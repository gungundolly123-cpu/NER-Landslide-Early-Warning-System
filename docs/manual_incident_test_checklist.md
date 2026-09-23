# NEXZORA Incident Reporting — Manual Verification & Testing Checklist

This guide provides step-by-step instructions for testing the Incident Reporting and Verification features in the browser or via API.

---

## 1. Test User Credentials
| Role | Mobile Number | Password | Operating District |
| :--- | :--- | :--- | :--- |
| **Administrator** | `9876543210` | `Admin@Nexzora2026!` | All Districts (NER-Wide) |
| **Field Officer** | `9876543211` | `Officer@Nexzora2026!` | East Khasi Hills (Meghalaya) |
| **Citizen** | `9876543213` | `Citizen@Nexzora2026!` | Kamrup Metropolitan (Assam) |

---

## 2. Automatic GPS Location & Incident Report Verification Workflow

### Test Case 1: High-Accuracy GPS Capture
1. **Sign In as Citizen**:
   - Enter `9876543213` and `Citizen@Nexzora2026!`.
2. **Open Incident Form**:
   - Click the **🚨 Report Incident** button on the bottom bar or user menu.
3. **Step 1: Select Incident Category**:
   - Choose **Falling Rocks** or **Major Landslide**.
4. **Step 2: Enter Description & Severity**:
   - Enter: `"Large rocks and mud are blocking one lane near the bridge."` (≥ 10 characters).
   - Select Severity: **High**.
5. **Step 3: Capture Location via GPS**:
   - Click **📍 Use My Current Location**.
   - If prompted by the browser, click **Allow**.
   - Notice the status updates through:
     - `Requesting GPS permission...`
     - `Getting current location...`
     - `Location captured accurately (±X m)`
   - Verify the telemetry card displays:
     - **Latitude & Longitude** (e.g., `25.5788° N, 91.8933° E`)
     - **Accuracy** (e.g., `±8 m (High Quality)`)
     - **Altitude** (if supported by hardware)
     - **Captured Time** & Local Timezone (`Asia/Kolkata`)
     - **Source**: `GPS (Hardware)`
   - Verify the interactive mini-map centers with a marker at the exact location.
6. **Submit Report**:
   - Confirm and click **Submit Incident Report**.
   - Verify response returns `201 Created` with `report_id` and complete location structure.

---

### Test Case 2: Manual Map Pin Fallback
1. Open the Report form.
2. If GPS permission is denied or device does not have GPS:
   - Click **🗺️ Choose Location on Map**.
   - Click anywhere on the interactive mini-map.
   - Drag the marker to adjust the exact location.
   - Verify that:
     - Status shows: `Manual location selected on map`
     - Telemetry card displays: `Source: Manual Map Pin`
     - Latitude and Longitude fields synchronize automatically.
3. Submit the report and verify `location_source = "manual_map_pin"` in database and GIS popup.

---

### Test Case 3: Low Accuracy Warning (> 50m / > 200m)
1. Using Chrome DevTools → **Sensors**, simulate GPS with accuracy `250m`.
2. Click **Use My Current Location**.
3. Verify that an amber/red alert appears:
   `"GPS location may be inaccurate by ~250 metres. Please place the pin manually if needed."`
4. The user can choose to retry GPS, use the location anyway, or place the pin manually.

---

### Test Case 4: Outside Study Area Boundary Warning
1. Using Chrome DevTools → **Sensors**, set coordinates outside NER (e.g., New Delhi `28.6139, 77.2090` or Mumbai `19.0760, 72.8777`).
2. Click **Use My Current Location**.
3. Verify that the system shows:
   `"⚠️ Outside Project Coverage Boundary (North Eastern Region study area is 21.8°–29.5°N, 88.0°–97.5°E)."`
4. Submit the report:
   - Verify report is safely saved in database with `outside_study_area = 1`.
   - Verify AI model returns `Outside Model Coverage` without fabricating local terrain risk.

---

### Test Case 5: Offline Draft Preservation
1. In Chrome DevTools → **Network**, select **Offline**.
2. Click **Use My Current Location** (or pin on map) and fill incident details.
3. Click **Submit Incident Report**.
4. Verify notification: `"Saved Offline — Waiting to Sync"`.
5. Switch Network back to **Online** and click **⚡ Sync Now**.
6. Verify report syncs to backend with original captured timestamp and altitude intact.

---

## 3. Offline Mode & PWA Synchronization

1. **Simulate Offline**:
   - In Chrome DevTools, go to **Network** tab and toggle **Offline**.
