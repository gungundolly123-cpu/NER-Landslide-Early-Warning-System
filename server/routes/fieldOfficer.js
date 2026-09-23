/**
 * NEXZORA — Field Officer Operations Router
 * Allows active Field Officers to view assigned district reports, verify field evidence,
 * update official road status, and propose emergency broadcasts.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../db');
const { logAudit } = require('../services/audit');
const { authenticate, requireRole, requireActive } = require('../middleware/auth');
const { calculatePriorityScore } = require('../services/aiRiskLookup');
const { createNotification } = require('../services/notifications');
const { saveBase64Media } = require('../services/mediaStorage');

// Field officer or Admin role required with active status
router.use(authenticate, requireActive, requireRole('field_officer', 'admin'));

function getOfficerAssignedDistricts(userId, role) {
  if (role === 'admin') return null; // Admin has global view
  const rows = db.prepare('SELECT district FROM officer_assignments WHERE user_id = ? AND active = 1').all(userId);
  return rows.map(r => r.district.toLowerCase());
}

/**
 * 1. GET /api/field-officer/incidents (also /assigned-reports)
 * District incident queue with priority ranking & query filters
 */
function handleGetAssignedIncidents(req, res) {
  try {
    const {
      status,
      district,
      incident_type,
      severity,
      sort_by = 'priority',
      limit = 100,
      offset = 0
    } = req.query;

    const assignedDistricts = getOfficerAssignedDistricts(req.user.id, req.user.role);

    let query = 'SELECT * FROM incident_reports WHERE 1=1';
    const params = [];

    // District constraint for Field Officers
    if (assignedDistricts !== null) {
      if (assignedDistricts.length === 0) {
        query += ' AND reporter_user_id = ?';
        params.push(req.user.id);
      } else {
        const placeholders = assignedDistricts.map(() => '?').join(',');
        query += ` AND (LOWER(district) IN (${placeholders}) OR reporter_user_id = ?)`;
        params.push(...assignedDistricts, req.user.id);
      }
    }

    if (district && district !== 'all') {
      query += ' AND LOWER(district) = LOWER(?)';
      params.push(district);
    }

    if (status && status !== 'all') {
      query += ' AND (LOWER(status) = LOWER(?) OR LOWER(report_status) = LOWER(?))';
      params.push(status, status);
    }

    if (incident_type && incident_type !== 'all') {
      query += ' AND (LOWER(incident_type) = LOWER(?) OR LOWER(type) = LOWER(?))';
      params.push(incident_type, incident_type);
    }

    if (severity && severity !== 'all') {
      query += ' AND (LOWER(severity_reported) = LOWER(?) OR LOWER(priority) = LOWER(?))';
      params.push(severity, severity);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const reports = db.prepare(query).all(...params);

    // Attach media, history, and calculate priority scores
    const enriched = reports.map(r => {
      const media = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(r.id);
      const history = db.prepare(`
        SELECT h.*, u.full_name as changed_by_name, u.role as changed_by_role
        FROM incident_status_history h
        LEFT JOIN users u ON h.changed_by_user_id = u.id
        WHERE h.incident_report_id = ?
        ORDER BY h.created_at ASC
      `).all(r.id);

      const priorityInfo = calculatePriorityScore(r);

      return {
        ...r,
        media,
        status_history: history,
        priority_score: priorityInfo.priorityScore,
        priority_level: priorityInfo.priorityLevel
      };
    });

    // Sort by priority if requested
    if (sort_by === 'priority') {
      enriched.sort((a, b) => b.priority_score - a.priority_score);
    }

    return res.json({
      success: true,
      count: enriched.length,
      assignedDistricts: assignedDistricts || 'all_ner',
      reports: enriched
    });
  } catch (err) {
    console.error('[Field Officer Reports Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to load assigned reports.' });
  }
}

router.get('/incidents', handleGetAssignedIncidents);
router.get('/assigned-reports', handleGetAssignedIncidents);

/**
 * 2. PATCH /api/field-officer/incidents/:id/status (and /reports/:reportId/verify)
 * Verified status lifecycle management
 */
