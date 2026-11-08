# Project: End-to-End Platform & Website Security Hardening

## Architecture
- **Database & RPC Security Layer (`supabase/migration_platform_security_hardening.sql`)**:
  - Authoritative appointment creation RPC (`create_patient_appointment`) enforcing doctor consultation fee lookup, clinic relationship check, 10-digit collision-proof tracking code, and safe initial states (`payment_status = 'pending'`, `checkin_status = 'not_checked_in'`).
  - Strict `BEFORE INSERT` guard trigger on `appointments` table (`prevent_appointment_tampering`) preventing direct client insertion of unverified fees or paid statuses.
  - Minimal public tracking RPC (`get_public_queue_status`) strictly isolating operational queue status and zero patient PII.
  - Server-verified guest report access (`verify_guest_appointment_identity` and `verify_and_get_lab_report_meta`) enforcing exact 10-digit mobile number matching.
  - Public discovery isolation views (`public_clinics`, `public_doctors`) and proximity RPC (`get_nearby_clinics`) filtering payment secrets, PAN, registration documents, and manager phone numbers, with plain-text description preservation.
  - Least-privilege RLS policies dropping all permissive `USING (true)` / `WITH CHECK (true)` rules across `profiles`, `clinics`, `doctors`, `appointments`, `billing_invoices`, `queue_entries`, `lab_reports`, `fcm_tokens`, `notifications`, `clinic_invitations`, and `slot_locks`.
  - Non-throwing `auth.uid()` override in `auth` schema, `firebase_uid VARCHAR(128)` column on `profiles`, and `current_auth_sub()` helper for alphanumeric Firebase UID support.
