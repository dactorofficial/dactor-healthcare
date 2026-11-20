# Dactor Platform — Work Report (November 19, 2026)

**Reporting Date**: Thursday, November 19, 2026  
**Repository**: `gitversiondactor` (`origin/main`)  
**Status**: All deliverables completed, verified, and synchronized across mobile apps (`clinic-app`, `patient-app`), backend (`supabase`), and web portal (`web-app`).

---

## 1. Executive Summary

Today's engineering activities centered on three major initiatives:
1. **Targeted Live Queue Refresh & New Appointment Detection**: Replaced heavy full-table scanning in Doctor and Clinic live queues with a selective sliding-window mechanism (upcoming 3–4 patients: `inside` + first 3 `waiting`) to verify cancellations and rescheduling in real-time, coupled with incremental new appointment detection for today's OPD schedule.
2. **Backend Notification System Query Optimization**: Completely eliminated periodic database query requests from Doctor and Clinic portals, centralizing polling strictly within the Patient mobile application. Implemented intelligent dual-interval scheduling: high-frequency 10-second queries on appointment day and 2-hour idle queries otherwise.
3. **Multi-Language (i18n) Support & UI Dialogs**: Added language preference dialogs and localization scaffolding supporting English, Nepali, Hindi, Maithili, and Bhojpuri across Clinic App, Patient App, and Web Portal.

All additions strictly adhere to **Global Rule: One-Way Logic Synchronization (App -> Website)**, ensuring 100% parity between mobile applications and the web portal.

---

## 2. Detailed Work Breakdown

### 2.1 Targeted Live Queue Selective Refresh & Incremental Detection

#### Problem Statement
Previously, live queue screens across Doctor and Clinic portals frequently triggered full queries of all appointments and queue entries for the day. Under high OPD volume, this introduced unnecessary database bandwidth and potential UI jitter. However, live queues still need to immediately detect:
- If any of the immediate upcoming patients cancelled or rescheduled their appointment.
- If any new appointments were booked or approved today.

#### Solution & Architecture
- **Sliding Window Lookahead (3–4 Patients)**:
  - Constrained authoritative state verification to the active consultation patient (`inside`) and the next 3 upcoming `waiting` patients.
  - If a patient's appointment is marked `CANCELLED` or rescheduled to another date, their queue entry is removed and local state is updated immediately.
  - If rescheduled to a different time today, the queue reorders accordingly.
- **Incremental New Appointment Detection**:
  - Compares existing appointment IDs with database records for today's date, fetching only delta appointments and enrolling them at `currentMaxPos + 1`.

#### Key Files Modified
* **Android (`clinic-app`)**:
  - [`AppointmentRepository.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt): Implemented `refreshAppointmentsByIds(ids)` and `checkNewAppointments(...)`.
  - [`QueueRepository.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt): Implemented `removeRogueQueueEntry(appointmentId)` and `autoEnrollNewAppointment(...)`.
  - [`DoctorQueueViewModel.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/DoctorQueueViewModel.kt): Added `refreshUpcomingPatientsAndCheckNew()` with concurrency guards.
  - [`DoctorQueueScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/DoctorQueueScreen.kt): Integrated 2-second periodic tick calling selective refresh.
  - [`QueueBoardScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt): Upgraded `loadQueue(isDeltaOnly = true)` to target top 3–4 patients and filter cancelled/rescheduled entries.
  - [`SelectiveSyncAndQueuePollingTest.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/test/java/com/dactor/clinic/data/sync/SelectiveSyncAndQueuePollingTest.kt): Added 5 unit tests covering sliding window bounds, cancellations, rescheduling, and new enrollments.
