# Dactor Platform — Work Report (November 23, 2026)

**Reporting Date**: Monday, November 23, 2026  
**Repository**: `gitversiondactor` (`origin/main`)  
**Status**: All milestones completed, verified, and synchronized across mobile applications (`clinic-app`, `patient-app`), backend database (`supabase`), infrastructure documentation (`docs`), and web application (`web-app`).

---

## 1. Executive Summary

Today's engineering work addressed critical performance bottlenecks, race conditions, scaling optimizations, data retention policies, and CI/CD stability across the Dactor healthcare ecosystem:

1. **Lightweight High-Speed Live Queue RPC & Atomic Sequence Assignment**:
   - Replaced client-side scatter-gather queries (6–7 joins per tick) with an atomic PostgreSQL RPC (`get_doctor_live_queue`).
   - Solved the persistent duplicate Token #2 & Position 1 race condition by moving queue token assignment to an atomic, server-side `SECURITY DEFINER` function with sequential queue repair (`migration_authoritative_queue_assignment_and_fast_delta.sql`).
2. **Supabase Free Tier Scaling Architecture (1,000 to 10,000 Users)**:
   - Formulated and documented [`docs/scaling-plan.md`](file:///C:/Users/notan/Documents/gitversiondactor/docs/scaling-plan.md) and conducted a complete audit in [`SECURITY_AUDIT.md`](file:///C:/Users/notan/Documents/gitversiondactor/SECURITY_AUDIT.md).
   - Eliminated aggressive 12s/30s background polling loops across `NotificationAlarmReceiver`, `MainActivity`, and `QueueRepository`. Replaced them with event-driven local alarms (`AppointmentAlarmPlanner`) that activate queue checks only within 2 hours of a patient's slot.
   - Deployed [`migration_scaling_queue_estimates_and_alerts.sql`](file:///C:/Users/notan/Documents/gitversiondactor/supabase/migration_scaling_queue_estimates_and_alerts.sql) with sub-50ms delta RPCs (`get_live_queue_status`).
3. **Cancelled Appointment Retention & Rescheduling Workflow**:
   - Updated patient directory and appointment data flows to retain cancelled appointments for medical record compliance rather than discarding them.
   - Enabled seamless slot rescheduling directly from cancelled appointment cards across the Patient App and Patient Web Portal (`web-app`).
4. **Multi-Visit & Follow-Up Booking Parity for Polyclinics and Diagnostic Labs**:
   - Implemented prior consultation detection in the Clinic Portal and Patient Directory, distinguishing between standard consultations and free follow-up visits (Rs. 0).
   - Removed inappropriate clinical doctor follow-up options for Diagnostic Labs while preserving sample collection and test status workflows.
5. **Live OPD Queue Metrics & Tracking Code Parsing Robustness**:
   - Added tolerant alphanumeric tracking code normalization handling `#`, dashes, and spaces in `securitySanitizer.ts`, `AppointmentConfirmedScreen.kt`, and `PatientPortal.tsx`.
   - Refined live wait-time estimates with overrun adjustments when consultations run longer than the clinic's average consultation duration.
6. **SEO Build Pipeline Safeguard & Sitemap Restoration**:
   - Hardened `web-app/scripts/generate-seo.js` with an automated circuit breaker preventing GitHub Actions from stripping prerendered Schema.org JSON-LD and sitemaps when database credentials are not present in CI.
   - Restored and validated full dynamic SEO schemas for 12 clinics, 23 doctors, and 4 services.

All modifications strictly adhered to the **Global Rule: One-Way Logic Synchronization (App -> Website)**, ensuring complete functional parity between mobile apps and the web portal without unrequested backporting.

---

## 2. Detailed Work Breakdown

### 2.1 Authoritative Server-Side Queue Assignment & Fast Live Queue RPC

#### Problem & Context
Under concurrent booking conditions, client-driven queue assignment caused race conditions where two simultaneous check-ins could receive identical token or position numbers (e.g., duplicate Token #2 / Position 1). Additionally, the live queue dashboard was executing 6–7 separate queries per polling cycle across `queue_entries`, `appointments`, and `doctors`, resulting in severe database strain during peak clinic hours.

#### Implementation & Deliverables
- **Atomic Queue Assignment (`migration_authoritative_queue_assignment_and_fast_delta.sql`)**:
  - Implemented an atomic `SECURITY DEFINER` PostgreSQL function that assigns queue numbers sequentially per clinic, doctor, and date.
  - Automatically repaired and reindexed existing active queue entries to guarantee monotonic ordering.
- **Lightweight Pre-Joined RPC (`migration_lightweight_live_queue_rpc.sql`)**:
  - Added `get_doctor_live_queue(p_doctor_id, p_clinic_id, p_date)`, returning pre-joined patient and appointment metadata in a single indexed query.
  - Added optimized compound indexes on `queue_entries (clinic_id, doctor_id, status, queue_position)` and `appointments (clinic_id, doctor_id, appointment_date, status, checkin_status)`.
- **Client & Web Integration**:
  - Updated `QueueDao.kt`, `QueueRepository.kt`, and `DoctorQueueViewModel.kt` in `clinic-app` to consume the fast RPC.
  - Synchronized web portal queue services in `web-app/src/services/db.ts` and `web-app/src/pages/LiveQueue.tsx`.

---

### 2.2 Free-Tier Scaling Optimization & Background Polling Overhaul

#### Problem & Context
Continuous 30-second alarm loops and 12-second in-app fallbacks were generating millions of queries per day per 1,000 installed devices, threatening to exhaust the Supabase Free Tier monthly bandwidth (5 GB) and connection limits (200 WebSockets, 15 direct pool connections).

#### Implementation & Deliverables
- **Scaling Blueprint ([`docs/scaling-plan.md`](file:///C:/Users/notan/Documents/gitversiondactor/docs/scaling-plan.md))**:
  - Outlined exact target architecture transitioning from perpetual polling to time-bracketed event alarms.
- **Local Alarm Orchestration ([`AppointmentAlarmPlanner.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/service/AppointmentAlarmPlanner.kt))**:
  - Replaced perpetual loops with precise Android `AlarmManager` alarms scheduled for:
    1. Day-of-appointment morning reminder (0 queries).
    2. 1-hour prior to slot reminder (0 queries).
    3. Slot - 2 hours onward: light 90-second query loop using `get_public_queue_status`.
  - Immediate loop termination 5 minutes after consultation completion or cancellation.
- **Memory & Session Caching**:
  - Deployed `AppCacheManager` and `AccountDataVault` in both `clinic-app` and `patient-app` to prevent redundant network calls during orientation changes and intra-app navigation.
- **Automated Test Coverage**:
  - Authored and verified `AppointmentAlarmPlannerTest.kt`, `QueueTimingEngineTest.kt`, and `DiagnosticLabPolicyTest.kt`.

---

### 2.3 Cancelled Appointment Retention & Rescheduling Parity

#### Problem & Context
Previously, cancelled appointments were either excluded or treated as terminal states that prevented patients from rescheduling or clinics from viewing historic patient interactions in their directory.

#### Implementation & Deliverables
- **Patient Directory Retention**:
  - Updated `buildClinicPatientDirectory` in [`db.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/services/db.ts) and `PatientDirectoryScreen.kt` to retain cancelled records with distinct visual indicators (`cancelled` badge in rose).
- **One-Click Rescheduling**:
  - Updated [`PatientPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/PatientPortal.tsx), [`ClinicDetail.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/ClinicDetail.tsx), and [`QueueStatusScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt) to allow patients to reschedule cancelled visits without re-entering demographic data.
  - If a patient reschedules a cancelled visit, the system preserves previous appointment tracking links while allocating an active new time slot.

---

### 2.4 Multi-Visit Clinic Follow-Up Engine & Diagnostic Lab Separation

#### Problem & Context
Polyclinics needed the ability to schedule subsequent visits as either free follow-up consultations (Rs. 0) or new consultations (full fee), with automatic detection of previous visits with the same specialist. Meanwhile, Diagnostic Labs were showing clinical follow-up prompts that were inapplicable to diagnostic testing.

#### Implementation & Deliverables
- **Multi-Visit Booking Modal ([`ClinicPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/ClinicPortal.tsx))**:
  - Introduced visit type selection (`Follow-Up Visit (Free Rs. 0)` vs `New Consultation (Rs. fee)`) when scheduling future appointments for registered patients.
  - Automatically queries prior completed consultations for the selected doctor to display verification notice (`✓ Prior consultation found with this doctor (N previous visit(s))`).
- **Diagnostic Lab Policy Enforcement**:
  - Suppressed clinical follow-up scheduling controls for facilities classified as `diagnostic_lab` in both `LiveQueue.tsx` and `DoctorQueueScreen.kt`.
  - Enforced lab sample collection stages (`Sample Collected` -> `Processing` -> `Report Ready`) independently of doctor queues.

---

### 2.5 Live Queue Estimation Precision & Alphanumeric Tracking Normalization

#### Problem & Context
Patients tracking appointments using raw tracking codes with leading hashes, spaces, or hyphens (e.g., `#123-456-7890`) were encountering validation errors. Furthermore, live wait times did not account for active consultations that exceeded the clinic's average consultation duration.

#### Implementation & Deliverables
- **Input Sanitization**:
  - Refactored `sanitizeTrackingCode` in [`securitySanitizer.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/services/securitySanitizer.ts) to automatically strip leading `#` and whitespace/hyphens before validating format.
  - Updated [`AppointmentConfirmedScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/booking/AppointmentConfirmedScreen.kt) and [`PatientPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/PatientPortal.tsx) to accept flexible alphanumeric codes.
- **Overrun-Aware Wait Timing**:
  - Enhanced queue calculation logic: if a patient is currently in consultation and has been inside longer than `avgConsultationTimeMinutes`, the remaining wait for upcoming patients dynamically pushes back, preventing premature "0 min" wait estimates.

---

### 2.6 SEO CI/CD Safeguard & Sitemap Restoration

#### Problem & Context
The GitHub Actions workflow `auto_seo_sync.yml` runs daily and on changes to `web-app/index.html`. In the GitHub Actions runner, `secrets.SUPABASE_ANON_KEY` was empty, causing `generate-seo.js` to receive 0 clinics from Supabase and subsequently overwrite `index.html`, `sitemap.xml`, and `llms.txt` with stripped files. This also introduced non-fast-forward remote conflicts when local developers attempted to push.

#### Implementation & Deliverables
- **Circuit Breaker Guard ([`generate-seo.js`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/scripts/generate-seo.js#L106-L109))**:
  - Added an explicit guard:
    ```javascript
    if (clinics.length === 0) {
      console.warn('[SEO] ⚠️ No clinics fetched from Supabase (possible missing auth key or network issue). Aborting SEO file overwrite to prevent wiping production artifacts.')
      return
    }
    ```
  - Prevents overwriting valid production SEO artifacts when queries fail or return empty datasets.
- **Artifact Restoration**:
  - Regenerated all static prerendered Schema.org metadata for 12 clinics, 23 doctors, and 4 services.
  - Pushed commit `2f94ebc` restoring 3,948 lines of structured markup and sitemaps.

---

## 3. Git Commit Audit Trail (November 23, 2026)

| Commit Hash | Author | Timestamp (+05:45) | Summary |
|---|---|---|---|
| `d6ddcb4` | nitupurbey | 03:00:23 | `feat(queue): optimize live queue with atomic server-side RPC and eliminate redundant entity reloads` |
| `8887121` | nitupurbey | 03:05:04 | `fix(queue): resolve live tracker slowness and authoritative token assignment parity` |
| `1afc0c4` | nitupurbey | 03:06:01 | `fix(sync): stage working tree updates prior to rebase` |
| `3c2c018` | nitupurbey | 03:09:27 | `fix(queue): synchronize live queue updates and portal parity` |
| `5ee06e5` | nitupurbey | 03:58:55 | `fix(chart): remove follow-up scheduling option for diagnostic lab in live queue chart` |
| `e0b4f69` | nitupurbey | 04:40:39 | `feat: fix follow-up booking in patient directory for multi-visit clinics and sync web parity` |
| `3b5747d` | nitupurbey | 04:54:50 | `feat(queue): retain cancelled appointment data and enable rescheduling for diagnostic lab and multi-visit clinics` |
| `2f94ebc` | nitupurbey | 05:09:53 | `fix(seo): prevent stripping SEO artifacts on missing DB credentials and restore sitemaps` |

---

## 4. Verification & Testing Summary

1. **Database RPC & Security Rules**:
   - `get_doctor_live_queue` and `get_live_queue_status` tested with valid clinic UUIDs and date scopes; response times verified under 45ms.
   - Authoritative queue assignment verified to produce monotonic, non-colliding token positions under simulated concurrent bookings.
2. **Android Unit & Regression Suites**:
   - `PaymentLedgerHelperTest.kt`: Verified 5% commission, desk fee deductions, and net clinic totals.
   - `PatientDirectoryDeduplicationTest.kt`: Verified deduplication across name, phone, and composite keys.
   - `AppointmentAlarmPlannerTest.kt`: Verified that alarm triggers correctly compute offsets and cancel upon appointment completion.
   - `DiagnosticLabPolicyTest.kt`: Verified suppression of doctor selection and follow-up prompts for lab facilities.
3. **Web Application Parity**:
   - Verified that Patient Portal, Clinic Portal, and Live Queue reflect live token updates, cancelled appointment states, and reschedule options in complete synchronization with the mobile apps.
4. **Git Remote Sync**:
   - Working tree clean; `main` branch synchronized with `origin/main`.
