/**
 * NEXZORA — Authentication & RBAC Authorization Middleware
 * Validates JWT signatures, checks active account status, enforces role boundaries,
 * and handles IP-based endpoint rate limiting.
 */

const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

/**
 * Validates incoming JWT access token
 */
function authenticate(req, res, next) {
  try {
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in to access this resource.'
      });
    }

    // Verify token signature
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Fetch live user record from database
    const user = db.prepare(`
      SELECT id, full_name, mobile_number, email, role, account_status,
             mobile_verified, email_verified, state, district, village_town,
             preferred_language, profile_photo_url, consent_accepted, last_login_at
      FROM users WHERE id = ?
    `).get(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    // Account status security checks
    if (user.account_status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Your account is currently suspended. Please contact the system administrator.'
      });
    }

    if (user.account_status === 'rejected') {
      return res.status(403).json({
        success: false,
        error: 'Your account registration was rejected by the administrator.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        error: 'Session expired. Please refresh your session or log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication credentials.'
    });
  }
}

/**
 * Optional authentication middleware for endpoints accessible publicly or with user context
 */
function optionalAuthenticate(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = db.prepare(`
        SELECT id, full_name, mobile_number, email, role, account_status,
               mobile_verified, email_verified, state, district, village_town,
               preferred_language, profile_photo_url
        FROM users WHERE id = ?
      `).get(decoded.userId);

      if (user && user.account_status === 'active') {
        req.user = user;
      }
    } catch {
      // Ignore token decode errors for optional auth
    }
  }
  next();
}

/**
 * Enforces allowed roles (e.g. requireRole('admin', 'field_officer'))
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_ROLE',
        error: `Access denied. Requires one of [${allowedRoles.join(', ')}] privileges.`
      });
    }

    next();
  };
}

/**
 * Enforces that user account status is strictly 'active'
 */
function requireActive(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  if (req.user.account_status !== 'active') {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_NOT_ACTIVE',
      error: `Your account is currently '${req.user.account_status}'. Active verification required.`
    });
  }

  next();
}

/**
 * Checks if a Field Officer is assigned to the target district (Admins bypass)
 */
function requireDistrictAssignment(getDistrictFromReq) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    // Admin has global North East jurisdiction
    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.role !== 'field_officer') {
      return res.status(403).json({ success: false, error: 'Officer role required.' });
    }

    const targetDistrict = getDistrictFromReq(req);
    if (!targetDistrict) {
      return res.status(400).json({ success: false, error: 'Target district not specified in request.' });
    }

    const assignment = db.prepare(`
      SELECT * FROM officer_assignments
      WHERE user_id = ? AND LOWER(district) = LOWER(?) AND active = 1
    `).get(req.user.id, targetDistrict);

    if (!assignment) {
      return res.status(403).json({
        success: false,
        code: 'DISTRICT_NOT_ASSIGNED',
        error: `You are not assigned to manage disaster operations in '${targetDistrict}'.`
      });
    }

    next();
  };
}

/**
 * In-memory sliding window rate limiter
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, maxRequests = 50, message = 'Too many requests. Please try again later.' }) {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    const clientHistory = requests.get(ip) || [];
    const validHistory = clientHistory.filter(timestamp => now - timestamp < windowMs);

    if (validHistory.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: message
      });
    }

    validHistory.push(now);
    requests.set(ip, validHistory);
    next();
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireActive,
  requireDistrictAssignment,
  createRateLimiter
};
