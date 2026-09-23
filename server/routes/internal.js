/**
 * NEXZORA — Internal Pipeline Services Router
 * Protected endpoint for machine learning model inference triggers
 * to propose suggested alert drafts without automated public broadcast.
 */

const express = require('express');
const router = express.Router();
const { createAISuggestedAlert } = require('../services/alertService');

/**
 * POST /api/internal/alerts/suggest
 * Propose an alert draft from AI spatial risk prediction (High/Very High)
 */
router.post('/alerts/suggest', (req, res) => {
  try {
    const {
      risk_class,
      risk_probability,
      target_state,
      target_district,
      target_villages,
      target_road_ids,
      reason_summary,
      precautions,
      linked_prediction_id,
      linked_incident_report_id,
      rainfall_summary,
      rainfall_data_timestamp,
      soil_moisture_summary,
      soil_data_timestamp,
      prediction_timestamp,
      valid_hours,
      allow_cooldown_override
    } = req.body;

    if (!target_district) {
      return res.status(400).json({ success: false, error: 'target_district is required.' });
    }

    const result = createAISuggestedAlert({
      risk_class: risk_class || 'high',
      risk_probability: risk_probability !== undefined ? parseFloat(risk_probability) : 0.85,
      target_state: target_state || 'Assam',
      target_district,
      target_villages: target_villages || [],
      target_road_ids: target_road_ids || [],
      reason_summary,
      precautions,
      linked_prediction_id,
      linked_incident_report_id,
      rainfall_summary,
      rainfall_data_timestamp,
      soil_moisture_summary,
      soil_data_timestamp,
      prediction_timestamp,
      valid_hours: valid_hours ? parseInt(valid_hours, 10) : 6,
      allow_cooldown_override: !!allow_cooldown_override
    });

    if (!result.created) {
      return res.status(200).json({
        success: false,
        created: false,
        reason: result.reason,
        cooldown: !!result.cooldown,
        existingAlertId: result.existingAlertId
      });
    }

    return res.status(201).json({
      success: true,
      created: true,
      message: 'AI alert draft suggested successfully. Awaiting Administrator approval.',
      ...result
    });
  } catch (err) {
    console.error('[Internal Alert Suggestion Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process AI alert suggestion.' });
  }
});

module.exports = router;
