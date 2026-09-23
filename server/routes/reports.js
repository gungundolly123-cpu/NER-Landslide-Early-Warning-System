/**
 * NEXZORA — Incident Reporting Router
 * Handles authenticated incident creation, role-based visibility filtering,
 * and strict IDOR access protection.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../db');
const { logAudit } = require('../services/audit');
const { authenticate, requireActive } = require('../middleware/auth');

/**
 * 1. POST /api/reports
 * Submit a new emergency incident report
 */
router.post('/', authenticate, requireActive, (req, res) => {
  try {
    const {
      type,
      priority = 'Medium',
      location,
      state,
      district,
      lat,
      lng,
      description,
      files = 0,
      media_urls = []
    } = req.body;

    if (!type || !location) {
      return res.status(400).json({ success: false, error: 'Incident type and location are required.' });
    }

    const id = 'rep_' + crypto.randomUUID();
    const now = new Date().toISOString();

    // Default state/district to user's home location if not provided
    const reportState = state || req.user.state || 'North Eastern Region';
    const reportDistrict = district || req.user.district || 'General';

    db.prepare(`
      INSERT INTO incident_reports (
        id, reporter_user_id, reporter_name, reporter_role, type, priority,
        status, location, state, district, lat, lng, description, files,
        media_urls, created_at, updated_at
      ) VALUES (
        @id, @reporter_user_id, @reporter_name, @reporter_role, @type, @priority,
        'New', @location, @state, @district, @lat, @lng, @description, @files,
        @media_urls, @now, @now
      )
    `).run({
      id,
      reporter_user_id: req.user.id,
      reporter_name: req.user.full_name,
      reporter_role: req.user.role,
      type,
      priority,
      location: location.trim(),
      state: reportState,
      district: reportDistrict,
      lat: lat !== undefined ? parseFloat(lat) : null,
      lng: lng !== undefined ? parseFloat(lng) : null,
      description: description ? description.trim() : '',
      files: parseInt(files || '0', 10),
      media_urls: JSON.stringify(media_urls || []),
      now
    });

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'incident_reported',
      entityType: 'incident_report',
      entityId: id,
      newValue: { type, priority, location, district: reportDistrict, state: reportState },
      req
    });

    const created = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);

    return res.status(201).json({
      success: true,
      message: 'Incident report submitted successfully.',
      report: created
    });
  } catch (err) {
    console.error('[Submit Report Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to submit incident report.' });
  }
});

/**
 * 2. GET /api/reports
 * Returns incident reports filtered strictly by user role
 */
router.get('/', authenticate, (req, res) => {
  try {
    const { status, type } = req.query;
    let reports = [];

    if (req.user.role === 'admin') {
      // Admin sees all reports
      let sql = 'SELECT * FROM incident_reports WHERE 1=1';
      const params = [];
      if (status && status !== 'all') {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (type && type !== 'all') {
        sql += ' AND type = ?';
        params.push(type);
      }
      sql += ' ORDER BY created_at DESC';
      reports = db.prepare(sql).all(...params);
    } else if (req.user.role === 'field_officer') {
      // Field officer sees reports from assigned districts + own reports
      const assignments = db.prepare('SELECT district FROM officer_assignments WHERE user_id = ? AND active = 1').all(req.user.id);
      const districts = assignments.map(a => a.district.toLowerCase());

      if (districts.length === 0) {
        reports = db.prepare('SELECT * FROM incident_reports WHERE reporter_user_id = ? ORDER BY created_at DESC').all(req.user.id);
      } else {
        const placeholders = districts.map(() => '?').join(',');
        reports = db.prepare(`
          SELECT * FROM incident_reports
          WHERE LOWER(district) IN (${placeholders}) OR reporter_user_id = ?
          ORDER BY created_at DESC
        `).all(...districts, req.user.id);
      }
    } else {
      // Citizen sees ONLY their own submitted reports
      reports = db.prepare(`
        SELECT * FROM incident_reports
        WHERE reporter_user_id = ?
        ORDER BY created_at DESC
      `).all(req.user.id);
    }

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (err) {
    console.error('[Get Reports Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch reports.' });
  }
});

/**
 * 3. GET /api/reports/:id
 * IDOR Protected single report lookup
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    // Role-based IDOR validation
    if (req.user.role === 'citizen' && report.reporter_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_REPORT_ACCESS',
        error: 'Access denied. You can only access your own submitted reports.'
      });
    }

    if (req.user.role === 'field_officer' && report.reporter_user_id !== req.user.id) {
      const assignments = db.prepare('SELECT district FROM officer_assignments WHERE user_id = ? AND active = 1').all(req.user.id);
      const assignedDistricts = assignments.map(a => a.district.toLowerCase());
      const reportDistrict = (report.district || '').toLowerCase();

      if (!assignedDistricts.includes(reportDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_REPORT_ACCESS',
          error: `Access denied. This report belongs to '${report.district}' which is outside your assigned area.`
        });
      }
    }

    return res.json({
      success: true,
      report
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load report.' });
  }
});

module.exports = router;
