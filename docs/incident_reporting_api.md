# NEXZORA Incident Reporting REST API Specification

All protected endpoints require a valid JWT Bearer token in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## 1. Incident Submission & Management

### `POST /api/incidents`
Submit a new ground incident report with automatic GPS location or manual map pin.
- **Roles Allowed**: `citizen`, `field_officer`, `admin`
- **Request Body (JSON / Multipart)**:
```json
{
  "client_report_id": "c8b417d4-89d1-4e92-9388-75c1b82798f0",
  "incident_type": "Road Fully Blocked",
  "description": "Large rocks and mud are blocking one lane near the bridge.",
  "severity_reported": "high",
  "latitude": 26.1542,
  "longitude": 91.7568,
  "gps_accuracy_m": 12.0,
  "altitude_m": 142.5,
  "altitude_accuracy_m": 4.0,
  "heading_deg": 180.0,
  "speed_mps": 0.0,
  "location_source": "gps",
  "location_captured_at": "2026-09-23T21:57:00+05:30",
  "device_timezone": "Asia/Kolkata",
  "location_permission_status": "granted",
  "location_quality": "high",
  "state": "Assam",
  "district": "Kamrup Metropolitan",
  "village_or_town": "Guwahati Hills",
  "road_name": "NH-27",
  "landmark": "Near scenic overlook"
}
```
- **Response `201 Created`**:
```json
{
  "success": true,
  "report_id": "rep_9f8d1c2b-3a4e-4b5c-8d6e-7f8a9b0c1d2e",
  "report_status": "pending_verification",
  "location": {
    "latitude": 26.1542,
    "longitude": 91.7568,
    "accuracy_m": 12.0,
    "altitude_m": 142.5,
    "source": "gps",
    "captured_at": "2026-09-23T21:57:00+05:30",
    "timezone": "Asia/Kolkata",
    "quality": "high"
  },
  "outside_study_area": false,
  "ai_risk_status": "completed",
  "ai_risk_class": "Critical",
  "message": "Incident report submitted successfully and is awaiting verification."
}
```

---

### `POST /api/incidents/sync`
Idempotent offline batch synchronization endpoint.
- **Roles Allowed**: `citizen`, `field_officer`, `admin`
- **Request Body**:
```json
{
  "reports": [
    {
      "client_report_id": "offline-uuid-1",
      "incident_type": "Crack on Road",
      "description": "Visible fissure across highway lane.",
      "severity_reported": "medium",
      "latitude": 25.57,
      "longitude": 91.88
    }
  ]
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "synced": 1,
  "results": [
    {
      "client_report_id": "offline-uuid-1",
      "status": "synced",
      "server_id": 15
    }
  ]
}
```

---

### `GET /api/incidents/my-reports`
Retrieve reports submitted by the authenticated user.
- **Roles Allowed**: All authenticated users
- **Response `200 OK`**:
```json
{
  "success": true,
  "count": 3,
  "reports": [
    {
      "id": 14,
      "incident_type": "Major Landslide",
      "report_status": "pending_verification",
      "severity_reported": "high",
      "village_or_town": "Mawkdok",
      "district": "East Khasi Hills",
      "created_at": "2026-09-23T16:20:00.000Z",
      "media_count": 2
    }
  ]
}
```

---

### `GET /api/incidents/:id`
Fetch full incident details, media gallery, status timeline, and verification notes.
- **Access Rule**:
  - `citizen`: Can access only own reports.
  - `field_officer`: Can access reports within assigned district.
  - `admin`: Can access any report across NER.
