/**
 * NEXZORA — Incident Notifications Service
 * Dispatches in-app notifications to reporters upon verification status changes.
 */

const crypto = require('crypto');
const db = require('../db');

/**
 * Create an in-app notification record
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.incidentReportId
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.type='status_update']
 */
function createNotification({ userId, incidentReportId, title, message, type = 'status_update' }) {
  if (!userId || !title || !message) return null;

  try {
    const id = 'ntf_' + crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO incident_notifications (id, user_id, incident_report_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, userId, incidentReportId || null, title.trim(), message.trim(), type, now);

    return { id, userId, incidentReportId, title, message, type, created_at: now };
  } catch (err) {
    console.error('[Notification Service Error]', err);
    return null;
  }
}

/**
 * Get unread/all notifications for a user
 * @param {string} userId
 * @param {number} [limit=50]
 */
function getUserNotifications(userId, limit = 50) {
  try {
    return db.prepare(`
      SELECT n.*, r.type as incident_type, r.location as incident_location, r.report_status
      FROM incident_notifications n
      LEFT JOIN incident_reports r ON n.incident_report_id = r.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  } catch (err) {
    console.error('[Get Notifications Error]', err);
    return [];
  }
}

/**
 * Mark notification as read
 * @param {string} notificationId
 * @param {string} userId
 */
function markNotificationRead(notificationId, userId) {
  try {
    db.prepare(`
      UPDATE incident_notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `).run(notificationId, userId);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationRead
};
