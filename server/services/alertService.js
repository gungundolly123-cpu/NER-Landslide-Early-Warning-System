/**
 * NEXZORA — Disaster Alert Management & Workflow Service
 * Generates multilingual alert templates, verifies telemetry freshness,
 * enforces admin approval workflows, and prevents alert fatigue.
 */

const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { logAudit } = require('./audit');
const { dispatchApprovedAlert } = require('./fcmService');

/**
 * Generate standard multilingual templates for landslide alerts
 * @param {object} params
 * @param {string} params.district
 * @param {string} params.areaName
 * @param {string} params.riskClass
 * @param {string} params.reason
 * @param {string} [params.precautions]
 * @param {string} [params.validUntil]
 * @returns {object} Dictionary of localized templates { en, hi, as, bn }
 */
function generateMultilingualTemplates({ district, areaName, riskClass, reason, precautions, validUntil }) {
  const area = areaName || district || 'North Eastern Region';
  const risk = (riskClass || 'High').toUpperCase();
  const expiry = validUntil ? new Date(validUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Next 6 Hours';

  const defaultPrecautionsEn = precautions || 'Avoid non-essential travel along hill corridors, stay alert for falling rocks/debris, and follow guidance from local disaster authorities.';
  const defaultPrecautionsHi = 'पहाड़ी रास्तों पर अनावश्यक यात्रा से बचें, गिरते पत्थरों और मलबे से सावधान रहें, तथा स्थानीय आपदा प्रबंधन के निर्देशों का पालन करें।';
  const defaultPrecautionsAs = 'পাহাড়ীয়া পথত অপ্ৰয়োজনীয় যাত্ৰা পৰিহাৰ কৰক, শিল আৰু বোকা খহি পৰাৰ প্ৰতি সতৰ্ক থাকক আৰু স্থানীয় প্ৰশাসনৰ নিৰ্দেশনা মানি চলক।';
  const defaultPrecautionsBn = 'পাহাড়ি রাস্তায় অপ্রয়োজনীয় চলাচল এড়িয়ে চলুন, পাথর ও ধস নামার ব্যাপারে সতর্ক থাকুন এবং স্থানীয় দুর্যোগ ব্যবস্থাপনা কর্তৃপক্ষের নির্দেশ মেনে চলুন।';

  return {
    en: {
      language_code: 'en',
      title: `⚠️ Landslide Warning: ${risk} Risk in ${area}`,
      message: `Area: ${area} (${district})\nRisk Level: ${risk}\nReason: ${reason || 'Heavy continuous rainfall and unstable slope condition.'}\nAdvice: ${defaultPrecautionsEn}\nValid Until: ${expiry}`,
      precautions: defaultPrecautionsEn
    },
    hi: {
      language_code: 'hi',
      title: `⚠️ भूस्खलन चेतावनी: ${area} में ${risk} जोखिम`,
      message: `क्षेत्र: ${area} (${district})\nजोखिम स्तर: ${risk}\nकारण: ${reason ? 'भारी वर्षा और ढलान पर भूस्खलन की संभावना।' : 'अत्यधिक वर्षा और अस्थिर ढलान स्थिति।'}\nसलाह: ${defaultPrecautionsHi}\nवैधता: ${expiry}`,
      precautions: defaultPrecautionsHi
    },
    as: {
      language_code: 'as',
      title: `⚠️ ভূমিস্খলনৰ সতৰ্কবাৰ্তা: ${area}ত ${risk} বিপদ`,
      message: `স্থান: ${area} (${district})\nবিপদৰ মাত্ৰা: ${risk}\nকাৰণ: ধাৰাসাৰ বৰষুণ আৰু পাহাৰীয়া ঢালৰ অস্থিৰতা।\nপৰামৰ্শ: ${defaultPrecautionsAs}\nসময়সীমা: ${expiry}`,
      precautions: defaultPrecautionsAs
    },
    bn: {
      language_code: 'bn',
      title: `⚠️ ভূমিধস সতর্কতা: ${area} এলাকায় ${risk} ঝুঁকি`,
      message: `এলাকা: ${area} (${district})\nঝুঁকির মাত্রা: ${risk}\nকারণ: একটানা ভারী বৃষ্টিপাত ও পাহাড়ি ঢালের অস্থিরতা।\nপরামর্শ: ${defaultPrecautionsBn}\nমেয়াদ: ${expiry}`,
      precautions: defaultPrecautionsBn
    }
  };
}

/**
 * Check whether telemetry data is fresh or stale
 * @param {object} params
 * @param {string|Date} [params.rainfallTimestamp]
 * @param {string|Date} [params.soilTimestamp]
 * @param {string|Date} [params.predictionTimestamp]
 * @returns {object} { isFresh: boolean, status: string, warnings: string[] }
 */
function checkDataFreshness({ rainfallTimestamp, soilTimestamp, predictionTimestamp }) {
  const now = Date.now();
  const warnings = [];
  let status = 'complete';

  // 1. Rainfall Freshness (Default: 6 hours)
  if (rainfallTimestamp) {
    const rainAgeHours = (now - new Date(rainfallTimestamp).getTime()) / (1000 * 60 * 60);
    if (rainAgeHours > config.RAINFALL_STALE_AFTER_HOURS) {
      warnings.push(`Rainfall telemetry is ${Math.round(rainAgeHours)}h old (threshold: ${config.RAINFALL_STALE_AFTER_HOURS}h).`);
      status = 'stale_rainfall';
    }
  }

  // 2. Soil Moisture Freshness (Default: 24 hours)
  if (soilTimestamp) {
    const soilAgeHours = (now - new Date(soilTimestamp).getTime()) / (1000 * 60 * 60);
    if (soilAgeHours > config.SOIL_MOISTURE_STALE_AFTER_HOURS) {
      warnings.push(`Soil moisture telemetry is ${Math.round(soilAgeHours)}h old (threshold: ${config.SOIL_MOISTURE_STALE_AFTER_HOURS}h).`);
      if (status === 'complete') status = 'stale_soil';
    }
  }

  // 3. Prediction Freshness (Default: 6 hours)
  if (predictionTimestamp) {
    const predAgeHours = (now - new Date(predictionTimestamp).getTime()) / (1000 * 60 * 60);
    if (predAgeHours > config.PREDICTION_STALE_AFTER_HOURS) {
      warnings.push(`AI Prediction result is ${Math.round(predAgeHours)}h old (threshold: ${config.PREDICTION_STALE_AFTER_HOURS}h).`);
      if (status === 'complete') status = 'stale_prediction';
    }
  }

  return {
    isFresh: warnings.length === 0,
    status,
    warnings
  };
}

/**
 * Check if an active/recent alert in this district already exists within cooldown window
 * @param {string} district
 * @param {string} riskClass
 * @returns {object|null}
 */
function checkAlertCooldown(district, riskClass) {
  const cooldownMs = config.NOTIFICATION_COOLDOWN_MINUTES * 60 * 1000;
  const cutoffTime = new Date(Date.now() - cooldownMs).toISOString();

  return db.prepare(`
    SELECT * FROM alerts
    WHERE LOWER(target_district) = LOWER(?)
      AND LOWER(risk_class) = LOWER(?)
      AND alert_status IN ('approved', 'sent', 'queued', 'pending_admin_approval')
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(district, riskClass, cutoffTime);
}

/**
 * Estimate recipient count for a district
 * @param {string} district
 * @returns {object} { citizenCount, officerCount, totalEstimated }
 */
function estimateRecipientCount(district) {
  const target = (district || '').toLowerCase().trim();

  const citizenCount = db.prepare(`
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    LEFT JOIN notification_preferences p ON u.id = p.user_id
    WHERE u.account_status = 'active'
      AND COALESCE(p.receive_push_alerts, 1) = 1
      AND (
        LOWER(COALESCE(p.subscribed_district, u.district, '')) = ?
        OR LOWER(COALESCE(p.subscribed_district, u.district, '')) = 'all'
      )
  `).get(target).count;

  const officerCount = db.prepare(`
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    JOIN officer_assignments oa ON u.id = oa.user_id
    WHERE u.role = 'field_officer'
      AND u.account_status = 'active'
      AND oa.active = 1
      AND LOWER(oa.district) = ?
  `).get(target).count;

  return {
    citizenCount,
    officerCount,
    totalEstimated: citizenCount + officerCount
  };
}

/**
 * Create an AI-suggested alert draft from model inference
 * IMPORTANT: This creates a draft with status 'pending_admin_approval' and NEVER sends notifications automatically.
 * @param {object} payload
 */
function createAISuggestedAlert(payload) {
  const {
    risk_class = 'high',
    risk_probability = 0.85,
    target_state = 'Assam',
    target_district,
    target_villages = [],
    target_road_ids = [],
    reason_summary,
    precautions,
    linked_prediction_id,
    linked_incident_report_id,
    rainfall_summary,
    rainfall_data_timestamp,
    soil_moisture_summary,
    soil_data_timestamp,
    prediction_timestamp = new Date().toISOString(),
    valid_hours = 6,
    allow_cooldown_override = false
  } = payload;

  if (!target_district) {
    throw new Error('Target district is required to suggest an alert.');
  }

  // 1. Safety Check: Only High or Very High risk triggers suggested public alerts
  const normalizedRisk = risk_class.toLowerCase();
  if (normalizedRisk !== 'high' && normalizedRisk !== 'very_high' && normalizedRisk !== 'critical') {
    return {
      created: false,
      reason: `Risk level '${risk_class}' does not meet the High/Very High threshold for public disaster alert suggestion.`
    };
  }

  // 2. Data Freshness Check
  const freshness = checkDataFreshness({
    rainfallTimestamp: rainfall_data_timestamp,
    soilTimestamp: soil_data_timestamp,
    predictionTimestamp: prediction_timestamp
  });

  // 3. Cooldown Duplicate Prevention
  if (!allow_cooldown_override) {
    const existingActive = checkAlertCooldown(target_district, normalizedRisk);
    if (existingActive) {
      return {
        created: false,
        cooldown: true,
        existingAlertId: existingActive.id,
        reason: `An active alert for ${target_district} with ${risk_class} risk was already created at ${existingActive.created_at} within the ${config.NOTIFICATION_COOLDOWN_MINUTES}m cooldown window.`
      };
    }
  }

  const id = 'alt_' + crypto.randomUUID();
  const alertRef = `NEX-ALT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + valid_hours * 60 * 60 * 1000).toISOString();

  // Generate localized message drafts
  const villageList = Array.isArray(target_villages) ? target_villages.join(', ') : (target_villages || target_district);
  const translations = generateMultilingualTemplates({
    district: target_district,
    areaName: villageList,
    riskClass: normalizedRisk === 'very_high' ? 'Very High' : 'High',
    reason: reason_summary || rainfall_summary || 'Heavy rainfall and severe slope instability detected.',
    precautions,
    validUntil
  });

  const enTemplate = translations.en;

  db.prepare(`
    INSERT INTO alerts (
      id, alert_reference_code, title, message, severity, alert_type, risk_class, risk_probability,
      target_state, target_district, target_districts, target_villages, target_road_ids,
      reason_summary, precautions, linked_prediction_id, linked_incident_report_id, model_version,
      rainfall_summary, rainfall_data_timestamp, soil_moisture_summary, soil_data_timestamp,
      data_completeness_status, status, alert_status, valid_from, valid_until, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'landslide_risk', ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 'NEXZORA-XGBoost-v2.1',
      ?, ?, ?, ?,
      ?, 'Pending_Approval', 'pending_admin_approval', ?, ?, ?, ?
    )
  `).run(
    id, alertRef, enTemplate.title, enTemplate.message,
    normalizedRisk === 'very_high' ? 'Critical' : 'High',
    normalizedRisk, risk_probability,
    target_state, target_district, target_district,
    JSON.stringify(target_villages), JSON.stringify(target_road_ids),
    reason_summary || 'AI Model high risk detection', precautions || enTemplate.precautions,
    linked_prediction_id || null, linked_incident_report_id || null,
    rainfall_summary || null, rainfall_data_timestamp || null,
    soil_moisture_summary || null, soil_data_timestamp || null,
    freshness.status, now, validUntil, now, now
  );

  // Store translations
  const insertTrans = db.prepare(`
    INSERT INTO alert_translations (id, alert_id, language_code, title, message, precautions, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lang of ['en', 'hi', 'as', 'bn']) {
    const t = translations[lang];
    insertTrans.run('trn_' + crypto.randomUUID(), id, lang, t.title, t.message, t.precautions, now, now);
  }

  logAudit({
    actorUserId: null,
    actorName: 'AI Spatial Risk Engine',
    actorRole: 'system',
    actionType: 'ai_alert_suggested',
    entityType: 'alert',
    entityId: id,
    newValue: { alertRef, target_district, risk_class: normalizedRisk, data_status: freshness.status }
  });

  return {
    created: true,
    alert_id: id,
    alert_reference_code: alertRef,
    alert_status: 'pending_admin_approval',
    data_freshness: freshness,
    recipientEstimate: estimateRecipientCount(target_district),
    valid_until: validUntil
  };
}

/**
 * Field Officer recommends a landslide alert based on field observation
 * @param {object} payload
 * @param {object} officerUser
 */
function recommendOfficerAlert(payload, officerUser) {
  const {
    target_district,
    target_villages = [],
    severity = 'High',
    reason,
    suggested_precautions,
    linked_incident_report_id,
    valid_hours = 6
  } = payload;

  if (!target_district) {
    throw new Error('Target district is required.');
  }

  const id = 'alt_' + crypto.randomUUID();
  const alertRef = `NEX-FO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + valid_hours * 60 * 60 * 1000).toISOString();

  const areaName = Array.isArray(target_villages) ? target_villages.join(', ') : (target_villages || target_district);
  const translations = generateMultilingualTemplates({
    district: target_district,
    areaName,
    riskClass: severity,
    reason: reason || 'Field Officer verified slope instability.',
    precautions: suggested_precautions,
    validUntil
  });

  const enTemplate = translations.en;

  db.prepare(`
    INSERT INTO alerts (
      id, alert_reference_code, title, message, severity, alert_type, risk_class,
      target_district, target_districts, target_villages, reason_summary, precautions,
      linked_incident_report_id, status, alert_status, suggested_by_officer_id, created_by_user_id,
      valid_from, valid_until, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'landslide_risk', ?,
      ?, ?, ?, ?, ?,
      ?, 'Pending_Approval', 'pending_admin_approval', ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    id, alertRef, enTemplate.title, enTemplate.message, severity,
    severity.toLowerCase() === 'critical' ? 'very_high' : severity.toLowerCase(),
    target_district, target_district, JSON.stringify(target_villages),
    reason, suggested_precautions || enTemplate.precautions,
    linked_incident_report_id || null, officerUser.id, officerUser.id,
    now, validUntil, now, now
  );

  // Store translations
  const insertTrans = db.prepare(`
    INSERT INTO alert_translations (id, alert_id, language_code, title, message, precautions, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lang of ['en', 'hi', 'as', 'bn']) {
    const t = translations[lang];
    insertTrans.run('trn_' + crypto.randomUUID(), id, lang, t.title, t.message, t.precautions, now, now);
  }

  logAudit({
    actorUserId: officerUser.id,
    actorName: officerUser.full_name,
    actorRole: 'field_officer',
    actionType: 'field_officer_alert_recommended',
    entityType: 'alert',
    entityId: id,
    newValue: { alertRef, target_district, severity }
  });

  return {
    success: true,
    alert_id: id,
    alert_reference_code: alertRef,
    alert_status: 'pending_admin_approval',
    message: 'Alert recommendation submitted for Admin approval.'
  };
}

/**
 * Admin approves and triggers alert broadcast dispatch
 * @param {string} alertId
 * @param {object} adminUser
 * @param {object} [customizations]
 */
async function approveAndBroadcastAlert(alertId, adminUser, customizations = {}) {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
  if (!alert) {
    throw new Error('Alert record not found.');
  }

  if (alert.alert_status === 'approved' || alert.alert_status === 'sent') {
    throw new Error('This alert has already been approved and dispatched.');
  }

  const now = new Date().toISOString();

  // Apply admin customizations if provided
  const updatedTitle = customizations.title || alert.title;
  const updatedMessage = customizations.message || alert.message;
  const updatedPrecautions = customizations.precautions || alert.precautions;
  const updatedDistrict = customizations.target_district || alert.target_district;
  const updatedValidUntil = customizations.valid_until || alert.valid_until;

  db.prepare(`
    UPDATE alerts
    SET title = ?, message = ?, precautions = ?, target_district = ?, target_districts = ?,
        valid_until = ?, status = 'Approved', alert_status = 'approved',
        approved_by_admin_id = ?, reviewed_by_admin_id = ?, approved_at = ?, reviewed_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    updatedTitle, updatedMessage, updatedPrecautions, updatedDistrict, updatedDistrict,
    updatedValidUntil, adminUser.id, adminUser.id, now, now, now, alertId
  );

  // Update translations if provided
  if (customizations.translations && Array.isArray(customizations.translations)) {
    for (const t of customizations.translations) {
      db.prepare(`
        INSERT INTO alert_translations (id, alert_id, language_code, title, message, precautions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(alert_id, language_code) DO UPDATE SET
          title = excluded.title,
          message = excluded.message,
          precautions = excluded.precautions,
          updated_at = excluded.updated_at
      `).run('trn_' + crypto.randomUUID(), alertId, t.language_code, t.title, t.message, t.precautions || updatedPrecautions, now, now);
    }
  }

  // Fetch updated translations
  const translations = db.prepare('SELECT * FROM alert_translations WHERE alert_id = ?').all(alertId);
  const updatedAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);

  // Dispatch Push Notifications via FCM / Simulator
  const deliverySummary = await dispatchApprovedAlert(updatedAlert, translations);

  // Update alert status to 'sent'
  db.prepare(`
    UPDATE alerts
    SET alert_status = 'sent', sent_at = ?, broadcast_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, now, alertId);

  logAudit({
    actorUserId: adminUser.id,
    actorName: adminUser.full_name,
    actorRole: 'admin',
    actionType: 'alert_approved_and_sent',
    entityType: 'alert',
    entityId: alertId,
    newValue: { deliverySummary, alertRef: alert.alert_reference_code }
  });

  return {
    success: true,
    alert_id: alertId,
    alert_status: 'sent',
    deliverySummary
  };
}

/**
 * Admin rejects an alert draft with a required reason
 * @param {string} alertId
 * @param {object} adminUser
 * @param {string} rejectionReason
 */
function rejectAlertDraft(alertId, adminUser, rejectionReason) {
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('A valid rejection reason is required to reject an alert.');
  }

  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
  if (!alert) {
    throw new Error('Alert record not found.');
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE alerts
    SET status = 'Rejected', alert_status = 'rejected', rejection_reason = ?,
        reviewed_by_admin_id = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(rejectionReason.trim(), adminUser.id, now, now, alertId);

  logAudit({
    actorUserId: adminUser.id,
    actorName: adminUser.full_name,
    actorRole: 'admin',
    actionType: 'alert_rejected',
    entityType: 'alert',
    entityId: alertId,
    newValue: { rejectionReason: rejectionReason.trim() }
  });

  return {
    success: true,
    alert_id: alertId,
    alert_status: 'rejected',
    rejection_reason: rejectionReason.trim()
  };
}

module.exports = {
  generateMultilingualTemplates,
  checkDataFreshness,
  checkAlertCooldown,
  estimateRecipientCount,
  createAISuggestedAlert,
  recommendOfficerAlert,
  approveAndBroadcastAlert,
  rejectAlertDraft
};
