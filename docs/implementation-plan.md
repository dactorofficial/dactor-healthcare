# Implementation plan: fixes and improvements discussed (2026-11)

Covers every issue found in the review sessions. The payment confirmation design itself is in
[`payment-reliability-plan.md`](payment-reliability-plan.md); this file says **what to build, where, in
what order, and how to check it is done**. File references are against `main` (commit `163c36e`).

Estimates are for one developer familiar with the codebase. **Total: about 6–7 weeks** (including 7b).

## Order at a glance

| Phase | What | Why first | Estimate |
|---|---|---|---|
| 0 | Urgent security + deploy what is already merged | live risk / money | 1–2 days |
| 1 | Clinic app sign-in token (the "authorization failed" error) | blocks clinics from setting up payments | 2–3 days |
| 1b | Clinic app "already associated with a Clinic Portal" after sign-out; possible sign-in into another clinic (see [`portal-login-fix-plan.md`](portal-login-fix-plan.md)) | wrong login blocks; security | 1–2 days |
| 2 | eSewa not showing as a payment option | blocks online payments | 2 days |
| 2b | Rescheduled / follow-up visits missing from the live queue (see [`reschedule-followup-fix-plan.md`](reschedule-followup-fix-plan.md)) | clinics lose patients from the queue; follow-ups overwrite the previous visit | 2–3 days |
| 3 | Payment reliability (server-side confirmation) | paid-but-unconfirmed risk | 1.5–2 weeks |
| 4 | Payment inside the app and website | UX, fewer abandoned payments | 1 week |
| 5 | Security hardening | | 3–4 days |
| 6 | Push for every notification | instant alerts without polling | 2–3 days |
| 7 | Data and storage savings | free-tier limits, cost | 3–4 days |
| 7b | Stop re-downloading unchanged data (see [`query-optimization-plan.md`](query-optimization-plan.md)) | biggest remaining traffic: website appointment joins, live queue, doctor queue, history screens | 6–8 days |
| 8 | Bugs found during review | | 1 day |
| 9 | Clean-up and docs | | 1 day |
| 10 | Operations and release | | ongoing |

---

## Phase 0 — Urgent (do now)

### 0.1 Revoke the leaked GitHub token (VULN-019)
- `SECURITY_AUDIT.md` VULN-019: a GitHub personal access token was hard-coded in
  `scripts/deploy_ghpages.ps1`. Removing it from the file is not enough; it stays in git history.
- **Do:** revoke it on GitHub (Settings → Developer settings → Tokens), check the repo's audit log for
  use, move deployment to GitHub Actions with a repository secret.
- **Done when:** the old token returns 401; deploy works from Actions.

### 0.2 Deploy the scaling work already merged into `main`
- `supabase/migration_scaling_queue_estimates_and_alerts.sql` (merged via `e05d368`).
- **Do:** apply after all existing migrations → enable `pg_net` and `pg_cron` → re-run its part 4 →
  add Vault secrets `dactor_project_url`, `dactor_service_role_key` → release both apps → force update
  (`migration_app_version_control.sql`) → deploy website.
- **Done when:** `SELECT * FROM cron.job` shows `dactor-noshow-sweep`; a test queue move sends the
  "X patients left" push.

### 0.3 Quick checks in Supabase SQL editor
- Demo mode off: `SELECT is_global_demo_mode FROM platform_payment_settings;` → must be `false`.
- Payment background job can run:
  `SELECT current_setting('app.settings.supabase_url', true), current_setting('app.settings.service_role_key', true) IS NOT NULL;`
- eSewa visibility per clinic: diagnostic query from the eSewa investigation (conditions 1–5).
- **Done when:** results recorded in the issue tracker; anything wrong fixed or ticketed.

---

## Phase 1 — Clinic app sign-in token ("authorization failed")

**Cause:** clinic Google sign-in signs in to Firebase only (`clinic-app/.../ui/auth/ClinicLoginScreen.kt:603`);
the Supabase client is created without a user token (`clinic-app/.../di/AppModule.kt:8`). Calls to edge
functions therefore arrive anonymous and `appointment-payment` rejects them
(`authorizeClinicSetupCaller` → `is_trusted_application_identity`).

### 1.1 Confirm Supabase accepts Firebase tokens
- Supabase → Authentication → Third-party auth: Firebase project `dactor-ea1e1` added.
- Firebase users must carry `role: "authenticated"` in their token (custom claim set by a Firebase
  Cloud Function / blocking function on sign-up and sign-in).
- **Test:** with a Firebase ID token, `POST /rest/v1/rpc/is_trusted_application_identity` returns `true`.

### 1.2 Send the Firebase ID token on edge function calls (clinic app)
- New `FirebaseTokenProvider` (`clinic-app/.../data/auth/`): returns a fresh ID token
  (`currentUser.getIdToken(false)`), `null` when signed in by email/OTP (Supabase session is used then).