function handleVerifyStatus(req, res) {
  try {
    const reportId = req.params.id || req.params.reportId;
    const { status, verification_notes, notes, verified_severity, media_urls } = req.body;

    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    // Check district authorization for Field Officers
    if (req.user.role === 'field_officer') {
      const assignedDistricts = getOfficerAssignedDistricts(req.user.id, req.user.role);
      const reportDistrict = (report.district || '').toLowerCase();
      if (!assignedDistricts || !assignedDistricts.includes(reportDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'DISTRICT_MISMATCH',
          error: `You are not authorized to verify reports in '${report.district}'.`
        });
      }
    }

    // Map allowed status values
    const statusMap = {
      'under_review': { display: 'Under Review', code: 'under_review' },
      'Under Review': { display: 'Under Review', code: 'under_review' },
      'verified': { display: 'Verified', code: 'verified' },
      'Verified': { display: 'Verified', code: 'verified' },
      'rejected': { display: 'Rejected', code: 'rejected' },
      'Rejected': { display: 'Rejected', code: 'rejected' },
      'resolved': { display: 'Resolved', code: 'resolved' },
      'Resolved': { display: 'Resolved', code: 'resolved' },
      'pending_verification': { display: 'Pending Verification', code: 'pending_verification' },
      'Pending Verification': { display: 'Pending Verification', code: 'pending_verification' },
      'New': { display: 'Pending Verification', code: 'pending_verification' }
    };

    const targetStatus = statusMap[status];
    if (!targetStatus) {
      return res.status(400).json({
        success: false,
        error: `Invalid status '${status}'. Allowed values: under_review, verified, rejected, resolved.`
      });
    }

    const now = new Date().toISOString();
    const finalNotes = verification_notes || notes || report.verification_note || report.verification_notes;
    const finalSeverity = verified_severity || report.severity_verified || report.severity_reported;

    // Database updates
    db.prepare(`
      UPDATE incident_reports
      SET status = ?,
          report_status = ?,
          severity_verified = ?,
          verification_note = ?,
          verification_notes = ?,
          verified_by_officer_id = ?,
          verified_by_user_id = ?,
          verified_at = CASE WHEN ? = 'Verified' THEN ? ELSE verified_at END,
          resolved_by_user_id = CASE WHEN ? = 'Resolved' THEN ? ELSE resolved_by_user_id END,
          resolved_at = CASE WHEN ? = 'Resolved' THEN ? ELSE resolved_at END,
          updated_at = ?
      WHERE id = ?
    `).run(
      targetStatus.display,
      targetStatus.code,
      finalSeverity,
      finalNotes,
      finalNotes,
      req.user.id,
      req.user.id,
      targetStatus.display,
      now,
      targetStatus.display,
      req.user.id,
      targetStatus.display,
      now,
      now,
      reportId
    );

    // Record status history
    db.prepare(`
      INSERT INTO incident_status_history (id, incident_report_id, old_status, new_status, changed_by_user_id, change_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'his_' + crypto.randomUUID(),
      reportId,
      report.status,
      targetStatus.display,
      req.user.id,
      finalNotes || `Status updated to ${targetStatus.display}`,
      now
    );

    // Send in-app notification to reporter
    let notificationMsg = `Your incident report status is now '${targetStatus.display}'.`;
    if (targetStatus.display === 'Under Review') {
      notificationMsg = 'Your incident report is under review by an authorized field officer.';
    } else if (targetStatus.display === 'Verified') {
      notificationMsg = 'Your incident report has been verified. Disaster response authorities have been informed.';
    } else if (targetStatus.display === 'Rejected') {
      notificationMsg = 'Your report could not be verified. Please review the details or submit more information if needed.';
    } else if (targetStatus.display === 'Resolved') {
      notificationMsg = 'The reported incident has been marked as resolved.';
    }

    createNotification({
      userId: report.reporter_user_id,
      incidentReportId: reportId,
      title: `Incident ${targetStatus.display}`,
      message: notificationMsg,
      type: `status_${targetStatus.code}`
    });

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'report_verified',
      entityType: 'incident_report',
      entityId: reportId,
      oldValue: { status: report.status },
      newValue: { status: targetStatus.display, notes: finalNotes, severity: finalSeverity },
      req
    });

    const updated = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);

    return res.json({
      success: true,
      message: `Report status updated to '${targetStatus.display}'.`,
      report: updated
    });
  } catch (err) {
    console.error('[Verify Report Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update report verification.' });
  }
}

router.patch('/incidents/:id/status', handleVerifyStatus);
router.patch('/reports/:reportId/verify', handleVerifyStatus);

/**
 * 3. POST /api/field-officer/incidents/:id/verification
 * Add formal verification inspection details and official media
 */
router.post('/incidents/:id/verification', (req, res) => {
  try {
    const reportId = req.params.id;
    const {
      verification_note,
      verified_severity = 'Medium',
      action_status = 'Verified',
      recommended_action,
      official_media
    } = req.body;

    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    // Check district authorization for Field Officers
    if (req.user.role === 'field_officer') {
      const assignedDistricts = getOfficerAssignedDistricts(req.user.id, req.user.role);
      const reportDistrict = (report.district || '').toLowerCase();
      if (!assignedDistricts || !assignedDistricts.includes(reportDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'DISTRICT_MISMATCH',
          error: `You are not authorized to verify reports in '${report.district}'.`
        });
      }
    }

    const now = new Date().toISOString();
    const finalNote = [
      verification_note,
      recommended_action ? `Action Recommended: ${recommended_action}` : null
    ].filter(Boolean).join(' | ');

    db.prepare(`
      UPDATE incident_reports
      SET status = ?,
          report_status = ?,
          severity_verified = ?,
          verification_note = ?,
          verification_notes = ?,
          verified_by_officer_id = ?,
          verified_by_user_id = ?,
          verified_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      action_status,
      action_status.toLowerCase().replace(/\s+/g, '_'),
      verified_severity,
      finalNote,
      finalNote,
      req.user.id,
      req.user.id,
      now,
      now,
      reportId
    );

    // Save official media if provided
    if (official_media && official_media.dataUrl) {
      try {
        const saved = saveBase64Media(official_media.dataUrl, official_media.name || 'official_inspection', req.user.id);
        db.prepare(`
          INSERT INTO incident_media (
            id, incident_report_id, media_type, storage_url, thumbnail_url,
            original_filename, mime_type, file_size_bytes, uploaded_by_user_id,
            captured_at, created_at, moderation_status, is_official_media,
            uploaded_by_field_officer_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1, ?)
        `).run(
          saved.id, reportId, saved.mediaType, saved.storageUrl, saved.thumbnailUrl,
          saved.originalFilename, saved.mimeType, saved.sizeBytes, req.user.id,
          now, now, req.user.id
        );
      } catch (mErr) {
        console.warn('[Official Media Warning]', mErr.message);
      }
    }

    // Status history
    db.prepare(`
      INSERT INTO incident_status_history (id, incident_report_id, old_status, new_status, changed_by_user_id, change_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'his_' + crypto.randomUUID(),
      reportId,
      report.status,
      action_status,
      req.user.id,
      finalNote,
      now
    );

    // Notification to citizen
    createNotification({
      userId: report.reporter_user_id,
      incidentReportId: reportId,
      title: `Report ${action_status}`,
      message: `Field inspection completed: ${finalNote}`,
      type: 'inspection_completed'
    });

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'field_inspection_submitted',
      entityType: 'incident_report',
      entityId: reportId,
      newValue: { action_status, verified_severity, note: finalNote },
      req
    });

    const updated = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    return res.json({ success: true, message: 'Inspection details saved successfully.', report: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to record verification details.' });
  }
});

/**
 * 4. POST /api/field-officer/incidents/:id/road-status (also /roads/:roadId/status)
 * Link and update road connectivity status
 */
router.post('/incidents/:id/road-status', (req, res) => {
  try {
    const reportId = req.params.id;
    const { road_id, road_name, status, update_note } = req.body;

    if (!['Open', 'At Risk', 'Partially Blocked', 'Fully Blocked', 'Cleared'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid road status specified.' });
    }

    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(reportId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    // Check district authorization for Field Officers
    if (req.user.role === 'field_officer') {
      const assignedDistricts = getOfficerAssignedDistricts(req.user.id, req.user.role);
      const reportDistrict = (report.district || '').toLowerCase();
      if (!assignedDistricts || !assignedDistricts.includes(reportDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'DISTRICT_MISMATCH',
          error: `You are not authorized to update road status in '${report.district}'.`
        });
      }
    }

    const now = new Date().toISOString();
    const finalRoadId = road_id || 'road_dynamic_' + crypto.randomUUID().slice(0, 8);
    const finalRoadName = road_name || report.road_name || `Corridor near ${report.location}`;

    // 1. Ensure road exists in roads table
    const existingRoad = db.prepare('SELECT * FROM roads WHERE id = ?').get(finalRoadId);
    if (!existingRoad) {
      db.prepare(`
        INSERT INTO roads (id, name, state, district, status, risk_score, last_updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, 65, ?, ?)
      `).run(finalRoadId, finalRoadName, report.state || 'Assam', report.district || 'Kamrup Metropolitan', status, req.user.id, now);
    } else {
      db.prepare(`
        UPDATE roads
        SET status = ?, last_updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(status, req.user.id, now, finalRoadId);
    }

    // 2. Update incident report road linkage
    db.prepare(`
      UPDATE incident_reports
      SET related_road_id = ?,
          road_status_at_report_time = ?,
          road_name = ?,
          updated_at = ?
      WHERE id = ?
    `).run(finalRoadId, status, finalRoadName, now, reportId);

    // 3. Insert into road_status_updates
    const updateId = 'rsu_' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO road_status_updates (
        id, related_incident_report_id, road_id, road_name, state, district,
        previous_status, current_status, update_note, updated_by_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      updateId,
      reportId,
      finalRoadId,
      finalRoadName,
      report.state || 'Assam',
      report.district || 'Kamrup Metropolitan',
      report.road_status_at_report_time || 'Open',
      status,
      update_note || `Updated following incident report ${reportId}`,
      req.user.id,
      now
    );

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'road_status_changed',
      entityType: 'road',
      entityId: finalRoadId,
      newValue: { road_name: finalRoadName, status, incidentId: reportId },
      req
    });

    return res.json({
      success: true,
      message: `Road '${finalRoadName}' status updated to '${status}'.`,
      roadUpdate: {
        id: updateId,
        roadId: finalRoadId,
        roadName: finalRoadName,
        status,
        updatedAt: now
      }
    });
  } catch (err) {
    console.error('[Road Status Link Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update linked road status.' });
  }
});

