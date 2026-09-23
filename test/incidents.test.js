/**
 * NEXZORA — Incident Reporting & GIS Verification Automated Test Suite
 * Validates Citizen reporting, offline sync, media safety, AI risk lookup,
 * Field Officer district verification, road updates, and Admin moderation.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const app = require('../server/server');
const db = require('../server/db');
const { estimateSpatialRisk, calculatePriorityScore } = require('../server/services/aiRiskLookup');
const { validateMedia } = require('../server/services/mediaStorage');

let server;
let baseUrl;

// Sample 1x1 Transparent PNG Base64
const SAMPLE_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Test Users
let citizenToken = '';
let officerKhasiToken = '';
let officerGangtokToken = '';
let adminToken = '';

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

  // Log in seed accounts
  adminToken = await loginUser('9876543210', 'Admin@Nexzora2026!');
  officerKhasiToken = await loginUser('9876543211', 'Officer@Nexzora2026!');
  citizenToken = await loginUser('9876543213', 'Citizen@Nexzora2026!');
});

after(() => {
  if (server) server.close();
});

describe('1. Citizen Incident Report Creation & Workflows', () => {
  it('1.1 Citizen can submit a valid incident report with GPS and media', async () => {
    const payload = {
      incident_type: 'Minor Landslide',
      description: 'Massive debris and soil sliding down the eastern hill slope near Shillong Peak road.',
      severity_reported: 'High',
      latitude: 25.5420,
      longitude: 91.8540,
      gps_accuracy_m: 8.5,
      location_source: 'gps',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_town: 'Upper Shillong',
      road_name: 'Shillong Peak Road',
      allow_duplicate: true,
      media: [
        { dataUrl: SAMPLE_PNG_BASE64, name: 'slope_crack_evidence.png' }
      ]
    };

    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.report.incident_type, 'Minor Landslide');
    assert.strictEqual(data.report.status, 'Pending Verification');
    assert.strictEqual(data.report.district, 'East Khasi Hills');
    assert.strictEqual(data.report.media_count, 1);
    assert(data.report.ai_risk_probability > 0, 'AI risk probability must be populated');
  });

  it('1.2 Citizen can view only their own submitted reports', async () => {
    const res = await fetch(`${baseUrl}/api/incidents/my-reports`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.reports));
    // All reports must belong to citizen usr_citizen_001
    data.reports.forEach(r => {
      assert.strictEqual(r.reporter_user_id, 'usr_citizen_001');
    });
  });

  it('1.3 Citizen can edit draft / pending verification report', async () => {
    // Create new report
    const createRes = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        incident_type: 'Crack on Road',
        description: 'Initial crack observed on highway lane.',
        latitude: 25.56,
        longitude: 91.88,
        state: 'Meghalaya',
        district: 'East Khasi Hills',
        allow_duplicate: true
      })
    });
    const created = (await createRes.json()).report;

    // Edit description
    const editRes = await fetch(`${baseUrl}/api/incidents/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        description: 'Updated: Crack has widened to 15 centimeters and water is seeping through.',
        landmark: 'Near Milestone 4'
      })
    });

    assert.strictEqual(editRes.status, 200);
    const editData = await editRes.json();
    assert.strictEqual(editData.success, true);
    assert(editData.report.description.includes('widened to 15 centimeters'));
  });
});

describe('2. Input Validation Rules & Media Security', () => {
  it('2.1 Missing incident type fails validation with 400', async () => {
    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        description: 'Some valid length description here.',
        latitude: 25.5,
        longitude: 91.8
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('2.2 Description shorter than 10 characters fails validation with 400', async () => {
    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        incident_type: 'Mud or Debris on Road',
        description: 'Too short',
        latitude: 25.5,
        longitude: 91.8
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('2.3 Invalid coordinates fail validation with 400', async () => {
    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify({
        incident_type: 'Mud or Debris on Road',
        description: 'Valid description for incident location.',
        latitude: 145.0, // Invalid lat
        longitude: 91.8
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('2.4 Executable or script files are strictly rejected by media validator', () => {
    const scriptCheck = validateMedia({
      originalName: 'exploit.sh',
      mimeType: 'application/x-sh',
      sizeBytes: 1024
    });
    assert.strictEqual(scriptCheck.valid, false);
    assert(scriptCheck.error.includes('strictly prohibited'));

    const exeCheck = validateMedia({
      originalName: 'malware.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 2048
    });
    assert.strictEqual(exeCheck.valid, false);
  });

  it('2.5 Duplicate submission warning is triggered for repeated reports within 24h', async () => {
    const uniqueLat = 23.0 + ((Date.now() % 100000) / 100000) * 0.8;
    const uniqueLng = 90.0 + ((Date.now() % 100000) / 100000) * 0.8;
    const payload = {
      incident_type: 'Flooded Road',
      description: 'Water depth over 2 feet near river bank culvert.',
      latitude: uniqueLat,
      longitude: uniqueLng,
      district: 'East Khasi Hills'
    };

    // First submit
    const res1 = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res1.status, 201);

    // Repeated submit without allow_duplicate
    const res2 = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res2.status, 409);
    const data = await res2.json();
    assert.strictEqual(data.code, 'DUPLICATE_REPORT_DETECTED');
  });
});

describe('3. Offline Reporting & Idempotent Sync', () => {
  it('3.1 Offline report syncs idempotently via client_report_id', async () => {
    const clientReportId = 'client_rep_test_' + Date.now();
    const payload = {
      client_report_id: clientReportId,
      incident_type: 'Falling Rocks',
      description: 'Continuous rockfall on hillside stretch near Nongpoh.',
      severity_reported: 'High',
      latitude: 25.9010,
      longitude: 91.8790,
      state: 'Meghalaya',
      district: 'East Khasi Hills'
    };

    // Sync attempt 1
    const res1 = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.results.synced, true);

    // Sync attempt 2 (Repeated sync)
    const res2 = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.results.alreadyExists, true);

    // Ensure database contains only 1 record for this client_report_id
    const dbCount = db.prepare('SELECT COUNT(*) as count FROM incident_reports WHERE client_report_id = ?').get(clientReportId).count;
    assert.strictEqual(dbCount, 1);
  });
});

describe('4. Field Officer District Operations & Verification Lifecycle', () => {
  let incidentId;

  before(async () => {
    // Create an incident in East Khasi Hills (Officer usr_officer_001's assigned district)
    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({
        incident_type: 'Road Partially Blocked',
        description: 'Landslide debris covering left lane of highway NH-6.',
        severity_reported: 'Medium',
        latitude: 25.5500,
        longitude: 91.8600,
        district: 'East Khasi Hills',
        state: 'Meghalaya',
        allow_duplicate: true
      })
    });
    const data = await res.json();
    incidentId = data.report.id;
  });

  it('4.1 Field Officer can view queue of reports in assigned district', async () => {
    const res = await fetch(`${baseUrl}/api/field-officer/incidents`, {
      headers: { 'Authorization': `Bearer ${officerKhasiToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.reports.length > 0);
    // Verified reports have priority_score calculated
    assert(data.reports[0].priority_score !== undefined);
  });

  it('4.2 Field Officer can transition status: Pending Verification -> Under Review -> Verified', async () => {
    // 1. Move to Under Review
    const res1 = await fetch(`${baseUrl}/api/field-officer/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${officerKhasiToken}` },
      body: JSON.stringify({ status: 'Under Review', verification_notes: 'Officer en-route with inspection crew.' })
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.report.status, 'Under Review');

    // 2. Complete Verification
    const res2 = await fetch(`${baseUrl}/api/field-officer/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${officerKhasiToken}` },
      body: JSON.stringify({
        status: 'Verified',
        verified_severity: 'High',
        verification_notes: 'Ground survey confirms 40m slope fissure. Heavy machinery required.'
      })
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.report.status, 'Verified');
    assert.strictEqual(data2.report.severity_verified, 'High');
  });

  it('4.3 Field Officer can update related road connectivity status', async () => {
    const res = await fetch(`${baseUrl}/api/field-officer/incidents/${incidentId}/road-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${officerKhasiToken}` },
      body: JSON.stringify({
        road_name: 'NH-6 Shillong Corridor',
        status: 'Partially Blocked',
        update_note: 'One lane blocked by landslide debris at km 42.'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.roadUpdate.status, 'Partially Blocked');
  });

  it('4.4 Field Officer CANNOT verify reports outside their assigned district', async () => {
    // Create report in Sikkim (Outside East Khasi Hills)
    const outRes = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({
        incident_type: 'Major Landslide',
        description: 'Huge boulder fall on Sikkim mountain road.',
        latitude: 27.35,
        longitude: 88.62,
        district: 'Gangtok',
        state: 'Sikkim',
        allow_duplicate: true
      })
    });
    const outsideIncident = (await outRes.json()).report;

    // East Khasi Hills officer attempts verification on Gangtok report
    const verifyRes = await fetch(`${baseUrl}/api/field-officer/incidents/${outsideIncident.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${officerKhasiToken}` },
      body: JSON.stringify({ status: 'Verified' })
    });

    assert.strictEqual(verifyRes.status, 403);
    const data = await verifyRes.json();
    assert.strictEqual(data.code, 'DISTRICT_MISMATCH');
  });
});

describe('5. Admin Operations & Governance', () => {
  it('5.1 Admin can view all-district reports and summary analytics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.summary.total > 0);
    assert(data.summary.pending >= 0);
    assert(data.summary.verified >= 0);
  });

  it('5.2 Admin can mark duplicate reports safely', async () => {
    // Create report to duplicate
    const r1 = await (await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({
        incident_type: 'Damaged Bridge',
        description: 'Crack on bridge abutment.',
        latitude: 25.5,
        longitude: 91.8,
        district: 'East Khasi Hills',
        allow_duplicate: true
      })
    })).json();

    const r2 = await (await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({
        incident_type: 'Damaged Bridge',
        description: 'Second report of same bridge issue.',
        latitude: 25.5,
        longitude: 91.8,
        district: 'East Khasi Hills',
        allow_duplicate: true
      })
    })).json();

    const dupRes = await fetch(`${baseUrl}/api/admin/incidents/${r2.report.id}/mark-duplicate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        duplicate_of_report_id: r1.report.id,
        note: 'Verified duplicate of earlier reported abutment issue.'
      })
    });

    assert.strictEqual(dupRes.status, 200);
    const dupData = await dupRes.json();
    assert.strictEqual(dupData.report.status, 'Duplicate');
    assert.strictEqual(dupData.report.duplicate_of_report_id, r1.report.id);
  });
});

describe('6. AI Risk Lookup & GIS Priority Scoring', () => {
  it('6.1 AI Spatial Risk lookup returns accurate risk class for East Khasi Hills', () => {
    const risk = estimateSpatialRisk(25.5788, 91.8933);
    assert(risk.ai_risk_probability >= 0.70);
    assert(['High', 'Critical'].includes(risk.ai_risk_class));
    assert(risk.ai_data_timestamp !== null);
  });

  it('6.2 AI lookup handles invalid / null coordinates gracefully without crashing', () => {
    const risk = estimateSpatialRisk(null, null);
    assert.strictEqual(risk.ai_risk_probability, null);
    assert.strictEqual(risk.ai_risk_class, 'Unavailable');
  });

  it('6.3 Priority scoring ranks major landslide and high AI risk as Critical/High', () => {
    const scoreInfo = calculatePriorityScore({
      incident_type: 'Major Landslide',
      severity_reported: 'High',
      ai_risk_class: 'Critical',
      road_status_at_report_time: 'Fully Blocked'
    });

    assert(scoreInfo.priorityScore >= 80, `Expected score >= 80, got ${scoreInfo.priorityScore}`);
    assert.strictEqual(scoreInfo.priorityLevel, 'Critical');
  });
});

describe('7. Role Security & IDOR Access Control', () => {
  it('7.1 Citizen cannot access Admin incidents endpoint (403)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/incidents`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  it('7.2 Citizen cannot verify or change incident status (403)', async () => {
    const res = await fetch(`${baseUrl}/api/field-officer/incidents/rep_001/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${citizenToken}` },
      body: JSON.stringify({ status: 'Verified' })
    });
    assert.strictEqual(res.status, 403);
  });
});