- Add `Authorization: Bearer <token>` to every `functions.invoke` call:
  `ClinicRepository.kt` (`toggle_gateway` :802, `save_credentials` :841, `reconcile_pending` :785),
  `QueueRepository.kt` (`send-fcm-alert` :1630 and the broadcast call), document uploads (`document-access`).
- **Done when:** a Google-signed-in clinic owner saves eSewa keys and toggles a gateway without error;
  a different clinic's account still gets 403.

### 1.3 Database reads/writes from the clinic app
- Audit which PostgREST writes from the clinic app currently fail as anonymous under RLS (queue status,
  invoices, clinic settings). Log and list them.
- Decide: supabase-kt `accessToken` provider (Firebase) for Google users vs. keeping the Auth plugin for
  email/OTP users. Implement the chosen path in `AppModule.kt`.
- **Done when:** the audit list is empty in a test run (all screens) for both Google and email users.

### 1.4 Same check for patient app and website
- Verify which of their edge-function calls need a user token (booking, payment initiate, document
  access) and that Firebase-signed-in users send one.

---

## Phase 2 — eSewa not showing

### 2.1 Never lose the "direct payment enabled" setting
- `web-app/src/services/db.ts` `updateClinic` (fallback at ~3768): when the full update fails it saves
  only the description JSON, leaving `clinics.is_direct_payment_enabled` false while the UI shows enabled.
- **Do:** on failure, retry with only the payment fields; if that also fails, show the error.
  Never report success when the column was not written.
- One-time fix: list clinics where the description JSON says enabled but the column is false; fix after
  confirming with each owner.

### 2.2 Show the real status in clinic settings (web + app)
- "Visible to patients: Yes/No" per gateway using `get_clinic_public_payment_methods`, plus the failing
  condition (direct payment off / keys missing / not verified / gateway off).

### 2.3 Key verification that does not silently reject
- `appointment-payment/index.ts` `verifyEsewaCredentials` (:989): split "eSewa rejected the keys"
  from "eSewa unreachable / unexpected reply".
- Unreachable → save as `pending_verification`, retry from the server, tell the owner.
- **Done when:** a test with eSewa blocked saves keys as pending and shows a clear message.

---

## Phase 3 — Payment reliability

Implements [`payment-reliability-plan.md`](payment-reliability-plan.md) (decisions in its §18).

| Step | Work | Files |
|---|---|---|
| 3.1 | Migration: attempt columns (`merchant_code`, `environment`, `next_check_at`, `claimed_until`, …), statuses `needs_attention`, `unresolved`, `refunded`; `payment_events`, `payment_verifier_runs`; `confirm_paid_attempt` returning a status; `payment_health` view; Vault-based cron (replaces the `app.settings` job); drop blind 24 h expiry | new `supabase/migration_payment_reliability.sql` |
| 3.2 | Local SQL tests: transitions, idempotency, duplicate payment, concurrent workers, hold expiry → UNRESOLVED | `supabase/test_payment_reliability.sql` |
| 3.3 | Edge function: `verify_attempt` (per gateway, plan §7), `verify_due` (lease with `SKIP LOCKED`, every minute during the 15-min hold), return path always calls `verify_attempt`; mocked-gateway tests | `supabase/functions/appointment-payment/` |
| 3.4 | Server-side 15-minute slot hold; no-show sweep skips appointments with a pending attempt | migration + `initiate` |
| 3.5 | Backfill: re-verify `expired`/`failed`/`pending` attempts from the last 30 days once; confirm or flag | one-off script / action |
| 3.6 | Staff lists "Needs attention" + "Unresolved" with **Check now / Confirm / Mark refunded** (web clinic portal + clinic app) | `ClinicPortal.tsx`, clinic app billing screens |
| 3.7 | Alerts (FCM to clinic devices + admin) and admin health card | admin panel, migration |

**Done when:** in the eSewa sandbox, paying and immediately closing the browser still confirms the
appointment within 2 minutes; turning off the verifier raises an alert within 5 minutes.

---

## Phase 4 — Payment inside the app and website

Tested 2026-11-22: every gateway's checkout page forbids being shown inside another website
(`X-Frame-Options`), but in-app WebViews are not affected (plan §11a).

| Step | Work | Files |
|---|---|---|
| 4.1 | Patient app in-app payment screen (WebView): loads server-built checkout, closes on our return URL, passes `intent://` to the eSewa/bank app, safe WebView settings; Custom Tab fallback | replace `ACTION_VIEW` at `patient-app/.../ui/booking/PaymentScreen.kt:307` |
| 4.2 | Website payment window over the booking page (opened on the Pay click), return page closes it and `postMessage`s the booking page; "Continue payment" if blocked | `web-app/src/pages/PatientPortal.tsx` (`handleExecutePayment` :1801), new return page |
| 4.3 | Status-only UI in app and web: "Confirming…" → "Confirmed" / "Clinic reviewing" / "Not completed" | same |
| 4.4 | Fonepay QR on our own page (after Fonepay confirms QR access): server QR request, render QR, status via `thirdPartyDynamicQrGetStatus` | edge function, app, web |

