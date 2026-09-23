/**
 * NEXZORA — Admin Operations & User Management Router
 * Provides administrative oversight: user status moderation, role management,
 * Field Officer district assignments, audit log review, and emergency alert approval.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../db');
const { logAudit } = require('../services/audit');
const { authenticate, requireRole, requireActive } = require('../middleware/auth');
const {
  getTargetRecipients,
  dispatchApprovedSmsAlert,
  getSmsDeliverySummary,
  retryFailedSms,
  generateMultilingualSms,
  maskPhoneNumber
} = require('../services/smsService');

// Apply admin role security guard to all endpoints in this router
router.use(authenticate, requireActive, requireRole('admin'));

function sanitizeUser(user) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.token_hash;
  return safe;
}

/**
 * 1. GET /api/admin/stats
 * Overview dashboard metrics
 */
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const activeCitizens = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'citizen' AND account_status = 'active'").get().count;
    const pendingOfficers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'field_officer' AND account_status = 'pending_verification'").get().count;
    const activeOfficers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'field_officer' AND account_status = 'active'").get().count;
    const totalReports = db.prepare('SELECT COUNT(*) AS count FROM incident_reports').get().count;
    const pendingReports = db.prepare("SELECT COUNT(*) AS count FROM incident_reports WHERE status = 'New'").get().count;
    const pendingAlerts = db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE status = 'Pending_Approval'").get().count;
    const totalAuditLogs = db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeCitizens,
        pendingOfficers,
        activeOfficers,
        totalReports,
        pendingReports,
        pendingAlerts,
        totalAuditLogs
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve stats.' });
  }
});

/**
 * 2. GET /api/admin/users
 * Filterable list of all registered users
 */
