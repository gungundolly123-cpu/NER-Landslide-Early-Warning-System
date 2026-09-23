/**
 * NEXZORA — Automatic GPS Location & Boundary Validation Test Suite
 * Validates GPS telemetry capture, coordinate limits, NER study area boundaries,
 * manual map pin selection, accuracy thresholds, offline sync, and role permissions.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const app = require('../server/server');
const db = require('../server/db');
const { isInsideNERStudyArea, estimateSpatialRisk } = require('../server/services/aiRiskLookup');

let server;
let baseUrl;

let citizenToken = '';
let officerToken = '';
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

  adminToken = await loginUser('9876543210', 'Admin@Nexzora2026!');
  officerToken = await loginUser('9876543211', 'Officer@Nexzora2026!');
  citizenToken = await loginUser('9876543213', 'Citizen@Nexzora2026!');
});

after(() => {
  if (server) server.close();
});

describe('1. Spatial Boundary & NER Study Area Validation Unit Tests', () => {
  it('1.1 Should correctly identify coordinates inside the NER study area', () => {
    // Guwahati, Assam
    assert.strictEqual(isInsideNERStudyArea(26.1445, 91.7362), true);
    // Shillong, Meghalaya
    assert.strictEqual(isInsideNERStudyArea(25.5788, 91.8933), true);
    // Gangtok, Sikkim
    assert.strictEqual(isInsideNERStudyArea(27.3389, 88.6065), true);
    // Itanagar, Arunachal Pradesh
    assert.strictEqual(isInsideNERStudyArea(27.0844, 93.6053), true);
    // Aizawl, Mizoram
    assert.strictEqual(isInsideNERStudyArea(23.7271, 92.7176), true);
    // Kohima, Nagaland
    assert.strictEqual(isInsideNERStudyArea(25.6751, 94.1086), true);
    // Agartala, Tripura
    assert.strictEqual(isInsideNERStudyArea(23.8315, 91.2868), true);
  });

  it('1.2 Should flag coordinates outside the NER study area', () => {
    // New Delhi
    assert.strictEqual(isInsideNERStudyArea(28.6139, 77.2090), false);
    // Mumbai
    assert.strictEqual(isInsideNERStudyArea(19.0760, 72.8777), false);
    // Bengaluru
    assert.strictEqual(isInsideNERStudyArea(12.9716, 77.5946), false);
    // London
    assert.strictEqual(isInsideNERStudyArea(51.5074, -0.1278), false);
    // Invalid/Null
    assert.strictEqual(isInsideNERStudyArea(null, null), false);
    assert.strictEqual(isInsideNERStudyArea(undefined, 91.7), false);
  });

  it('1.3 Spatial AI risk estimator should not fabricate local predictions outside NER', async () => {
    const outsidePrediction = await estimateSpatialRisk(19.0760, 72.8777);
    assert.strictEqual(outsidePrediction.outside_study_area, true);
    assert.strictEqual(outsidePrediction.ai_risk_status, 'outside_study_area');
    assert.strictEqual(outsidePrediction.ai_risk_class, 'Outside Model Coverage');
    assert.strictEqual(outsidePrediction.ai_risk_probability, null);

    const insidePrediction = await estimateSpatialRisk(25.5788, 91.8933);
    assert.strictEqual(insidePrediction.outside_study_area, false);
    assert.ok(insidePrediction.ai_risk_status === 'completed' || insidePrediction.ai_risk_status === 'calculated');
    assert.ok(insidePrediction.ai_risk_probability > 0);
  });
});

describe('2. Automatic GPS Location Capture & Report Submission', () => {
  it('2.1 Citizen can submit incident report with high-accuracy GPS telemetry', async () => {
    const payload = {
      incident_type: 'Falling Rocks',
      description: 'Multiple large boulders falling onto the NH-6 highway near Sonapur tunnel.',
      severity_reported: 'High',
      latitude: 25.1254,
      longitude: 92.3658,
      gps_accuracy_m: 6.8,
      altitude_m: 485.2,
      altitude_accuracy_m: 3.5,
      heading_deg: 142.5,
      speed_mps: 0.2,
      location_source: 'gps',
      location_captured_at: new Date().toISOString(),
      device_timezone: 'Asia/Kolkata',
      location_permission_status: 'granted',
      location_quality: 'high',
      allow_duplicate: true,
      state: 'Meghalaya',
      district: 'East Jaintia Hills',
      village_or_town: 'Sonapur',
      road_name: 'NH-6',
      landmark: 'Near Sonapur Tunnel Exit'
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
    assert.ok(data.report_id, 'Report ID should be returned');
    assert.strictEqual(data.report_status, 'pending_verification');
    assert.strictEqual(data.location.latitude, 25.1254);
    assert.strictEqual(data.location.longitude, 92.3658);
    assert.strictEqual(data.location.accuracy_m, 6.8);
    assert.strictEqual(data.location.altitude_m, 485.2);
    assert.strictEqual(data.location.source, 'gps');
    assert.strictEqual(data.location.quality, 'high');
    assert.strictEqual(data.outside_study_area, false);
    assert.ok(data.ai_risk_status === 'completed' || data.ai_risk_status === 'calculated');

    // Verify in database
    const dbReport = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(data.report_id);
    assert.ok(dbReport);
    assert.strictEqual(dbReport.latitude, 25.1254);
    assert.strictEqual(dbReport.longitude, 92.3658);
    assert.strictEqual(dbReport.gps_accuracy_m, 6.8);
    assert.strictEqual(dbReport.altitude_m, 485.2);
    assert.strictEqual(dbReport.altitude_accuracy_m, 3.5);
    assert.strictEqual(dbReport.heading_deg, 142.5);
    assert.strictEqual(dbReport.speed_mps, 0.2);
    assert.strictEqual(dbReport.location_source, 'gps');
    assert.strictEqual(dbReport.device_timezone, 'Asia/Kolkata');
    assert.strictEqual(dbReport.location_quality, 'high');
    assert.strictEqual(dbReport.outside_study_area, 0);
  });

  it('2.2 Citizen can submit incident report using manual map pin fallback', async () => {
    const payload = {
      incident_type: 'Crack on Road',
      description: 'Long longitudinal fissure discovered on state road, GPS was unavailable in deep gorge.',
      severity_reported: 'Medium',
      latitude: 27.3312,
      longitude: 88.6134,
      gps_accuracy_m: null,
      altitude_m: null,
      location_source: 'manual_map_pin',
      location_captured_at: new Date().toISOString(),
      device_timezone: 'Asia/Kolkata',
      location_permission_status: 'denied',
      location_quality: 'medium',
      allow_duplicate: true,
      state: 'Sikkim',
      district: 'Gangtok',
      village_or_town: 'Tadong',
      road_name: 'Gangtok-Rangpo Road'
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
    assert.strictEqual(data.location.source, 'manual_map_pin');
    assert.strictEqual(data.location.accuracy_m, null);
    assert.strictEqual(data.outside_study_area, false);

    const dbReport = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(data.report_id);
    assert.strictEqual(dbReport.location_source, 'manual_map_pin');
    assert.strictEqual(dbReport.location_permission_status, 'denied');
  });

  it('2.3 Report outside study area is saved with outside_study_area=true and no AI hallucination', async () => {
    const payload = {
      incident_type: 'Slope Movement',
      description: 'Testing slope incident reported from Delhi NCR test facility.',
      severity_reported: 'Low',
      latitude: 28.6139,
      longitude: 77.2090,
      gps_accuracy_m: 15.0,
      location_source: 'gps',
      location_captured_at: new Date().toISOString(),
      location_quality: 'high',
      allow_duplicate: true,
      state: 'Delhi',
      district: 'New Delhi'
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
    assert.strictEqual(data.outside_study_area, true);
    assert.strictEqual(data.ai_risk_status, 'outside_study_area');

    const dbReport = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(data.report_id);
    assert.strictEqual(dbReport.outside_study_area, 1);
    assert.strictEqual(dbReport.ai_risk_class, 'Outside Model Coverage');
  });
});

describe('3. Coordinate Validation & Quality Thresholds', () => {
  it('3.1 Rejects request when coordinates are completely missing', async () => {
    const payload = {
      incident_type: 'Major Landslide',
      description: 'Missing all location coordinates'
    };

    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Location coordinates'));
  });

  it('3.2 Rejects invalid latitude values out of range [-90, 90]', async () => {
    const payload = {
      incident_type: 'Major Landslide',
      description: 'Latitude out of range',
      latitude: 145.2,
      longitude: 91.7
    };

    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('latitude'));
  });

  it('3.3 Rejects invalid longitude values out of range [-180, 180]', async () => {
    const payload = {
      incident_type: 'Major Landslide',
      description: 'Longitude out of range',
      latitude: 26.1,
      longitude: -195.4
    };

    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('longitude'));
  });

  it('3.4 Correctly classifies low accuracy GPS (> 200m) into low quality', async () => {
    const payload = {
      incident_type: 'Damaged Bridge',
      description: 'Culvert cracked under heavy runoff, weak GPS lock.',
      severity_reported: 'High',
      latitude: 26.1823,
      longitude: 91.7456,
      gps_accuracy_m: 245.0, // > 200m = low
      location_source: 'gps',
      location_captured_at: new Date().toISOString(),
      location_quality: 'low',
      allow_duplicate: true,
      state: 'Assam',
      district: 'Kamrup Metropolitan'
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
    assert.strictEqual(data.location.quality, 'low');
    assert.strictEqual(data.location.accuracy_m, 245.0);
  });
});

describe('4. Offline Draft Sync with Location Telemetry', () => {
  it('4.1 Preserves exact captured timestamp, accuracy, and altitude during offline sync', async () => {
    const clientReportId = `draft-offline-gps-${Date.now()}`;
    const capturedTimestamp = '2026-09-23T21:45:00.000Z';

    const syncPayload = {
      client_report_id: clientReportId,
      incident_type: 'Blocked Road',
      description: 'Captured offline in zero-connectivity zone in Dima Hasao.',
      severity_reported: 'High',
      latitude: 25.1850,
      longitude: 93.0240,
      gps_accuracy_m: 14.2,
      altitude_m: 720.0,
      altitude_accuracy_m: 5.0,
      location_source: 'gps',
      location_captured_at: capturedTimestamp,
      device_timezone: 'Asia/Kolkata',
      location_permission_status: 'granted',
      location_quality: 'high',
      state: 'Assam',
      district: 'Dima Hasao',
      road_name: 'Haflong Hill Highway'
    };

    const res = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(syncPayload)
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.synced, true);
    assert.strictEqual(data.location.accuracy_m, 14.2);
    assert.strictEqual(data.location.altitude_m, 720.0);
    assert.strictEqual(data.location.captured_at, capturedTimestamp);

    // Verify DB stored original captured timestamp without overriding
    const dbReport = db.prepare('SELECT * FROM incident_reports WHERE client_report_id = ?').get(clientReportId);
    assert.ok(dbReport);
    assert.strictEqual(dbReport.location_captured_at, capturedTimestamp);
    assert.strictEqual(dbReport.altitude_m, 720.0);
    assert.strictEqual(dbReport.latitude, 25.1850);
  });

  it('4.2 Rejects offline sync if location is missing', async () => {
    const clientReportId = `draft-invalid-${Date.now()}`;
    const syncPayload = {
      client_report_id: clientReportId,
      incident_type: 'Crack on Hill Slope',
      description: 'Missing location in offline draft'
    };

    const res = await fetch(`${baseUrl}/api/incidents/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${citizenToken}`
      },
      body: JSON.stringify(syncPayload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Location coordinates'));
  });
});

describe('5. Access Control & Security on Location Telemetry', () => {
  it('5.1 Unauthenticated requests cannot submit reports or location telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incident_type: 'Minor Landslide',
        latitude: 26.1,
        longitude: 91.7
      })
    });

    assert.strictEqual(res.status, 401);
  });

  it('5.2 Field Officer can query verified and pending incident locations in their jurisdiction', async () => {
    const res = await fetch(`${baseUrl}/api/field-officer/incidents?district=East+Khasi+Hills`, {
      headers: { 'Authorization': `Bearer ${officerToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.reports));
    if (data.reports.length > 0) {
      const inc = data.reports[0];
      assert.ok(typeof inc.latitude === 'number');
      assert.ok(typeof inc.longitude === 'number');
    }
  });
});
