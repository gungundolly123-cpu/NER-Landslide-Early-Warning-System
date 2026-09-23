/**
 * NEXZORA — Database Engine & Migrations Layer
 * Uses better-sqlite3 for high-performance synchronous SQL queries with transaction safety.
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure database directory exists
const dbDir = path.dirname(config.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.DATABASE_PATH);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      mobile_number TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'field_officer', 'admin')),
      account_status TEXT NOT NULL CHECK(account_status IN ('unverified', 'pending_verification', 'active', 'suspended', 'rejected')),
      mobile_verified INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      village_town TEXT NOT NULL,
      preferred_language TEXT DEFAULT 'English',
      profile_photo_url TEXT,
      consent_accepted INTEGER NOT NULL DEFAULT 0,
      consent_accepted_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile_number);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);
    CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);

    -- 2. Officer District Assignments Table
    CREATE TABLE IF NOT EXISTS officer_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      assigned_by_admin_id TEXT REFERENCES users(id),
      assigned_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_user ON officer_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_district ON officer_assignments(district);

    -- 3. Password Reset Tokens
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);

    -- 4. OTP Verifications Table
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id TEXT PRIMARY KEY,
      mobile_number TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      otp_code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_otp_mobile ON otp_verifications(mobile_number);

    -- 5. Auth Refresh Tokens / Sessions Table
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      device_info TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);

    -- 6. Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      actor_name TEXT,
      actor_role TEXT,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_value_summary TEXT,
      new_value_summary TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

    -- 7. Incident Reports Table
    CREATE TABLE IF NOT EXISTS incident_reports (
      id TEXT PRIMARY KEY,
      client_report_id TEXT,
      reporter_user_id TEXT NOT NULL REFERENCES users(id),
      reporter_name TEXT NOT NULL,
      reporter_role TEXT NOT NULL,
      type TEXT NOT NULL,
      incident_type TEXT,
      priority TEXT NOT NULL,
      severity_reported TEXT DEFAULT 'Medium',
      severity_verified TEXT,
      status TEXT NOT NULL DEFAULT 'Pending Verification',
      report_status TEXT DEFAULT 'pending_verification',
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      lat REAL,
      lng REAL,
      gps_accuracy_m REAL,
      location_source TEXT DEFAULT 'gps',
      location_captured_at TEXT,
      state TEXT,
      district TEXT,
      village_or_town TEXT,
      road_name TEXT,
      landmark TEXT,
      description TEXT,
      files INTEGER DEFAULT 0,
      media_count INTEGER DEFAULT 0,
      media_urls TEXT DEFAULT '[]',
      duplicate_of_report_id TEXT REFERENCES incident_reports(id),
      verification_note TEXT,
      verification_notes TEXT,
      verified_by_officer_id TEXT REFERENCES users(id),
      verified_by_user_id TEXT REFERENCES users(id),
      verified_at TEXT,
      resolved_by_user_id TEXT REFERENCES users(id),
      resolved_at TEXT,
      related_road_id TEXT REFERENCES roads(id),
      road_status_at_report_time TEXT,
      ai_risk_probability REAL,
      ai_risk_class TEXT,
      ai_data_timestamp TEXT,
      archived_at TEXT,
      deleted_by_user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 8. Incident Media Table
    CREATE TABLE IF NOT EXISTS incident_media (
      id TEXT PRIMARY KEY,
      incident_report_id TEXT NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL CHECK(media_type IN ('photo', 'video')),
      storage_url TEXT NOT NULL,
      thumbnail_url TEXT,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
      captured_at TEXT,
      created_at TEXT NOT NULL,
      moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending', 'approved', 'rejected')),
      is_official_media INTEGER NOT NULL DEFAULT 0,
      uploaded_by_field_officer_id TEXT REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_report ON incident_media(incident_report_id);
    CREATE INDEX IF NOT EXISTS idx_media_uploader ON incident_media(uploaded_by_user_id);

    -- 9. Incident Status History Table
    CREATE TABLE IF NOT EXISTS incident_status_history (
      id TEXT PRIMARY KEY,
      incident_report_id TEXT NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by_user_id TEXT REFERENCES users(id),
      change_note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_report ON incident_status_history(incident_report_id);

    -- 10. Road Status Updates Table
    CREATE TABLE IF NOT EXISTS road_status_updates (
      id TEXT PRIMARY KEY,
      related_incident_report_id TEXT REFERENCES incident_reports(id),
      road_id TEXT NOT NULL,
      road_name TEXT,
      state TEXT,
      district TEXT,
      previous_status TEXT,
      current_status TEXT NOT NULL,
      update_note TEXT,
      updated_by_user_id TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_road_updates_road ON road_status_updates(road_id);

    -- 11. Incident In-App Notifications Table
    CREATE TABLE IF NOT EXISTS incident_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      incident_report_id TEXT REFERENCES incident_reports(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'status_update',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user ON incident_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON incident_notifications(is_read);

    -- 12. Roads Table
    CREATE TABLE IF NOT EXISTS roads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Open', 'At Risk', 'Partially Blocked', 'Fully Blocked', 'Cleared')),
      risk_score INTEGER DEFAULT 50,
      last_updated_by TEXT REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    -- 13. Alerts Table
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      alert_reference_code TEXT UNIQUE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'High',
      alert_type TEXT DEFAULT 'landslide_risk',
      risk_class TEXT DEFAULT 'high',
      risk_probability REAL,
      target_state TEXT,
      target_district TEXT NOT NULL,
      target_districts TEXT,
      target_villages TEXT,
      target_geometry TEXT,
      target_road_ids TEXT,
      reason_summary TEXT,
      precautions TEXT,
      linked_prediction_id TEXT,
      linked_incident_report_id TEXT,
      model_version TEXT DEFAULT 'NEXZORA-XGBoost-v2.1',
      rainfall_summary TEXT,
      rainfall_data_timestamp TEXT,
      soil_moisture_summary TEXT,
      soil_data_timestamp TEXT,
      data_completeness_status TEXT DEFAULT 'complete',
      status TEXT DEFAULT 'Pending_Approval',
      alert_status TEXT DEFAULT 'pending_admin_approval',
      suggested_by_officer_id TEXT REFERENCES users(id),
      created_by_user_id TEXT REFERENCES users(id),
      approved_by_admin_id TEXT REFERENCES users(id),
      reviewed_by_admin_id TEXT REFERENCES users(id),
      reviewed_at TEXT,
      rejection_reason TEXT,
      approved_at TEXT,
      sent_at TEXT,
      broadcast_at TEXT,
      valid_from TEXT,
      valid_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 14. Device Push Tokens Table
    CREATE TABLE IF NOT EXISTS device_push_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'web' CHECK(platform IN ('android', 'ios', 'web')),
      app_version TEXT,
      device_identifier_hash TEXT,
      notification_permission TEXT NOT NULL DEFAULT 'default' CHECK(notification_permission IN ('granted', 'denied', 'default')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_user ON device_push_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_active ON device_push_tokens(is_active);
    CREATE INDEX IF NOT EXISTS idx_tokens_token ON device_push_tokens(token);

    -- 15. Notification Preferences Table
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'hi', 'as', 'bn', 'other')),
      receive_push_alerts INTEGER NOT NULL DEFAULT 1,
      receive_sms_alerts INTEGER NOT NULL DEFAULT 0,
      receive_email_alerts INTEGER NOT NULL DEFAULT 0,
      subscribed_state TEXT DEFAULT 'Assam',
      subscribed_district TEXT DEFAULT 'Kamrup Metropolitan',
      subscribed_village_or_area TEXT,
      notification_radius_km REAL DEFAULT 25.0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_pref_dist ON notification_preferences(subscribed_district);

    -- 16. Alert Translations Table
    CREATE TABLE IF NOT EXISTS alert_translations (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      language_code TEXT NOT NULL CHECK(language_code IN ('en', 'hi', 'as', 'bn')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      precautions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(alert_id, language_code)
    );

    CREATE INDEX IF NOT EXISTS idx_translations_alert ON alert_translations(alert_id);

    -- 17. Notification Deliveries Table
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      delivery_channel TEXT NOT NULL DEFAULT 'push' CHECK(delivery_channel IN ('push', 'sms', 'email', 'in_app')),
      target_token_id TEXT REFERENCES device_push_tokens(id) ON DELETE SET NULL,
      delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK(delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'invalid_token', 'skipped')),
      provider_message_id TEXT,
      error_code TEXT,
      error_message_safe TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_alert ON notification_deliveries(alert_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_user ON notification_deliveries(user_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON notification_deliveries(delivery_status);

    -- 18. Emergency Contacts Table (Feature C)
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      contact_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK(contact_type IN ('citizen', 'field_officer', 'admin_official', 'police', 'PRI_representative', 'PWD_team', 'disaster_management_office', 'emergency_contact')),
      state TEXT NOT NULL DEFAULT 'Meghalaya',
      district TEXT NOT NULL,
      village_or_area TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'hi', 'as', 'bn', 'other')),
      receive_sms_alerts INTEGER NOT NULL DEFAULT 1,
      contact_status TEXT NOT NULL DEFAULT 'active' CHECK(contact_status IN ('active', 'inactive', 'unsubscribed')),
      verified_contact INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_emergency_dist ON emergency_contacts(district);
    CREATE INDEX IF NOT EXISTS idx_emergency_type ON emergency_contacts(contact_type);
    CREATE INDEX IF NOT EXISTS idx_emergency_phone ON emergency_contacts(phone_number);
    CREATE INDEX IF NOT EXISTS idx_emergency_status ON emergency_contacts(contact_status);

    -- 19. SMS Deliveries Table (Feature C)
    CREATE TABLE IF NOT EXISTS sms_deliveries (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      recipient_id TEXT REFERENCES emergency_contacts(id) ON DELETE SET NULL,
      phone_number_masked TEXT NOT NULL,
      provider_name TEXT NOT NULL DEFAULT 'test',
      provider_message_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK(delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'skipped', 'invalid_number', 'test_mode')),
      failure_reason_safe TEXT,
      language_code TEXT NOT NULL DEFAULT 'en',
      message_template_reference TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sms_deliveries_alert ON sms_deliveries(alert_id);
    CREATE INDEX IF NOT EXISTS idx_sms_deliveries_rec ON sms_deliveries(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_sms_deliveries_status ON sms_deliveries(delivery_status);
  `);

  // Upgrade existing incident_reports table if it had old CHECK constraint
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='incident_reports'").get();
    if (tableSql && tableSql.sql && tableSql.sql.includes("CHECK(status IN ('New'")) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE IF NOT EXISTS incident_reports_v2 (
          id TEXT PRIMARY KEY,
          client_report_id TEXT,
          reporter_user_id TEXT NOT NULL REFERENCES users(id),
          reporter_name TEXT NOT NULL,
          reporter_role TEXT NOT NULL,
          type TEXT NOT NULL,
          incident_type TEXT,
          priority TEXT NOT NULL,
          severity_reported TEXT DEFAULT 'Medium',
          severity_verified TEXT,
          status TEXT NOT NULL DEFAULT 'Pending Verification',
          report_status TEXT DEFAULT 'pending_verification',
          location TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          lat REAL,
          lng REAL,
          gps_accuracy_m REAL,
          location_source TEXT DEFAULT 'gps',
          location_captured_at TEXT,
          state TEXT,
          district TEXT,
          village_or_town TEXT,
          road_name TEXT,
          landmark TEXT,
          description TEXT,
          files INTEGER DEFAULT 0,
          media_count INTEGER DEFAULT 0,
          media_urls TEXT DEFAULT '[]',
          duplicate_of_report_id TEXT REFERENCES incident_reports(id),
          verification_note TEXT,
          verification_notes TEXT,
          verified_by_officer_id TEXT REFERENCES users(id),
          verified_by_user_id TEXT REFERENCES users(id),
          verified_at TEXT,
          resolved_by_user_id TEXT REFERENCES users(id),
          resolved_at TEXT,
          related_road_id TEXT REFERENCES roads(id),
          road_status_at_report_time TEXT,
          ai_risk_probability REAL,
          ai_risk_class TEXT,
          ai_data_timestamp TEXT,
          archived_at TEXT,
          deleted_by_user_id TEXT REFERENCES users(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO incident_reports_v2 (
          id, reporter_user_id, reporter_name, reporter_role, type, priority, status,
          location, state, district, lat, lng, description, files, media_urls,
          verification_notes, verified_by_officer_id, verified_at, created_at, updated_at
        )
        SELECT
          id, reporter_user_id, reporter_name, reporter_role, type, priority, status,
          location, state, district, lat, lng, description, files, media_urls,
          verification_notes, verified_by_officer_id, verified_at, created_at, updated_at
        FROM incident_reports;

        DROP TABLE incident_reports;
        ALTER TABLE incident_reports_v2 RENAME TO incident_reports;
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.warn('[DB Migration] Table constraint upgrade note:', err.message);
  }

  // Run dynamic column migrations for existing incident_reports tables BEFORE creating indexes
  const existingCols = db.pragma('table_info(incident_reports)').map(c => c.name);
  const requiredColumns = [
    { name: 'client_report_id', def: 'TEXT' },
    { name: 'incident_type', def: 'TEXT' },
    { name: 'severity_reported', def: 'TEXT DEFAULT "Medium"' },
    { name: 'severity_verified', def: 'TEXT' },
    { name: 'report_status', def: 'TEXT DEFAULT "pending_verification"' },
    { name: 'latitude', def: 'REAL' },
    { name: 'longitude', def: 'REAL' },
    { name: 'gps_accuracy_m', def: 'REAL' },
    { name: 'location_source', def: 'TEXT DEFAULT "gps"' },
    { name: 'location_captured_at', def: 'TEXT' },
    { name: 'village_or_town', def: 'TEXT' },
    { name: 'road_name', def: 'TEXT' },
    { name: 'landmark', def: 'TEXT' },
    { name: 'altitude_m', def: 'REAL' },
    { name: 'altitude_accuracy_m', def: 'REAL' },
    { name: 'heading_deg', def: 'REAL' },
    { name: 'speed_mps', def: 'REAL' },
    { name: 'device_timezone', def: 'TEXT' },
    { name: 'location_permission_status', def: 'TEXT' },
    { name: 'location_quality', def: 'TEXT' },
    { name: 'outside_study_area', def: 'INTEGER DEFAULT 0' },
    { name: 'reverse_geocoded_address', def: 'TEXT' },
    { name: 'media_count', def: 'INTEGER DEFAULT 0' },
    { name: 'duplicate_of_report_id', def: 'TEXT' },
    { name: 'verification_note', def: 'TEXT' },
    { name: 'verified_by_user_id', def: 'TEXT' },
    { name: 'resolved_by_user_id', def: 'TEXT' },
    { name: 'resolved_at', def: 'TEXT' },
    { name: 'related_road_id', def: 'TEXT' },
    { name: 'road_status_at_report_time', def: 'TEXT' },
    { name: 'ai_risk_probability', def: 'REAL' },
    { name: 'ai_risk_class', def: 'TEXT' },
    { name: 'ai_data_timestamp', def: 'TEXT' },
    { name: 'archived_at', def: 'TEXT' },
    { name: 'deleted_by_user_id', def: 'TEXT' }
  ];

  for (const col of requiredColumns) {
    if (!existingCols.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE incident_reports ADD COLUMN ${col.name} ${col.def}`);
      } catch (err) {
        // Column may already exist
      }
    }
  }

  // Dynamic column migrations for alerts table
  const existingAlertCols = db.pragma('table_info(alerts)').map(c => c.name);
  const requiredAlertColumns = [
    { name: 'alert_reference_code', def: 'TEXT' },
    { name: 'alert_type', def: 'TEXT DEFAULT "landslide_risk"' },
    { name: 'risk_class', def: 'TEXT DEFAULT "high"' },
    { name: 'risk_probability', def: 'REAL' },
    { name: 'target_state', def: 'TEXT' },
    { name: 'target_district', def: 'TEXT' },
    { name: 'target_villages', def: 'TEXT' },
    { name: 'target_geometry', def: 'TEXT' },
    { name: 'target_road_ids', def: 'TEXT' },
    { name: 'reason_summary', def: 'TEXT' },
    { name: 'precautions', def: 'TEXT' },
    { name: 'linked_prediction_id', def: 'TEXT' },
    { name: 'linked_incident_report_id', def: 'TEXT' },
    { name: 'model_version', def: 'TEXT DEFAULT "NEXZORA-XGBoost-v2.1"' },
    { name: 'rainfall_summary', def: 'TEXT' },
    { name: 'rainfall_data_timestamp', def: 'TEXT' },
    { name: 'soil_moisture_summary', def: 'TEXT' },
    { name: 'soil_data_timestamp', def: 'TEXT' },
    { name: 'data_completeness_status', def: 'TEXT DEFAULT "complete"' },
    { name: 'alert_status', def: 'TEXT DEFAULT "pending_admin_approval"' },
    { name: 'created_by_user_id', def: 'TEXT' },
    { name: 'reviewed_by_admin_id', def: 'TEXT' },
    { name: 'reviewed_at', def: 'TEXT' },
    { name: 'rejection_reason', def: 'TEXT' },
    { name: 'approved_at', def: 'TEXT' },
    { name: 'sent_at', def: 'TEXT' },
    { name: 'valid_from', def: 'TEXT' },
    { name: 'valid_until', def: 'TEXT' },
    { name: 'updated_at', def: 'TEXT' }
  ];

  for (const col of requiredAlertColumns) {
    if (!existingAlertCols.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE alerts ADD COLUMN ${col.name} ${col.def}`);
      } catch (err) {}
    }
  }

  // Create indexes after column migrations
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reports_reporter ON incident_reports(reporter_user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_district ON incident_reports(district);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON incident_reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_client_id ON incident_reports(client_report_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON incident_reports(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(alert_status);
    CREATE INDEX IF NOT EXISTS idx_alerts_district ON alerts(target_district);
    CREATE INDEX IF NOT EXISTS idx_alerts_ref ON alerts(alert_reference_code);
  `);
}

function seedDefaultData() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) return;

  console.log('[DB] Seeding initial development & demo accounts...');

  const now = new Date().toISOString();
  const salt = bcrypt.genSaltSync(10);

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, full_name, mobile_number, email, password_hash, role, account_status,
      mobile_verified, email_verified, state, district, village_town, preferred_language,
      profile_photo_url, consent_accepted, consent_accepted_at, created_at, updated_at
    ) VALUES (
      @id, @full_name, @mobile_number, @email, @password_hash, @role, @account_status,
      @mobile_verified, @email_verified, @state, @district, @village_town, @preferred_language,
      @profile_photo_url, @consent_accepted, @consent_accepted_at, @created_at, @updated_at
    )
  `);

  const insertAssignment = db.prepare(`
    INSERT INTO officer_assignments (id, user_id, state, district, assigned_by_admin_id, assigned_at, active)
    VALUES (@id, @user_id, @state, @district, @assigned_by_admin_id, @assigned_at, @active)
  `);

  const insertRoad = db.prepare(`
    INSERT INTO roads (id, name, state, district, status, risk_score, last_updated_by, updated_at)
    VALUES (@id, @name, @state, @district, @status, @risk_score, @last_updated_by, @updated_at)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, title, message, severity, target_districts, suggested_by_officer_id, status, approved_by_admin_id, created_at, broadcast_at)
    VALUES (@id, @title, @message, @severity, @target_districts, @suggested_by_officer_id, @status, @approved_by_admin_id, @created_at, @broadcast_at)
  `);

  const insertReport = db.prepare(`
    INSERT INTO incident_reports (
      id, reporter_user_id, reporter_name, reporter_role, type, priority, status,
      location, state, district, lat, lng, description, files, media_urls,
      verification_notes, verified_by_officer_id, verified_at, created_at, updated_at
    ) VALUES (
      @id, @reporter_user_id, @reporter_name, @reporter_role, @type, @priority, @status,
      @location, @state, @district, @lat, @lng, @description, @files, @media_urls,
      @verification_notes, @verified_by_officer_id, @verified_at, @created_at, @updated_at
    )
  `);

  const seedTx = db.transaction(() => {
    // 1. Admin Account
    insertUser.run({
      id: 'usr_admin_001',
      full_name: 'Dr. Debojit Barman (NER Admin)',
      mobile_number: '9876543210',
      email: 'admin@nexzora.gov.in',
      password_hash: bcrypt.hashSync('Admin@Nexzora2026!', salt),
      role: 'admin',
      account_status: 'active',
      mobile_verified: 1,
      email_verified: 1,
      state: 'Assam',
      district: 'Kamrup Metropolitan',
      village_town: 'Guwahati Dispur',
      preferred_language: 'English',
      profile_photo_url: null,
      consent_accepted: 1,
      consent_accepted_at: now,
      created_at: now,
      updated_at: now
    });

    // 2. Active Field Officer
    insertUser.run({
      id: 'usr_officer_001',
      full_name: 'Pema Bhutia (Field Officer)',
      mobile_number: '9876543211',
      email: 'officer.shillong@nexzora.gov.in',
      password_hash: bcrypt.hashSync('Officer@Nexzora2026!', salt),
      role: 'field_officer',
      account_status: 'active',
      mobile_verified: 1,
      email_verified: 1,
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_town: 'Shillong Sadar',
      preferred_language: 'English',
      profile_photo_url: null,
      consent_accepted: 1,
      consent_accepted_at: now,
      created_at: now,
      updated_at: now
    });

    // Assign Officer 1 to East Khasi Hills & Mangan
    insertAssignment.run({
      id: 'asg_001',
      user_id: 'usr_officer_001',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      assigned_by_admin_id: 'usr_admin_001',
      assigned_at: now,
      active: 1
    });

    // 3. Pending Field Officer
    insertUser.run({
      id: 'usr_officer_002',
      full_name: 'Tashi Namgyal (New Officer)',
      mobile_number: '9876543212',
      email: 'officer.gangtok@nexzora.gov.in',
      password_hash: bcrypt.hashSync('Officer@Nexzora2026!', salt),
      role: 'field_officer',
      account_status: 'pending_verification',
      mobile_verified: 1,
      email_verified: 0,
      state: 'Sikkim',
      district: 'Gangtok',
      village_town: 'Tadong',
      preferred_language: 'English',
      profile_photo_url: null,
      consent_accepted: 1,
      consent_accepted_at: now,
      created_at: now,
      updated_at: now
    });

    // 4. Active Citizen
    insertUser.run({
      id: 'usr_citizen_001',
      full_name: 'Ananya Sharma (Local Resident)',
      mobile_number: '9876543213',
      email: 'citizen.assam@nexzora.gov.in',
      password_hash: bcrypt.hashSync('Citizen@Nexzora2026!', salt),
      role: 'citizen',
      account_status: 'active',
      mobile_verified: 1,
      email_verified: 1,
      state: 'Assam',
      district: 'Kamrup Metropolitan',
      village_town: 'Guwahati Panbazar',
      preferred_language: 'English',
      profile_photo_url: null,
      consent_accepted: 1,
      consent_accepted_at: now,
      created_at: now,
      updated_at: now
    });

    // Seed Roads
    const initialRoads = [
      { id: 'road_01', name: 'NH-10 Sevoke - Gangtok Highway', state: 'Sikkim', district: 'Gangtok', status: 'Partially Blocked', risk_score: 92 },
      { id: 'road_02', name: 'NH-6 Shillong - Silchar Corridor', state: 'Meghalaya', district: 'East Khasi Hills', status: 'At Risk', risk_score: 85 },
      { id: 'road_03', name: 'Bhalukpong - Tawang Axis (NH-13)', state: 'Arunachal Pradesh', district: 'West Kameng', status: 'Fully Blocked', risk_score: 96 },
      { id: 'road_04', name: 'NH-29 Dimapur - Kohima Highway', state: 'Nagaland', district: 'Kohima', status: 'Partially Blocked', risk_score: 78 },
      { id: 'road_05', name: 'NH-37 Guwahati - Jorhat Highway', state: 'Assam', district: 'Kamrup Metropolitan', status: 'Open', risk_score: 24 },
      { id: 'road_06', name: 'NH-102 Imphal - Moreh Highway', state: 'Manipur', district: 'Chandel', status: 'Open', risk_score: 38 }
    ];

    for (const r of initialRoads) {
      insertRoad.run({
        id: r.id,
        name: r.name,
        state: r.state,
        district: r.district,
        status: r.status,
        risk_score: r.risk_score,
        last_updated_by: 'usr_officer_001',
        updated_at: now
      });
    }

    // Seed Alerts
    insertAlert.run({
      id: 'alt_001',
      title: 'CRITICAL: Severe Landslide Threat on NH-10 corridor',
      message: 'Persistent torrential rain has triggered fresh debris flow along Melli-Teesta stretch. Public transit halted.',
      severity: 'Critical',
      target_districts: JSON.stringify(['Gangtok', 'Mangan', 'Kalimpong']),
      suggested_by_officer_id: 'usr_officer_001',
      status: 'Approved',
      approved_by_admin_id: 'usr_admin_001',
      created_at: now,
      broadcast_at: now
    });

    insertAlert.run({
      id: 'alt_002',
      title: 'HIGH: Slope Subsidence Advisory on NH-6',
      message: 'Heavy seepage detected along Sonapur tunnel approach. Heavy commercial vehicles advised diversion.',
      severity: 'High',
      target_districts: JSON.stringify(['East Khasi Hills', 'East Jaintia Hills']),
      suggested_by_officer_id: 'usr_officer_001',
      status: 'Approved',
      approved_by_admin_id: 'usr_admin_001',
      created_at: now,
      broadcast_at: now
    });

    insertAlert.run({
      id: 'alt_003',
      title: 'SUGGESTED: Flash flood hazard near Dikrong Basin',
      message: 'Sudden surge in upstream telemetry gauges. Low-lying habitations alert proposed.',
      severity: 'Moderate',
      target_districts: JSON.stringify(['Papum Pare']),
      suggested_by_officer_id: 'usr_officer_001',
      status: 'Pending_Approval',
      approved_by_admin_id: null,
      created_at: now,
      broadcast_at: null
    });

    // Seed Sample Citizen Incident Reports
    insertReport.run({
      id: 'rep_001',
      reporter_user_id: 'usr_citizen_001',
      reporter_name: 'Ananya Sharma',
      reporter_role: 'citizen',
      type: 'Landslide',
      priority: 'High',
      status: 'Verified',
      location: 'Near Upper Shillong Peak Road, Meghalaya',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      lat: 25.5420,
      lng: 91.8540,
      description: 'Retaining wall cracked with active mud flow across downhill roadway.',
      files: 2,
      media_urls: JSON.stringify(['/assets/reports/sample_slide1.jpg']),
      verification_notes: 'Inspected on-site. SDRF alerted and clearing machinery deployed.',
      verified_by_officer_id: 'usr_officer_001',
      verified_at: now,
      created_at: now,
      updated_at: now
    });

    insertReport.run({
      id: 'rep_002',
      reporter_user_id: 'usr_citizen_001',
      reporter_name: 'Ananya Sharma',
      reporter_role: 'citizen',
      type: 'Road blockage',
      priority: 'Critical',
      status: 'New',
      location: 'Mile 14, Gangtok-Nathula highway, Sikkim',
      state: 'Sikkim',
      district: 'Gangtok',
      lat: 27.3512,
      lng: 88.6321,
      description: 'Huge boulder rolled down blocking both lanes completely.',
      files: 1,
      media_urls: JSON.stringify([]),
      verification_notes: null,
      verified_by_officer_id: null,
      verified_at: null,
      created_at: now,
      updated_at: now
    });
  });

  seedTx();
  console.log('[DB] Schema and seed data successfully initialized.');
}

function seedEmergencyContacts() {
  const contactCount = db.prepare('SELECT COUNT(*) AS count FROM emergency_contacts').get().count;
  if (contactCount > 0) return;

  const now = new Date().toISOString();
  const insertContact = db.prepare(`
    INSERT INTO emergency_contacts (
      id, user_id, contact_name, phone_number, contact_type, state, district,
      village_or_area, preferred_language, receive_sms_alerts, contact_status, verified_contact, created_at, updated_at
    ) VALUES (
      @id, @user_id, @contact_name, @phone_number, @contact_type, @state, @district,
      @village_or_area, @preferred_language, @receive_sms_alerts, @contact_status, @verified_contact, @created_at, @updated_at
    )
  `);

  const initialContacts = [
    {
      id: 'cnt_001',
      user_id: 'usr_officer_001',
      contact_name: 'Pema Bhutia (Field Officer)',
      phone_number: '9876543211',
      contact_type: 'field_officer',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_area: 'Shillong Sadar',
      preferred_language: 'en',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_002',
      user_id: null,
      contact_name: 'District Disaster Management Authority (DDMA)',
      phone_number: '9862001122',
      contact_type: 'disaster_management_office',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_area: 'DC Office Complex, Shillong',
      preferred_language: 'en',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_003',
      user_id: null,
      contact_name: 'Shillong Police Control Room (Traffic/Emergency)',
      phone_number: '9862003344',
      contact_type: 'police',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_area: 'Police Headquarters, Shillong',
      preferred_language: 'en',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_004',
      user_id: null,
      contact_name: 'Meghalaya PWD (NH-6 Rapid Road Clearance Division)',
      phone_number: '9862005566',
      contact_type: 'PWD_team',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_area: 'Sonapur & Upper Shillong',
      preferred_language: 'en',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_005',
      user_id: null,
      contact_name: 'Nongpoh & Upper Shillong PRI Representative',
      phone_number: '9862007788',
      contact_type: 'PRI_representative',
      state: 'Meghalaya',
      district: 'East Khasi Hills',
      village_or_area: 'Upper Shillong Panchayat',
      preferred_language: 'as',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_006',
      user_id: 'usr_citizen_001',
      contact_name: 'Ananya Sharma (Registered Citizen)',
      phone_number: '9876543213',
      contact_type: 'citizen',
      state: 'Assam',
      district: 'Kamrup Metropolitan',
      village_or_area: 'Guwahati Dispur',
      preferred_language: 'as',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    },
    {
      id: 'cnt_007',
      user_id: null,
      contact_name: 'Kamrup Metro DDMA Emergency Cell',
      phone_number: '9864009900',
      contact_type: 'disaster_management_office',
      state: 'Assam',
      district: 'Kamrup Metropolitan',
      village_or_area: 'DC Office Guwahati',
      preferred_language: 'as',
      receive_sms_alerts: 1,
      contact_status: 'active',
      verified_contact: 1
    }
  ];

  const contactTx = db.transaction(() => {
    for (const c of initialContacts) {
      insertContact.run({ ...c, created_at: now, updated_at: now });
    }
  });

  contactTx();
  console.log(`[DB] Seeded ${initialContacts.length} emergency contacts for multi-district response.`);
}

initSchema();
seedDefaultData();
seedEmergencyContacts();

module.exports = db;

