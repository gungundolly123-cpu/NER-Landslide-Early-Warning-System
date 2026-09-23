/**
 * NEXZORA — Firebase Cloud Messaging (FCM) Push Service
 * Supports token-based targeting, localized translation delivery,
 * invalid token deactivation, and fallback local simulation mode.
 */

const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { logAudit } = require('./audit');

let firebaseAdmin = null;
let fcmInitialized = false;

// Attempt Firebase Admin SDK Initialization if configured
try {
  if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.FIREBASE_PROJECT_ID,
          clientEmail: config.FIREBASE_CLIENT_EMAIL,
          privateKey: config.FIREBASE_PRIVATE_KEY
        })
      });
    }
    firebaseAdmin = admin;
    fcmInitialized = true;
    console.log('[FCM Service] Firebase Admin SDK initialized for project:', config.FIREBASE_PROJECT_ID);
  } else {
    console.log('[FCM Service] Running in Development / Simulation Mode (No Firebase private key configured)');
  }
} catch (err) {
  console.warn('[FCM Service] Firebase SDK init warning (fallback to simulation):', err.message);
}

/**
 * Register or refresh a device push token
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.token
 * @param {string} [params.platform='web']
 * @param {string} [params.appVersion]
 * @param {string} [params.deviceIdentifierHash]
 * @param {string} [params.permission='granted']
 */
function registerDeviceToken({ userId, token, platform = 'web', appVersion = '1.0.0', deviceIdentifierHash = null, permission = 'granted' }) {
  if (!userId || !token || typeof token !== 'string' || !token.trim()) {
    throw new Error('User ID and non-empty push token are required.');
  }

  const cleanToken = token.trim();
  const now = new Date().toISOString();

  // Deduplicate and upsert token
  const existing = db.prepare('SELECT id, user_id FROM device_push_tokens WHERE token = ?').get(cleanToken);

  if (existing) {
    db.prepare(`
      UPDATE device_push_tokens
      SET user_id = ?, platform = ?, app_version = ?, notification_permission = ?, is_active = 1, last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `).run(userId, platform, appVersion, permission, now, now, existing.id);

    return { id: existing.id, token: cleanToken, updated: true };
  }

  const id = 'tok_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO device_push_tokens (
      id, user_id, token, platform, app_version, device_identifier_hash,
      notification_permission, is_active, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, userId, cleanToken, platform, appVersion, deviceIdentifierHash, permission, now, now, now);

  logAudit({
    actorUserId: userId,
    actorName: 'User',
    actorRole: 'citizen',
    actionType: 'push_token_registered',
    entityType: 'device_push_token',
    entityId: id,
    newValue: { platform, permission }
  });

  return { id, token: cleanToken, created: true };
}

/**
 * Deactivate a device token (e.g. on logout or invalidation)
 * @param {string} token
 * @param {string} [userId]
 */
function deactivateDeviceToken(token, userId = null) {
  if (!token) return false;
  const now = new Date().toISOString();

  if (userId) {
    db.prepare('UPDATE device_push_tokens SET is_active = 0, updated_at = ? WHERE token = ? AND user_id = ?').run(now, token, userId);
  } else {
    db.prepare('UPDATE device_push_tokens SET is_active = 0, updated_at = ? WHERE token = ?').run(now, token);
  }
  return true;
}

/**
 * Build localized message payload
 */
function buildPayload(alert, translation) {
  const title = (translation && translation.title) ? translation.title : alert.title;
  const message = (translation && translation.message) ? translation.message : alert.message;

  return {
    notification: {
      title,
      body: message
    },
    data: {
      alert_id: String(alert.id),
      alert_reference_code: String(alert.alert_reference_code || alert.id),
      alert_type: String(alert.alert_type || 'landslide_risk'),
      risk_class: String(alert.risk_class || alert.severity || 'high'),
      target_district: String(alert.target_district || alert.target_districts || ''),
      target_area: String(alert.target_villages || alert.target_district || ''),
      valid_until: String(alert.valid_until || ''),
      deep_link: `/alerts/${alert.id}`
    }
  };
}

/**
 * Send alert push notification to a single device token
 * @param {object} tokenRecord
 * @param {object} alert
 * @param {object} translation
 * @returns {Promise<object>}
 */