2. **Submit Report**:
   - Open the **Report Incident** modal and submit a report.
   - Notice the status message: `"Saved Offline — Will upload when internet returns"`.
   - Notice the header sync pill displays: `⏳ 1 Pending Sync`.
3. **Restore Network**:
   - Toggle DevTools back to **Online** (or click **⚡ Sync Now**).
   - The app automatically syncs the report via `POST /api/incidents/sync`.
   - The report status transitions to `PENDING VERIFICATION` without duplicating.

---

## 4. Field Officer Inspection & Verification Workflow

1. **Sign In as Field Officer**:
   - Sign in with `9876543211` and `Officer@Nexzora2026!`.
   - Open the **Field Officer Console** from the top bar.

2. **Inspect Assigned District Incident Queue**:
   - Locate the report in the list.
   - Observe the **CRITICAL** / **HIGH** priority badge and AI Risk Score.
   - Click **Inspect & Verify →**.

3. **Perform Operational Verification**:
   - Review submitted citizen photo and GPS coordinate.
   - Change Status to **Verified**.
   - Enter Verification Note: `"On-site inspection completed. Heavy machinery dispatched for lane clearance."`
   - Update Road Status to **Partially Blocked**.
   - Click **Submit Verification Decision**.

4. **Verify Map Layer**:
   - Return to the GIS Map view.
   - Confirm the incident pin displays in **Red / Green** with updated status and road condition.

---

## 5. Administrator Multi-District Management & Moderation

1. **Sign In as Administrator**:
   - Sign in with `9876543210` and `Admin@Nexzora2026!`.
   - Open the **Admin Control Room**.
2. **Open "Incidents & Moderation" Tab**:
   - View all incidents reported across Assam, Meghalaya, Sikkim, Nagaland, etc.
   - Click **Duplicate** on a report to link it to an existing Master Incident ID.
   - Access the **Security Audit Log Trail** to verify that every report submission, status change, and road update has been permanently logged with actor details and timestamps.

---

## 6. Push Notifications & Admin Alert Approval Workflow

### Test Case 1: Device Token Registration & Language Preferences
1. **Sign in as Citizen**:
   - Log in with `9876543213` / `Citizen@Nexzora2026!`.
   - Click the **🔔 Notification Settings** bell icon or modal.
   - Click **"Enable Browser Push Notifications"** and allow notifications when prompted.
   - Select **Preferred Language**: e.g., **অসমীয়া (Assamese)** or **हिंदी (Hindi)**.
   - Click **Save Preferences**.

### Test Case 2: Field Officer Alert Recommendation
1. **Sign in as Field Officer**:
   - Log in with `9876543211` / `Officer@Nexzora2026!`.
   - Open the **Field Officer Console** and click **📢 Recommend District Alert**.
   - Select Risk Level: **Very High Risk**, Target Villages: `Nongpoh, Upper Shillong`.
   - Enter Ground Rationale: `"Continuous heavy downpour for 12 hours; slope fissures widening along NH-6."`
   - Click **Submit Alert Recommendation to Admin Queue**.
   - Confirm status shows `pending_admin_approval`.

### Test Case 3: Admin Review, Multilingual Inspection & Approval
1. **Sign in as Admin**:
   - Log in with `9876543210` / `Admin@Nexzora2026!`.
   - Open the **Admin Control Room** → **Alert Approval Queue** tab.
   - Locate the pending alert card.
   - Verify the **Telemetry Freshness Badges** (`Rainfall Fresh (<6h)`, `Soil Moisture Fresh (<24h)`).
   - Switch between the **EN**, **HI**, **AS**, and **BN** language preview tabs.
   - Inspect the estimated recipient count badge.
   - Click **✅ Approve & Broadcast Alert**.

### Test Case 4: Citizen Emergency Banner & Multilingual Advisory
1. **Switch to Citizen View**:
   - The GIS Map top emergency banner immediately renders with flashing warning indicator.
   - Click **View Safety Instructions** on the banner.
   - Verify title and actionable safety advisory render in the citizen's selected language (`AS`, `HI`, `BN`, or `EN`).
   - Click **Acknowledge Alert**.

### Test Case 5: Admin Rejection with Mandatory Reason
1. In the Admin queue, click **❌ Reject Alert** on a draft.
2. Attempt to submit with an empty reason -> verify validation error prevents rejection.
3. Enter `"Ground inspection indicates minor road silt; warning sirens not required."` and confirm.
4. Verify draft status transitions to `rejected` with rejection reason logged in audit trail.