* **Web Portal (`web-app`)**:
  - [`db.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/services/db.ts): Mirrored `refreshAppointmentsByIds`, `checkNewAppointments`, `removeRogueQueueEntry`, and `autoEnrollNewAppointment`.
  - [`DoctorPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/DoctorPortal.tsx): Added targeted 2.5s sliding window interval in `deskTab === 'today_queue'`.
  - [`ClinicPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/ClinicPortal.tsx): Added targeted 2.5s sliding window interval in `deskTab === 'queue'`.

---

### 2.2 Backend Notification Query Optimization & Doctor/Clinic Query Elimination

#### Problem Statement
Doctor and clinic devices were running frequent periodic polling loops for notifications, even when idle, resulting in excessive read queries against Supabase.

#### Solution & Architecture
- **Query Elimination in Doctor/Clinic**:
  - Removed 4-second activity polling loop in `clinic-app` (`MainActivity.kt`, `DactorClinicApp.kt`, `NotificationAlarmReceiver.kt`).
  - Removed clinic notification background polling in `web-app` (`ClinicPortal.tsx`, `db.ts`).
- **Patient-Centric Intelligent Polling**:
  - Guarded all background polling by patient ID presence.
  - **Dynamic Intervals**: If the patient has an active appointment today, poll every **10 seconds** for estimated wait time, doctor consultation status, and alerts. If no appointment is scheduled today, throttle polling to once every **2 hours**.
- **Atomic Database RPC**:
  - Created `public.get_patient_consultation_query(p_patient_id UUID, p_tracking_code TEXT, p_phone TEXT)` returning status, doctor presence, token called, wait time, and the recommended polling interval.

#### Key Files Modified
* **Database**:
  - [`supabase/migration_optimize_patient_consultation_query.sql`](file:///C:/Users/notan/Documents/gitversiondactor/supabase/migration_optimize_patient_consultation_query.sql)
* **Android (`patient-app`)**:
  - [`MainActivity.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/MainActivity.kt)
  - [`QueueStatusScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt)
  - [`NotificationAlarmReceiver.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/service/NotificationAlarmReceiver.kt)
  - [`NotificationSyncWorker.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/service/NotificationSyncWorker.kt)
* **Automated Tests**:
  - [`tests/test_notification_query_optimization.cjs`](file:///C:/Users/notan/Documents/gitversiondactor/tests/test_notification_query_optimization.cjs) (15/15 assertions passed).

---

### 2.3 Multi-Language (i18n) Preference Settings

#### Problem Statement
Clinics and patients across diverse linguistic regions required in-app language switching between English, Nepali, Hindi, Maithili, and Bhojpuri.

#### Solution & Architecture
- Created reusable language selection dialogs and string catalogs.
- Integrated language selection into Clinic settings and Patient profile/onboarding.
- Synchronized translation helpers and language picker modals to the Web Portal.

#### Key Files Modified
* **Android (`clinic-app`)**:
  - [`ClinicSettingsScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/settings/ClinicSettingsScreen.kt): Added language selection setting dialog and clickable event handlers.
* **Android (`patient-app`)**:
  - [`LanguageSelectionDialog.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/components/LanguageSelectionDialog.kt)
  - [`AppLanguage.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/i18n/AppLanguage.kt)
  - [`DactorStrings.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/i18n/DactorStrings.kt)
  - [`PatientMainScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt)
  - [`ProfileScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/profile/ProfileScreen.kt)
* **Web Portal (`web-app`)**:
  - [`LanguageSelectionModal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/components/LanguageSelectionModal.tsx)
  - [`i18n.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/utils/i18n.ts)
  - [`Navbar.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/components/Navbar.tsx)

---

## 3. Verification & Test Metrics

| Suite / Build Target | Test / Build Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Android Unit Tests** | `gradlew.bat testDebugUnitTest` | **PASSED** | 12 tests executed, 0 failed, 0 skipped (`BUILD SUCCESSFUL in 14m 12s`) |
| **Notification Optimization Tests** | `node tests/test_notification_query_optimization.cjs` | **PASSED** | 15/15 assertions passed across 4 test suites |
| **Web Portal Production Build** | `npm run build` | **PASSED** | `vite v5.4.19`: 1,832 modules transformed, built in 22.58s (Exit Code 0) |

---

## 4. Git Commit History for November 19, 2026

- `5b1db90`: `fix(clinic): add clickable import to ClinicSettingsScreen for language preference dialog`
- `9d97044`: `feat(clinic): add language preference setting dialog to ClinicSettingsScreen`
- `35055dc`: `chore(seo): automated daily sitemap and schema synchronization [skip ci]`
- `b1bea4f`: `feat: optimize notification system query intervals and remove doctor portal polling`
