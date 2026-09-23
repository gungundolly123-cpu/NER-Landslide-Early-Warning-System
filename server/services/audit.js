/**
 * NEXZORA — Audit Logging Service
 * Records security-sensitive administrative, field officer, and user actions
 * into the audit_logs table with sanitization of secret data.
 */

const crypto = require('crypto');
const db = require('../db');

function sanitizeSummary(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  const clone = { ...data };
  delete clone.password;
  delete clone.password_hash;
  delete clone.confirm_password;
  delete clone.token;
  delete clone.token_hash;
  delete clone.otp;
  delete clone.otp_code_hash;
  return JSON.stringify(clone);
}

function logAudit({
  actorUserId = null,
  actorName = 'System / Unauthenticated',
  actorRole = 'system',
  actionType,
  entityType,
  entityId,
  oldValue = null,
  newValue = null,
  req = null
}) {
  try {
    let ipAddress = '127.0.0.1';
    if (req) {
      ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      if (typeof ipAddress === 'string' && ipAddress.includes(',')) {
        ipAddress = ipAddress.split(',')[0].trim();
      }
    }

    const id = 'aud_' + crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, actor_user_id, actor_name, actor_role, action_type,
        entity_type, entity_id, old_value_summary, new_value_summary,
        ip_address, created_at
      ) VALUES (
        @id, @actor_user_id, @actor_name, @actor_role, @action_type,
        @entity_type, @entity_id, @old_value_summary, @new_value_summary,
        @ip_address, @created_at
      )
    `);

    stmt.run({
      id,
      actor_user_id: actorUserId,
      actor_name: actorName,
      actor_role: actorRole,
      action_type: actionType,
      entity_type: entityType,
      entity_id: String(entityId),
      old_value_summary: sanitizeSummary(oldValue),
      new_value_summary: sanitizeSummary(newValue),
      ip_address: ipAddress,
      created_at: createdAt
    });

    return id;
  } catch (err) {
    console.error('[AuditLog Error]', err);
    return null;
  }
}

module.exports = {
  logAudit,
  sanitizeSummary
};
