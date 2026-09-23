/**
 * NEXZORA — Comprehensive Incident Reporting API Router
 * Handles citizen submission, offline sync, media attachments, IDOR-protected lookups,
 * and status timeline tracking.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const db = require('../db');
const { logAudit } = require('../services/audit');
const { authenticate, requireActive } = require('../middleware/auth');
const { estimateSpatialRisk, calculatePriorityScore, isInsideNERStudyArea } = require('../services/aiRiskLookup');
const { saveBase64Media, deleteMediaFile } = require('../services/mediaStorage');
const { createNotification, getUserNotifications, markNotificationRead } = require('../services/notifications');

const VALID_INCIDENT_TYPES = [
  'Crack on Hill Slope',
  'Crack on Road',
  'Slope Movement',
  'Falling Rocks',
  'Mud or Debris on Road',
  'Minor Landslide',
  'Major Landslide',
  'Road Partially Blocked',
  'Road Fully Blocked',
  'Damaged Bridge',
  'Water Leakage from Slope',
  'Flooded Road',
  'Other',
  // Backwards-compatible aliases
  'Landslide',
  'Rockfall',
  'Mudflow',
  'Road blockage',
  'Slope crack'
];

/**
 * Helper: Find active district assignments for a Field Officer
 */
function getOfficerDistricts(userId, role) {
  if (role === 'admin') return null; // Global access
  const assignments = db.prepare('SELECT district FROM officer_assignments WHERE user_id = ? AND active = 1').all(userId);
  return assignments.map(a => a.district.toLowerCase());
}

/**
 * 0. GET /api/incidents
 * Returns active incidents for GIS Dashboard map layer with sanitized privacy
 */
router.get('/', (req, res) => {
  try {
    const { district, status, limit = 200 } = req.query;
    let query = `
      SELECT 
        id, incident_type, type, priority, severity_reported, severity_verified,
        status, report_status, location, latitude, longitude,
        gps_accuracy_m, altitude_m, altitude_accuracy_m, heading_deg, speed_mps,
        location_source, location_captured_at, device_timezone, location_permission_status,
        location_quality, outside_study_area,
        state, district, village_or_town, road_name, landmark, description,
        road_status_at_report_time, ai_risk_probability, ai_risk_class, created_at
      FROM incident_reports
      WHERE report_status NOT IN ('rejected', 'duplicate')
    `;
    const params = [];
    if (district && district !== 'all') {
      query += ' AND LOWER(district) = LOWER(?)';
      params.push(district);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const incidents = db.prepare(query).all(...params);

    const enriched = incidents.map(inc => {
      const media = db.prepare('SELECT id, media_type, thumbnail_url FROM incident_media WHERE incident_report_id = ?').all(inc.id);
      return { ...inc, media };
    });

    return res.json({
      success: true,
      count: enriched.length,
      incidents: enriched
    });
  } catch (err) {
    console.error('[Get Map Incidents Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve incidents.' });
  }
});

/**
 * 1. POST /api/incidents
 * Create and submit a new ground incident report
 */
