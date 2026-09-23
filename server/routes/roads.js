/**
 * NEXZORA — Road Network Status Router
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/roads
 * List all monitored road segments
 */
router.get('/', (req, res) => {
  try {
    const { district, status } = req.query;
    let query = 'SELECT * FROM roads WHERE 1=1';
    const params = [];

    if (district && district !== 'all') {
      query += ' AND LOWER(district) = LOWER(?)';
      params.push(district);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY risk_score DESC';
    const roads = db.prepare(query).all(...params);

    return res.json({ success: true, count: roads.length, roads });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch road networks.' });
  }
});

module.exports = router;