- **Edge Functions & Storage Security Layer (`supabase/functions/`)**:
  - `document-access`: Server-authorized upload endpoint (`action: "authorize_upload"`) enforcing caller authentication, entity ownership verification, strict MIME type allowlists (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`), 10MB file limit, non-guessable paths (`${entityId}/${uuid}.${ext}`), and signed upload URL generation via `createSignedUploadUrl`.
  - CORS isolation across `document-access`, `appointment-payment`, and `send-fcm-alert` replacing wildcard `*` with dynamic origin reflection against `ALLOWED_ORIGINS` with `Vary: Origin`.
  - `appointment-payment`: Server-authoritative fee lookup querying `doctors.consultation_fee`, eSewa return URL allowlisting against `PAYMENT_RETURN_ORIGINS`, and server-to-server transaction verification with signature and amount matching before finalization.
  - Complete isolation of service role keys, gateway credentials, device tokens, and raw provider response bodies.
- **Frontend Web & Admin Security Layer (`web-app/` & `admin-panel/`)**:
  - `web-app/src/services/db.ts`: Refactored appointment booking calling `create_patient_appointment` RPC without client-specified fee or payment status.
  - `web-app/src/components/LiveTrackerModal.tsx`: Refactored to query `get_public_queue_status` RPC exclusively, eliminating patient name, phone, age, bill downloads, and prescription downloads for unauthenticated users.
  - `web-app/src/services/db.ts` & `admin-panel/src/lib/storage.ts`: Refactored document uploads to call `document-access` (`authorize_upload`) for signed upload URLs.
  - `web-app/src/utils/security.ts`: Centralized URL sanitization (`isSafeUrl`) and iframe sandboxing across `LabReportModal.tsx`, `LiveQueue.tsx`, `ClinicVerification.tsx`, and `DoctorKYC.tsx` preventing protocol-based XSS.
  - Preserved Maps E2E test suite (108 tests) and Web Offline Sync suite (140 tests) with 100% green pass.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Server-Authoritative Appointment RPC (`create_patient_appointment`) | Authoritative fee lookup, clinic relationship check, 10-digit tracking code, pending status | M1 | Survey E1/E2/E3 (R1) |
| 2 | Appointment Anti-Tampering Trigger (`prevent_appointment_tampering`) | `BEFORE INSERT` trigger blocking client fee injection and forced paid statuses | M1 | Survey E1 (R1) |
| 3 | Minimal Public Queue Tracking RPC (`get_public_queue_status`) | Operational queue status only (token, doctor, clinic, date/time, wait); 0 PII | M1 | Survey E1/E3 (R2) |
| 4 | Exact 10-Digit Phone Verification for Guest Lab Reports | Server-side verification requiring exact 10-digit registered phone matching | M1 | Survey E1 (R2) |
| 5 | Public Clinic & Doctor Discovery Isolation | Strict isolation of payment credentials, PAN, registration docs, manager phone in views | M1 | Survey E1 (R4) |
| 6 | Plain-Text Clinic Description Preservation | Robust description sanitization supporting plain text and JSON without NULL wiping | M1 | Survey E1 (R4) |
| 7 | Proximity RPC Sanitization (`get_nearby_clinics`) | Clean proximity search excluding secrets and raw JSON description fields | M1 | Survey E1 (R4) |
| 8 | Comprehensive RLS Sweep & Policy Hardening | Drop all permissive `USING (true)` policies on private tables with least-privilege rules | M1 | Survey E1 (R5) |
| 9 | Role Privilege Escalation Trigger Guards | Trigger blocking non-admins from self-assigning admin, clinic_admin, or doctor roles | M1 | Survey E1 (R5) |
| 10 | Firebase Alphanumeric UID Compatibility | Safe non-throwing `auth.uid()` override, `firebase_uid` column, and `current_auth_sub()` | M1 | Survey E1/E3 (R10) |
| 11 | Server-Authorized Document Upload Pipeline | `authorize_upload` in `document-access` with ownership checks, MIME allowlist, 10MB limit | M2 | Survey E2/E3 (R3) |
| 12 | Dynamic CORS Isolation on Edge Functions | Restrict CORS in all edge functions against `ALLOWED_ORIGINS` replacing wildcard `*` | M2 | Survey E2 (R6) |
| 13 | Edge Function Caller Authentication & Token Hygiene | Strict auth verification via `is_trusted_application_identity`; zero token/provider leakage | M2 | Survey E2 (R6, R9) |
| 14 | Authoritative Fee Verification in Payment Initiation | Authoritative consultation fee lookup in `appointment-payment` before eSewa checkout | M2 | Survey E2 (R7) |
| 15 | eSewa Server-to-Server Verification & Return URL Allowlist | Strict return URL allowlist and server-to-server signature/amount transaction check | M2 | Survey E2 (R7) |
| 16 | Frontend Appointment Booking Refactoring | Refactor `web-app` booking flows to use `create_patient_appointment` RPC | M3 | Survey E3 (R1) |
| 17 | Frontend Public Tracking PII Elimination | Refactor `LiveTrackerModal` to use `get_public_queue_status` stripping PII and bill downloads | M3 | Survey E3 (R2) |
| 18 | Frontend Signed Upload Pipeline Integration | Refactor `web-app` and `admin-panel` to use `authorize_upload` signed URLs | M3 | Survey E3 (R3) |
| 19 | DOM XSS Prevention & Iframe Sandboxing | URL protocol sanitizer (`isSafeUrl`) and iframe sandboxing on report/doc viewers | M3 | Survey E3 (R8) |
| 20 | Frontend Build & Credential Safety | Ensure zero leaked secrets in client bundles and 0 TypeScript/Vite compilation errors | M3 | Survey E3 (R9) |
| 21 | Automated E2E Security Test Suite (Tiers 1-4) | Comprehensive opaque-box test runner validating R1-R10 security guardrails | M0 | Dispatch AC |
| 22 | Final E2E Test Pass, Regression Suites & Adversarial Hardening | 100% green pass on Security E2E, Maps (108), Offline (140), and Tier 5 adversarial audit | M4 | Dispatch AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Security Testing Track | Comprehensive 4-tier opaque-box security test harness & test cases (`TEST_READY.md`) | none | IN_PROGRESS |
| M1 | Database Schema, RPCs, Firebase UID & RLS | `migration_platform_security_hardening.sql`: R1, R2, R4, R5, R10 SQL rules | none | IN_PROGRESS |
| M2 | Edge Functions, CORS, Storage & Payments | `document-access`, `appointment-payment`, `send-fcm-alert`: R3, R6, R7, R9 | M1 | PLANNED |
| M3 | Frontend Web & Admin Security Hardening | `web-app` and `admin-panel` booking, tracking, uploads, XSS, and builds: R1, R2, R3, R8 | M1, M2 | PLANNED |
| M4 | Final E2E Pass, Regressions & Adversarial Audit | 100% pass on Security E2E (Tiers 1-4), Maps (108), Offline (140), and Tier 5 hardening | M0, M3 | PLANNED |

## Interface Contracts

### `create_patient_appointment` SQL RPC (`supabase/migration_platform_security_hardening.sql`)
```sql
FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_appointment_time TIME,
    p_patient_name TEXT,
    p_patient_phone TEXT,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL
) RETURNS JSONB;
-- Returns: { "success": true, "appointment_id": "...", "tracking_code": "...", "fee_amount": 500.00, "payment_status": "pending", "checkin_status": "not_checked_in" }
```

### `get_public_queue_status` SQL RPC
```sql
FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TIME,
    checkin_status TEXT,
    queue_status TEXT,
    queue_position INT,
    patients_ahead INT,
    current_queue_position INT,
    doctor_is_in_clinic BOOLEAN
);
-- Strictly omits: patient_name, patient_mobile, patient_email, patient_age, patient_gender, notes, invoices
```

### `document-access` Edge Function (`supabase/functions/document-access/index.ts`)
```ts
// Action: "authorize_upload"
POST /document-access
Headers: { "Authorization": "Bearer <JWT>", "Origin": "https://..." }
Body: {
    action: "authorize_upload",
    bucket: "lab-reports-private" | "doctor-kyc-private" | "clinic-docs-private",
    fileName: string,
    fileType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp",
    fileSize: number, // <= 10485760 (10MB)
    entityId: string // clinicId for lab/clinic docs, doctorId for kyc
}
Response: {
    success: true,
    uploadUrl: string, // Signed upload URL
    storagePath: string, // non-guessable path: `${entityId}/${uuid}.${ext}`
    bucket: string
}
```

### `web-app/src/utils/security.ts`
```ts
export function isSafeUrl(url: string | null | undefined): boolean;
// Returns true ONLY for https:, http:, blob:, data:image/ protocols; rejects javascript:, data:text/html, etc.
```

## Code Layout
- `supabase/migration_platform_security_hardening.sql`: Master PostgreSQL security migration containing all RPCs, triggers, views, and RLS rules.
- `supabase/functions/document-access/`: Server-authorized upload handler, MIME allowlist, and signed upload URL generator.
- `supabase/functions/appointment-payment/`: Authoritative fee lookup, CORS isolation, return URL allowlist, eSewa server-to-server verification.
- `supabase/functions/send-fcm-alert/`: CORS isolation, trusted caller verification, zero token leakage.
- `web-app/src/services/db.ts`: Appointment booking via RPC, signed URL uploads, tracking lookups.
- `web-app/src/components/LiveTrackerModal.tsx`: Minimal operational queue status rendering without PII.
- `web-app/src/utils/security.ts`: URL protocol validation and iframe sandboxing.
- `tests/e2e_security/`: Automated 4-tier security test suite validating R1-R10.
- `tests/e2e_maps/run_all_tests.cjs`: Maps regression suite (108 tests).
- `web-app/tests/e2e_offline_sync_backup/run_all.js`: Offline sync regression suite (140 tests).