router.post('/', authenticate, requireActive, (req, res) => {
  try {
    const {
      incident_type,
      type,
      description,
      severity_reported = 'Medium',
      priority,
      latitude,
      longitude,
      lat,
      lng,
      gps_accuracy_m,
      altitude_m,
      altitude_accuracy_m,
      heading_deg,
      speed_mps,
      location_source = 'gps',
      location_captured_at,
      device_timezone,
      location_permission_status = 'granted',
      location_quality,
      reverse_geocoded_address,
      location,
      state,
      district,
      village_or_town,
      road_name,
      landmark,
      client_report_id,
      media = [],
      media_urls = [],
      confirm_accurate = true,
      allow_duplicate = false
    } = req.body;

    const chosenType = incident_type || type;
    const chosenSeverity = severity_reported || priority || 'Medium';
    const finalLat = latitude !== undefined ? parseFloat(latitude) : (lat !== undefined ? parseFloat(lat) : null);
    const finalLng = longitude !== undefined ? parseFloat(longitude) : (lng !== undefined ? parseFloat(lng) : null);

    // Validation 1: Incident Type
    if (!chosenType || typeof chosenType !== 'string' || !chosenType.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Incident type is required. Please select a valid hazard category.'
      });
    }

    // Validation 2: Description (10 to 1000 chars)
    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Description is required and must be at least 10 characters long.'
      });
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 10 || trimmedDescription.length > 1000) {
      return res.status(400).json({
        success: false,
        error: `Description must be between 10 and 1,000 characters. Current length: ${trimmedDescription.length}.`
      });
    }

    // Validation 3: Coordinates Presence & Boundaries
    if (finalLat === null || finalLng === null || isNaN(finalLat) || isNaN(finalLng)) {
      return res.status(400).json({
        success: false,
        error: 'Location coordinates (latitude and longitude) are required. Please use GPS or select a point on the map.'
      });
    }

    if (finalLat < -90 || finalLat > 90) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude coordinate. Must be between -90 and 90.'
      });
    }

    if (finalLng < -180 || finalLng > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid longitude coordinate. Must be between -180 and 180.'
      });
    }

    // Check Coverage Boundary
    const isInsideStudyArea = isInsideNERStudyArea(finalLat, finalLng);
    const isOutsideArea = !isInsideStudyArea;

    // Check for Duplicate Detection
    if (!allow_duplicate) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const existingDuplicate = db.prepare(`
        SELECT id, incident_type, location, created_at, reporter_user_id
        FROM incident_reports
        WHERE reporter_user_id = ?
          AND ABS(latitude - ?) < 0.015
          AND ABS(longitude - ?) < 0.015
          AND (LOWER(incident_type) = LOWER(?) OR LOWER(type) = LOWER(?))
          AND created_at >= ?
          AND report_status NOT IN ('rejected', 'duplicate')
        LIMIT 1
      `).get(req.user.id, finalLat, finalLng, chosenType, chosenType, oneDayAgo);

      if (existingDuplicate && existingDuplicate.reporter_user_id === req.user.id) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_REPORT_DETECTED',
          warning: 'You recently submitted a similar report in this vicinity within the last 24 hours.',
          existingReportId: existingDuplicate.id,
          hint: 'If this is a distinct or newly escalated event, resubmit with allow_duplicate=true.'
        });
      }
    }

    const id = 'rep_' + crypto.randomUUID();
    const now = new Date().toISOString();
    const finalState = state || req.user.state || 'Assam';
    const finalDistrict = district || req.user.district || 'Kamrup Metropolitan';
    const finalLocation = location || `${village_or_town || ''} ${road_name || ''} ${landmark || ''}`.trim() || `${finalDistrict}, ${finalState}`;

    // Calculate quality score if not explicitly set
    const finalGpsAccuracy = gps_accuracy_m ? parseFloat(gps_accuracy_m) : null;
    let finalQuality = location_quality;
    if (!finalQuality) {
      if (location_source === 'manual_map_pin') {
        finalQuality = 'medium';
      } else if (finalGpsAccuracy !== null) {
        finalQuality = finalGpsAccuracy <= 50 ? 'high' : finalGpsAccuracy <= 200 ? 'medium' : 'low';
      } else {
        finalQuality = 'unknown';
      }
    }

    // Query AI Risk Model
    const aiRisk = estimateSpatialRisk(finalLat, finalLng);

    // Insert Report
    db.prepare(`
      INSERT INTO incident_reports (
        id, client_report_id, reporter_user_id, reporter_name, reporter_role,
        type, incident_type, priority, severity_reported, severity_verified,
        status, report_status, location, latitude, longitude, lat, lng,
        gps_accuracy_m, altitude_m, altitude_accuracy_m, heading_deg, speed_mps,
        location_source, location_captured_at, device_timezone, location_permission_status,
        location_quality, outside_study_area, reverse_geocoded_address,
        state, district, village_or_town, road_name, landmark, description, files, media_count,
        media_urls, duplicate_of_report_id, verification_note, verification_notes,
        ai_risk_probability, ai_risk_class, ai_data_timestamp, created_at, updated_at
      ) VALUES (
        @id, @client_report_id, @reporter_user_id, @reporter_name, @reporter_role,
        @type, @incident_type, @priority, @severity_reported, NULL,
        'Pending Verification', 'pending_verification', @location, @latitude, @longitude, @lat, @lng,
        @gps_accuracy_m, @altitude_m, @altitude_accuracy_m, @heading_deg, @speed_mps,
        @location_source, @location_captured_at, @device_timezone, @location_permission_status,
        @location_quality, @outside_study_area, @reverse_geocoded_address,
        @state, @district, @village_or_town, @road_name, @landmark, @description, @files, @media_count,
        @media_urls, NULL, NULL, NULL,
        @ai_risk_probability, @ai_risk_class, @ai_data_timestamp, @now, @now
      )
    `).run({
      id,
      client_report_id: client_report_id || null,
      reporter_user_id: req.user.id,
      reporter_name: req.user.full_name,
      reporter_role: req.user.role,
      type: chosenType,
      incident_type: chosenType,
      priority: chosenSeverity,
      severity_reported: chosenSeverity,
      location: finalLocation,
      latitude: finalLat,
      longitude: finalLng,
      lat: finalLat,
      lng: finalLng,
      gps_accuracy_m: finalGpsAccuracy,
      altitude_m: altitude_m ? parseFloat(altitude_m) : null,
      altitude_accuracy_m: altitude_accuracy_m ? parseFloat(altitude_accuracy_m) : null,
      heading_deg: heading_deg ? parseFloat(heading_deg) : null,
      speed_mps: speed_mps ? parseFloat(speed_mps) : null,
      location_source: location_source || 'gps',
      location_captured_at: location_captured_at || now,
      device_timezone: device_timezone || 'Asia/Kolkata',
      location_permission_status: location_permission_status || 'granted',
      location_quality: finalQuality,
      outside_study_area: isOutsideArea ? 1 : 0,
      reverse_geocoded_address: typeof reverse_geocoded_address === 'object' ? JSON.stringify(reverse_geocoded_address) : (reverse_geocoded_address || null),
      state: finalState,
      district: finalDistrict,
      village_or_town: village_or_town || null,
      road_name: road_name || null,
      landmark: landmark || null,
      description: trimmedDescription,
      files: Array.isArray(media) ? media.length : (Array.isArray(media_urls) ? media_urls.length : 0),
      media_count: Array.isArray(media) ? media.length : (Array.isArray(media_urls) ? media_urls.length : 0),
      media_urls: JSON.stringify(media_urls || []),
      ai_risk_probability: aiRisk.ai_risk_probability,
      ai_risk_class: aiRisk.ai_risk_class,
      ai_data_timestamp: aiRisk.ai_data_timestamp,
      now
    });

    // Record initial status history
    db.prepare(`
      INSERT INTO incident_status_history (id, incident_report_id, old_status, new_status, changed_by_user_id, change_note, created_at)
      VALUES (?, ?, NULL, 'Pending Verification', ?, 'Incident submitted by reporter', ?)
    `).run('his_' + crypto.randomUUID(), id, req.user.id, now);

    // Save attached media files if provided
    let savedMediaCount = 0;
    if (Array.isArray(media) && media.length > 0) {
      for (const item of media) {
        if (item.dataUrl) {
          try {
            const saved = saveBase64Media(item.dataUrl, item.name || 'incident_evidence', req.user.id);
            db.prepare(`
              INSERT INTO incident_media (
                id, incident_report_id, media_type, storage_url, thumbnail_url,
                original_filename, mime_type, file_size_bytes, uploaded_by_user_id,
                captured_at, created_at, moderation_status, is_official_media
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
            `).run(
              saved.id, id, saved.mediaType, saved.storageUrl, saved.thumbnailUrl,
              saved.originalFilename, saved.mimeType, saved.sizeBytes, req.user.id,
              item.capturedAt || now, now
            );
            savedMediaCount++;
          } catch (mErr) {
            console.warn('[Incident Media Upload Warning]', mErr.message);
          }
        }
      }
      if (savedMediaCount > 0) {
        db.prepare('UPDATE incident_reports SET media_count = ?, files = ? WHERE id = ?').run(savedMediaCount, savedMediaCount, id);
      }
    }

    // Send in-app notification to reporter
    createNotification({
      userId: req.user.id,
      incidentReportId: id,
      title: 'Incident Report Submitted',
      message: `Your incident report for '${chosenType}' has been submitted and is waiting for field officer verification.`,
      type: 'submission_confirmation'
    });

    // Audit log
    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'incident_created',
      entityType: 'incident_report',
      entityId: id,
      newValue: {
        type: chosenType,
        severity: chosenSeverity,
        district: finalDistrict,
        location: finalLocation,
        latitude: finalLat,
        longitude: finalLng,
        gpsAccuracy: finalGpsAccuracy,
        locationSource: location_source,
        aiRiskClass: aiRisk.ai_risk_class,
        outsideStudyArea: isOutsideArea
      },
      req
    });

    const createdReport = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
    const mediaItems = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(id);

    return res.status(201).json({
      success: true,
      message: 'Incident report submitted successfully and queued for field verification.',
      report_id: id,
      incident_id: id,
      report_status: 'pending_verification',
      location: {
        latitude: finalLat,
        longitude: finalLng,
        accuracy_m: finalGpsAccuracy,
        altitude_m: altitude_m ? parseFloat(altitude_m) : null,
        source: location_source || 'gps',
        captured_at: location_captured_at || now,
        timezone: device_timezone || 'Asia/Kolkata',
        quality: finalQuality
      },
      outside_study_area: isOutsideArea,
      ai_risk_status: aiRisk.ai_risk_status,
      ai_risk_class: aiRisk.ai_risk_class,
      ai_risk_probability: aiRisk.ai_risk_probability,
      report: {
        ...createdReport,
        media: mediaItems,
        ai_risk: aiRisk
      },
      incident: {
        ...createdReport,
        media: mediaItems,
        ai_risk: aiRisk
      }
    });
  } catch (err) {
    console.error('[Submit Incident Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to process incident submission.' });
  }
});

