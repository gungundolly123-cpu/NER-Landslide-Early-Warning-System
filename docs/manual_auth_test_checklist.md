# NEXZORA — Manual Authentication & RBAC Testing Checklist

Follow this checklist to manually verify all authentication, user registration, role authorization, and disaster operations workflows.

---

## 1. Test Accounts (Pre-Seeded)

The database comes pre-seeded with development test accounts:

| Role | Mobile Number | Email | Password | Initial Status |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `9876543210` | `admin@nexzora.gov.in` | `Admin@Nexzora2026!` | Active |
| **Field Officer (Active)** | `9876543211` | `officer.shillong@nexzora.gov.in` | `Officer@Nexzora2026!` | Active (Assigned: East Khasi Hills) |
| **Field Officer (Pending)**| `9876543212` | `officer.gangtok@nexzora.gov.in` | `Officer@Nexzora2026!` | Pending Verification (Gangtok) |
| **Citizen** | `9876543213` | `citizen.assam@nexzora.gov.in` | `Citizen@Nexzora2026!` | Active (Kamrup Metropolitan) |

---

## 2. Step-by-Step Manual Test Scenarios

### Scenario A: Citizen Registration & Incident Reporting
1. Click **"Sign In"** in the topbar, then click **"Create an account"**.
2. **Step 1 (Personal Details)**: Enter full name `Subhradip Adhikari`, mobile number `9800000001`, email `subhra@example.com`. Click Next.
3. **Step 2 (Location & Role)**: Select State `Assam`, District `Jorhat`, Town `Jorhat Town`, Role `Citizen`. Click Next.
4. **Step 3 (Password & Consent)**: Enter password `MyPassword123!`, Confirm password, check the mandatory consent checkbox. Click Next.
5. **Step 4 (OTP Verification)**: In development mode, the OTP code is displayed on screen and logged to the server console. Enter the 6-digit code and click **"Verify & Complete"**.
6. **Verification Result**: Account is created as **Active**. The topbar shows your name and `CITIZEN` badge.
7. Click **"Add photo / video"** on the left sidebar to open the Incident Report modal. Submit a Landslide report.
8. Switch to the **Operations Dashboard** view. Under **Panel 4 (Citizen Incident Reports)**, verify that your new report appears with status `New`.

---

### Scenario B: Field Officer Signup & Admin Approval Flow
1. Open the registration wizard with mobile number `9800000002`.
2. In Step 2, select **Role: Field Officer** and District `Gangtok`, State `Sikkim`.
3. Complete Step 3 and Step 4 with OTP.
4. **Verification Result**: After OTP, the system displays the **Pending Verification** screen stating that the account requires Administrator approval.
5. Sign out. Sign in as **Admin** (`9876543210` / `Admin@Nexzora2026!`).
6. Click the new **"🛡️ Admin Control"** tab in the topbar.
7. Locate the new Field Officer in the **User Management Table**.
8. Click **"Assign District"**, select `Sikkim` → `Gangtok`, and confirm.
9. **Verification Result**: Officer account status transitions to `Active`.
10. Sign out and log back in as the Field Officer. The **"🚨 Officer Console"** is now accessible.

---

### Scenario C: Field Officer Report Verification & Road Status Update
1. Log in as Field Officer (`9876543211` / `Officer@Nexzora2026!`).
2. Click the **"🚨 Officer Console"** tab.
3. Inspect pending reports in your assigned district (`East Khasi Hills`).
4. Click **"Verify Report"**, enter official inspection notes: `Ground inspection verified 12m slope slippage. SDRF deployed.` Click Submit.
5. Under the **Road Connectivity Status** section, change `NH-6 Shillong - Silchar Corridor` status from `At Risk` to `Partially Blocked`.
6. Return to the Live GIS Map. Observe that the road layer immediately reflects the updated status.

---

### Scenario D: Security & IDOR Verification
1. Log in as **Citizen** (`9876543213` / `Citizen@Nexzora2026!`).
2. Verify that Admin tabs and Officer verification buttons are hidden.
3. Open browser developer console and attempt to fetch `/api/admin/users`:
   ```javascript
   const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('nexzora_access_token')}` } });
   console.log(await res.json()); // Output: 403 Forbidden
   ```
4. Attempt to fetch another citizen's private report by ID (`/api/reports/rep_002`):
   - Result: Returns `403 Forbidden` (`FORBIDDEN_REPORT_ACCESS`).