async function sendPushToToken(tokenRecord, alert, translation) {
  const deliveryId = 'del_' + crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = buildPayload(alert, translation);

  // 1. Real Firebase Admin SDK Dispatch (if initialized)
  if (fcmInitialized && firebaseAdmin) {
    try {
      const response = await firebaseAdmin.messaging().send({
        token: tokenRecord.token,
        notification: payload.notification,
        data: payload.data
      });

      db.prepare(`
        INSERT INTO notification_deliveries (
          id, alert_id, user_id, delivery_channel, target_token_id,
          delivery_status, provider_message_id, sent_at, delivered_at, created_at
        ) VALUES (?, ?, ?, 'push', ?, 'delivered', ?, ?, ?, ?)
      `).run(deliveryId, alert.id, tokenRecord.user_id, tokenRecord.id, response, now, now, now);

      return { success: true, deliveryId, providerMessageId: response, status: 'delivered' };
    } catch (err) {
      const isInvalidToken = err.code === 'messaging/registration-token-not-registered' ||
                            err.code === 'messaging/invalid-registration-token' ||
                            err.message.includes('not a valid FCM registration token');

      if (isInvalidToken) {
        deactivateDeviceToken(tokenRecord.token);
      }

      db.prepare(`
        INSERT INTO notification_deliveries (
          id, alert_id, user_id, delivery_channel, target_token_id,
          delivery_status, error_code, error_message_safe, sent_at, created_at
        ) VALUES (?, ?, ?, 'push', ?, ?, ?, ?, ?, ?)
      `).run(
        deliveryId, alert.id, tokenRecord.user_id, tokenRecord.id,
        isInvalidToken ? 'invalid_token' : 'failed',
        err.code || 'SEND_ERROR',
        err.message ? err.message.slice(0, 200) : 'FCM send failure',
        now, now
      );

      return { success: false, deliveryId, error: err.message, status: isInvalidToken ? 'invalid_token' : 'failed' };
    }
  }

  // 2. High-Fidelity Simulation / Development Mode
  const isSimulatedInvalid = tokenRecord.token.includes('invalid') || tokenRecord.token.includes('expired');
  if (isSimulatedInvalid) {
    deactivateDeviceToken(tokenRecord.token);
    db.prepare(`
      INSERT INTO notification_deliveries (
        id, alert_id, user_id, delivery_channel, target_token_id,
        delivery_status, error_code, error_message_safe, sent_at, created_at
      ) VALUES (?, ?, ?, 'push', ?, 'invalid_token', 'SIMULATED_INVALID_TOKEN', 'Token marked unregistered by FCM simulator', ?, ?)
    `).run(deliveryId, alert.id, tokenRecord.user_id, tokenRecord.id, now, now);

    return { success: false, deliveryId, status: 'invalid_token', simulated: true };
  }

  const simulatedMsgId = 'fcm_sim_' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO notification_deliveries (
      id, alert_id, user_id, delivery_channel, target_token_id,
      delivery_status, provider_message_id, sent_at, delivered_at, created_at
    ) VALUES (?, ?, ?, 'push', ?, 'delivered', ?, ?, ?, ?)
  `).run(deliveryId, alert.id, tokenRecord.user_id, tokenRecord.id, simulatedMsgId, now, now, now);

  return { success: true, deliveryId, providerMessageId: simulatedMsgId, status: 'delivered', simulated: true };
}

/**
 * Dispatch an approved alert to all targeted recipients in the affected district(s)
 * @param {object} alert
 * @param {Array<object>} translations
 * @returns {Promise<object>} Summary of delivery dispatch
 */
async function dispatchApprovedAlert(alert, translations = []) {
  const targetDistrict = (alert.target_district || alert.target_districts || '').toLowerCase().trim();
  if (!targetDistrict) {
    throw new Error('Target district is required for alert dispatch.');
  }

  // Map translations by language code
  const transMap = {};
  for (const t of translations) {
    transMap[t.language_code] = t;
  }

  // 1. Identify Target Citizens subscribed to target district
  const citizenTokens = db.prepare(`
    SELECT t.id, t.user_id, t.token, t.platform,
           COALESCE(p.preferred_language, u.preferred_language, 'en') as preferred_language
    FROM device_push_tokens t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN notification_preferences p ON u.id = p.user_id
    WHERE t.is_active = 1
      AND u.account_status = 'active'
      AND COALESCE(p.receive_push_alerts, 1) = 1
      AND (
        LOWER(COALESCE(p.subscribed_district, u.district, '')) = ?
        OR LOWER(COALESCE(p.subscribed_district, u.district, '')) = 'all'
      )
  `).all(targetDistrict);

  // 2. Identify Target Field Officers assigned to target district
  const officerTokens = db.prepare(`
    SELECT t.id, t.user_id, t.token, t.platform,
           COALESCE(p.preferred_language, u.preferred_language, 'en') as preferred_language
    FROM device_push_tokens t
    JOIN users u ON t.user_id = u.id
    JOIN officer_assignments oa ON u.id = oa.user_id
    LEFT JOIN notification_preferences p ON u.id = p.user_id
    WHERE t.is_active = 1
      AND u.role = 'field_officer'
      AND u.account_status = 'active'
      AND oa.active = 1
      AND LOWER(oa.district) = ?
  `).all(targetDistrict);

  // Combine and deduplicate target tokens by token ID
  const tokenMap = new Map();
  for (const t of [...citizenTokens, ...officerTokens]) {
    if (!tokenMap.has(t.id)) {
      tokenMap.set(t.id, t);
    }
  }

  const allTargetTokens = Array.from(tokenMap.values());
  let sentCount = 0;
  let failedCount = 0;
  let invalidTokensCount = 0;

  for (const tok of allTargetTokens) {
    const lang = tok.preferred_language || 'en';
    const chosenTrans = transMap[lang] || transMap['en'] || { title: alert.title, message: alert.message };

    const res = await sendPushToToken(tok, alert, chosenTrans);
    if (res.status === 'delivered') {
      sentCount++;
    } else if (res.status === 'invalid_token') {
      invalidTokensCount++;
      failedCount++;
    } else {
      failedCount++;
    }
  }

  // Also create in-app notification records for dashboard & inbox
  const userIds = [...new Set(allTargetTokens.map(t => t.user_id))];
  const now = new Date().toISOString();
  for (const uid of userIds) {
    const inAppId = 'ntf_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO incident_notifications (id, user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, 'emergency_alert', 0, ?)
    `).run(inAppId, uid, alert.title, alert.message, now);
  }

  const deliverySummary = {
    alertId: alert.id,
    targetDistrict,
    totalTargeted: allTargetTokens.length,
    sentCount,
    failedCount,
    invalidTokensCount,
    dispatchedAt: now
  };

  logAudit({
    actorUserId: alert.approved_by_admin_id || alert.reviewed_by_admin_id || null,
    actorName: 'Admin',
    actorRole: 'admin',
    actionType: 'alert_push_dispatched',
    entityType: 'alert',
    entityId: alert.id,
    newValue: deliverySummary
  });

  return deliverySummary;
}

module.exports = {
  registerDeviceToken,
  deactivateDeviceToken,
  sendPushToToken,
  dispatchApprovedAlert
};
