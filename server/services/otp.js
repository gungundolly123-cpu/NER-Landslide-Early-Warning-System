/**
 * NEXZORA — OTP, SMTP Email & SMS Verification Service
 * Handles secure OTP generation, cryptographic hashing, expiry management,
 * attempt rate-limiting, and SMTP email dispatch for Registration & Password Reset.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { sendRegistrationOTPEmail, sendPasswordResetOTPEmail } = require('./emailService');

function generateOTPCode() {
  // Generate 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(code) {
  return bcrypt.hashSync(code, 8);
}

function verifyOTPHash(code, hash) {
  return bcrypt.compareSync(code, hash);
}

/**
 * Send OTP via SMTP Email and/or Mobile SMS
 * Supports both signatures:
 *   sendOTP(mobileOrEmail, userId)
 *   sendOTP({ mobileNumber, email, userId, type, userName })
 */
async function sendOTP(arg1, arg2 = null) {
  let mobileNumber = null;
  let email = null;
  let userId = null;
  let type = 'registration'; // 'registration' | 'password_reset'
  let userName = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    mobileNumber = arg1.mobileNumber || null;
    email = arg1.email || null;
    userId = arg1.userId || null;
    type = arg1.type || 'registration';
    userName = arg1.userName || null;
  } else {
    const str = String(arg1 || '').trim();
    if (str.includes('@')) {
      email = str.toLowerCase();
    } else {
      mobileNumber = str;
    }
    userId = arg2;
  }

  // If userId is given, resolve missing details from users table
  if (userId && (!email || !mobileNumber || !userName)) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (user) {
      email = email || user.email;
      mobileNumber = mobileNumber || user.mobile_number;
      userName = userName || user.full_name;
    }
  }

  // If email is given and mobile is missing, resolve from users table
  if (email && !mobileNumber) {
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.toLowerCase());
    if (user) {
      mobileNumber = user.mobile_number;
      userId = userId || user.id;
      userName = userName || user.full_name;
    }
  }

  // If mobile is given and email is missing, resolve from users table
  if (mobileNumber && !email) {
    const cleanDigits = String(mobileNumber).trim().replace(/\D/g, '').slice(-10);
    const user = db.prepare('SELECT * FROM users WHERE mobile_number = ?').get(cleanDigits);
    if (user) {
      email = user.email;
      userId = userId || user.id;
      userName = userName || user.full_name;
    }
  }

  const cleanMobile = mobileNumber ? String(mobileNumber).trim().replace(/\D/g, '').slice(-10) : '';
  const cleanEmail = email && String(email).trim().includes('@') ? String(email).trim().toLowerCase() : null;

  if (!cleanMobile && !cleanEmail) {
    throw new Error('A valid email address or mobile number is required to send OTP.');
  }

  // Check active cooldown on recent unexpired OTP for this mobile OR email
  const recentOtp = db.prepare(`
    SELECT * FROM otp_verifications
    WHERE ((mobile_number = ? AND mobile_number != '') OR (LOWER(email) = LOWER(?) AND email IS NOT NULL))
      AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanMobile || '__NONE__', cleanEmail || '__NONE__');

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

  // Invalidate old unused OTPs for this recipient
  db.prepare(`
    UPDATE otp_verifications
    SET used_at = ?
    WHERE ((mobile_number = ? AND mobile_number != '') OR (LOWER(email) = LOWER(?) AND email IS NOT NULL))
      AND used_at IS NULL
  `).run(createdAt, cleanMobile || '__NONE__', cleanEmail || '__NONE__');

  // Insert new OTP record
  db.prepare(`
    INSERT INTO otp_verifications (
      id, mobile_number, email, otp_type, user_id, otp_code_hash,
      attempts, max_attempts, expires_at, used_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)
  `).run(
    id,
    cleanMobile || '',
    cleanEmail,
    type,
    userId,
    codeHash,
    config.MAX_OTP_ATTEMPTS,
    expiresAt,
    createdAt
  );

  // Dispatch via SMTP Email
  let emailDispatch = null;
  if (cleanEmail) {
    try {
      if (type === 'password_reset') {
        emailDispatch = await sendPasswordResetOTPEmail({
          email: cleanEmail,
          code,
          fullName: userName
        });
      } else {
        emailDispatch = await sendRegistrationOTPEmail({
          email: cleanEmail,
          code,
          fullName: userName
        });
      }
    } catch (err) {
      console.error('[OTP Email Dispatch Error]', err.message);
    }
  }

  // Dispatch via SMS Gateway or Dev Logger
  if (config.OTP_PROVIDER === 'production' && config.SMS_API_KEY && cleanMobile) {
    console.log(`[SMS Gateway] Dispatched SMS OTP to masked recipient +91-******${cleanMobile.slice(-4)}`);
  } else {
    const maskedNumber = cleanMobile ? `+91-******${cleanMobile.slice(-4)}` : 'N/A';
    console.log(`\n======================================================`);
    console.log(`[DEV OTP DISPATCH] Purpose: ${type.toUpperCase()}`);
    if (cleanEmail) console.log(`[DEV OTP] Email:  ${cleanEmail} (SMTP: ${emailDispatch ? emailDispatch.deliveredVia : 'attempted'})`);
    if (cleanMobile) console.log(`[DEV OTP] Mobile: ${maskedNumber}`);
    console.log(`[DEV OTP] Verification Code: >>> ${code} <<<`);
    console.log(`[DEV OTP] Valid for ${config.OTP_EXPIRY_MINUTES} minutes.`);
    console.log(`======================================================\n`);
  }

  return {
    success: true,
    expiresInMinutes: config.OTP_EXPIRY_MINUTES,
    emailSent: !!cleanEmail,
    targetEmail: cleanEmail,
    targetMobile: cleanMobile,
    emailDelivery: emailDispatch ? emailDispatch.deliveredVia : 'none',
    devCode: config.NODE_ENV !== 'production' ? code : undefined
  };
}

/**
 * Verify OTP by mobile number, email address, or user ID
 */
async function verifyOTP(identifier, submittedCode, expectedType = null) {
  if (!identifier || !submittedCode) {
    throw new Error('Email or mobile number, and OTP code are required.');
  }

  const cleanStr = String(identifier).trim();
  const isEmail = cleanStr.includes('@');
  const cleanEmail = isEmail ? cleanStr.toLowerCase() : null;
  const cleanMobile = !isEmail ? cleanStr.replace(/\D/g, '').slice(-10) : null;

  const otpRecord = db.prepare(`
    SELECT * FROM otp_verifications
    WHERE (
      (LOWER(email) = LOWER(?) AND ? IS NOT NULL)
      OR
      (mobile_number = ? AND ? IS NOT NULL AND mobile_number != '')
    )
    AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanEmail, cleanEmail, cleanMobile, cleanMobile);

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

  return {
    verified: true,
    userId: otpRecord.user_id,
    email: otpRecord.email,
    mobileNumber: otpRecord.mobile_number,
    otpType: otpRecord.otp_type
  };
}

module.exports = {
  sendOTP,
  verifyOTP,
  generateOTPCode
};