router.get('/users', (req, res) => {
  try {
    const { role, status, district, search, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT id, full_name, mobile_number, email, role, account_status,
             mobile_verified, email_verified, state, district, village_town,
             preferred_language, profile_photo_url, last_login_at, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (role && role !== 'all') {
      query += ` AND role = ?`;
      params.push(role);
    }

    if (status && status !== 'all') {
      query += ` AND account_status = ?`;
      params.push(status);
    }

    if (district && district !== 'all') {
      query += ` AND LOWER(district) = LOWER(?)`;
      params.push(district);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += ` AND (LOWER(full_name) LIKE ? OR mobile_number LIKE ? OR LOWER(email) LIKE ?)`;
      params.push(term, term, term);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const users = db.prepare(query).all(...params);

    // Attach assignments for field officers
    const enrichedUsers = users.map(u => {
      if (u.role === 'field_officer') {
        const assignments = db.prepare(`
          SELECT id, state, district, assigned_at, active
          FROM officer_assignments WHERE user_id = ?
        `).all(u.id);
        return { ...u, assignments };
      }
      return u;
    });

    const totalCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    return res.json({
      success: true,
      users: enrichedUsers,
      total: totalCount
    });
  } catch (err) {
    console.error('[Admin Users List Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
});

/**
 * 3. GET /api/admin/users/:id
 */
router.get('/users/:id', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, full_name, mobile_number, email, role, account_status,
             mobile_verified, email_verified, state, district, village_town,
             preferred_language, profile_photo_url, consent_accepted,
             consent_accepted_at, last_login_at, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const assignments = db.prepare('SELECT * FROM officer_assignments WHERE user_id = ?').all(user.id);
    const reportsCount = db.prepare('SELECT COUNT(*) AS count FROM incident_reports WHERE reporter_user_id = ?').get(user.id).count;

    return res.json({
      success: true,
      user: {
        ...user,
        assignments,
        reportsCount
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load user profile.' });
  }
});

/**
 * 4. PATCH /api/admin/users/:id/status
 * Moderate account status: active / pending_verification / suspended / rejected
 */
router.patch('/users/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const targetUserId = req.params.id;

    if (!['active', 'pending_verification', 'suspended', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid account status specified.' });
    }

    if (targetUserId === req.user.id && status !== 'active') {
      return res.status(400).json({ success: false, error: 'Administrators cannot deactivate or suspend their own account.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found.' });
    }

    const oldStatus = targetUser.account_status;
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?').run(status, now, targetUserId);

    // If suspended or rejected, revoke active auth sessions immediately
    if (['suspended', 'rejected'].includes(status)) {
      db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ?').run(now, targetUserId);
    }

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'user_status_changed',
      entityType: 'user',
      entityId: targetUserId,
      oldValue: { status: oldStatus },
      newValue: { status, reason: reason || 'Admin moderation' },
      req
    });

    return res.json({
      success: true,
      message: `User status changed from '${oldStatus}' to '${status}'.`,
      userId: targetUserId,
      status
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update user status.' });
  }
});

/**
 * 5. PATCH /api/admin/users/:id/role
 * Change user role
 */
router.patch('/users/:id/role', (req, res) => {
  try {
    const { role } = req.body;
    const targetUserId = req.params.id;

    if (!['citizen', 'field_officer', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found.' });
    }

    const oldRole = targetUser.role;
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, targetUserId);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'role_changed',
      entityType: 'user',
      entityId: targetUserId,
      oldValue: { role: oldRole },
      newValue: { role },
      req
    });

    return res.json({
      success: true,
      message: `User role updated from '${oldRole}' to '${role}'.`,
      userId: targetUserId,
      role
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update user role.' });
  }
});

/**
 * 6. POST /api/admin/field-officers/:id/assignments
 * Assign district to Field Officer and activate account
 */
router.post('/field-officers/:id/assignments', (req, res) => {
  try {
    const { state, district } = req.body;
    const officerId = req.params.id;

    if (!state || !district) {
      return res.status(400).json({ success: false, error: 'State and district are required.' });
    }

    const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(officerId);
    if (!officer) {
      return res.status(404).json({ success: false, error: 'Officer user not found.' });
    }

    if (officer.role !== 'field_officer') {
      return res.status(400).json({ success: false, error: 'User must have role field_officer to receive assignments.' });
    }

    const now = new Date().toISOString();
    const assignmentId = 'asg_' + crypto.randomUUID();

    // Check if already assigned
    const existing = db.prepare(`
      SELECT id FROM officer_assignments
      WHERE user_id = ? AND LOWER(district) = LOWER(?) AND active = 1
    `).get(officerId, district);

    if (existing) {
      return res.status(409).json({ success: false, error: `Officer is already actively assigned to ${district}.` });
    }

    const tx = db.transaction(() => {
      // 1. Insert assignment
      db.prepare(`
        INSERT INTO officer_assignments (id, user_id, state, district, assigned_by_admin_id, assigned_at, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(assignmentId, officerId, state, district, req.user.id, now);

      // 2. Automatically ensure officer status is active
      if (officer.account_status !== 'active') {
        db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?').run('active', now, officerId);
      }
    });

    tx();

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'officer_assigned',
      entityType: 'officer_assignment',
      entityId: assignmentId,
      newValue: { officer_id: officerId, state, district, officer_name: officer.full_name },
      req
    });

    return res.status(201).json({
      success: true,
      message: `Assigned ${officer.full_name} to ${district}, ${state}. Account is active.`,
      assignment: {
        id: assignmentId,
        userId: officerId,
        state,
        district,
        assignedAt: now
      }
    });
  } catch (err) {
    console.error('[Officer Assignment Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to create officer assignment.' });
  }
});

/**
 * 7. GET /api/admin/field-officers/:id/assignments
 */
router.get('/field-officers/:id/assignments', (req, res) => {
  try {
    const assignments = db.prepare(`
      SELECT * FROM officer_assignments
      WHERE user_id = ? ORDER BY assigned_at DESC
    `).all(req.params.id);

    return res.json({ success: true, assignments });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch assignments.' });
  }
});

/**
 * 8. DELETE /api/admin/field-officers/:id/assignments/:assignmentId
 */
router.delete('/field-officers/:id/assignments/:assignmentId', (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = db.prepare('SELECT * FROM officer_assignments WHERE id = ?').get(assignmentId);

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }

    db.prepare('DELETE FROM officer_assignments WHERE id = ?').run(assignmentId);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'officer_assignment_removed',
      entityType: 'officer_assignment',
      entityId: assignmentId,
      oldValue: assignment,
      req
    });

    return res.json({ success: true, message: 'Assignment removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to remove assignment.' });
  }
});

/**
 * 9. GET /api/admin/audit-logs
 * Security audit trail viewer
 */
router.get('/audit-logs', (req, res) => {
  try {
    const { action_type, actor_role, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action_type && action_type !== 'all') {
      query += ' AND action_type = ?';
      params.push(action_type);
    }

    if (actor_role && actor_role !== 'all') {
      query += ' AND actor_role = ?';
      params.push(actor_role);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const logs = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count;

    return res.json({ success: true, logs, total });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load audit logs.' });
  }
});

/**
 * 10. GET /api/admin/alerts
 * Filterable list of all alerts with translations and delivery stats
 */
router.get('/alerts', (req, res) => {
  try {
    const { status, district, risk_class, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT a.*,
             u.full_name as approved_by_name,
             fo.full_name as suggested_by_officer_name,
             rev.full_name as reviewed_by_name
      FROM alerts a
      LEFT JOIN users u ON a.approved_by_admin_id = u.id
      LEFT JOIN users fo ON a.suggested_by_officer_id = fo.id
      LEFT JOIN users rev ON a.reviewed_by_admin_id = rev.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND (LOWER(a.status) = LOWER(?) OR LOWER(a.alert_status) = LOWER(?))`;
      params.push(status, status);
    }

    if (district && district !== 'all') {
      query += ` AND (LOWER(a.target_district) = LOWER(?) OR LOWER(a.target_districts) LIKE LOWER(?))`;
      params.push(district, `%${district}%`);
    }

    if (risk_class && risk_class !== 'all') {
      query += ` AND (LOWER(a.risk_class) = LOWER(?) OR LOWER(a.severity) = LOWER(?))`;
      params.push(risk_class, risk_class);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const alerts = db.prepare(query).all(...params);

    const enriched = alerts.map(alt => {
      const translations = db.prepare('SELECT language_code, title, message, precautions FROM alert_translations WHERE alert_id = ?').all(alt.id);
      const deliverySummary = db.prepare(`
        SELECT delivery_status, COUNT(*) as count
        FROM notification_deliveries
        WHERE alert_id = ?
        GROUP BY delivery_status
      `).all(alt.id);

      return {
        ...alt,
        translations,
        deliveries_breakdown: deliverySummary
      };
    });

    const total = db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE alert_status = 'pending_admin_approval' OR status = 'Pending_Approval'").get().count;

    return res.json({
      success: true,
      count: enriched.length,
      total,
      pendingCount,
      alerts: enriched
    });
  } catch (err) {
    console.error('[Admin Get Alerts Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch alerts.' });
  }
});

/**
 * 10a. GET /api/admin/alerts/pending
 * Retrieve only pending alert drafts awaiting admin review
 */
router.get('/alerts/pending', (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT a.*,
             fo.full_name as suggested_by_officer_name
      FROM alerts a
      LEFT JOIN users fo ON a.suggested_by_officer_id = fo.id
      WHERE a.alert_status = 'pending_admin_approval' OR a.status = 'Pending_Approval'
      ORDER BY a.created_at DESC
    `).all();

    const { estimateRecipientCount } = require('../services/alertService');

    const enriched = alerts.map(alt => {
      const translations = db.prepare('SELECT language_code, title, message, precautions FROM alert_translations WHERE alert_id = ?').all(alt.id);
      const recipientEstimate = estimateRecipientCount(alt.target_district);

      return {
        ...alt,
        translations,
        recipient_estimate: recipientEstimate
      };
    });

    return res.json({
      success: true,
      count: enriched.length,
      pendingAlerts: enriched
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch pending alert approval queue.' });
  }
});

/**
 * 10b. GET /api/admin/alerts/:alertId
 * Retrieve full details of an alert
 */
router.get('/alerts/:alertId', (req, res) => {
  try {
    const alert = db.prepare(`
      SELECT a.*,
             u.full_name as approved_by_name,
             fo.full_name as suggested_by_officer_name,
             rev.full_name as reviewed_by_name
      FROM alerts a
      LEFT JOIN users u ON a.approved_by_admin_id = u.id
      LEFT JOIN users fo ON a.suggested_by_officer_id = fo.id
      LEFT JOIN users rev ON a.reviewed_by_admin_id = rev.id
      WHERE a.id = ?
    `).get(req.params.alertId);

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    const translations = db.prepare('SELECT * FROM alert_translations WHERE alert_id = ?').all(alert.id);
    const deliveries = db.prepare(`
      SELECT d.*, u.full_name, u.role
      FROM notification_deliveries d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.alert_id = ?
      ORDER BY d.created_at DESC
      LIMIT 100
    `).all(alert.id);

    const { estimateRecipientCount } = require('../services/alertService');
    const recipientEstimate = estimateRecipientCount(alert.target_district);

    return res.json({
      success: true,
      alert: {
        ...alert,
        translations,
        deliveries,
        recipient_estimate: recipientEstimate
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch alert details.' });
  }
});

/**
 * 10c. PATCH /api/admin/alerts/:alertId
 * Edit alert message, title, target areas, translations, or expiration
 */
router.patch('/alerts/:alertId', (req, res) => {
  try {
    const { alertId } = req.params;
    const { title, message, precautions, target_district, target_villages, valid_until, translations } = req.body;

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alerts
      SET title = COALESCE(?, title),
          message = COALESCE(?, message),
          precautions = COALESCE(?, precautions),
          target_district = COALESCE(?, target_district),
          target_districts = COALESCE(?, target_districts),
          target_villages = COALESCE(?, target_villages),
          valid_until = COALESCE(?, valid_until),
          updated_at = ?
      WHERE id = ?
    `).run(
      title || null, message || null, precautions || null,
      target_district || null, target_district || null,
      target_villages ? JSON.stringify(target_villages) : null,
      valid_until || null, now, alertId
    );

    if (translations && Array.isArray(translations)) {
      for (const t of translations) {
        db.prepare(`
          INSERT INTO alert_translations (id, alert_id, language_code, title, message, precautions, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(alert_id, language_code) DO UPDATE SET
            title = excluded.title,
            message = excluded.message,
            precautions = excluded.precautions,
            updated_at = excluded.updated_at
        `).run('trn_' + crypto.randomUUID(), alertId, t.language_code, t.title, t.message, t.precautions || precautions || alert.precautions, now, now);
      }
    }

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'alert_edited',
      entityType: 'alert',
      entityId: alertId,
      newValue: { title, target_district },
      req
    });

    const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    const updatedTrans = db.prepare('SELECT * FROM alert_translations WHERE alert_id = ?').all(alertId);

    return res.json({
      success: true,
      message: 'Alert updated successfully.',
      alert: { ...updated, translations: updatedTrans }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update alert.' });
  }
});

/**
 * 10d. PATCH & POST /api/admin/alerts/:alertId/approve
 * Approve emergency alert and dispatch push notifications
 */
function handleApproveAlert(req, res) {
  try {
    const { alertId } = req.params;
    const { title, message, precautions, target_district, valid_until, translations } = req.body || {};

    const { approveAndBroadcastAlert } = require('../services/alertService');

    approveAndBroadcastAlert(alertId, req.user, {
      title,
      message,
      precautions,
      target_district,
      valid_until,
      translations
    }).then(result => {
      return res.json({
        success: true,
        message: 'Alert approved and push notifications dispatched.',
        ...result
      });
    }).catch(err => {
      console.error('[Alert Approval Dispatch Error]', err);
      return res.status(400).json({ success: false, error: err.message || 'Failed to approve and broadcast alert.' });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal approval error.' });
  }
}

router.patch('/alerts/:alertId/approve', handleApproveAlert);
router.post('/alerts/:alertId/approve', handleApproveAlert);
router.post('/alerts/:alertId/queue-send', handleApproveAlert);

/**
 * 11. PATCH & POST /api/admin/alerts/:alertId/reject
 * Reject an alert draft with mandatory reason
 */
function handleRejectAlert(req, res) {
  try {
    const { alertId } = req.params;
    const { reason, rejection_reason } = req.body || {};
    const chosenReason = reason || rejection_reason;

    if (!chosenReason || !chosenReason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required. Please explain why this alert is being rejected.'
      });
    }

    const { rejectAlertDraft } = require('../services/alertService');
    const result = rejectAlertDraft(alertId, req.user, chosenReason);

    return res.json({
      success: true,
      message: 'Alert draft rejected.',
      ...result
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to reject alert.' });
  }
}

router.patch('/alerts/:alertId/reject', handleRejectAlert);
router.post('/alerts/:alertId/reject', handleRejectAlert);

/**
 * 11a. POST /api/admin/alerts/:alertId/cancel
 * Cancel an active or pending alert
 */
router.post('/alerts/:alertId/cancel', (req, res) => {
  try {
    const { alertId } = req.params;
    const { reason } = req.body || {};
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alerts
      SET alert_status = 'cancelled', status = 'Rejected', rejection_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason || 'Cancelled by administrator', now, alertId);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'alert_cancelled',
      entityType: 'alert',
      entityId: alertId,
      newValue: { reason }
    });

    return res.json({ success: true, message: 'Alert has been cancelled.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to cancel alert.' });
  }
});

/**
 * 11b. POST /api/admin/alerts/:alertId/expire
 * Manually expire an alert
 */
router.post('/alerts/:alertId/expire', (req, res) => {
  try {
    const { alertId } = req.params;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE alerts
      SET alert_status = 'expired', valid_until = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, alertId);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'alert_expired',
      entityType: 'alert',
      entityId: alertId
    });

    return res.json({ success: true, message: 'Alert marked as expired.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to expire alert.' });
  }
});

