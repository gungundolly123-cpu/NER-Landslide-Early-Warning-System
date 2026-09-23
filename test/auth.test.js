/**
 * NEXZORA — Automated Authentication & RBAC Test Suite
 * Validates all 16 security and operational test cases using Node.js native test runner.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = './data/nexzora.db';

const app = require('../server/server');
const db = require('../server/db');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function generateTestPhone() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
}

describe('NEXZORA RBAC & Authentication Suite', () => {
  let adminToken = '';
  let officerToken = '';
  let citizenToken = '';

  before(async () => {
    // Reset seed states for officer_002
    db.prepare("DELETE FROM officer_assignments WHERE user_id = 'usr_officer_002'").run();
    db.prepare("UPDATE users SET account_status = 'pending_verification' WHERE id = 'usr_officer_002'").run();
    db.prepare("UPDATE users SET account_status = 'active' WHERE id = 'usr_citizen_001'").run();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Obtain token for default seeded admin
    const adminRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543210',
      password: 'Admin@Nexzora2026!'
    });
    assert.equal(adminRes.status, 200);
    adminToken = adminRes.body.tokens.accessToken;

    // Obtain token for seeded active officer
    const officerRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543211',
      password: 'Officer@Nexzora2026!'
    });
    assert.equal(officerRes.status, 200);
    officerToken = officerRes.body.tokens.accessToken;

    // Obtain token for seeded active citizen
    const citizenRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543213',
      password: 'Citizen@Nexzora2026!'
    });
    assert.equal(citizenRes.status, 200);
    citizenToken = citizenRes.body.tokens.accessToken;
  });

  after(() => {
    if (server) server.close();
  });

  // TEST 1: Citizen registration & OTP verification
  it('1. Citizen can register and verify OTP to become Active', async () => {
    const phone = generateTestPhone();
    const regRes = await makeRequest('POST', '/api/auth/register', {
      full_name: 'Test Citizen User',
      mobile_number: phone,
      password: 'SecurePassword123!',
      confirm_password: 'SecurePassword123!',
      role: 'citizen',
      state: 'Assam',
      district: 'Jorhat',
      village_town: 'Jorhat Town',
      consent_accepted: true
    });

    assert.equal(regRes.status, 201);
    assert.ok(regRes.body.devCode, 'Dev code should be returned in test mode');

    const verifyRes = await makeRequest('POST', '/api/auth/verify-otp', {
      mobile_number: phone,
      otp_code: regRes.body.devCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.account_status, 'active');
    assert.equal(verifyRes.body.user.role, 'citizen');
  });

  // TEST 2: Role escalation prevention
  it('2. Citizen cannot select or register as Admin', async () => {
    const phone = generateTestPhone();
    const res = await makeRequest('POST', '/api/auth/register', {
      full_name: 'Hacker User',
      mobile_number: phone,
      password: 'SecurePassword123!',
      confirm_password: 'SecurePassword123!',
      role: 'admin',
      state: 'Assam',
      district: 'Kamrup Metropolitan',
      village_town: 'Guwahati',
      consent_accepted: true
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'INVALID_ROLE');
  });

  // TEST 3: Field Officer registration starts as Pending Verification
  it('3. Field Officer registration creates Pending Verification account', async () => {
    const phone = generateTestPhone();
    const regRes = await makeRequest('POST', '/api/auth/register', {
      full_name: 'Test Officer User',
      mobile_number: phone,
      password: 'SecurePassword123!',
      confirm_password: 'SecurePassword123!',
      role: 'field_officer',
      state: 'Sikkim',
      district: 'Mangan',
      village_town: 'Mangan Base',
      consent_accepted: true
    });

    assert.equal(regRes.status, 201);

    const verifyRes = await makeRequest('POST', '/api/auth/verify-otp', {
      mobile_number: phone,
      otp_code: regRes.body.devCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.account_status, 'pending_verification');
    assert.equal(verifyRes.body.redirectUrl, '/account-pending');
  });

  // TEST 4: Pending Field Officer cannot verify reports
  it('4. Pending Field Officer cannot verify reports', async () => {
    // Ensure usr_officer_002 is pending
    db.prepare("UPDATE users SET account_status = 'pending_verification' WHERE id = 'usr_officer_002'").run();

    const loginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543212',
      password: 'Officer@Nexzora2026!'
    });
    assert.equal(loginRes.status, 200);
    const pendingToken = loginRes.body.tokens.accessToken;

    const verifyAttempt = await makeRequest('PATCH', '/api/field-officer/reports/rep_002/verify', {
      status: 'Verified',
      verification_notes: 'Unauthorized verification attempt'
    }, { 'Authorization': `Bearer ${pendingToken}` });

    assert.equal(verifyAttempt.status, 403);
    assert.equal(verifyAttempt.body.code, 'ACCOUNT_NOT_ACTIVE');
  });

  // TEST 5: Admin can approve Field Officer and assign district
  it('5. Admin can approve Field Officer and assign district', async () => {
    db.prepare("DELETE FROM officer_assignments WHERE user_id = 'usr_officer_002'").run();

    const assignRes = await makeRequest('POST', '/api/admin/field-officers/usr_officer_002/assignments', {
      state: 'Sikkim',
      district: 'Gangtok'
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert.equal(assignRes.status, 201);
    assert.ok(assignRes.body.assignment.id);

    // Verify officer status transitioned to active
    const userRes = await makeRequest('GET', '/api/admin/users/usr_officer_002', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.equal(userRes.status, 200);
    assert.equal(userRes.body.user.account_status, 'active');
  });

  // TEST 6: Active Field Officer can access only assigned district reports
  it('6. Active Field Officer can access only assigned district reports', async () => {
    const reportsRes = await makeRequest('GET', '/api/field-officer/assigned-reports', null, {
      'Authorization': `Bearer ${officerToken}`
    });

    assert.equal(reportsRes.status, 200);
    const reports = reportsRes.body.reports;
    assert.ok(Array.isArray(reports));
    for (const r of reports) {
      if (r.reporter_user_id !== 'usr_officer_001') {
        assert.equal(r.district.toLowerCase(), 'east khasi hills');
      }
    }
  });

  // TEST 7: Citizen cannot access admin routes
  it('7. Citizen cannot access admin routes or admin APIs', async () => {
    const res = await makeRequest('GET', '/api/admin/users', null, {
      'Authorization': `Bearer ${citizenToken}`
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN_ROLE');
  });

  // TEST 8: Field Officer cannot access admin user management
  it('8. Field Officer cannot access admin user management', async () => {
    const res = await makeRequest('GET', '/api/admin/audit-logs', null, {
      'Authorization': `Bearer ${officerToken}`
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN_ROLE');
  });

  // TEST 9: Unauthenticated user is rejected on protected routes
  it('9. Unauthenticated user is rejected on protected routes', async () => {
    const res = await makeRequest('GET', '/api/users/me');
    assert.equal(res.status, 401);
  });

  // TEST 10: IDOR protection on private reports
  it('10. User cannot access another user private report by changing report ID', async () => {
    const phone = generateTestPhone();
    const newCitReg = await makeRequest('POST', '/api/auth/register', {
      full_name: 'Other Citizen',
      mobile_number: phone,
      password: 'SecurePassword123!',
      confirm_password: 'SecurePassword123!',
      role: 'citizen',
      state: 'Mizoram',
      district: 'Aizawl',
      village_town: 'Aizawl Central',
      consent_accepted: true
    });

    const newCitVer = await makeRequest('POST', '/api/auth/verify-otp', {
      mobile_number: phone,
      otp_code: newCitReg.body.devCode
    });
    const otherCitizenToken = newCitVer.body.tokens.accessToken;

    const idorAttempt = await makeRequest('GET', '/api/reports/rep_001', null, {
      'Authorization': `Bearer ${otherCitizenToken}`
    });

    assert.equal(idorAttempt.status, 403);
    assert.equal(idorAttempt.body.code, 'FORBIDDEN_REPORT_ACCESS');
  });

  // TEST 11: Passwords stored hashed, never plain text
  it('11. Password is stored hashed, never plain text', async () => {
    const user = db.prepare("SELECT password_hash FROM users WHERE mobile_number = '9876543210'").get();
    assert.ok(user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'));
    assert.notEqual(user.password_hash, 'Admin@Nexzora2026!');
  });

  // TEST 12: Login fails with invalid password
  it('12. Login fails with invalid password', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543210',
      password: 'WrongPassword123!'
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid mobile number/email or password.');
  });

  // TEST 13: Expired OTP or invalid reset token is rejected
  it('13. Expired OTP or invalid code is rejected', async () => {
    const res = await makeRequest('POST', '/api/auth/verify-otp', {
      mobile_number: '9876543210',
      otp_code: '000000'
    });

    assert.equal(res.status, 400);
  });

  // TEST 14: Suspended user cannot log in
  it('14. Suspended user cannot log in', async () => {
    // Admin suspends citizen
    const suspendRes = await makeRequest('PATCH', '/api/admin/users/usr_citizen_001/status', {
      status: 'suspended',
      reason: 'Testing suspension policy'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.equal(suspendRes.status, 200);

    // Suspended citizen tries to login
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543213',
      password: 'Citizen@Nexzora2026!'
    });

    assert.equal(loginRes.status, 403);
    assert.equal(loginRes.body.code, 'ACCOUNT_SUSPENDED');

    // Restore citizen to active
    await makeRequest('PATCH', '/api/admin/users/usr_citizen_001/status', {
      status: 'active'
    }, { 'Authorization': `Bearer ${adminToken}` });
  });

  // TEST 15: Logout invalidates session
  it('15. Logout invalidates session', async () => {
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: '9876543213',
      password: 'Citizen@Nexzora2026!'
    });
    const token = loginRes.body.tokens.accessToken;

    const logoutRes = await makeRequest('POST', '/api/auth/logout', null, {
      'Authorization': `Bearer ${token}`
    });
    assert.equal(logoutRes.status, 200);

    // Verify session revoked in database
    const session = db.prepare('SELECT revoked_at FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get('usr_citizen_001');
    assert.ok(session.revoked_at);
  });

  // TEST 16: Audit logs created for sensitive actions
  it('16. Audit log is created for sensitive administrative and field actions', async () => {
    const logsRes = await makeRequest('GET', '/api/admin/audit-logs', null, {
      'Authorization': `Bearer ${adminToken}`
    });

    assert.equal(logsRes.status, 200);
    const actions = logsRes.body.logs.map(l => l.action_type);
    assert.ok(actions.includes('officer_assigned') || actions.includes('account_registered'));
  });
});
