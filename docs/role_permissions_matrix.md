# NEXZORA — Role & Permissions Matrix

This document defines the functional capabilities, authorization boundaries, and security policies enforced across the three supported roles in the NEXZORA Disaster Management Platform.

| Feature / System Capability | Citizen | Field Officer | Admin |
| :--- | :---: | :---: | :---: |
| **View Live GIS Risk Map & Layers** | ✅ Yes | ✅ Yes | ✅ Yes |
| **View Public CAP Disaster Alerts** | ✅ Yes | ✅ Yes | ✅ Yes |
| **View At-Risk & Blocked Road Corridors** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Point A to B Route Hazard Check** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Submit Emergency Incident Report (GPS + Media)** | ✅ Yes | ✅ Yes | ✅ Yes |
| **View Own Submitted Incident Reports** | ✅ Yes | ✅ Yes | ✅ Yes |
| **View District Incident Reports** | ❌ No | ✅ Assigned District(s) Only | ✅ All Districts |
| **Verify / Resolve / Reject Incident Reports** | ❌ No | ✅ Assigned District(s) Only | ✅ All Districts |
| **Upload Official Field Inspection Notes & Photos** | ❌ No | ✅ Assigned District(s) Only | ✅ All Districts |
| **Update Road Network Status (Open/Blocked/At Risk)** | ❌ No | ✅ Assigned District(s) Only | ✅ All Districts |
| **Access Field Operations Console** | ❌ No | ✅ Yes (When Active) | ✅ Yes |
| **Propose Emergency Broadcast Alert** | ❌ No | ✅ Yes | ✅ Yes |
| **Approve / Broadcast Public CAP Emergency Alerts** | ❌ No | ❌ No | ✅ Yes |
| **View All Registered Users** | ❌ No | ❌ No | ✅ Yes |
| **Manage User Status (Active/Suspended/Rejected)** | ❌ No | ❌ No | ✅ Yes |
| **Assign Field Officers to Districts/Areas** | ❌ No | ❌ No | ✅ Yes |
| **Change User Roles** | ❌ No | ❌ No | ✅ Yes |
| **View Security Audit Logs** | ❌ No | ❌ No | ✅ Yes |
| **View AI Model Spatial CV & Telemetry Freshness** | ❌ No | ❌ No | ✅ Yes |
| **Update Personal Profile & Password** | ✅ Yes | ✅ Yes | ✅ Yes |

---

## Access Control Rules & Enforcement Details

1. **Citizen Boundaries**:
   - Citizens can never view or modify other users' reports or administrative logs.
   - Citizens are restricted from accessing `/api/admin/*` and `/api/field-officer/*` endpoints.

2. **Field Officer Boundaries**:
   - Field Officers must have their account in the `active` state and hold an active district assignment before they can verify reports or edit road conditions in that district.
   - Attempts to verify reports in unassigned districts return `403 Forbidden` (`DISTRICT_MISMATCH`).
   - Field Officers cannot approve public alerts or create/delete admin users.

3. **Admin Powers & Limits**:
   - Admins hold full oversight across all 8 North Eastern Region states and 35 hazard districts.
   - Admins cannot view or export raw user passwords (which are permanently stored as one-way bcrypt hashes).
   - Admins cannot deactivate or suspend their own user account.