/**
 * 2. POST /api/incidents/sync
 * Idempotent offline sync endpoint using client_report_id
 */
router.post('/sync', authenticate, requireActive, (req, res) => {
  try {
    const { client_report_id, reports } = req.body;

    // Handle single report sync or batch sync
    const reportsToSync = Array.isArray(reports) ? reports : [req.body];
    const results = [];

    for (const item of reportsToSync) {
      const cId = item.client_report_id || client_report_id;
      if (!cId) {
        results.push({ success: false, error: 'client_report_id is required for offline sync.' });
        continue;
      }

      // Check if already synced
      const existing = db.prepare(`
        SELECT * FROM incident_reports WHERE client_report_id = ? AND reporter_user_id = ?
      `).get(cId, req.user.id);

      if (existing) {
        const existingMedia = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(existing.id);
        results.push({
          success: true,
          synced: true,
          alreadyExists: true,
          report: { ...existing, media: existingMedia }
        });
        continue;
      }

      // Create new synced report
      const chosenType = item.incident_type || item.type || 'Landslide';
      const chosenSeverity = item.severity_reported || item.priority || 'Medium';
      const finalLat = item.latitude !== undefined ? parseFloat(item.latitude) : (item.lat !== undefined ? parseFloat(item.lat) : null);
      const finalLng = item.longitude !== undefined ? parseFloat(item.longitude) : (item.lng !== undefined ? parseFloat(item.lng) : null);

      if (finalLat === null || finalLng === null || isNaN(finalLat) || isNaN(finalLng)) {
        if (!Array.isArray(reports)) {
          return res.status(400).json({
            success: false,
            error: 'Location coordinates (latitude and longitude) are required before final sync.'
          });
        }
        results.push({
          success: false,
          client_report_id: cId,
          error: 'Location coordinates (latitude and longitude) are required before final sync.'
        });
        continue;
      }

      const finalLocation = item.location || `${item.district || 'Kamrup Metropolitan'}, ${item.state || 'Assam'}`;
      const now = new Date().toISOString();
      const id = 'rep_' + crypto.randomUUID();

      const aiRisk = estimateSpatialRisk(finalLat, finalLng);

      const isInsideStudyArea = isInsideNERStudyArea(finalLat, finalLng);
      const isOutsideArea = !isInsideStudyArea;
      const finalGpsAccuracy = item.gps_accuracy_m ? parseFloat(item.gps_accuracy_m) : null;
      let finalQuality = item.location_quality;
      if (!finalQuality) {
        if (item.location_source === 'manual_map_pin') finalQuality = 'medium';
        else if (finalGpsAccuracy !== null) finalQuality = finalGpsAccuracy <= 50 ? 'high' : finalGpsAccuracy <= 200 ? 'medium' : 'low';
        else finalQuality = 'unknown';
      }

      db.prepare(`
        INSERT INTO incident_reports (
          id, client_report_id, reporter_user_id, reporter_name, reporter_role,
          type, incident_type, priority, severity_reported,
          status, report_status, location, latitude, longitude, lat, lng,
          gps_accuracy_m, altitude_m, altitude_accuracy_m, heading_deg, speed_mps,
          location_source, location_captured_at, device_timezone, location_permission_status,
          location_quality, outside_study_area, reverse_geocoded_address,
          state, district, village_or_town, road_name, landmark, description, files, media_count,
          media_urls, ai_risk_probability, ai_risk_class, ai_data_timestamp,
          created_at, updated_at
        ) VALUES (
          @id, @client_report_id, @reporter_user_id, @reporter_name, @reporter_role,
          @type, @incident_type, @priority, @severity_reported,
          'Pending Verification', 'pending_verification', @location, @latitude, @longitude, @lat, @lng,
          @gps_accuracy_m, @altitude_m, @altitude_accuracy_m, @heading_deg, @speed_mps,
          @location_source, @location_captured_at, @device_timezone, @location_permission_status,
          @location_quality, @outside_study_area, @reverse_geocoded_address,
          @state, @district, @village_or_town, @road_name, @landmark, @description, @files, @media_count,
          @media_urls, @ai_risk_probability, @ai_risk_class, @ai_data_timestamp,
          @now, @now
        )
      `).run({
        id,
        client_report_id: cId,
        reporter_user_id: req.user.id,
        reporter_name: req.user.full_name,
        reporter_role: req.user.role,
        type: chosenType,
        incident_type: chosenType,
        priority: chosenSeverity,
        severity_reported: chosenSeverity,
        location: finalLocation,
        latitude: finalLat,
        longitude: finalLng,
        lat: finalLat,
        lng: finalLng,
        gps_accuracy_m: finalGpsAccuracy,
        altitude_m: item.altitude_m ? parseFloat(item.altitude_m) : null,
        altitude_accuracy_m: item.altitude_accuracy_m ? parseFloat(item.altitude_accuracy_m) : null,
        heading_deg: item.heading_deg ? parseFloat(item.heading_deg) : null,
        speed_mps: item.speed_mps ? parseFloat(item.speed_mps) : null,
        location_source: item.location_source || 'gps',
        location_captured_at: item.location_captured_at || now,
        device_timezone: item.device_timezone || 'Asia/Kolkata',
        location_permission_status: item.location_permission_status || 'granted',
        location_quality: finalQuality,
        outside_study_area: isOutsideArea ? 1 : 0,
        reverse_geocoded_address: typeof item.reverse_geocoded_address === 'object' ? JSON.stringify(item.reverse_geocoded_address) : (item.reverse_geocoded_address || null),
        state: item.state || req.user.state || 'Assam',
        district: item.district || req.user.district || 'Kamrup Metropolitan',
        village_or_town: item.village_or_town || null,
        road_name: item.road_name || null,
        landmark: item.landmark || null,
        description: (item.description || '').trim() || 'Offline captured incident report.',
        files: Array.isArray(item.media) ? item.media.length : 0,
        media_count: Array.isArray(item.media) ? item.media.length : 0,
        media_urls: JSON.stringify(item.media_urls || []),
        ai_risk_probability: aiRisk.ai_risk_probability,
        ai_risk_class: aiRisk.ai_risk_class,
        ai_data_timestamp: aiRisk.ai_data_timestamp,
        now
      });

      // Status history
      db.prepare(`
        INSERT INTO incident_status_history (id, incident_report_id, old_status, new_status, changed_by_user_id, change_note, created_at)
        VALUES (?, ?, 'Pending Sync', 'Pending Verification', ?, 'Offline report synced successfully', ?)
      `).run('his_' + crypto.randomUUID(), id, req.user.id, now);

      // Save media if provided
      if (Array.isArray(item.media)) {
        for (const m of item.media) {
          if (m.dataUrl) {
            try {
              const saved = saveBase64Media(m.dataUrl, m.name, req.user.id);
              db.prepare(`
                INSERT INTO incident_media (
                  id, incident_report_id, media_type, storage_url, thumbnail_url,
                  original_filename, mime_type, file_size_bytes, uploaded_by_user_id,
                  captured_at, created_at, moderation_status, is_official_media
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
              `).run(
                saved.id, id, saved.mediaType, saved.storageUrl, saved.thumbnailUrl,
                saved.originalFilename, saved.mimeType, saved.sizeBytes, req.user.id,
                m.capturedAt || now, now
              );
            } catch (err) {}
          }
        }
      }

      // In-app notification
      createNotification({
        userId: req.user.id,
        incidentReportId: id,
        title: 'Offline Report Synced',
        message: `Your offline report for '${chosenType}' has synced successfully.`,
        type: 'sync_success'
      });

      logAudit({
        actorUserId: req.user.id,
        actorName: req.user.full_name,
        actorRole: req.user.role,
        actionType: 'incident_synced',
        entityType: 'incident_report',
        entityId: id,
        newValue: { client_report_id: cId, type: chosenType },
        req
      });

      const syncedReport = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(id);
      const mediaList = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(id);

      results.push({
        success: true,
        synced: true,
        report_id: id,
        report: { ...syncedReport, media: mediaList },
        location: {
          latitude: finalLat,
          longitude: finalLng,
          accuracy_m: finalGpsAccuracy,
          altitude_m: item.altitude_m ? parseFloat(item.altitude_m) : null,
          source: item.location_source || 'gps',
          captured_at: item.location_captured_at || now
        }
      });
    }

    if (!Array.isArray(reports) && results.length === 1) {
      const single = results[0];
      if (!single.success) {
        return res.status(400).json(single);
      }
      return res.status(200).json({
        success: true,
        synced: true,
        message: 'Offline sync processed successfully.',
        count: 1,
        results: single,
        ...single
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Offline sync processed successfully.',
      count: results.length,
      results: Array.isArray(reports) ? results : results[0]
    });
  } catch (err) {
    console.error('[Sync Incident Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to sync offline reports.' });
  }
});