**Done when:** sandbox payments complete without leaving the app; on the website the booking page never
navigates away.

---

## Phase 5 — Security hardening

| Step | Work | Where |
|---|---|---|
| 5.1 | Demo mode refused in the live environment (server environment flag) + admin banner when on | `appointment-payment`, admin panel |
| 5.2 | Real rate limiting: `consume_security_rate_limit` currently always returns TRUE; implement a counter table and use it in booking and payment initiate | `supabase/migration_add_rate_limiter_and_notification_realtime.sql:17` → new migration |
| 5.3 | Gateway secrets into Supabase Vault (table keeps secret ids) | migration + `getCredentials` |
| 5.4 | Free follow-up / reschedule eligibility decided by the server (client fee is not trusted) | `create_patient_appointment`, reschedule RPC; `PatientPortal.tsx` bypass path |
| 5.5 | Encrypt the patient app's stored data (EncryptedSharedPreferences / Tink), including the per-account vault files | `patient-app/.../data/local/` |
| 5.6 | Remove unfiltered queries: "latest 50 notifications" without a user filter (patient alarm receiver / worker, `clinic-app/.../MainActivity.kt:127`); lab reports for **all clinics** when the clinic id is blank (`clinic-app/.../LabReportRepository.kt:64`) | both apps |
| 5.7 | RLS review of `notifications`, `appointments`, `queue_entries` read policies | migration |

---

## Phase 6 — Push for every notification

- DB trigger on `notifications` insert → `send-fcm-alert` via `pg_net` + Vault (user, appointment,
  clinic, or broadcast target), with a sent flag to avoid duplicates.
- Admin broadcasts (`admin-panel/src/pages/BroadcastNotification.tsx`) delivered as FCM topic pushes.
- Clinic devices registered to `clinic_<id>` topic and token table (check clinic `FcmService`).
- **Done when:** pay-at-desk requests and admin broadcasts arrive on a closed clinic app within seconds;
  the patient app's 10-minute full check can drop its notification query.

---

## Phase 7 — Data and storage savings

| Step | Work | Where |
|---|---|---|
| 7.1 | Compress lab reports and images at upload (images to ~1600 px, quality ~75; size cap), target ~150–300 KB | web upload (`db.ts` → `document-access`), clinic app lab upload, `patient-app/.../util/FileCompressor.kt` |
| 7.2 | Keep downloaded reports on the phone (keyed by report id + updated time) | `patient-app/.../util/LabReportPdfDownloader.kt` |
| 7.3 | Search screen uses the saved clinic/doctor/service lists | `patient-app/.../ui/search/PatientSearchScreen.kt:325` → `HomeDataCache` |
| 7.4 | Server function returning only free slot counts per clinic/date, replacing "all slots + all appointments for the date" | new RPC; `patient-app/.../SlotRepository.kt:153`, web equivalents |
| 7.5 | Small thumbnails for clinic/doctor photos in lists | upload pipeline / storage transforms |

---

## Phase 8 — Bugs found during review

- **Website public tracker shows blank token/status:** `LiveTrackerModal.tsx:138` and `LiveQueue.tsx:271`
  read `token_number`, `status`, `doctor_in_cabin`, which `get_public_queue_status` does not return.
  Map to `queue_position`, `queue_status`, `current_queue_position`, `doctor_is_in_clinic`.
- **Done when:** a guest tracking code shows token, status and "now serving" on the website.

---

## Phase 9 — Clean-up and docs

- Remove or wire up: patient `NotificationWatchdogService` (not registered), clinic `SyncWorker`/`SyncEngine`
  (`SyncWorker.kt:86`, never scheduled), clinic `AppCacheManager.clearAllCache` (`:65`, unused since
  sign-out keeps data — or expose it as "Reset this device").
- Update `docs/scaling-plan.md` to the merged state.

---

## Phase 10 — Operations and release

- Supabase usage alerts (egress, storage, DB size); review weekly for the first month.
- Crashlytics in both apps.
- Daily backups (Pro) + one test restore.
- Separate staging Supabase project for gateway sandbox tests.
- Release order for each phase with server changes: migration → edge functions → apps (forced update
  when old versions would break) → website.
- Plan: move to Supabase Pro before the 3rd clinic goes live.

---

## Decisions still needed

| # | Question | Proposed default |
|---|---|---|
| 1 | Who receives payment alerts | clinic owner + receptionist devices (push) and admin (email + push) |
| 2 | Who may mark a payment refunded | admin only; clinic can request |
| 3 | Fonepay QR access on clinics' merchant accounts | ask Fonepay |
| 4 | Clinic app token approach (Phase 1.3) | decide after the audit |
