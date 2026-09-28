/**
 * NEXZORA — SMTP Email Dispatch Service
 * Implements standard SMTP protocol email delivery using Nodemailer.
 * Used for email OTP account verification, password resets, and emergency alerts.
 */

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const hasConfig = (config.SMTP_HOST && config.SMTP_USER) || (config.SMTP_SERVICE && config.SMTP_USER);
  if (!hasConfig) {
    return null;
  }

  const transportOptions = {};

  if (config.SMTP_SERVICE) {
    transportOptions.service = config.SMTP_SERVICE;
  } else if (config.SMTP_HOST) {
    transportOptions.host = config.SMTP_HOST;
    transportOptions.port = config.SMTP_PORT;
    transportOptions.secure = config.SMTP_SECURE;
  }

  if (config.SMTP_USER && config.SMTP_PASS) {
    transportOptions.auth = {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS
    };
  }

  // Set reasonable connection timeouts for reliability
  transportOptions.connectionTimeout = 10000; // 10s
  transportOptions.greetingTimeout = 10000;
  transportOptions.socketTimeout = 15000;

  try {
    transporter = nodemailer.createTransport(transportOptions);
    console.log(`[SMTP Service] Initialized SMTP transporter for host/service: ${config.SMTP_SERVICE || config.SMTP_HOST}`);
  } catch (err) {
    console.error('[SMTP Service] Failed to initialize SMTP transporter:', err.message);
    transporter = null;
  }

  return transporter;
}

function isSmtpConfigured() {
  return Boolean((config.SMTP_HOST && config.SMTP_USER) || (config.SMTP_SERVICE && config.SMTP_USER));
}

/**
 * Generic email dispatcher via SMTP
 */