/**
 * 3. GET /api/incidents/my-reports
 * Return only authenticated user's submitted reports with media and timeline
 */
router.get('/my-reports', authenticate, (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM incident_reports WHERE reporter_user_id = ?';
    const params = [req.user.id];

    if (status && status !== 'all') {
      query += ' AND (LOWER(status) = LOWER(?) OR LOWER(report_status) = LOWER(?))';
      params.push(status, status);
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

    return res.json({
      success: true,
      count: enriched.length,
      reports: enriched
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch personal reports.' });
  }
});

/**
 * 4. GET /api/incidents/notifications
 * In-app notifications feed for authenticated user
 */
router.get('/notifications', authenticate, (req, res) => {
  try {
    const notifications = getUserNotifications(req.user.id);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    return res.json({
      success: true,
      unreadCount,
      notifications
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
});

/**
 * 5. PATCH /api/incidents/notifications/:id/read
 * Mark notification as read
 */
router.patch('/notifications/:id/read', authenticate, (req, res) => {
  try {
    markNotificationRead(req.params.id, req.user.id);
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

/**
 * 6. GET /api/incidents/:id
 * IDOR Protected single report lookup
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    // Role-based IDOR validation
    if (req.user.role === 'citizen' && report.reporter_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN_REPORT_ACCESS',
        error: 'Access denied. Citizens can only view their own submitted reports.'
      });
    }

    if (req.user.role === 'field_officer' && report.reporter_user_id !== req.user.id) {
      const assignedDistricts = getOfficerDistricts(req.user.id, req.user.role);
      const reportDistrict = (report.district || '').toLowerCase();

      if (!assignedDistricts || !assignedDistricts.includes(reportDistrict)) {
        return res.status(403).json({
          success: false,
          code: 'DISTRICT_MISMATCH',
          error: `Access denied. Report belongs to '${report.district}', outside your assigned jurisdiction.`
        });
      }
    }

    // Attach media, history, and calculated priority score
    const media = db.prepare('SELECT * FROM incident_media WHERE incident_report_id = ?').all(report.id);
    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name, u.role as changed_by_role
      FROM incident_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.incident_report_id = ?
      ORDER BY h.created_at ASC
    `).all(report.id);

    const roadUpdates = db.prepare(`
      SELECT * FROM road_status_updates WHERE related_incident_report_id = ? ORDER BY updated_at DESC
    `).all(report.id);

    const priorityInfo = calculatePriorityScore(report);

    // Sanitize reporter privacy for public/other citizens
    let sanitizedReport = { ...report };
    if (req.user.role === 'citizen' && report.reporter_user_id !== req.user.id) {
      delete sanitizedReport.reporter_name;
      delete sanitizedReport.reporter_user_id;
    }

    return res.json({
      success: true,
      report: {
        ...sanitizedReport,
        media,
        status_history: history,
        road_updates: roadUpdates,
        priority_analysis: priorityInfo
      }
    });
  } catch (err) {
    console.error('[Get Incident Detail Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve incident details.' });
  }
});

/**
 * 7. PATCH /api/incidents/:id
 * Reporter can edit draft/pending report; Officer/Admin can update operational details
 */
router.patch('/:id', authenticate, requireActive, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    const isOwner = report.reporter_user_id === req.user.id;
    const isOfficer = req.user.role === 'field_officer';
    const isAdmin = req.user.role === 'admin';

    // Citizen can only edit own report while Pending Verification or Draft
    if (isOwner && req.user.role === 'citizen') {
      const allowedStatuses = ['Pending Verification', 'New', 'draft', 'pending_verification'];
      if (!allowedStatuses.includes(report.status) && !allowedStatuses.includes(report.report_status)) {
        return res.status(403).json({
          success: false,
          error: `Cannot edit report. Report is already '${report.status}'.`
        });
      }

      const { description, incident_type, severity_reported, landmark, village_or_town } = req.body;
      const now = new Date().toISOString();

      if (description && (description.trim().length < 10 || description.trim().length > 1000)) {
        return res.status(400).json({ success: false, error: 'Description must be between 10 and 1,000 characters.' });
      }

      db.prepare(`
        UPDATE incident_reports
        SET description = COALESCE(?, description),
            incident_type = COALESCE(?, incident_type),
            type = COALESCE(?, type),
            severity_reported = COALESCE(?, severity_reported),
            landmark = COALESCE(?, landmark),
            village_or_town = COALESCE(?, village_or_town),
            updated_at = ?
        WHERE id = ?
      `).run(
        description ? description.trim() : null,
        incident_type || null,
        incident_type || null,
        severity_reported || null,
        landmark || null,
        village_or_town || null,
        now,
        report.id
      );

      logAudit({
        actorUserId: req.user.id,
        actorName: req.user.full_name,
        actorRole: req.user.role,
        actionType: 'incident_edited',
        entityType: 'incident_report',
        entityId: report.id,
        oldValue: { description: report.description, type: report.incident_type },
        newValue: { description, incident_type },
        req
      });

      const updated = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(report.id);
      return res.json({ success: true, message: 'Incident report updated successfully.', report: updated });
    }

    if (!isAdmin && !isOfficer) {
      return res.status(403).json({ success: false, error: 'Unauthorized to modify this report.' });
    }

    // Admin / Officer operational updates
    const { landmark, road_name, village_or_town } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE incident_reports
      SET landmark = COALESCE(?, landmark),
          road_name = COALESCE(?, road_name),
          village_or_town = COALESCE(?, village_or_town),
          updated_at = ?
      WHERE id = ?
    `).run(landmark || null, road_name || null, village_or_town || null, now, report.id);

    return res.json({ success: true, message: 'Incident metadata updated.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update report.' });
  }
});

/**
 * 8. POST /api/incidents/:id/media
 * Upload photo or video to an incident report
 */
router.post('/:id/media', authenticate, requireActive, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    const isOwner = report.reporter_user_id === req.user.id;
    const isOfficer = req.user.role === 'field_officer';
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isOfficer && !isAdmin) {
      return res.status(403).json({ success: false, error: 'You are not authorized to upload media for this report.' });
    }

    const { dataUrl, filename, capturedAt, is_official } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ success: false, error: 'Media dataUrl is required.' });
    }

    const saved = saveBase64Media(dataUrl, filename || 'evidence', req.user.id);
    const isOfficial = is_official || (isOfficer || isAdmin ? 1 : 0);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO incident_media (
        id, incident_report_id, media_type, storage_url, thumbnail_url,
        original_filename, mime_type, file_size_bytes, uploaded_by_user_id,
        captured_at, created_at, moderation_status, is_official_media,
        uploaded_by_field_officer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      saved.id, report.id, saved.mediaType, saved.storageUrl, saved.thumbnailUrl,
      saved.originalFilename, saved.mimeType, saved.sizeBytes, req.user.id,
      capturedAt || now, now, isOfficial ? 1 : 0,
      (isOfficer || isAdmin) ? req.user.id : null
    );

    // Update media count
    const count = db.prepare('SELECT COUNT(*) as count FROM incident_media WHERE incident_report_id = ?').get(report.id).count;
    db.prepare('UPDATE incident_reports SET media_count = ?, files = ?, updated_at = ? WHERE id = ?').run(count, count, now, report.id);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'media_uploaded',
      entityType: 'incident_media',
      entityId: saved.id,
      newValue: { reportId: report.id, filename: saved.originalFilename, sizeBytes: saved.sizeBytes },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Media evidence uploaded successfully.',
      media: {
        id: saved.id,
        incident_report_id: report.id,
        media_type: saved.mediaType,
        storage_url: saved.storageUrl,
        thumbnail_url: saved.thumbnailUrl,
        original_filename: saved.originalFilename,
        file_size_bytes: saved.sizeBytes,
        is_official_media: isOfficial ? 1 : 0
      }
    });
  } catch (err) {
    console.error('[Upload Media Error]', err);
    return res.status(400).json({ success: false, error: err.message || 'Media upload failed.' });
  }
});

/**
 * 9. DELETE /api/incidents/:id/media/:mediaId
 * Remove media item (Owner before verification or Admin)
 */
router.delete('/:id/media/:mediaId', authenticate, requireActive, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found.' });
    }

    const media = db.prepare('SELECT * FROM incident_media WHERE id = ? AND incident_report_id = ?').get(req.params.mediaId, report.id);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media record not found.' });
    }

    const isOwner = report.reporter_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && (!isOwner || (report.status !== 'Pending Verification' && report.status !== 'New'))) {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this media attachment.' });
    }

    deleteMediaFile(media.storage_url);
    db.prepare('DELETE FROM incident_media WHERE id = ?').run(media.id);

    const count = db.prepare('SELECT COUNT(*) as count FROM incident_media WHERE incident_report_id = ?').get(report.id).count;
    db.prepare('UPDATE incident_reports SET media_count = ?, files = ? WHERE id = ?').run(count, count, report.id);

    return res.json({ success: true, message: 'Media attachment deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete media.' });
  }
});

module.exports = router;