/**
 * 11c. GET /api/admin/alerts/:alertId/delivery-summary
 * Get detailed recipient delivery status breakdown
 */
router.get('/alerts/:alertId/delivery-summary', (req, res) => {
  try {
    const { alertId } = req.params;
    const deliveries = db.prepare(`
      SELECT d.*, u.full_name, u.role, u.district
      FROM notification_deliveries d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.alert_id = ?
      ORDER BY d.created_at DESC
    `).all(alertId);

    const counts = db.prepare(`
      SELECT delivery_status, COUNT(*) as count
      FROM notification_deliveries
      WHERE alert_id = ?
      GROUP BY delivery_status
    `).all(alertId);

    return res.json({
      success: true,
      alertId,
      totalDeliveries: deliveries.length,
      breakdown: counts,
      deliveries
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch delivery summary.' });
  }
});

/**
 * 11d. GET /api/admin/notification-audit
 * Specialized audit log for notification & alert actions
 */
router.get('/notification-audit', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action_type LIKE '%alert%' OR action_type LIKE '%push%' OR action_type LIKE '%notif%'
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch notification audit logs.' });
  }
});

/**
 * 12. GET /api/admin/incidents
 * Full multi-district incident management list with analytics
 */
router.get('/incidents', (req, res) => {
  try {
    const {
      status,
      district,
      state,
      incident_type,
      severity,
      search,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM incident_reports WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND (LOWER(status) = LOWER(?) OR LOWER(report_status) = LOWER(?))';
      params.push(status, status);
    }

    if (district && district !== 'all') {
      query += ' AND LOWER(district) = LOWER(?)';
      params.push(district);
    }

    if (state && state !== 'all') {
      query += ' AND LOWER(state) = LOWER(?)';
      params.push(state);
    }

    if (incident_type && incident_type !== 'all') {
      query += ' AND (LOWER(incident_type) = LOWER(?) OR LOWER(type) = LOWER(?))';
      params.push(incident_type, incident_type);
    }

    if (severity && severity !== 'all') {
      query += ' AND (LOWER(severity_reported) = LOWER(?) OR LOWER(priority) = LOWER(?))';
      params.push(severity, severity);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += ' AND (LOWER(description) LIKE ? OR LOWER(location) LIKE ? OR LOWER(reporter_name) LIKE ?)';
      params.push(term, term, term);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const reports = db.prepare(query).all(...params);

    const enriched = reports.map(r => {
      const media = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(r.id);
      const history = db.prepare('SELECT * FROM incident_status_history WHERE incident_report_id = ? ORDER BY created_at ASC').all(r.id);
      return {
        ...r,
        media,
        status_history: history
      };
    });

    const total = db.prepare('SELECT COUNT(*) AS count FROM incident_reports').get().count;
    const pendingCount = db.prepare("SELECT COUNT(*) AS count FROM incident_reports WHERE status IN ('Pending Verification', 'New')").get().count;
    const verifiedCount = db.prepare("SELECT COUNT(*) AS count FROM incident_reports WHERE status = 'Verified'").get().count;
    const resolvedCount = db.prepare("SELECT COUNT(*) AS count FROM incident_reports WHERE status = 'Resolved'").get().count;
    const duplicateCount = db.prepare("SELECT COUNT(*) AS count FROM incident_reports WHERE status = 'Duplicate' OR report_status = 'duplicate'").get().count;

    return res.json({
      success: true,
      count: enriched.length,
      total,
      summary: {
        total,
        pending: pendingCount,
        verified: verifiedCount,
        resolved: resolvedCount,
        duplicate: duplicateCount
      },
      reports: enriched
    });
  } catch (err) {
    console.error('[Admin Incidents Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch incident reports.' });
  }
});

