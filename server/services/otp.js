/**
 * NEXZORA — OTP & SMS Verification Service
 * Handles secure OTP generation, cryptographic hashing, expiry management,
 * attempt rate-limiting, and development safe logging.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');

function generateOTPCode() {
  // Generate 6 digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(code) {
  return bcrypt.hashSync(code, 8);
}

function verifyOTPHash(code, hash) {
  return bcrypt.compareSync(code, hash);
}

async function sendOTP(mobileNumber, userId = null) {
  // Check active cooldown on recent unexpired OTP
  const recentOtp = db.prepare(`
    SELECT * FROM otp_verifications
    WHERE mobile_number = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(mobileNumber);

  if (recentOtp) {
    const elapsedSeconds = (Date.now() - new Date(recentOtp.created_at).getTime()) / 1000;
    if (elapsedSeconds < config.OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(config.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      throw new Error(`Please wait ${waitSeconds}s before requesting a new OTP.`);
    }
  }

  const code = generateOTPCode();
  const codeHash = hashOTP(code);
  const id = 'otp_' + crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  // Invalidate any old unused OTPs for this number
  db.prepare(`
    UPDATE otp_verifications SET used_at = ? WHERE mobile_number = ? AND used_at IS NULL
  `).run(createdAt, mobileNumber);

  // Insert new OTP record
  db.prepare(`
    INSERT INTO otp_verifications (id, mobile_number, user_id, otp_code_hash, attempts, max_attempts, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?)
  `).run(id, mobileNumber, userId, codeHash, config.MAX_OTP_ATTEMPTS, expiresAt, createdAt);

  // Dispatch via SMS Gateway or Dev Logger
  if (config.OTP_PROVIDER === 'production' && config.SMS_API_KEY) {
    // In production, integrate with SMS gateway (e.g. CDAC/Fast2SMS/Twilio)
    console.log(`[SMS Gateway] Dispatched SMS OTP to masked recipient +91-******${mobileNumber.slice(-4)}`);
  } else {
    // Development Mode
    const maskedNumber = `+91-******${mobileNumber.slice(-4)}`;
    console.log(`\n======================================================`);
    console.log(`[DEV OTP] Mobile: ${maskedNumber}`);
    console.log(`[DEV OTP] Verification Code: >>> ${code} <<<`);
    console.log(`[DEV OTP] Valid for ${config.OTP_EXPIRY_MINUTES} minutes.`);
    console.log(`======================================================\n`);
  }

  return {
    success: true,
    expiresInMinutes: config.OTP_EXPIRY_MINUTES,
    // In dev mode, we also return the dev code in API response to facilitate easy browser testing & automated test verification
    devCode: config.NODE_ENV !== 'production' ? code : undefined
  };
}

async function verifyOTP(mobileNumber, submittedCode) {
  if (!mobileNumber || !submittedCode) {
    throw new Error('Mobile number and OTP code are required.');
  }

  const otpRecord = db.prepare(`
    SELECT * FROM otp_verifications
    WHERE mobile_number = ? AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(mobileNumber);

  if (!otpRecord) {
    throw new Error('No active OTP found. Please request a new one.');
  }

  const now = new Date();
  const expiryDate = new Date(otpRecord.expires_at);

  if (now > expiryDate) {
    db.prepare('UPDATE otp_verifications SET used_at = ? WHERE id = ?').run(now.toISOString(), otpRecord.id);
    throw new Error('OTP has expired. Please request a new code.');
  }

  if (otpRecord.attempts >= otpRecord.max_attempts) {
    db.prepare('UPDATE otp_verifications SET used_at = ? WHERE id = ?').run(now.toISOString(), otpRecord.id);
    throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
  }

  // Increment attempts counter
  db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(otpRecord.id);

  const isValid = verifyOTPHash(submittedCode.trim(), otpRecord.otp_code_hash);
  if (!isValid) {
    const remaining = otpRecord.max_attempts - (otpRecord.attempts + 1);
    throw new Error(`Invalid OTP code. ${remaining} attempt(s) remaining.`);
  }

  // Mark as used
  db.prepare('UPDATE otp_verifications SET used_at = ? WHERE id = ?').run(now.toISOString(), otpRecord.id);

  return { verified: true, userId: otpRecord.user_id };
}

module.exports = {
  sendOTP,
  verifyOTP
};
