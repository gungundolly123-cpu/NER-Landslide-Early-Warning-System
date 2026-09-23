/**
 * NEXZORA — Notification & Device Registration Router
 * Handles FCM push token management, citizen language/district preferences,
 * and in-app alerts inbox feeds.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { authenticate, requireActive } = require('../middleware/auth');
const { registerDeviceToken, deactivateDeviceToken } = require('../services/fcmService');
const { getUserNotifications, markNotificationRead } = require('../services/notifications');
const { logAudit } = require('../services/audit');

/**
 * 1. POST /api/notifications/register-device
 * Register or update device push token for the authenticated user
 */
router.post('/register-device', authenticate, requireActive, (req, res) => {
  try {
    const { token, platform = 'web', app_version = '1.0.0', device_identifier_hash, permission = 'granted' } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid device push token is required.' });
    }

    const result = registerDeviceToken({
      userId: req.user.id,
      token,
      platform,
      appVersion: app_version,
      deviceIdentifierHash: device_identifier_hash,
      permission
    });

    return res.status(200).json({
      success: true,
      message: 'Device push token registered successfully.',
      deviceId: result.id
    });
  } catch (err) {
    console.error('[Register Device Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to register push token.' });
  }
});

/**
 * 2. DELETE /api/notifications/devices/:token
 * Deactivate a registered device token (e.g., on logout)
 */
router.delete('/devices/:token', authenticate, (req, res) => {
  try {
    const token = req.params.token;
    deactivateDeviceToken(token, req.user.id);
    return res.json({ success: true, message: 'Device push token deactivated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to deactivate push token.' });
  }
});

/**
 * 3. GET /api/notifications/preferences
 * Fetch user notification and language preferences
 */
router.get('/preferences', authenticate, (req, res) => {
  try {
    let pref = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user.id);

    if (!pref) {
      const now = new Date().toISOString();
      const id = 'pref_' + crypto.randomUUID();
      db.prepare(`
        INSERT INTO notification_preferences (
          id, user_id, preferred_language, receive_push_alerts, receive_sms_alerts,
          receive_email_alerts, subscribed_state, subscribed_district, updated_at
        ) VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?)
      `).run(id, req.user.id, req.user.preferred_language || 'en', req.user.state || 'Assam', req.user.district || 'Kamrup Metropolitan', now);

      pref = db.prepare('SELECT * FROM notification_preferences WHERE id = ?').get(id);
    }

    return res.json({ success: true, preferences: pref });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch notification preferences.' });
  }
});

/**
 * 4. PATCH /api/notifications/preferences
 * Update user language, subscribed district, and notification channels
 */
router.patch('/preferences', authenticate, requireActive, (req, res) => {
  try {
    const {
      preferred_language,
      receive_push_alerts,
      receive_sms_alerts,
      receive_email_alerts,
      subscribed_state,
      subscribed_district,
      subscribed_village_or_area,
      notification_radius_km
    } = req.body;

    const now = new Date().toISOString();

    let pref = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user.id);

    const validLangs = ['en', 'hi', 'as', 'bn', 'other'];
    const chosenLang = (preferred_language && validLangs.includes(preferred_language))
      ? preferred_language
      : (pref ? pref.preferred_language : (req.user.preferred_language || 'en'));

    if (pref) {
      db.prepare(`
        UPDATE notification_preferences
        SET preferred_language = ?,
            receive_push_alerts = COALESCE(?, receive_push_alerts),
            receive_sms_alerts = COALESCE(?, receive_sms_alerts),
            receive_email_alerts = COALESCE(?, receive_email_alerts),
            subscribed_state = COALESCE(?, subscribed_state),
            subscribed_district = COALESCE(?, subscribed_district),
            subscribed_village_or_area = COALESCE(?, subscribed_village_or_area),
            notification_radius_km = COALESCE(?, notification_radius_km),
            updated_at = ?
        WHERE user_id = ?
      `).run(
        chosenLang,
        receive_push_alerts !== undefined ? (receive_push_alerts ? 1 : 0) : null,
        receive_sms_alerts !== undefined ? (receive_sms_alerts ? 1 : 0) : null,
        receive_email_alerts !== undefined ? (receive_email_alerts ? 1 : 0) : null,
        subscribed_state !== undefined ? subscribed_state : null,
        subscribed_district !== undefined ? subscribed_district : null,
        subscribed_village_or_area !== undefined ? subscribed_village_or_area : null,
        notification_radius_km !== undefined ? parseFloat(notification_radius_km) : null,
        now, req.user.id
      );
    } else {
      const id = 'pref_' + crypto.randomUUID();
      db.prepare(`
        INSERT INTO notification_preferences (
          id, user_id, preferred_language, receive_push_alerts, receive_sms_alerts,
          receive_email_alerts, subscribed_state, subscribed_district,
          subscribed_village_or_area, notification_radius_km, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, req.user.id, chosenLang,
        receive_push_alerts !== undefined ? (receive_push_alerts ? 1 : 0) : 1,
        receive_sms_alerts !== undefined ? (receive_sms_alerts ? 1 : 0) : 0,
        receive_email_alerts !== undefined ? (receive_email_alerts ? 1 : 0) : 0,
        subscribed_state || req.user.state || 'Assam',
        subscribed_district || req.user.district || 'Kamrup Metropolitan',
        subscribed_village_or_area || null,
        notification_radius_km ? parseFloat(notification_radius_km) : 25.0,
        now
      );
    }

    // Also update user preferred_language in users table
    if (preferred_language) {
      db.prepare('UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?').run(chosenLang, now, req.user.id);
    }

    const updated = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user.id);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'notification_preferences_updated',
      entityType: 'notification_preference',
      entityId: updated.id,
      newValue: { language: chosenLang, district: updated.subscribed_district }
    });

    return res.json({
      success: true,
      message: 'Notification preferences updated successfully.',
      preferences: updated
    });
  } catch (err) {
    console.error('[Update Preferences Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update notification preferences.' });
  }
});

/**
 * 5. GET /api/notifications/inbox
 * Get combined in-app alerts and notifications
 */
router.get('/inbox', authenticate, (req, res) => {
  try {
    const notifications = getUserNotifications(req.user.id, 50);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    return res.json({
      success: true,
      unreadCount,
      notifications
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch notification inbox.' });
  }
});

/**
 * 6. PATCH /api/notifications/:id/read
 * Mark notification as read
 */
router.patch('/:id/read', authenticate, (req, res) => {
  try {
    markNotificationRead(req.params.id, req.user.id);
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

module.exports = router;