- **Response `200 OK`**:
```json
{
  "success": true,
  "incident": {
    "id": 14,
    "incident_type": "Major Landslide",
    "description": "Massive debris flow completely blocking both lanes.",
    "report_status": "verified",
    "severity_reported": "high",
    "severity_verified": "high",
    "latitude": 25.5788,
    "longitude": 91.8933,
    "district": "East Khasi Hills",
    "road_name": "NH-206",
    "road_status_at_report_time": "Fully Blocked",
    "ai_risk_class": "Critical",
    "ai_risk_probability": 0.94,
    "verification_note": "Inspection confirmed complete slope failure. PWD heavy machinery dispatched.",
    "verified_at": "2026-09-23T16:30:00.000Z",
    "media": [
      {
        "id": 8,
        "media_type": "photo",
        "storage_url": "/uploads/media-uuid.jpg",
        "mime_type": "image/jpeg",
        "file_size_bytes": 1048576,
        "is_official_media": 0
      }
    ],
    "history": [
      {
        "old_status": "pending_verification",
        "new_status": "under_review",
        "change_note": "Officer initiated ground inspection",
        "created_at": "2026-09-23T16:25:00.000Z"
      },
      {
        "old_status": "under_review",
        "new_status": "verified",
        "change_note": "Site verified by Field Officer",
        "created_at": "2026-09-23T16:30:00.000Z"
      }
    ]
  }
}
```

---

### `POST /api/incidents/:id/media`
Secure multipart file upload for incident evidence.
- **Supported Formats**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4`, `.mov`
- **File Limits**: Photo ≤ 10 MB, Video ≤ 50 MB
- **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Media uploaded securely.",
  "media": {
    "id": 9,
    "media_type": "photo",
    "storage_url": "/uploads/uuid.jpg",
    "file_size_bytes": 2048500
  }
}
```

---

## 2. Field Officer Verification & Road Actions

### `GET /api/field-officer/incidents`
Retrieve incident reports within officer's assigned districts with priority calculation.
- **Roles Allowed**: `field_officer`, `admin`
- **Query Filters**: `status`, `district`, `severity`, `incident_type`
- **Response `200 OK`**:
```json
{
  "success": true,
  "count": 5,
  "incidents": [
    {
      "id": 14,
      "incident_type": "Major Landslide",
      "report_status": "pending_verification",
      "district": "East Khasi Hills",
      "priority_score": {
        "score": 92,
        "level": "CRITICAL",
        "reasons": ["Major Landslide event", "High AI risk score"]
      }
    }
  ]
}
```

---

### `PATCH /api/field-officer/incidents/:id/status`
Transition incident workflow status.
- **Roles Allowed**: `field_officer` (within district), `admin`
- **Valid Transitions**:
  - `pending_verification` → `under_review`
  - `under_review` → `verified` / `rejected`
  - `verified` → `resolved`
- **Request Body**:
```json
{
  "status": "verified",
  "note": "Ground survey confirmed 20m debris blockage."
}
```

---

### `POST /api/field-officer/incidents/:id/verification`
Submit comprehensive inspection verdict.
- **Roles Allowed**: `field_officer`, `admin`
- **Request Body**:
```json
{
  "verification_note": "Debris clearance ongoing. 1 lane partially opened.",
  "severity_verified": "high",
  "road_status": "Partially Blocked"
}
```

---

### `POST /api/field-officer/incidents/:id/road-status`
Update linked road connectivity status.
- **Valid Status Values**: `Open`, `At Risk`, `Partially Blocked`, `Fully Blocked`, `Cleared`
- **Request Body**:
```json
{
  "road_status": "Partially Blocked",
  "note": "One lane operational with caution"
}
```

---

## 3. Administrator Governance & Content Moderation

### `GET /api/admin/incidents`
Full multi-district incident inventory with pagination and moderation flags.
- **Roles Allowed**: `admin`

### `PATCH /api/admin/incidents/:id/mark-duplicate`
Link a redundant incident report to an existing master incident.
- **Request Body**:
```json
{
  "duplicate_of_report_id": 14,
  "reason": "Duplicate report of same rockfall incident"
}
```

### `PATCH /api/admin/incidents/:id/moderate-media`
Approve or reject uploaded media under community safety policies.
- **Request Body**:
```json
{
  "media_id": 8,
  "moderation_status": "approved"
}
```
