/**
 * NEXZORA — Web Dashboard, Offline Sync & Admin SMS Alert Delivery Test Suite
 * Validates Feature A (Offline Sync & Idempotency), Feature B (Field Officer/Admin Dashboard),
 * and Feature C (Admin-Approved SMS Alert Delivery).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server/server');
const db = require('../server/db');
const {
  maskPhoneNumber,
  generateMultilingualSms,
  getTargetRecipients,
  dispatchApprovedSmsAlert,
  getSmsDeliverySummary
} = require('../server/services/smsService');

let server;
let baseUrl;

let citizenToken = '';
let officerToken = '';
let adminToken = '';
let testAlertId = '';

async function loginUser(mobile, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: mobile, password })
  });
  const data = await res.json();
  return data.tokens ? data.tokens.accessToken : data.accessToken;
}

before(async () => {
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  adminToken = await loginUser('9876543210', 'Admin@Nexzora2026!');
  officerToken = await loginUser('9876543211', 'Officer@Nexzora2026!');
  citizenToken = await loginUser('9876543213', 'Citizen@Nexzora2026!');

  // Seed a test alert in DB for SMS test suite
  testAlertId = `alt_test_${Date.now()}`;
  db.prepare(`
    INSERT INTO alerts (
      id, alert_reference_code, title, message, severity, risk_class,
      target_district, target_districts, status, alert_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 'approved', datetime('now'), datetime('now'))
  `).run(
    testAlertId,
    `REF-TEST-${Date.now()}`,
    'Test High Risk Alert',
    'Heavy rain triggering mudflow risk',
    'High',
    'High',
    'East Khasi Hills',
    JSON.stringify(['East Khasi Hills'])
  );
});

after(() => {
  if (server) server.close();
});

describe('1. Feature A: Offline Reporting & Idempotent Sync', () => {
  const clientReportId = `client_uuid_${Date.now()}`;

  it('1.1 Citizen can sync an offline report draft with client_report_id', async () => {
    const res = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        client_report_id: clientReportId,
        incident_type: 'Landslide',
        severity_reported: 'High',
        description: 'Offline ground report captured during road blockage near Nongpoh.',
        latitude: 25.9030,
        longitude: 91.8810,
        location_accuracy_m: 12.5,
        location_source: 'gps',
        district: 'Ri-Bhoi',
        state: 'Meghalaya'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, true);
    assert.ok(data.official_report_id || data.report_id || data.report);
  });

  it('1.2 Re-syncing the same client_report_id returns the existing report idempotently', async () => {
    const res = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        client_report_id: clientReportId,
        incident_type: 'Landslide',
        severity_reported: 'High',
        description: 'Duplicate attempt to sync same offline draft.',
        latitude: 25.9030,
        longitude: 91.8810,
        district: 'Ri-Bhoi',
        state: 'Meghalaya'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    // Should indicate already synced or return the same report
    assert.ok(data.official_report_id || data.report || data.already_synced);
  });
});

describe('2. Feature B: Field Officer & Admin Web Dashboard', () => {
  it('2.1 Citizen cannot access dashboard summary API (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary?district=East%20Khasi%20Hills`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  it('2.2 Field Officer dashboard summary is restricted to assigned district', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary?district=all`, {
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    // Should automatically fallback to East Khasi Hills (assigned jurisdiction)
    assert.strictEqual(data.district.toLowerCase(), 'east khasi hills');
    assert.ok(typeof data.summary.highRiskRoads === 'number');
    assert.ok(data.freshness.rainfall);
  });

  it('2.3 Admin can query global or specific district dashboard summary', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary?district=all`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.district, 'all');
    assert.ok(data.summary.newCitizenReports >= 0);
    assert.ok(data.summary.roadsBlocked >= 0);
  });

  it('2.4 Dashboard map-layers endpoint returns roads, incidents, and infrastructure', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/map-layers?district=East%20Khasi%20Hills`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.layers.roads));
    assert.ok(Array.isArray(data.layers.riskHotspots));
    assert.ok(Array.isArray(data.layers.vulnerableInfrastructure));
  });

  it('2.5 Dashboard environment endpoint returns multi-day rainfall telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/environment?district=East%20Khasi%20Hills`, {
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.environment.rainfall_1d_mm >= 0);
    assert.ok(data.environment.volumetricSoilMoisturePct >= 0);
    assert.strictEqual(data.environment.freshness, 'Fresh');
  });

  it('2.6 Emergency priority ranking ranks hazards with decision-support disclaimer', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/emergency-priorities?district=East%20Khasi%20Hills`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.priorities));
    assert.ok(data.disclaimer.includes('decision-support'));
  });
});

describe('3. Feature C: Admin-Approved SMS Alert Delivery', () => {
  it('3.1 Phone number masking masks sensitive digits correctly', () => {
    assert.strictEqual(maskPhoneNumber('9876543210'), '98XXXXXX10');
    assert.strictEqual(maskPhoneNumber('+919862001122'), '98XXXXXX22');
  });

  it('3.2 Multilingual SMS generator produces concise messages in EN, HI, AS, BN', () => {
    const templates = generateMultilingualSms({
      areaName: 'East Khasi Hills',
      riskLevel: 'Very High',
      validUntil: new Date().toISOString()
    });

    assert.ok(templates.en.includes('LANDSLIDE ALERT: VERY HIGH'));
    assert.ok(templates.hi.includes('भूस्खलन चेतावनी'));
    assert.ok(templates.as.includes('ভূমিস্খলন সতৰ্কবাৰ্তা'));
    assert.ok(templates.bn.includes('ভূমিধস সতর্কতা'));
  });

  it('3.3 Citizen or Field Officer cannot dispatch SMS alert directly (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/alerts/${testAlertId}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${officerToken}`
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 403);
  });

  it('3.4 Admin can view SMS recipient breakdown and preview', async () => {
    const res = await fetch(`${baseUrl}/api/admin/alerts/${testAlertId}/recipients`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.counts.total > 0);
    assert.ok(data.smsPreviews.en);
    assert.ok(Array.isArray(data.sampleRecipients));
    // Verify phone numbers in sampleRecipients are masked
    assert.ok(data.sampleRecipients[0].maskedPhone.includes('X'));
  });

  it('3.5 Admin can approve and dispatch SMS broadcast in test simulation mode', async () => {
    const res = await fetch(`${baseUrl}/api/admin/alerts/${testAlertId}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ allow_cooldown_override: true })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, true);
    assert.ok(data.sentCount > 0);
    assert.strictEqual(data.provider, 'test_simulation');
  });

  it('3.6 Admin can retrieve SMS delivery summary and audit records', async () => {
    const res = await fetch(`${baseUrl}/api/admin/alerts/${testAlertId}/sms-delivery-summary`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats.total > 0);
    assert.ok(Array.isArray(data.deliveries));
    assert.ok(data.deliveries[0].phone_number_masked.includes('X'));
  });

  it('3.7 Admin can list, create and remove emergency contacts in directory', async () => {
    // 1. Create Contact
    const createRes = await fetch(`${baseUrl}/api/admin/emergency-contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        contact_name: 'Shillong Civil Hospital Emergency Desk',
        phone_number: '9862009988',
        contact_type: 'emergency_contact',
        state: 'Meghalaya',
        district: 'East Khasi Hills',
        preferred_language: 'en'
      })
    });

    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createData.success, true);
    const createdId = createData.contact.id;

    // 2. List Contacts
    const listRes = await fetch(`${baseUrl}/api/admin/emergency-contacts?district=East%20Khasi%20Hills`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.ok(listData.contacts.length >= 1);

    // 3. Delete Contact
    const delRes = await fetch(`${baseUrl}/api/admin/emergency-contacts/${createdId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const delData = await delRes.json();
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delData.success, true);
  });
});
