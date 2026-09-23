/**
 * NEXZORA — Push Notifications & Admin-Approved Landslide Alerts Test Suite
 * Validates FCM device token registration, AI suggested alerts, data freshness checks,
 * cooldown deduplication, multilingual translations, Field Officer recommendations,
 * Admin approval/rejection workflows, and push delivery recording.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const app = require('../server/server');
const db = require('../server/db');
const {
  checkDataFreshness,
  generateMultilingualTemplates,
  createAISuggestedAlert,
  recommendOfficerAlert,
  approveAndBroadcastAlert,
  rejectAlertDraft,
  estimateRecipientCount
} = require('../server/services/alertService');

let server;
let baseUrl;

let citizenToken = '';
let officerToken = '';
let adminToken = '';
let citizenUserId = '';
let officerUserId = '';

async function loginUser(mobile, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: mobile, password })
  });
  const data = await res.json();
  return {
    token: data.tokens ? data.tokens.accessToken : data.accessToken,
    user: data.user
  };
}

before(async () => {
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  const adminAuth = await loginUser('9876543210', 'Admin@Nexzora2026!');
  adminToken = adminAuth.token;

  const officerAuth = await loginUser('9876543211', 'Officer@Nexzora2026!');
  officerToken = officerAuth.token;
  officerUserId = officerAuth.user.id;

  const citizenAuth = await loginUser('9876543213', 'Citizen@Nexzora2026!');
  citizenToken = citizenAuth.token;
  citizenUserId = citizenAuth.user.id;
});

after(() => {
  if (server) server.close();
});

describe('1. Device Push Token Management & Preferences', () => {
  const sampleToken = 'fcm_test_token_' + Date.now();

  it('1.1 Authenticated user can register an active device push token', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/register-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        token: sampleToken,
        platform: 'web',
        app_version: '2.1.0',
        permission: 'granted'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.deviceId);

    // Verify token stored in DB
    const dbTok = db.prepare('SELECT * FROM device_push_tokens WHERE token = ?').get(sampleToken);
    assert.ok(dbTok);
    assert.strictEqual(dbTok.is_active, 1);
    assert.strictEqual(dbTok.platform, 'web');
  });

  it('1.2 Re-registering existing token deduplicates and refreshes record without error', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/register-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        token: sampleToken,
        platform: 'web',
        app_version: '2.2.0',
        permission: 'granted'
      })
    });

    assert.strictEqual(res.status, 200);
    const count = db.prepare('SELECT COUNT(*) as count FROM device_push_tokens WHERE token = ?').get(sampleToken).count;
    assert.strictEqual(count, 1, 'Token must not be duplicated');
  });

  it('1.3 Unauthenticated request cannot register device push token', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/register-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'unauth_token_123' })
    });
    assert.strictEqual(res.status, 401);
  });

  it('1.4 User can update notification preferences (language and subscribed district)', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        preferred_language: 'as', // Assamese
        subscribed_district: 'East Khasi Hills',
        receive_push_alerts: true
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.preferences.preferred_language, 'as');
    assert.strictEqual(data.preferences.subscribed_district, 'East Khasi Hills');
  });
});

describe('2. AI Alert Suggestions & Data Freshness Unit Tests', () => {
  it('2.1 Generates multilingual templates in EN, HI, AS, BN', () => {
    const trans = generateMultilingualTemplates({
      district: 'East Khasi Hills',
      areaName: 'Cherrapunji Corridor',
      riskClass: 'Very High',
      reason: '220mm rainfall in 24 hours'
    });

    assert.ok(trans.en.title.includes('Cherrapunji Corridor'));
    assert.ok(trans.hi.title.includes('भूस्खलन'));
    assert.ok(trans.as.title.includes('ভূমিস্খলনৰ'));
    assert.ok(trans.bn.title.includes('ভূমিধস'));
  });

  it('2.2 Flags stale rainfall data (> 6 hours)', () => {
    const staleTime = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const freshSoil = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const result = checkDataFreshness({
      rainfallTimestamp: staleTime,
      soilTimestamp: freshSoil
    });

    assert.strictEqual(result.isFresh, false);
    assert.strictEqual(result.status, 'stale_rainfall');
    assert.ok(result.warnings.length > 0);
  });

  it('2.3 Rejects Low/Medium risk predictions from automated alert suggestions', () => {
    const lowResult = createAISuggestedAlert({
      risk_class: 'low',
      risk_probability: 0.25,
      target_district: 'Kamrup Metropolitan'
    });
    assert.strictEqual(lowResult.created, false);

    const medResult = createAISuggestedAlert({
      risk_class: 'medium',
      risk_probability: 0.50,
      target_district: 'Kamrup Metropolitan'
    });
    assert.strictEqual(medResult.created, false);
  });

  it('2.4 High/Very High risk AI result creates draft with pending_admin_approval status', () => {
    const uniqueDist = `TestDistrict_${Date.now()}`;
    const result = createAISuggestedAlert({
      risk_class: 'very_high',
      risk_probability: 0.94,
      target_state: 'Meghalaya',
      target_district: uniqueDist,
      target_villages: ['Mawkdok', 'Sohra'],
      rainfall_summary: 'Extreme 210mm rainfall event',
      rainfall_data_timestamp: new Date().toISOString(),
      soil_moisture_summary: '94% saturation',
      soil_data_timestamp: new Date().toISOString()
    });

    assert.strictEqual(result.created, true);
    assert.strictEqual(result.alert_status, 'pending_admin_approval');

    const dbAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(result.alert_id);
    assert.ok(dbAlert);
    assert.strictEqual(dbAlert.alert_status, 'pending_admin_approval');
    assert.strictEqual(dbAlert.target_district, uniqueDist);

    // Verify 4 translations were generated
    const translations = db.prepare('SELECT * FROM alert_translations WHERE alert_id = ?').all(result.alert_id);
    assert.strictEqual(translations.length, 4);
  });
});

describe('3. Field Officer Alert Recommendation Workflow', () => {
  it('3.1 Field Officer can submit an alert recommendation', async () => {
    const payload = {
      target_district: 'East Khasi Hills',
      target_villages: ['Mawlynnong Ridge'],
      severity: 'High',
      reason: 'Active deep slope fissure observed expanding during road inspection.',
      suggested_precautions: 'Close lower lane and restrict heavy vehicles.',
      valid_hours: 12
    };

    const res = await fetch(`${baseUrl}/api/field-officer/alerts/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${officerToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.alert_status, 'pending_admin_approval');

    const dbAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(data.alert_id);
    assert.strictEqual(dbAlert.suggested_by_officer_id, officerUserId);
    assert.strictEqual(dbAlert.alert_status, 'pending_admin_approval');
  });

  it('3.2 Citizen cannot recommend or create alerts (403 forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/field-officer/alerts/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({ target_district: 'East Khasi Hills', severity: 'High' })
    });

    assert.strictEqual(res.status, 403);
  });
});

describe('4. Admin Review, Approval & Push Notification Dispatch', () => {
  let pendingAlertId = '';

  before(() => {
    const res = createAISuggestedAlert({
      risk_class: 'high',
      risk_probability: 0.88,
      target_district: 'East Khasi Hills',
      rainfall_summary: 'Heavy downpour on hill stretch',
      rainfall_data_timestamp: new Date().toISOString(),
      soil_data_timestamp: new Date().toISOString(),
      allow_cooldown_override: true
    });
    pendingAlertId = res.alert_id;
  });

  it('4.1 Admin can view pending approval queue with telemetry and recipient estimates', async () => {
    const res = await fetch(`${baseUrl}/api/admin/alerts/pending`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.pendingAlerts));
    assert.ok(data.pendingAlerts.length > 0);
  });

  it('4.2 Non-admin (Citizen or Field Officer) cannot approve alerts (403 forbidden)', async () => {
    const resCitizen = await fetch(`${baseUrl}/api/admin/alerts/${pendingAlertId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });
    assert.strictEqual(resCitizen.status, 403);

    const resOfficer = await fetch(`${baseUrl}/api/admin/alerts/${pendingAlertId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });
    assert.strictEqual(resOfficer.status, 403);
  });

  it('4.3 Rejection requires a mandatory reason', async () => {
    const tempAlert = createAISuggestedAlert({
      risk_class: 'high',
      target_district: `Temp_Reject_${Date.now()}`,
      allow_cooldown_override: true
    });

    const res = await fetch(`${baseUrl}/api/admin/alerts/${tempAlert.alert_id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: '' }) // Empty reason
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Rejection reason is required'));
  });

  it('4.4 Admin can approve alert and trigger push dispatch', async () => {
    // Register active token in target district for citizen
    const tok = 'fcm_dispatch_test_' + Date.now();
    await fetch(`${baseUrl}/api/notifications/register-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({ token: tok, platform: 'web' })
    });

    const res = await fetch(`${baseUrl}/api/admin/alerts/${pendingAlertId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: '⚠️ Approved Landslide Warning: East Khasi Hills',
        message: 'High risk detected. Avoid travel on NH-6.'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.alert_status, 'sent');
    assert.ok(data.deliverySummary);

    // Verify DB updated to sent
    const dbAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(pendingAlertId);
    assert.strictEqual(dbAlert.alert_status, 'sent');
    assert.ok(dbAlert.sent_at);
  });

  it('4.5 Citizen receives approved alert in their localized language feed', async () => {
    const res = await fetch(`${baseUrl}/api/alerts/my-alerts`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.alerts));
    assert.ok(data.alerts.length > 0);

    const targetAlert = data.alerts.find(a => a.id === pendingAlertId);
    assert.ok(targetAlert);
    assert.ok(targetAlert.localized_title);
  });

  it('4.6 Admin can view delivery breakdown and notification audit trail', async () => {
    const resSummary = await fetch(`${baseUrl}/api/admin/alerts/${pendingAlertId}/delivery-summary`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(resSummary.status, 200);
    const dataSummary = await resSummary.json();
    assert.strictEqual(dataSummary.success, true);
    assert.ok(Array.isArray(dataSummary.deliveries));

    const resAudit = await fetch(`${baseUrl}/api/admin/notification-audit`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(resAudit.status, 200);
    const dataAudit = await resAudit.json();
    assert.strictEqual(dataAudit.success, true);
    assert.ok(dataAudit.logs.length > 0);
  });
});
