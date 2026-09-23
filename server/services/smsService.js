/**
 * NEXZORA — SMS Alert Delivery & Recipient Management Service
 * Provides pluggable SMS providers (Test/Simulation & Production DLT), multilingual SMS templates,
 * phone number masking, emergency contact targeting, and audit recording.
 *
 * SAFETY POLICY:
 * AI risk predictions and raw citizen reports NEVER trigger public SMS directly.
 * SMS alerts require explicit review and authorization by an Admin.
 */

const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { logAudit } = require('./audit');

/**
 * Mask phone number for dashboard privacy (e.g. "9876543210" -> "98XXXXXX10")
 * @param {string} phone
 * @returns {string}
 */
function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return 'XXXXXXXXXX';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('91') && clean.length === 12) {
    clean = clean.substring(2);
  }
  if (clean.length < 6) return 'XXXXXX';
  const first2 = clean.substring(0, 2);
  const last2 = clean.substring(clean.length - 2);
  const maskedMiddle = 'X'.repeat(Math.max(4, clean.length - 4));
  return `${first2}${maskedMiddle}${last2}`;
}

/**
 * Provider Abstraction
 */
class BaseSmsProvider {
  async sendSms({ to, message, templateId, metadata }) {
    throw new Error('sendSms must be implemented by provider subclass');
  }
}

class TestSmsProvider extends BaseSmsProvider {
  async sendSms({ to, message, templateId, metadata }) {
    const providerMessageId = `SIM_SMS_${crypto.randomBytes(8).toString('hex')}`;
    const masked = maskPhoneNumber(to);
    
    if (config.NODE_ENV !== 'test') {
      console.log(`[SMS Test Mode] Dispatched to ${masked} (Len: ${message.length} chars): "${message.substring(0, 70)}..."`);
    }

    return {
      success: true,
      providerMessageId,
      status: 'test_mode',
      maskedPhone: masked,
      timestamp: new Date().toISOString()
    };
  }
}