/**
 * 13. PATCH /api/admin/incidents/:id/mark-duplicate
 * Mark report as duplicate and link to master report
 */
router.patch('/incidents/:id/mark-duplicate', (req, res) => {
  try {
    const reportId = req.params.id;
    const { duplicate_of_report_id, note } = req.body;

    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Target report not found.' });
    }

    if (duplicate_of_report_id && duplicate_of_report_id === reportId) {
      return res.status(400).json({ success: false, error: 'A report cannot be marked as a duplicate of itself.' });
    }

    const now = new Date().toISOString();
    const reason = note || `Marked duplicate of ${duplicate_of_report_id || 'earlier report'}`;

    db.prepare(`
      UPDATE incident_reports
      SET status = 'Duplicate',
          report_status = 'duplicate',
          duplicate_of_report_id = ?,
          verification_note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(duplicate_of_report_id || null, reason, now, reportId);

    // Record status history
    db.prepare(`
      INSERT INTO incident_status_history (id, incident_report_id, old_status, new_status, changed_by_user_id, change_note, created_at)
      VALUES (?, ?, ?, 'Duplicate', ?, ?, ?)
    `).run('his_' + crypto.randomUUID(), reportId, report.status, req.user.id, reason, now);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'incident_marked_duplicate',
      entityType: 'incident_report',
      entityId: reportId,
      oldValue: { status: report.status },
      newValue: { status: 'Duplicate', duplicateOf: duplicate_of_report_id },
      req
    });

    const updated = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    return res.json({ success: true, message: 'Report marked as duplicate.', report: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to mark report duplicate.' });
  }
});

/**
 * 14. PATCH /api/admin/incidents/:id/moderate-media
 * Approve or reject media under content moderation policy
 */
router.patch('/incidents/:id/moderate-media', (req, res) => {
  try {
    const { media_id, moderation_status, moderation_reason } = req.body;

    if (!media_id || !['approved', 'rejected', 'pending'].includes(moderation_status)) {
      return res.status(400).json({ success: false, error: 'Valid media_id and moderation_status (approved/rejected/pending) required.' });
    }

    const media = db.prepare('SELECT * FROM incident_media WHERE id = ?').get(media_id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media record not found.' });
    }

    db.prepare(`UPDATE incident_media SET moderation_status = ? WHERE id = ?`).run(moderation_status, media_id);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'media_moderated',
      entityType: 'incident_media',
      entityId: media_id,
      oldValue: { status: media.moderation_status },
      newValue: { status: moderation_status, reason: moderation_reason },
      req
    });

    return res.json({ success: true, message: `Media moderation status set to '${moderation_status}'.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to moderate media.' });
  }
});

