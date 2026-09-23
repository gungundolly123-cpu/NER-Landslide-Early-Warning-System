/**
 * NEXZORA — User Profile Router
 * Manages user profile retrieval, safe profile editing, password changes,
 * and avatar updates.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const db = require('../db');
const { logAudit } = require('../services/audit');
const { authenticate } = require('../middleware/auth');

function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  return safe;
}

/**
 * 1. GET /api/users/me
 */
router.get('/me', authenticate, (req, res) => {
  let assignedDistricts = [];
  if (req.user.role === 'field_officer') {
    assignedDistricts = db.prepare(`
      SELECT district, state FROM officer_assignments
      WHERE user_id = ? AND active = 1
    `).all(req.user.id);
  }

  return res.json({
    success: true,
    user: {
      ...sanitizeUser(req.user),
      assignedDistricts
    }
  });
});

/**
 * 2. PATCH /api/users/me
 * Update basic profile fields (Role and Status strictly immutable by self)
 */
router.patch('/me', authenticate, (req, res) => {
  try {
    const {
      full_name,
      email,
      state,
      district,
      village_town,
      preferred_language,
      profile_photo_url
    } = req.body;

    const current = req.user;
    const now = new Date().toISOString();

    let newEmail = current.email;
    if (email !== undefined) {
      const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
      if (cleanEmail && cleanEmail !== current.email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, current.id);
        if (existing) {
          return res.status(409).json({ success: false, error: 'This email is already registered to another account.' });
        }
      }
      newEmail = cleanEmail;
    }

    const updatedName = full_name && full_name.trim() ? full_name.trim() : current.full_name;
    const updatedState = state || current.state;
    const updatedDistrict = district || current.district;
    const updatedVillage = village_town !== undefined ? village_town.trim() : current.village_town;
    const updatedLang = preferred_language || current.preferred_language;
    const updatedPhoto = profile_photo_url !== undefined ? profile_photo_url : current.profile_photo_url;

    db.prepare(`
      UPDATE users
      SET full_name = @full_name, email = @email, state = @state,
          district = @district, village_town = @village_town,
          preferred_language = @preferred_language, profile_photo_url = @profile_photo_url,
          updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: current.id,
      full_name: updatedName,
      email: newEmail,
      state: updatedState,
      district: updatedDistrict,
      village_town: updatedVillage,
      preferred_language: updatedLang,
      profile_photo_url: updatedPhoto,
      updated_at: now
    });

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(current.id);

    logAudit({
      actorUserId: current.id,
      actorName: current.full_name,
      actorRole: current.role,
      actionType: 'profile_updated',
      entityType: 'user',
      entityId: current.id,
      oldValue: { name: current.full_name, email: current.email, district: current.district },
      newValue: { name: updatedName, email: newEmail, district: updatedDistrict },
      req
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: sanitizeUser(refreshed)
    });
  } catch (err) {
    console.error('[Profile Update Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

/**
 * 3. POST /api/users/me/change-password
 */
router.post('/me/change-password', authenticate, (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ success: false, error: 'Current password, new password, and confirmation are required.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'New passwords do not match.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const isCurrentValid = bcrypt.compareSync(current_password, user.password_hash);

    if (!isCurrentValid) {
      return res.status(400).json({ success: false, error: 'Incorrect current password.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, req.user.id);

    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name,
      actorRole: req.user.role,
      actionType: 'password_changed',
      entityType: 'user',
      entityId: req.user.id,
      req
    });

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to change password.' });
  }
});

/**
 * 4. POST /api/users/me/profile-photo
 */
router.post('/me/profile-photo', authenticate, (req, res) => {
  try {
    const { profile_photo_url } = req.body;
    if (!profile_photo_url) {
      return res.status(400).json({ success: false, error: 'Profile photo URL or avatar identifier is required.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET profile_photo_url = ?, updated_at = ? WHERE id = ?').run(
      profile_photo_url,
      now,
      req.user.id
    );

    return res.json({ success: true, message: 'Profile photo updated.', profilePhotoUrl: profile_photo_url });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update photo.' });
  }
});

module.exports = router;