/**
 * 5. PATCH /api/field-officer/roads/:roadId/status
 * Direct road connectivity status update
 */
router.patch('/roads/:roadId/status', (req, res) => {
  try {
    const { roadId } = req.params;
    const { status, risk_score } = req.body;

    if (!['Open', 'At Risk', 'Partially Blocked', 'Fully Blocked', 'Cleared'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid road status specified.' });
    }

    const road = db.prepare('SELECT * FROM roads WHERE id = ?').get(roadId);
    if (!road) {
      return res.status(404).json({ success: false, error: 'Road segment not found.' });
    }

    if (req.user.role === 'field_officer') {
      const assignedDistricts = getOfficerAssignedDistricts(req.user.id, req.user.role);
      const roadDistrict = (road.district || '').toLowerCase();
      if (!assignedDistricts.includes(roadDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'DISTRICT_MISMATCH',
          error: `You are not authorized to update road status in '${road.district}'.`
        });
      }
    }

    const now = new Date().toISOString();
    const newRisk = risk_score !== undefined ? parseInt(risk_score, 10) : road.risk_score;

    db.prepare(`
      UPDATE roads
      SET status = ?, risk_score = ?, last_updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(status, newRisk, req.user.id, now, roadId);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'road_status_updated',
      entityType: 'road',
      entityId: roadId,
      oldValue: { status: road.status, risk_score: road.risk_score },
      newValue: { status, risk_score: newRisk, updated_by: req.user.full_name },
      req
    });

    const updated = db.prepare('SELECT * FROM roads WHERE id = ?').get(roadId);

    return res.json({
      success: true,
      message: `Road '${road.name}' status updated to '${status}'.`,
      road: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update road status.' });
  }
});

/**
 * 6. POST /api/field-officer/alerts/recommend (and /suggest-alert)
 * Recommend an emergency landslide alert from verified ground observation
 */
function handleRecommendAlert(req, res) {
  try {
    const {
      title,
      message,
      severity = 'High',
      risk_level,
      target_district,
      target_districts,
      target_villages,
      reason,
      suggested_precautions,
      linked_incident_report_id,
      valid_hours
    } = req.body;

    const district = target_district || (Array.isArray(target_districts) ? target_districts[0] : target_districts) || req.user.district;
    const chosenSeverity = severity || risk_level || 'High';

    if (!district) {
      return res.status(400).json({ success: false, error: 'Target district is required.' });
    }

    const { recommendOfficerAlert } = require('../services/alertService');

    const result = recommendOfficerAlert({
      target_district: district,
      target_villages: target_villages || [],
      severity: chosenSeverity,
      reason: reason || message || title || 'Verified high landslide hazard risk on ground.',
      suggested_precautions,
      linked_incident_report_id,
      valid_hours: valid_hours ? parseInt(valid_hours, 10) : 6
    }, req.user);

    return res.status(201).json({
      success: true,
      message: 'Alert recommendation submitted for Admin approval.',
      ...result
    });
  } catch (err) {
    console.error('[Recommend Alert Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to submit alert proposal.' });
  }
}

router.post('/alerts/recommend', handleRecommendAlert);
router.post('/suggest-alert', handleRecommendAlert);

module.exports = router;