async function sendEmail({ to, subject, html, text }) {
  const mailOptions = {
    from: config.SMTP_FROM,
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    html
  };

  const client = getTransporter();

  if (client) {
    try {
      const info = await client.sendMail(mailOptions);
      console.log(`[SMTP Dispatch] Successfully sent email to ${to}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId, deliveredVia: 'smtp' };
    } catch (err) {
      console.error(`[SMTP Error] Delivery to ${to} failed:`, err.message);
      // Fallback logging for safety in development
      logEmailToConsole(to, subject, text || html);
      return { success: false, error: err.message, deliveredVia: 'fallback' };
    }
  } else {
    // Development fallback when SMTP credentials are not yet configured in .env
    logEmailToConsole(to, subject, text || html);
    return { success: true, deliveredVia: 'dev_console', message: 'SMTP not configured in .env; logged to console.' };
  }
}

function logEmailToConsole(to, subject, content) {
  console.log(`\n======================================================`);
  console.log(`[SMTP SIMULATION / DEV EMAIL LOGGER]`);
  console.log(`To:      ${to}`);
  console.log(`From:    ${config.SMTP_FROM}`);
  console.log(`Subject: ${subject}`);
  console.log(`------------------------------------------------------`);
  // Print snippet or extracted text
  const cleanSnippet = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  console.log(`Body:    ${cleanSnippet}...`);
  console.log(`======================================================\n`);
}

/**
 * Send 6-digit OTP verification email for Registration
 */
async function sendRegistrationOTPEmail({ email, code, fullName }) {
  const name = fullName ? fullName.trim() : 'Citizen / Officer';
  const subject = `[NEXZORA] Your Account Verification Code: ${code}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your NEXZORA Account</title>
      <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #f8fafc; }
        .wrapper { width: 100%; max-width: 580px; margin: 0 auto; padding: 32px 16px; box-sizing: border-box; }
        .card { background-color: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 36px 30px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
        .header { text-align: center; margin-bottom: 26px; }
        .brand-badge { display: inline-block; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 12px; }
        .brand-title { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: -0.5px; }
        .greeting { font-size: 16px; color: #e2e8f0; margin-bottom: 16px; line-height: 1.5; }
        .message { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .otp-container { background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%); border: 2px dashed #10b981; border-radius: 12px; padding: 22px; text-align: center; margin: 26px 0; }
        .otp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 8px; }
        .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 38px; font-weight: 800; color: #10b981; letter-spacing: 8px; margin: 0; text-shadow: 0 0 15px rgba(16, 185, 129, 0.4); }
        .expiry-note { font-size: 12px; color: #f59e0b; margin-top: 10px; font-weight: 500; }
        .warning-box { background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #fca5a5; margin: 24px 0; line-height: 1.5; }
        .footer { text-align: center; margin-top: 28px; font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #334155; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header">
            <span class="brand-badge">🏔️ SIH Disaster Early Warning</span>
            <h1 class="brand-title">NEXZORA</h1>
          </div>
          <div class="greeting">Hello <strong>${name}</strong>,</div>
          <div class="message">
            Thank you for registering on <strong>NEXZORA</strong> — AI-powered landslide monitoring and early warning system for the North Eastern Region of India.
            <br><br>
            Please use the 6-digit one-time password (OTP) below to verify your email address and activate your account:
          </div>

          <div class="otp-container">
            <div class="otp-label">One-Time Verification Code</div>
            <div class="otp-code">${code}</div>
            <div class="expiry-note">⏱️ Valid for 10 minutes only.</div>
          </div>

          <div class="warning-box">
            🔒 <strong>Security Notice:</strong> Never share this code with anyone. NEXZORA officials will never ask for your verification code.
          </div>

          <div class="message" style="margin-bottom:0;">
            If you did not initiate this registration, you can safely disregard this email.
          </div>

          <div class="footer">
            Smart India Hackathon (SIH) Prototype • North Eastern Region (NER), India<br>
            Ministry of Earth Sciences / Geological Survey of India / NDMA
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
NEXZORA — AI Early Warning & Landslide Risk Monitoring
Hello ${name},

Your 6-digit account verification code is: ${code}

This code is valid for 10 minutes.
Please enter it on the registration screen to complete your verification.

If you did not register for NEXZORA, please ignore this email.
Never share your verification code with anyone.
  `.trim();

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send 6-digit OTP verification email for Password Reset
 */
async function sendPasswordResetOTPEmail({ email, code, fullName }) {
  const name = fullName ? fullName.trim() : 'User';
  const subject = `[NEXZORA] Password Reset Code: ${code}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your NEXZORA Password</title>
      <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1120; color: #f8fafc; }
        .wrapper { width: 100%; max-width: 580px; margin: 0 auto; padding: 32px 16px; box-sizing: border-box; }
        .card { background-color: #1e293b; border-radius: 14px; border: 1px solid #334155; padding: 36px 30px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
        .header { text-align: center; margin-bottom: 26px; }
        .brand-badge { display: inline-block; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(245, 158, 11, 0.3); margin-bottom: 12px; }
        .brand-title { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: -0.5px; }
        .greeting { font-size: 16px; color: #e2e8f0; margin-bottom: 16px; line-height: 1.5; }
        .message { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .otp-container { background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%); border: 2px dashed #f59e0b; border-radius: 12px; padding: 22px; text-align: center; margin: 26px 0; }
        .otp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-weight: 600; margin-bottom: 8px; }
        .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 38px; font-weight: 800; color: #f59e0b; letter-spacing: 8px; margin: 0; text-shadow: 0 0 15px rgba(245, 158, 11, 0.4); }
        .expiry-note { font-size: 12px; color: #f59e0b; margin-top: 10px; font-weight: 500; }
        .warning-box { background: rgba(239, 68, 68, 0.12); border-left: 3px solid #ef4444; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #fca5a5; margin: 24px 0; line-height: 1.5; }
        .footer { text-align: center; margin-top: 28px; font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #334155; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header">
            <span class="brand-badge">🔒 Password Recovery</span>
            <h1 class="brand-title">NEXZORA</h1>
          </div>
          <div class="greeting">Hello <strong>${name}</strong>,</div>
          <div class="message">
            We received a request to reset the password for your <strong>NEXZORA</strong> account associated with this email address.
            <br><br>
            Enter the 6-digit recovery code below on the password reset screen to set your new password:
          </div>

          <div class="otp-container">
            <div class="otp-label">Password Reset Code</div>
            <div class="otp-code">${code}</div>
            <div class="expiry-note">⏱️ Valid for 10 minutes only.</div>
          </div>

          <div class="warning-box">
            ⚠️ <strong>Did not request this?</strong> If you did not request a password reset, please ignore this email or change your password immediately if you suspect unauthorized activity.
          </div>

          <div class="footer">
            Smart India Hackathon (SIH) Prototype • North Eastern Region (NER), India<br>
            This is an automated system message. Do not reply directly to this email.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
NEXZORA — Password Recovery
Hello ${name},

A password reset was requested for your NEXZORA account.
Your 6-digit recovery code is: ${code}

This code is valid for 10 minutes.
Enter this code along with your new password on the reset page.

If you did not make this request, you can safely ignore this email.
  `.trim();

  return sendEmail({ to: email, subject, html, text });
}

module.exports = {
  getTransporter,
  isSmtpConfigured,
  sendEmail,
  sendRegistrationOTPEmail,
  sendPasswordResetOTPEmail
};