/**
 * 15. GET /api/admin/alerts/:id/recipients
 * Retrieve estimated SMS recipient count and category breakdown
 */
router.get('/alerts/:id/recipients', (req, res) => {
  try {
    const alertId = req.params.id;
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    const { recipients, counts } = getTargetRecipients({
      district: alert.target_district,
      includeCitizens: true
    });

    const smsPreviews = generateMultilingualSms({
      areaName: alert.target_district,
      riskLevel: alert.risk_class || alert.severity || 'High',
      validUntil: alert.valid_until
    });

    const maskedRecipients = recipients.map(r => ({
      id: r.id,
      name: r.name,
      maskedPhone: maskPhoneNumber(r.phone),
      type: r.type,
      language: r.language
    }));

    return res.json({
      success: true,
      alertId,
      district: alert.target_district,
      counts,
      smsPreviews,
      sampleRecipients: maskedRecipients.slice(0, 15),
      totalRecipients: recipients.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 16. POST /api/admin/alerts/:id/send-sms
 * Admin explicitly approves and dispatches SMS warning to target district recipients
 */
router.post('/alerts/:id/send-sms', async (req, res) => {
  try {
    const alertId = req.params.id;
    const { allow_cooldown_override = false } = req.body;

    const result = await dispatchApprovedSmsAlert({
      alertId,
      adminUserId: req.user.id,
      allowCooldownOverride: Boolean(allow_cooldown_override)
    });

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 17. GET /api/admin/alerts/:id/sms-delivery-summary
 * Full delivery breakdown of SMS broadcasts
 */
router.get('/alerts/:id/sms-delivery-summary', (req, res) => {
  try {
    const alertId = req.params.id;
    const summary = getSmsDeliverySummary(alertId);
    return res.json({ success: true, ...summary });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 18. POST /api/admin/alerts/:id/retry-failed-sms
 * Retry failed SMS delivery attempts
 */
router.post('/alerts/:id/retry-failed-sms', async (req, res) => {
  try {
    const alertId = req.params.id;
    const result = await retryFailedSms(alertId, req.user.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 19. GET /api/admin/emergency-contacts
 * Retrieve emergency contacts directory
 */
router.get('/emergency-contacts', (req, res) => {
  try {
    const { district, contact_type } = req.query;
    let query = 'SELECT * FROM emergency_contacts WHERE 1=1';
    const params = [];

    if (district && district !== 'all') {
      query += ' AND LOWER(district) = LOWER(?)';
      params.push(district);
    }
    if (contact_type && contact_type !== 'all') {
      query += ' AND contact_type = ?';
      params.push(contact_type);
    }

    query += ' ORDER BY district ASC, contact_type ASC';
    const rows = db.prepare(query).all(...params);

    const safeRows = rows.map(r => ({
      ...r,
      phone_number_masked: maskPhoneNumber(r.phone_number)
    }));

    return res.json({ success: true, contacts: safeRows, total: rows.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 20. POST /api/admin/emergency-contacts
 * Create a new emergency contact in directory
 */
router.post('/emergency-contacts', (req, res) => {
  try {
    const {
      contact_name,
      phone_number,
      contact_type,
      state = 'Meghalaya',
      district,
      village_or_area,
      preferred_language = 'en',
      receive_sms_alerts = 1
    } = req.body;

    if (!contact_name || !phone_number || !contact_type || !district) {
      return res.status(400).json({
        success: false,
        error: 'contact_name, phone_number, contact_type, and district are required fields.'
      });
    }

    const cleanPhone = phone_number.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Valid 10-digit mobile number required.' });
    }

    const now = new Date().toISOString();
    const id = `cnt_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO emergency_contacts (
        id, contact_name, phone_number, contact_type, state, district,
        village_or_area, preferred_language, receive_sms_alerts, contact_status,
        verified_contact, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
    `).run(
      id, contact_name, cleanPhone, contact_type, state, district,
      village_or_area || null, preferred_language, Number(receive_sms_alerts), now, now
    );

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'emergency_contact_created',
      entityType: 'emergency_contact',
      entityId: id,
      details: { contact_name, district, contact_type },
      req
    });

    const created = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(id);
    return res.status(201).json({
      success: true,
      message: 'Emergency contact added successfully.',
      contact: { ...created, phone_number_masked: maskPhoneNumber(created.phone_number) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 21. DELETE /api/admin/emergency-contacts/:id
 * Remove emergency contact
 */
router.delete('/emergency-contacts/:id', (req, res) => {
  try {
    const id = req.params.id;
    const contact = db.prepare('SELECT * FROM emergency_contacts WHERE id = ?').get(id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Emergency contact not found.' });
    }

    db.prepare('DELETE FROM emergency_contacts WHERE id = ?').run(id);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'emergency_contact_deleted',
      entityType: 'emergency_contact',
      entityId: id,
      details: { name: contact.contact_name, district: contact.district },
      req
    });

    return res.json({ success: true, message: 'Emergency contact removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

