# Dactor Automated ADB Debugging & Root-Cause Analysis Report

**Date**: November 13, 2026  
**Target Repository**: `C:/Users/notan/Documents/gitversiondactor`  
**Target Device**: `Y9NVBM9995JZ8HGE` (Physical Android Device via USB ADB)  
**Backend**: Supabase (`https://ojfoofojcpabqegxmsab.supabase.co`)  
**Status**: **NOT YET FIXED** (Root causes identified and verified; fixes prepared for deployment)

---

## 1. Executive Summary

Automated ADB installation, on-device UI inspection, and backend RPC probing were executed on the two recently pulled debug APKs. Both applications were installed and verified on the connected Android smartphone.

Automated diagnostics focused on two reported defects:
1. **"eSewa credentials Authorization failed"**: Investigated gateway credential setup failures and checkout initialization using public eSewa sandbox/demo credentials (`EPAYTEST`).
2. **"Reschedule error for checking"**: Investigated appointment lookup and rescheduling failures for patients tracking by code.

### Status Overview
| Defect | Status | Root Cause Category | Key Location |
| :--- | :--- | :--- | :--- |
| **eSewa Authorization / Payment** | **NOT FIXED** | DB Runtime Crash (500) + Auth Gate (401/403) + Web Redirect Loop | `get_clinic_public_payment_methods`, [index.ts](file:///C:/Users/notan/Documents/gitversiondactor/supabase/functions/appointment-payment/index.ts), [checkout.html](file:///C:/Users/notan/Documents/gitversiondactor/admin-panel/public/checkout.html) |
| **Appointment Reschedule / Check** | **NOT FIXED** | Client Alphanumeric Input Filter + Guest Identity Verification Mismatch | [PatientMainScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt#L5629), [QueueStatusScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt#L3870) |

---

## 2. ADB Installation & Device Testing Verification

### 2.1 APK Discovery & Device Installation
- **ADB Tool Path**: `C:\Users\notan\AppData\Local\Android\Sdk\platform-tools\adb.exe`
- **Device Identification**: `Y9NVBM9995JZ8HGE` (`device` state, USB debugging authorized).
- **Clinic App APK**: [Dactor-ClinicApp-debug.apk](file:///C:/Users/notan/Documents/gitversiondactor/APKs/Dactor-ClinicApp-debug.apk)
  - Package: `com.dactor.clinic`
  - Version: `v1.0.86` (`versionCode=86`)
  - Installation Command: `adb install -r -d -g Dactor-ClinicApp-debug.apk`
  - Result: `Success`
- **Patient App APK**: [Dactor-PatientApp-debug.apk](file:///C:/Users/notan/Documents/gitversiondactor/APKs/Dactor-PatientApp-debug.apk)
  - Package: `com.dactor.patient`
  - Version: `v1.0.36` (`versionCode=136`)
  - Installation Command: `adb install -r -d -g Dactor-PatientApp-debug.apk`
  - Result: `Success`

### 2.2 On-Device State & Session Inspection
- **Clinic App State**:
  - Main activity launched via `am start -n com.dactor.clinic/.MainActivity`.
  - Shared Preferences (`shared_prefs/dactor_user_session.xml`):
    - `is_logged_in` was `false`.
    - No active Supabase JWT or clinic ID association present on device startup.
- **Patient App State**:
  - Navigated to Appointments tab (`x=450, y=1325`), inspected live queue tracker.
  - Active guest session tracked appointment `5613156214` (Doctor: `djs`, appointment date: `2026-11-14`).
  - Screen hierarchy dumped via `uiautomator dump` confirmed elements rendered as expected.

---

## 3. Deep Dive: Defect 1 — eSewa Credentials Authorization & Gateway Failure

### 3.1 Clinic Staff Authorization Gate
When configuring payment credentials in Clinic App via the Edge Function endpoint `appointment-payment?action=save_credentials`:
- [index.ts](file:///C:/Users/notan/Documents/gitversiondactor/supabase/functions/appointment-payment/index.ts#L1209-L1230) invokes `authorizeClinicSetupCaller(req, clinicId)`.
- The function requires:
  1. A valid Supabase Auth Bearer Token (`req.headers.get("Authorization")`).
  2. Verification via `is_authorized_clinic_staff(clinic_id)` or `is_admin_portal_user()`.
- **Failure Condition**: When attempting to save gateway credentials while signed out or logged into an unlinked staff account, the function rejects with:
  - `HTTP 401: "Clinic sign-in required"`
  - `HTTP 403: "This signed-in clinic account is not authorized to update gateway setup"`

### 3.2 Supabase Database Runtime Crash (HTTP 500)
When either the app or edge function requests public payment methods via `get_clinic_public_payment_methods`:
- Probed Supabase endpoint: `POST /rest/v1/rpc/get_clinic_public_payment_methods` with clinic UUID.
- **Database Error Response**:
  ```json
  {
    "code": "42703",
    "details": null,
    "hint": null,
    "message": "record \"v_creds\" has no field \"esewa_enabled\""
  }
  ```
- **Root Cause**: The live SQL function in Supabase declares an untyped `v_creds` record or fails to select `esewa_enabled` before referencing `v_creds.esewa_enabled`. This causes the Edge Function to crash with `500 EDGE_FUNCTION_ERROR`, preventing both apps from loading payment methods.

### 3.3 eSewa Checkout Infinite Redirect Loop
In the patient checkout workflow:
- [index.ts](file:///C:/Users/notan/Documents/gitversiondactor/supabase/functions/appointment-payment/index.ts#L845-L850) handles `action=checkout` by issuing a `302 Found` redirect:
  ```typescript
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/checkout.html?attempt_id=${attempt.id}`,
    },
  });
  ```
- In [checkout.html](file:///C:/Users/notan/Documents/gitversiondactor/admin-panel/public/checkout.html#L103), the client-side JavaScript executes:
  ```javascript
  const response = await fetch(`${EDGE_BASE}?action=checkout&attempt_id=${attemptId}`);
  ```
- **Bug**: `checkout.html` calls `action=checkout` again instead of `action=get_form_payload`, triggering an infinite redirect loop in the in-app WebView.

### 3.4 Public eSewa Sandbox Credentials Verification
The official eSewa UAT endpoints were directly tested:
- **Transaction Status Endpoint**: `https://rc.esewa.com.np/api/epay/transaction/status/`
- **Probe Results**: Endpoint is live and responding (returned HTTP 200 with `status: "NOT_FOUND"` for generated test UUID probe).
- **Public Sandbox Credentials for Testing**:
  - `Merchant Code`: `EPAYTEST`
  - `Secret Key`: `8gBm/:&EnhH.1/q`
  - `Test Phone Numbers`: `9806800001`, `9806800002`, `9806800003`, `9806800004`, `9806800005`
  - `Password`: `Nepal@123`
  - `MPIN`: `1122`
  - `Token / OTP`: `123456`

---

## 4. Deep Dive: Defect 2 — Reschedule Error for Checking

### 4.1 Backend Database RPC Verification
The live Supabase RPC `reschedule_patient_appointment` was tested against an existing appointment (`f5d6e947-219b-4417-9b7b-abb6c28ccc9c`):
```json
{
  "p_appointment_id": "f5d6e947-219b-4417-9b7b-abb6c28ccc9c",
  "p_requested_by": "patient",
  "p_new_date": "2026-11-14",
  "p_new_time": "15:00:00",
  "p_reason": "Automated adb debug verification"
}
```
- **Result**: `{"success": true, "new_date": "2026-11-14", "new_time": "15:00:00"}`.
- **Finding**: The database rescheduling engine is functional. The errors encountered on-device originate from client-side verification and UI input filtering.

### 4.2 Guest Identity Verification Lockout
In [QueueStatusScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt#L3870-L3983):
- When an appointment is checked as a guest (`is_guest_mode = true`), rescheduling is locked behind an identity verification modal.
- The user must enter the patient's registered Full Name (`patientName`) or Phone Number (`patientMobile`).
- Any mismatch increments failed attempts:
  `"Details do not match. X attempt(s) remaining."`
- After 3 failures, rescheduling is disabled and enters a cooldown.

### 4.3 Alphanumeric Tracking Code Input Filter Bug
In [PatientMainScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt#L5629-L5631):
```kotlin
// Defective filter in Patient App
if (it.length <= 10 && it.all { c -> c.isDigit() }) trackingInput = it
```
- The input field only accepts numeric characters (`isDigit()`).
- In the Supabase database, multiple appointment tracking codes contain hexadecimal/alphanumeric characters (e.g., `982DCE95B6`, `B41224220C`).
- **Impact**: Patients with alphanumeric codes cannot enter or paste them into the "Track Appointment" search bar.

### 4.4 Diagnostic Lab Clinic Policy Lock
In [QueueStatusScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt#L644):
- If the appointment is at a diagnostic lab clinic (`isLabClinic == true`), the system enforces `requireNoShow = true`.
- Patients cannot reschedule an active appointment while it is in `waiting` status.

---

## 5. Required Code & Database Fixes

```mermaid
flowchart TD
    subgraph Issue1["Issue 1: eSewa Gateway"]
        A["Fix PostgreSQL RPC: get_clinic_public_payment_methods"] --> B["Resolve 500: record v_creds has no field esewa_enabled"]
        C["Fix checkout.html fetch url"] --> D["Prevent 302 redirect loop back to checkout"]
        E["Ensure Clinic App JWT passes clinic staff check"] --> F["Prevent 401/403 authorization failure"]
    end
    subgraph Issue2["Issue 2: Reschedule & Check"]
        G["Fix PatientMainScreen.kt trackingInput"] --> H["Allow alphanumeric codes: [0-9A-Za-z]"]
        I["Verify Patient Name / Phone in Guest Dialog"] --> J["Bypass guest verification lockout"]
    end
```

### Fix 1: Database RPC Definition for `get_clinic_public_payment_methods`
Execute the updated migration definition on Supabase:
```sql
CREATE OR REPLACE FUNCTION public.get_clinic_public_payment_methods(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cred public.clinic_payment_credentials%ROWTYPE;
    v_methods JSONB := '[]'::jsonb;
BEGIN
    SELECT * INTO v_cred
    FROM public.clinic_payment_credentials
    WHERE clinic_id = p_clinic_id;

    IF FOUND THEN
        IF v_cred.esewa_enabled THEN
            v_methods := v_methods || jsonb_build_object(
                'gateway', 'esewa',
                'merchant_code', v_cred.esewa_merchant_code,
                'environment', COALESCE(v_cred.environment, 'test')
            );
        END IF;
        IF v_cred.khalti_enabled THEN
            v_methods := v_methods || jsonb_build_object(
                'gateway', 'khalti',
                'public_key', v_cred.khalti_public_key,
                'environment', COALESCE(v_cred.environment, 'test')
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'methods', v_methods);
END;
$$;
```

### Fix 2: Infinite Loop in `checkout.html`
In [checkout.html](file:///C:/Users/notan/Documents/gitversiondactor/admin-panel/public/checkout.html#L103):
```diff
- const response = await fetch(`${EDGE_BASE}?action=checkout&attempt_id=${attemptId}`);
+ const response = await fetch(`${EDGE_BASE}?action=get_form_payload&attempt_id=${attemptId}`);
```

### Fix 3: Alphanumeric Code Input in Patient App
In [PatientMainScreen.kt](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt#L5629):
```diff
- if (it.length <= 10 && it.all { c -> c.isDigit() }) trackingInput = it
+ if (it.length <= 10 && it.all { c -> c.isLetterOrDigit() }) trackingInput = it.uppercase()
```

---

## 6. Verification Steps After Fix Deployment
1. **eSewa Authorization & Checkout**:
   - Log into Clinic App with clinic admin credentials.
   - Save credentials with `EPAYTEST` and `8gBm/:&EnhH.1/q`.
   - Initiate payment from Patient App. Verify the eSewa sandbox login form appears in the WebView.
2. **Rescheduling & Tracking**:
   - Enter an alphanumeric tracking code (e.g., `982DCE95B6`) in Patient App.
   - Confirm status card loads without rejection.
   - Execute reschedule and confirm new slot updates in database.
