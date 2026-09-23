# NEXZORA — REST API Specification: Auth & RBAC

## Base URL
`http://localhost:3000/api`

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates a new Citizen or Field Officer account and triggers mobile OTP dispatch.

**Request Body:**
```json
{
  "full_name": "Tenzing Norbu",
  "mobile_number": "9876543210",
  "email": "tenzing@example.com",
  "password": "SecurePassword123!",
  "confirm_password": "SecurePassword123!",
  "role": "citizen",
  "state": "Sikkim",
  "district": "Gangtok",
  "village_town": "Tadong",
  "preferred_language": "English",
  "consent_accepted": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Account registered. Please enter the OTP sent to your mobile number.",
  "userId": "usr_uuid",
  "mobileNumber": "9876543210",
  "role": "citizen",
  "devCode": "123456"
}
```

---

### `POST /api/auth/verify-otp`
Verifies the 6-digit OTP code, marks mobile verified, and activates Citizen or marks Field Officer pending verification.

**Request Body:**
```json
{
  "mobile_number": "9876543210",
  "otp_code": "123456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Account verified successfully!",
  "user": {
    "id": "usr_uuid",
    "full_name": "Tenzing Norbu",
    "role": "citizen",
    "account_status": "active"
  },
  "tokens": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  },
  "redirectUrl": "/citizen/dashboard"
}
```

---

### `POST /api/auth/login`
Authenticates a user with mobile/email and password.

**Request Body:**
```json
{
  "identifier": "9876543210",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Welcome back, Tenzing Norbu!",
  "user": {
    "id": "usr_uuid",
    "full_name": "Tenzing Norbu",
    "role": "citizen",
    "account_status": "active",
    "assignedDistricts": []
  },
  "tokens": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  },
  "redirectUrl": "/citizen/dashboard"
}
```

---

### `POST /api/auth/logout`
Revokes active sessions and clears auth cookies. Requires authentication.

---

### `POST /api/auth/forgot-password`
Initiates password recovery for an account.

**Request Body:**
```json
{
  "identifier": "9876543210"
}
```

---

### `POST /api/auth/reset-password`
Completes password reset with verified OTP.

**Request Body:**
```json
{
  "mobile_number": "9876543210",
  "otp_code": "123456",
  "new_password": "NewSecurePassword123!",
  "confirm_password": "NewSecurePassword123!"
}
```

---

### `GET /api/auth/me`
Fetches current authenticated user profile and assigned districts.

---

## 2. User Profile Endpoints

### `GET /api/users/me`
Returns current profile.

### `PATCH /api/users/me`
Updates profile fields (Name, Email, State, District, Village/Town, Language, Photo).

### `POST /api/users/me/change-password`
Requires `current_password`, `new_password`, `confirm_password`.

---

## 3. Field Officer Endpoints

### `GET /api/field-officer/assigned-reports`
Returns incident reports in officer's assigned districts + reports submitted by officer.

### `PATCH /api/field-officer/reports/:reportId/verify`
Verifies, resolves, or rejects a report.

**Request Body:**
```json
{
  "status": "Verified",
  "verification_notes": "Ground team verified slope movement.",
  "media_urls": ["/assets/evidence.jpg"]
}
```

### `PATCH /api/field-officer/roads/:roadId/status`
Updates road segment status.

**Request Body:**
```json
{
  "status": "Partially Blocked",
  "risk_score": 85
}
```

---

## 4. Admin Management Endpoints

### `GET /api/admin/stats`
Returns system dashboard overview metrics.

### `GET /api/admin/users`
Lists all users with filters (`role`, `status`, `district`, `search`).

### `PATCH /api/admin/users/:id/status`
Moderates user account status (`active`, `pending_verification`, `suspended`, `rejected`).

### `PATCH /api/admin/users/:id/role`
Updates user role (`citizen`, `field_officer`, `admin`).

### `POST /api/admin/field-officers/:id/assignments`
Assigns Field Officer to a state and district, activating their account.

**Request Body:**
```json
{
  "state": "Meghalaya",
  "district": "East Khasi Hills"
}
```

### `GET /api/admin/audit-logs`
Returns historical security audit logs.

### `POST /api/admin/alerts/:alertId/approve`
Approves an emergency broadcast.
