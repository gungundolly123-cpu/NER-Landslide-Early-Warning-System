/**
 * NEXZORA — Disaster Alerts & Broadcast Router
 * Handles citizen/public alert discovery, localized multilingual feeds,
 * single alert lookups, and user receipt acknowledgments.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuthenticate, authenticate } = require('../middleware/auth');

/**
 * 1. GET /api/alerts
 * List approved disaster alerts for public GIS map and dashboard
 */
router.get('/', optionalAuthenticate, (req, res) => {
  try {
    const isStaff = req.user && ['admin', 'field_officer'].includes(req.user.role);
    const { district, risk_class, limit = 50 } = req.query;

    let query = `
      SELECT a.*,
             u.full_name as approved_by_name,
             fo.full_name as suggested_by_officer_name
      FROM alerts a
      LEFT JOIN users u ON a.approved_by_admin_id = u.id
      LEFT JOIN users fo ON a.suggested_by_officer_id = fo.id
      WHERE 1=1
    `;
    const params = [];

    if (!isStaff) {
      query += " AND (a.status = 'Approved' OR a.alert_status IN ('approved', 'sent'))";
    }

    if (district && district !== 'all') {
      query += " AND (LOWER(a.target_district) = LOWER(?) OR LOWER(a.target_districts) LIKE LOWER(?))";
      params.push(district, `%${district}%`);
    }

    if (risk_class && risk_class !== 'all') {
      query += " AND (LOWER(a.risk_class) = LOWER(?) OR LOWER(a.severity) = LOWER(?))";
      params.push(risk_class, risk_class);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const alerts = db.prepare(query).all(...params);

    const enriched = alerts.map(alt => {
      const translations = db.prepare('SELECT language_code, title, message, precautions FROM alert_translations WHERE alert_id = ?').all(alt.id);
      return { ...alt, translations };
    });

    return res.json({ success: true, count: enriched.length, alerts: enriched });
  } catch (err) {
    console.error('[Get Alerts Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch disaster alerts.' });
  }
});

/**
 * 2. GET /api/alerts/my-alerts
 * Retrieve alerts targeted to the authenticated user's subscribed location in their preferred language
 */
router.get('/my-alerts', authenticate, (req, res) => {
  try {
    // Get user preferences
    const pref = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.user.id);
    const userLang = pref ? pref.preferred_language : (req.user.preferred_language || 'en');
    const userDistrict = pref ? (pref.subscribed_district || req.user.district) : req.user.district;

    let query = `
      SELECT a.*,
             COALESCE(t.title, a.title) as localized_title,
             COALESCE(t.message, a.message) as localized_message,
             COALESCE(t.precautions, a.precautions) as localized_precautions
      FROM alerts a
      LEFT JOIN alert_translations t ON a.id = t.alert_id AND t.language_code = ?
      WHERE (a.status = 'Approved' OR a.alert_status IN ('approved', 'sent'))
    `;
    const params = [userLang];

    if (req.user.role === 'field_officer') {
      const assignments = db.prepare('SELECT district FROM officer_assignments WHERE user_id = ? AND active = 1').all(req.user.id);
      if (assignments.length > 0) {
        const dists = assignments.map(a => a.district.toLowerCase());
        const placeholders = dists.map(() => '?').join(',');
        query += ` AND (LOWER(a.target_district) IN (${placeholders}) OR LOWER(a.target_district) = 'all')`;
        params.push(...dists);
      }
    } else if (userDistrict && userDistrict.toLowerCase() !== 'all') {
      query += ` AND (LOWER(a.target_district) = LOWER(?) OR LOWER(a.target_district) = 'all' OR LOWER(a.target_districts) LIKE LOWER(?))`;
      params.push(userDistrict, `%${userDistrict}%`);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 50';

    const alerts = db.prepare(query).all(...params);

    return res.json({
      success: true,
      preferredLanguage: userLang,
      subscribedDistrict: userDistrict || 'NER',
      count: alerts.length,
      alerts
    });
  } catch (err) {
    console.error('[Get My Alerts Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch personal alerts.' });
  }
});

/**
 * 3. GET /api/alerts/:id
 * Detailed view of a single disaster alert including all translations
 */
router.get('/:id', optionalAuthenticate, (req, res) => {
  try {
    const alert = db.prepare(`
      SELECT a.*,
             u.full_name as approved_by_name,
             fo.full_name as suggested_by_officer_name
      FROM alerts a
      LEFT JOIN users u ON a.approved_by_admin_id = u.id
      LEFT JOIN users fo ON a.suggested_by_officer_id = fo.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found.' });
    }

    // Role-based visibility check
    const isStaff = req.user && ['admin', 'field_officer'].includes(req.user.role);
    if (!isStaff && alert.status !== 'Approved' && !['approved', 'sent'].includes(alert.alert_status)) {
      return res.status(403).json({ success: false, error: 'This alert is awaiting administrative review.' });
    }

    const translations = db.prepare('SELECT * FROM alert_translations WHERE alert_id = ?').all(alert.id);
    const deliveriesCount = db.prepare('SELECT COUNT(*) as count FROM notification_deliveries WHERE alert_id = ?').get(alert.id).count;

    return res.json({
      success: true,
      alert: {
        ...alert,
        translations,
        deliveries_count: deliveriesCount
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch alert details.' });
  }
});

/**
 * 4. POST /api/alerts/:id/acknowledge
 * Citizen acknowledges receiving/reading an alert
 */
router.post('/:id/acknowledge', authenticate, (req, res) => {
  try {
    const alertId = req.params.id;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE notification_deliveries
      SET delivery_status = 'delivered', delivered_at = COALESCE(delivered_at, ?)
      WHERE alert_id = ? AND user_id = ?
    `).run(now, alertId, req.user.id);

    return res.json({ success: true, message: 'Alert acknowledged.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to acknowledge alert.' });
  }
});

module.exports = router;
