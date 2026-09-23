/**
 * NEXZORA — Configuration Loader
 * Handles environment variables, cryptographic secrets with secure fallbacks in dev mode,
 * and service configuration.
 */

require('dotenv').config();
const crypto = require('crypto');
const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// In development, provide deterministic local secrets if not explicitly set
const defaultDevSecret = 'nexzora-dev-jwt-access-super-secret-key-32chars!';
const defaultDevRefreshSecret = 'nexzora-dev-jwt-refresh-super-secret-key-32chars!';

const JWT_SECRET = process.env.JWT_SECRET || (isProd ? crypto.randomBytes(32).toString('hex') : defaultDevSecret);
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isProd ? crypto.randomBytes(32).toString('hex') : defaultDevRefreshSecret);

module.exports = {
  NODE_ENV,
  isProd,
  PORT: parseInt(process.env.PORT || '3000', 10),
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
  DATABASE_PATH: process.env.DATABASE_URL || path.join(__dirname, '..', 'data', 'nexzora.db'),
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  OTP_PROVIDER: process.env.OTP_PROVIDER || 'development',
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  OTP_RESEND_COOLDOWN_SECONDS: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
  MAX_OTP_ATTEMPTS: parseInt(process.env.MAX_OTP_ATTEMPTS || '5', 10),
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'test',
  SMS_API_KEY: process.env.SMS_API_KEY || '',
  SMS_SENDER_ID: process.env.SMS_SENDER_ID || 'NEXZOR',
  SMS_API_URL: process.env.SMS_API_URL || '',
  SMS_TEMPLATE_ID: process.env.SMS_TEMPLATE_ID || '',
  SMS_DLT_ENTITY_ID: process.env.SMS_DLT_ENTITY_ID || '',
  SMS_DLT_TEMPLATE_ID: process.env.SMS_DLT_TEMPLATE_ID || '',
  SMS_MAX_RECIPIENTS_PER_BATCH: parseInt(process.env.SMS_MAX_RECIPIENTS_PER_BATCH || '100', 10),
  SMS_RATE_LIMIT_PER_MINUTE: parseInt(process.env.SMS_RATE_LIMIT_PER_MINUTE || '30', 10),
  // Firebase Cloud Messaging Settings
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY || '',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || '',
  // Alert freshness & rate-limiting policies
  NOTIFICATION_COOLDOWN_MINUTES: parseInt(process.env.NOTIFICATION_COOLDOWN_MINUTES || '180', 10), // 3 hours
  RAINFALL_STALE_AFTER_HOURS: parseInt(process.env.RAINFALL_STALE_AFTER_HOURS || '6', 10),
  SOIL_MOISTURE_STALE_AFTER_HOURS: parseInt(process.env.SOIL_MOISTURE_STALE_AFTER_HOURS || '24', 10),
  PREDICTION_STALE_AFTER_HOURS: parseInt(process.env.PREDICTION_STALE_AFTER_HOURS || '6', 10),
  COOKIE_SETTINGS: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};
