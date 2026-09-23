/**
 * NEXZORA — Authentication Router
 * Implements secure registration, mobile OTP verification, login, refresh,
 * logout, password recovery, and session profile endpoints.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../db');
const config = require('../config');
const { logAudit } = require('../services/audit');
const { sendOTP, verifyOTP } = require('../services/otp');
const { authenticate, createRateLimiter } = require('../middleware/auth');

// Rate limiters for sensitive endpoints
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication attempts. Please try again after 15 minutes.'
});

const otpRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many OTP requests. Please wait a few minutes before trying again.'
});

// Helper to issue JWT tokens
function generateTokens(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    status: user.account_status
  };

  const accessToken = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN
  });

  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN
  });

  // Store refresh session in DB
  const sessionId = 'ses_' + crypto.randomUUID();
  const tokenHash = bcrypt.hashSync(refreshToken.slice(-16), 8);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, user.id, tokenHash, expiresAt, now.toISOString());

  return { accessToken, refreshToken, sessionId };
}

function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.token_hash;
  return safe;
}

/**
 * 1. POST /api/auth/register
 * Register Citizen or Field Officer
 */
router.post('/register', authRateLimiter, async (req, res) => {
  try {
    const {
      full_name,
      mobile_number,
      email,
      password,
      confirm_password,
      role = 'citizen',
      state,
      district,
      village_town,
      preferred_language = 'English',
      profile_photo_url = null,
      consent_accepted
    } = req.body;

    // Field Validations
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }

    const cleanMobile = String(mobile_number || '').trim().replace(/\D/g, '').slice(-10);
    if (!cleanMobile || cleanMobile.length !== 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    // Role Escalation Prevention: Never allow public registration as admin
    if (role === 'admin' || !['citizen', 'field_officer'].includes(role)) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_ROLE',
        error: 'Administrator accounts cannot be created via public registration.'
      });
    }

    if (!state || !district || !village_town) {
      return res.status(400).json({ success: false, error: 'State, district, and village/town are required.' });
    }

    if (!consent_accepted) {
      return res.status(400).json({
        success: false,
        error: 'Consent for disaster management and location data usage is mandatory.'
      });
    }

    // Check unique mobile
    const existingMobile = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(cleanMobile);
    if (existingMobile) {
      return res.status(409).json({
        success: false,
        error: 'An account with this mobile number already exists. Please log in or reset password.'
      });
    }

    // Check unique email if provided
    let cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    if (cleanEmail) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existingEmail) {
        return res.status(409).json({ success: false, error: 'This email is already registered.' });
      }
    }

    const userId = 'usr_' + crypto.randomUUID();
    const now = new Date().toISOString();
    const password_hash = bcrypt.hashSync(password, 10);

    // Initial account status: unverified (awaits mobile OTP)
    const account_status = 'unverified';

    db.prepare(`
      INSERT INTO users (
        id, full_name, mobile_number, email, password_hash, role, account_status,
        mobile_verified, email_verified, state, district, village_town, preferred_language,
        profile_photo_url, consent_accepted, consent_accepted_at, created_at, updated_at
      ) VALUES (
        @id, @full_name, @mobile_number, @email, @password_hash, @role, @account_status,
        0, 0, @state, @district, @village_town, @preferred_language,
        @profile_photo_url, 1, @now, @now, @now
      )
    `).run({
      id: userId,
      full_name: full_name.trim(),
      mobile_number: cleanMobile,
      email: cleanEmail,
      password_hash,
      role,
      account_status,
      state,
      district,
      village_town: village_town.trim(),
      preferred_language,
      profile_photo_url,
      now
    });

    // Send OTP
    const otpResult = await sendOTP(cleanMobile, userId);

    logAudit({
      actorUserId: userId,
      actorName: full_name,
      actorRole: role,
      actionType: 'account_registered',
      entityType: 'user',
      entityId: userId,
      newValue: { mobile_number: cleanMobile, role, district, state },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Account registered. Please enter the OTP sent to your mobile number.',
      userId,
      mobileNumber: cleanMobile,
      role,
      devCode: otpResult.devCode
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

/**
 * 2. POST /api/auth/verify-otp
 * Verify 6-digit OTP and activate account or mark Field Officer pending
 */
router.post('/verify-otp', otpRateLimiter, async (req, res) => {
  try {
    const { mobile_number, otp_code } = req.body;
    const cleanMobile = String(mobile_number || '').trim().replace(/\D/g, '').slice(-10);

    if (!cleanMobile || !otp_code) {
      return res.status(400).json({ success: false, error: 'Mobile number and OTP code are required.' });
    }

    const { verified, userId } = await verifyOTP(cleanMobile, otp_code);
    if (!verified) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE mobile_number = ? OR id = ?').get(cleanMobile, userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    // Determine target status
    let targetStatus = user.account_status;
    if (user.role === 'citizen') {
      targetStatus = 'active';
    } else if (user.role === 'field_officer') {
      // Field officers remain pending verification until admin grants district approval
      targetStatus = user.account_status === 'active' ? 'active' : 'pending_verification';
    } else if (user.role === 'admin') {
      targetStatus = 'active';
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET mobile_verified = 1, account_status = ?, updated_at = ?, last_login_at = ?
      WHERE id = ?
    `).run(targetStatus, now, now, user.id);

    // Refresh user record
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const { accessToken, refreshToken } = generateTokens(updatedUser);

    // Set cookie
    res.cookie('accessToken', accessToken, config.COOKIE_SETTINGS);

    logAudit({
      actorUserId: updatedUser.id,
      actorName: updatedUser.full_name,
      actorRole: updatedUser.role,
      actionType: 'otp_verified',
      entityType: 'user',
      entityId: updatedUser.id,
      newValue: { mobile_verified: 1, account_status: targetStatus },
      req
    });

    let redirectUrl = '/citizen/dashboard';
    if (updatedUser.role === 'admin') redirectUrl = '/admin/dashboard';
    else if (updatedUser.role === 'field_officer') {
      redirectUrl = targetStatus === 'active' ? '/field-officer/dashboard' : '/account-pending';
    }

    return res.json({
      success: true,
      message: targetStatus === 'pending_verification'
        ? 'Your Field Officer account is verified and currently pending administrator approval.'
        : 'Account verified successfully!',
      user: sanitizeUser(updatedUser),
      tokens: { accessToken, refreshToken },
      redirectUrl
    });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    return res.status(400).json({ success: false, error: err.message || 'OTP verification failed.' });
  }
});

/**
 * 3. POST /api/auth/resend-otp
 */
router.post('/resend-otp', otpRateLimiter, async (req, res) => {
  try {
    const { mobile_number } = req.body;
    const cleanMobile = String(mobile_number || '').trim().replace(/\D/g, '').slice(-10);

    if (!cleanMobile) {
      return res.status(400).json({ success: false, error: 'Mobile number is required.' });
    }

    const user = db.prepare('SELECT id FROM users WHERE mobile_number = ?').get(cleanMobile);
    const otpResult = await sendOTP(cleanMobile, user ? user.id : null);

    return res.json({
      success: true,
      message: 'A fresh OTP has been sent.',
      devCode: otpResult.devCode
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Could not send OTP.' });
  }
});

/**
 * 4. POST /api/auth/login
 * Login with Mobile/Email and Password
 */
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your mobile number or email, and your password.'
      });
    }

    const cleanInput = String(identifier).trim();
    const isMobile = /^\d{10}$/.test(cleanInput.replace(/\D/g, ''));
    const lookupMobile = cleanInput.replace(/\D/g, '').slice(-10);

    const user = db.prepare(`
      SELECT * FROM users
      WHERE (mobile_number = ? AND ? = 1) OR (LOWER(email) = LOWER(?) AND ? = 0)
    `).get(lookupMobile, isMobile ? 1 : 0, cleanInput, isMobile ? 1 : 0);

    if (!user) {
      logAudit({
        actorName: cleanInput,
        actionType: 'login_failed',
        entityType: 'auth',
        entityId: 'unknown',
        oldValue: { reason: 'user_not_found', identifier: cleanInput },
        req
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid mobile number/email or password.'
      });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      logAudit({
        actorUserId: user.id,
        actorName: user.full_name,
        actorRole: user.role,
        actionType: 'login_failed',
        entityType: 'auth',
        entityId: user.id,
        oldValue: { reason: 'invalid_password' },
        req
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid mobile number/email or password.'
      });
    }

    // Account Status Checks
    if (user.account_status === 'suspended') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        error: 'Your account is currently unavailable. Please contact the administrator.'
      });
    }

    if (user.account_status === 'rejected') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        error: 'Your account registration was rejected by the administrator.'
      });
    }

    if (user.account_status === 'unverified' || !user.mobile_verified) {
      // Send OTP to complete verification
      const otpResult = await sendOTP(user.mobile_number, user.id);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_UNVERIFIED',
        error: 'Your mobile number is not yet verified. An OTP has been sent.',
        mobileNumber: user.mobile_number,
        devCode: otpResult.devCode
      });
    }

    // Update last login
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, user.id);

    const { accessToken, refreshToken } = generateTokens(user);
    res.cookie('accessToken', accessToken, config.COOKIE_SETTINGS);

    // Fetch officer district assignments if applicable
    let assignedDistricts = [];
    if (user.role === 'field_officer') {
      assignedDistricts = db.prepare(`
        SELECT district, state FROM officer_assignments
        WHERE user_id = ? AND active = 1
      `).all(user.id);
    }

    logAudit({
      actorUserId: user.id,
      actorName: user.full_name,
      actorRole: user.role,
      actionType: 'login_success',
      entityType: 'auth',
      entityId: user.id,
      newValue: { role: user.role, status: user.account_status },
      req
    });

    let redirectUrl = '/citizen/dashboard';
    if (user.role === 'admin') redirectUrl = '/admin/dashboard';
    else if (user.role === 'field_officer') {
      redirectUrl = user.account_status === 'active' ? '/field-officer/dashboard' : '/account-pending';
    }

    return res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      user: {
        ...sanitizeUser(user),
        assignedDistricts
      },
      tokens: { accessToken, refreshToken },
      redirectUrl
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

/**
 * 5. POST /api/auth/logout
 */
router.post('/logout', authenticate, (req, res) => {
  try {
    // Revoke sessions
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ?').run(
      new Date().toISOString(),
      req.user.id
    );

    res.clearCookie('accessToken');

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'logout',
      entityType: 'auth',
      entityId: req.user.id,
      req
    });

    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Logout failed.' });
  }
});

/**
 * 6. POST /api/auth/refresh
 */
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);

    if (!user || user.account_status === 'suspended' || user.account_status === 'rejected') {
      return res.status(403).json({ success: false, error: 'Account is no longer active.' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    res.cookie('accessToken', accessToken, config.COOKIE_SETTINGS);

    return res.json({
      success: true,
      tokens: { accessToken, refreshToken: newRefreshToken }
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
  }
});

/**
 * 7. POST /api/auth/forgot-password
 */
router.post('/forgot-password', authRateLimiter, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Mobile number or email is required.' });
    }

    const cleanInput = String(identifier).trim();
    const isMobile = /^\d{10}$/.test(cleanInput.replace(/\D/g, ''));
    const lookupMobile = cleanInput.replace(/\D/g, '').slice(-10);

    const user = db.prepare(`
      SELECT * FROM users
      WHERE (mobile_number = ? AND ? = 1) OR (LOWER(email) = LOWER(?) AND ? = 0)
    `).get(lookupMobile, isMobile ? 1 : 0, cleanInput, isMobile ? 1 : 0);

    let devCode = undefined;
    if (user) {
      const otpResult = await sendOTP(user.mobile_number, user.id);
      devCode = otpResult.devCode;

      logAudit({
        actorUserId: user.id,
        actorName: user.full_name,
        actorRole: user.role,
        actionType: 'password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        req
      });
    }

    // Always return safe generic message to prevent account enumeration
    return res.json({
      success: true,
      message: 'If an account exists with this mobile number or email, a reset verification code has been sent.',
      devCode
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not process password reset.' });
  }
});

/**
 * 8. POST /api/auth/reset-password
 */
router.post('/reset-password', authRateLimiter, async (req, res) => {
  try {
    const { mobile_number, otp_code, new_password, confirm_password } = req.body;

    if (!mobile_number || !otp_code || !new_password) {
      return res.status(400).json({ success: false, error: 'Mobile number, OTP code, and new password are required.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    const cleanMobile = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
    const { verified, userId } = await verifyOTP(cleanMobile, otp_code);

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset code.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE mobile_number = ? OR id = ?').get(cleanMobile, userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, user.id);

    // Invalidate all active sessions for security
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ?').run(now, user.id);

    logAudit({
      actorUserId: user.id,
      actorName: user.full_name,
      actorRole: user.role,
      actionType: 'password_reset_completed',
      entityType: 'user',
      entityId: user.id,
      req
    });

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Password reset failed.' });
  }
});

/**
 * 9. GET /api/auth/me
 */
router.get('/me', authenticate, (req, res) => {
  let assignedDistricts = [];
  if (req.user.role === 'field_officer') {
    assignedDistricts = db.prepare(`
      SELECT district, state FROM officer_assignments
      WHERE user_id = ? AND active = 1
    `).all(req.user.id);
  }

  return res.json({
    success: true,
    user: {
      ...sanitizeUser(req.user),
      assignedDistricts
    }
  });
});

module.exports = router;