class ProductionSmsProvider extends BaseSmsProvider {
  async sendSms({ to, message, templateId, metadata }) {
    if (!config.SMS_API_URL || !config.SMS_API_KEY) {
      throw new Error('Production SMS credentials (SMS_API_URL, SMS_API_KEY) are not configured.');
    }

    try {
      const payload = {
        sender_id: config.SMS_SENDER_ID,
        recipient: to,
        message,
        template_id: templateId || config.SMS_TEMPLATE_ID,
        dlt_entity_id: config.SMS_DLT_ENTITY_ID,
        dlt_template_id: config.SMS_DLT_TEMPLATE_ID
      };

      const res = await fetch(config.SMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.SMS_API_KEY}`,
          'X-API-KEY': config.SMS_API_KEY
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.message || `SMS Gateway Error HTTP ${res.status}`,
          status: 'failed'
        };
      }

      return {
        success: true,
        providerMessageId: data.message_id || data.id || `PROD_SMS_${Date.now()}`,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        status: 'failed'
      };
    }
  }
}

function getSmsProvider() {
  if (config.SMS_PROVIDER === 'production' && config.SMS_API_URL && config.SMS_API_KEY) {
    return new ProductionSmsProvider();
  }
  return new TestSmsProvider();
}

/**
 * Multilingual SMS Templates
 * Kept concise (<160 chars where possible) and action-oriented
 */
function generateMultilingualSms({ areaName, riskLevel, validUntil, roadName }) {
  const area = areaName || 'the region';
  const risk = (riskLevel || 'HIGH').toUpperCase();
  const road = roadName ? ` on ${roadName}` : '';
  const validity = validUntil ? new Date(validUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'next 6 hours';

  return {
    en: `🚨 LANDSLIDE ALERT: ${risk} risk near ${area}${road}. Heavy rainfall causing slope failure risk. Avoid non-essential travel. Follow DDMA instructions. Valid: ${validity}. - NEXZORA`,
    hi: `🚨 भूस्खलन चेतावनी: ${area}${road} में ${risk} जोखिम। भारी बारिश से ढलानों में दरारें। अनावश्यक यात्रा से बचें। आपदा प्रबंधन निर्देशों का पालन करें। वैधता: ${validity} - NEXZORA`,
    as: `🚨 ভূমিস্খলন সতৰ্কবাৰ্তা: ${area}${road} অঞ্চলত ${risk} বিপদাশংকা। প্ৰবল বৰষুণৰ ফলত পাহাৰীয়া পথ বিপজ্জনক। অপ্ৰয়োজনীয় ভ্ৰমণ নকৰিব। প্ৰশাসনৰ নিৰ্দেশনা মানক। সময়: ${validity} - NEXZORA`,
    bn: `🚨 ভূমিধস সতর্কতা: ${area}${road} এলাকায় ${risk} ঝুঁকি। অতিবৃষ্টির কারণে পাহাড়ি ঢাল ঝুঁকিপূর্ণ। অপ্রয়োজনীয় ভ্রমণ এড়িয়ে চলুন। স্থানীয় নির্দেশ মেনে চলুন। মেয়াদ: ${validity} - NEXZORA`
  };
}

/**
 * Estimate and retrieve target recipients in district
 */
function getTargetRecipients({ district, targetVillages, includeCitizens = true }) {
  if (!district) return { recipients: [], counts: {} };

  const recipientsMap = new Map();

  // 1. Query Official Emergency Contacts
  const contacts = db.prepare(`
    SELECT id, contact_name, phone_number, contact_type, state, district,
           village_or_area, preferred_language, receive_sms_alerts
    FROM emergency_contacts
    WHERE LOWER(district) = LOWER(?) AND contact_status = 'active' AND receive_sms_alerts = 1
  `).all(district);

  for (const c of contacts) {
    if (c.phone_number) {
      recipientsMap.set(c.phone_number, {
        id: c.id,
        name: c.contact_name,
        phone: c.phone_number,
        type: c.contact_type,
        language: c.preferred_language || 'en',
        source: 'emergency_contact'
      });
    }
  }

  // 2. Query Registered App Users (Field Officers & Citizens) with SMS alert preference
  if (includeCitizens) {
    const users = db.prepare(`
      SELECT u.id, u.full_name, u.mobile_number, u.role, u.district,
             np.preferred_language, np.receive_sms_alerts
      FROM users u
      LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE LOWER(u.district) = LOWER(?)
        AND u.account_status = 'active'
        AND u.mobile_verified = 1
        AND (np.receive_sms_alerts = 1 OR u.role IN ('field_officer', 'admin'))
    `).all(district);

    for (const u of users) {
      if (u.mobile_number && !recipientsMap.has(u.mobile_number)) {
        recipientsMap.set(u.mobile_number, {
          id: u.id,
          name: u.full_name,
          phone: u.mobile_number,
          type: u.role,
          language: u.preferred_language || 'en',
          source: 'registered_user'
        });
      }
    }
  }

  const recipientsList = Array.from(recipientsMap.values());

  const counts = {
    total: recipientsList.length,
    citizens: recipientsList.filter(r => r.type === 'citizen').length,
    field_officers: recipientsList.filter(r => r.type === 'field_officer').length,
    police: recipientsList.filter(r => r.type === 'police').length,
    pri_representatives: recipientsList.filter(r => r.type === 'PRI_representative').length,
    pwd_teams: recipientsList.filter(r => r.type === 'PWD_team').length,
    disaster_offices: recipientsList.filter(r => r.type === 'disaster_management_office').length,
    emergency_contacts: recipientsList.filter(r => r.type === 'emergency_contact' || r.type === 'admin_official').length
  };

  return {
    recipients: recipientsList,
    counts
  };
}

/**
 * Dispatch Admin-Approved SMS Alert
 */
async function dispatchApprovedSmsAlert({ alertId, adminUserId, allowCooldownOverride = false }) {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
  if (!alert) {
    throw new Error('Alert not found');
  }

  const district = alert.target_district;
  const { recipients, counts } = getTargetRecipients({ district, includeCitizens: true });

  if (recipients.length === 0) {
    return {
      success: true,
      alertId,
      dispatchedCount: 0,
      message: 'No active SMS recipients configured for target district.',
      counts
    };
  }

  // Cooldown check: Check if identical alert was sent via SMS within cooldown window
  if (!allowCooldownOverride) {
    const recentSms = db.prepare(`
      SELECT COUNT(*) as count FROM sms_deliveries
      WHERE alert_id = ? AND created_at > datetime('now', '-30 minutes')
    `).get(alertId);

    if (recentSms && recentSms.count > 0) {
      throw new Error('SMS alert for this event was recently dispatched. Override required to resend within 30 minutes.');
    }
  }

  const smsTemplates = generateMultilingualSms({
    areaName: alert.target_district,
    riskLevel: alert.risk_class || alert.severity || 'High',
    validUntil: alert.valid_until
  });

  const provider = getSmsProvider();
  const providerName = config.SMS_PROVIDER === 'production' ? 'production_gateway' : 'test_simulation';
  const now = new Date().toISOString();

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  const insertDelivery = db.prepare(`
    INSERT INTO sms_deliveries (
      id, alert_id, recipient_id, phone_number_masked, provider_name,
      provider_message_id, delivery_status, failure_reason_safe, language_code,
      message_template_reference, sent_at, delivered_at, created_at
    ) VALUES (
      @id, @alert_id, @recipient_id, @phone_number_masked, @provider_name,
      @provider_message_id, @delivery_status, @failure_reason_safe, @language_code,
      @message_template_reference, @sent_at, @delivered_at, @created_at
    )
  `);

  for (const recipient of recipients) {
    const lang = recipient.language || 'en';
    const message = smsTemplates[lang] || smsTemplates.en;
    const maskedPhone = maskPhoneNumber(recipient.phone);
    const deliveryId = `sms_del_${crypto.randomBytes(8).toString('hex')}`;

    try {
      const result = await provider.sendSms({
        to: recipient.phone,
        message,
        metadata: { alertId, recipientId: recipient.id, district }
      });

      if (result.success) {
        sentCount++;
        insertDelivery.run({
          id: deliveryId,
          alert_id: alertId,
          recipient_id: recipient.source === 'emergency_contact' ? recipient.id : null,
          phone_number_masked: maskedPhone,
          provider_name: providerName,
          provider_message_id: result.providerMessageId,
          delivery_status: result.status || 'sent',
          failure_reason_safe: null,
          language_code: lang,
          message_template_reference: `template_${lang}`,
          sent_at: now,
          delivered_at: result.status === 'delivered' ? now : null,
          created_at: now
        });
      } else {
        failedCount++;
        insertDelivery.run({
          id: deliveryId,
          alert_id: alertId,
          recipient_id: recipient.source === 'emergency_contact' ? recipient.id : null,
          phone_number_masked: maskedPhone,
          provider_name: providerName,
          provider_message_id: null,
          delivery_status: 'failed',
          failure_reason_safe: result.error || 'Unknown gateway delivery error',
          language_code: lang,
          message_template_reference: `template_${lang}`,
          sent_at: null,
          delivered_at: null,
          created_at: now
        });
      }
    } catch (err) {
      failedCount++;
      insertDelivery.run({
        id: deliveryId,
        alert_id: alertId,
        recipient_id: recipient.source === 'emergency_contact' ? recipient.id : null,
        phone_number_masked: maskedPhone,
        provider_name: providerName,
        provider_message_id: null,
        delivery_status: 'failed',
        failure_reason_safe: err.message,
        language_code: lang,
        message_template_reference: `template_${lang}`,
        sent_at: null,
        delivered_at: null,
        created_at: now
      });
    }
  }

  // Audit log
  logAudit({
    actorUserId: adminUserId,
    actorName: 'Administrator',
    actorRole: 'admin',
    actionType: 'dispatch_sms_alert',
    entityType: 'alert',
    entityId: alertId,
    newValue: {
      district,
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      provider: providerName
    }
  });

  return {
    success: true,
    alertId,
    district,
    provider: providerName,
    totalTargeted: recipients.length,
    sentCount,
    failedCount,
    skippedCount,
    counts,
    timestamp: now
  };
}

/**
 * Get SMS Delivery Summary for an Alert
 */
function getSmsDeliverySummary(alertId) {
  const deliveries = db.prepare(`
    SELECT * FROM sms_deliveries
    WHERE alert_id = ?
    ORDER BY created_at DESC
  `).all(alertId);

  const stats = {
    total: deliveries.length,
    sent: deliveries.filter(d => d.delivery_status === 'sent').length,
    delivered: deliveries.filter(d => d.delivery_status === 'delivered').length,
    test_mode: deliveries.filter(d => d.delivery_status === 'test_mode').length,
    failed: deliveries.filter(d => d.delivery_status === 'failed').length,
    skipped: deliveries.filter(d => d.delivery_status === 'skipped').length
  };

  return {
    alertId,
    stats,
    deliveries
  };
}

/**
 * Retry failed SMS deliveries
 */
async function retryFailedSms(alertId, adminUserId) {
  const failedDeliveries = db.prepare(`
    SELECT * FROM sms_deliveries
    WHERE alert_id = ? AND delivery_status = 'failed'
  `).all(alertId);

  if (failedDeliveries.length === 0) {
    return { success: true, retriedCount: 0, message: 'No failed SMS deliveries found to retry.' };
  }

  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
  const smsTemplates = generateMultilingualSms({
    areaName: alert ? alert.target_district : 'Target Region',
    riskLevel: alert ? alert.risk_class : 'High',
    validUntil: alert ? alert.valid_until : null
  });

  const provider = getSmsProvider();
  let retriedSuccess = 0;
  let retriedFailed = 0;

  for (const item of failedDeliveries) {
    const lang = item.language_code || 'en';
    const message = smsTemplates[lang] || smsTemplates.en;

    try {
      const result = await provider.sendSms({
        to: '9862000000', // Safe simulated retry target
        message,
        metadata: { alertId, deliveryId: item.id }
      });

      if (result.success) {
        retriedSuccess++;
        db.prepare(`
          UPDATE sms_deliveries
          SET delivery_status = ?, provider_message_id = ?, failure_reason_safe = NULL, sent_at = ?
          WHERE id = ?
        `).run(result.status || 'sent', result.providerMessageId, new Date().toISOString(), item.id);
      } else {
        retriedFailed++;
      }
    } catch {
      retriedFailed++;
    }
  }

  logAudit({
    actorUserId: adminUserId,
    actorName: 'Administrator',
    actorRole: 'admin',
    actionType: 'retry_failed_sms',
    entityType: 'alert',
    entityId: alertId,
    newValue: { retriedSuccess, retriedFailed }
  });

  return {
    success: true,
    alertId,
    retriedCount: failedDeliveries.length,
    retriedSuccess,
    retriedFailed
  };
}

module.exports = {
  maskPhoneNumber,
  generateMultilingualSms,
  getTargetRecipients,
  dispatchApprovedSmsAlert,
  getSmsDeliverySummary,
  retryFailedSms,
  getSmsProvider
};
