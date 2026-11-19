# Dactor Platform — Work Report (November 20, 2026)

**Reporting Date**: Friday, November 20, 2026  
**Repository**: `gitversiondactor` (`origin/main`)  
**Status**: All deliverables completed, tested, and synchronized across mobile apps (`clinic-app`, `patient-app`), backend (`supabase`), and web portal (`web-app`).

---

## 1. Executive Summary

Today's engineering work encompassed six critical architectural enhancements, bug fixes, and reliability improvements across the Dactor healthcare ecosystem:

1. **Diagnostic Lab Walk-In Registration Restoration**: Fixed a regression in the Clinic App's walk-in booking workflow where patient manual details input fields (full name, phone, age, gender, address) were inadvertently bypassed for diagnostic lab facilities. Restored full patient registration while cleanly bypassing the attending doctor selector.
2. **Synchronous Authentication Cache Purge & Doctor Portal OAuth Guard**: Overhauled the authentication cache cleaning mechanism to immediately and synchronously purge all application tokens (`dactor_*`, `sb-*`, `dismiss_*`), issue instantaneous Firebase and Supabase signouts, and guard Doctor Portal OAuth session restores against inadvertent cross-portal credential leakage.
3. **10-Digit Numeric Tracking Code Standard & Live Queue Synchronization**: Enforced deterministic 10-digit numeric tracking codes across Pay-at-Desk booking workflows and updated database procedures, ensuring immediate real-time queue synchronization upon desk approval.
4. **Strict Doctor & Date Scoping for Live Queue Metrics**: Resolved live queue metric leakage across doctors and dates in both mobile and web portals, ensuring waiting counts, active consultations, and queue metrics are strictly scoped to the specific doctor and appointment date.
5. **Multi-Key Patient Directory Deduplication & Visit History Preservation**: Implemented a composite-identity deduplication engine (`extractKeys`) across Room local storage, desk registrations, and appointment sync. Fixed background polling to prevent repeated visit count inflation and premature last visit date overwrites for upcoming/waiting appointments.
6. **Diagnostic Lab UI Policy & Advance Appointment Banner Cleanliness**: Suppressed misleading "Your Turn is Coming Up" banners and sample collection callouts for appointments booked on different dates, and hidden clinical doctor remarks sections for lab appointments.

All changes strictly comply with the **Global Rule: One-Way Logic Synchronization (App -> Website)**, achieving complete functional and visual parity.

---

## 2. Detailed Work Breakdown

### 2.1 Diagnostic Lab Walk-In Patient Registration Form Restoration

#### Problem Statement
When booking walk-in appointments for diagnostic lab facilities, the manual patient entry form (Name, Mobile, Age, Gender, Address) was erroneously skipped due to an over-restrictive conditional check (`!isLabClinic`), preventing clinic receptionists from registering new walk-in patients directly from the desk.

#### Solution & Implementation
- In [`WalkinBookingScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/walkin/WalkinBookingScreen.kt), removed the restrictive branch so the standard patient details input form is universally rendered for new patients.
- Conditioned only the **Attending Doctor Selector** to display when `!isLabClinic && affiliatedDoctors.isNotEmpty()`, preserving proper lab workflow semantics where patients book tests rather than doctor consultations.

---

### 2.2 Clinic Logout Auth Cache Purge & Doctor Portal OAuth Guarding

#### Problem Statement
- Logging out from the clinic or doctor portals previously relied on asynchronous cache and IndexedDB clearing, which could experience race conditions or fail to clear active Supabase/Firebase sessions before navigation completed.
- Google OAuth redirects initiated in other contexts could accidentally trigger doctor portal auto-login.
- Doctors without active clinic affiliations experienced UI hangs on the live queue tab.

#### Solution & Implementation
- **Synchronous Storage Eviction**: Rewrote [`cacheCleaner.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/utils/cacheCleaner.ts) to execute a synchronous purge of `localStorage` (`dactor_*`, `dismiss_*`, `sb-*`) and `sessionStorage`, followed by synchronous calls to `firebaseSignOut()` and `supabase.auth.signOut()`, and a dispatched `storage` event notifying all active tabs.
- **Race-Guarded Secondary Wipe**: Placed secondary IndexedDB (`deleteClinicOfflineDb`) and browser `caches.delete` operations behind a strict 800ms race timeout to prevent logout hangs.
- **Target Portal OAuth Guarding**: Updated [`DoctorPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/DoctorPortal.tsx) and [`Login.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/Login.tsx) to verify `dactor_oauth_target_portal === 'doctor'` before processing OAuth redirect tokens or listening to auth state transitions.
- **Unaffiliated Doctor UI State**: In [`DoctorDashboardScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/dashboard/DoctorDashboardScreen.kt), added a dedicated fallback empty state with a call-to-action directing unaffiliated doctors to their dashboard invitations rather than attempting to load queue data without a clinic ID.
- **Targeted Repository Cache Eviction**: Added `invalidateClinicAppointments(clinicId)` and `invalidateDoctorAppointments(doctorId)` in [`AppointmentRepository.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt) to ensure instant state invalidation upon appointment approval or cancellation.

---

### 2.3 10-Digit Numeric Tracking Code Standard & Live Queue Synchronization

#### Problem Statement
Pay-at-Desk booking requests required uniform 10-digit numeric tracking codes to align with physical clinic tokens and search inputs, along with instant queue enrollment when approved at the clinic desk.

#### Solution & Implementation
- **PostgreSQL Migration**: Authored [`migration_pay_at_desk_numeric_id_and_live_queue_sync.sql`](file:///C:/Users/notan/Documents/gitversiondactor/supabase/migration_pay_at_desk_numeric_id_and_live_queue_sync.sql) to generate deterministic 10-digit numeric tracking codes and automatically insert approved Pay-at-Desk appointments into the authoritative `queue_entries` table.
- **Automated Test Suite**: Created and executed [`tests/pay_at_desk/test_numeric_id_and_queue_sync.cjs`](file:///C:/Users/notan/Documents/gitversiondactor/tests/pay_at_desk/test_numeric_id_and_queue_sync.cjs) confirming tracking code format, status transitions, and real-time live queue propagation.
- **Queue Board & Repository Sync**: Updated [`QueueBoardScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt) and [`QueueRepository.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/data/repository/QueueRepository.kt) to subscribe to real-time additions and display "Sample Collection Counter" for lab clinics when calling patients inside.

---

### 2.4 Strict Doctor & Date Scoping for Live Queue Metrics & Public Status

#### Problem Statement
Patients checking live queue status or multi-slot position estimates were seeing queue counts aggregated across all clinic doctors and dates, resulting in inaccurate waiting position estimates.

#### Solution & Implementation
- **Doctor & Date Isolated Function**: Implemented [`migration_live_queue_doctor_and_date_isolated.sql`](file:///C:/Users/notan/Documents/gitversiondactor/supabase/migration_live_queue_doctor_and_date_isolated.sql), creating `get_public_live_queue_status_isolated(p_clinic_id, p_doctor_id, p_appointment_date)` to calculate current token inside, total waiting, and estimated wait times strictly scoped to the doctor and date.
- **Multi-Slot Timing Engine**: Refactored `computeMultiSlotDailyPosition` in [`QueueRepository.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/data/repository/QueueRepository.kt) and [`db.ts`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/services/db.ts) so slots and appointments are filtered by both doctor ID and appointment date.
- **Web App Parity**: Updated [`LiveQueue.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/LiveQueue.tsx) to strictly scope waiting and consultation patient calculations to the selected doctor and date.

---

### 2.5 Multi-Key Patient Directory Deduplication & Visit History Preservation

#### Problem Statement
In the clinic's Patient Directory, patients with multiple appointments or walk-in records appeared duplicated due to varying key representations (raw appointment IDs vs. phone-derived deterministic IDs vs. tracking codes). Furthermore, background polling was incrementing `totalVisits` on every poll and setting `lastVisitDate` to future appointment dates even when the visit was only scheduled or waiting.

#### Solution & Implementation
- **Composite Key Extraction Engine**: Implemented `extractKeys` in [`PatientDirectoryScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/main/java/com/dactor/clinic/ui/patients/PatientDirectoryScreen.kt), extracting normalized keys:
  - Raw UUID (`id:<cleanId>`)
  - Sanitized phone (`phone:<cleanPhone>`)
  - Deterministic phone UUID (`detphone:<uuid>`) via `PatientIdentitySync`
  - Normalized email & deterministic email UUID (`email:<cleanEmail>`, `detemail:<uuid>`)
  - 10-digit tracking code (`track:<code10>`)
  - Auth UID (`uid:<authUid>`)
- **Visit Count & Date Integrity**: Corrected upsert logic so that:
  - `lastVisitDate` is updated only when an appointment is explicitly in a completed state (`completed`, `done`, `visited`). Uncompleted waiting appointments leave `lastVisitDate` unchanged.
  - `totalVisits` increments only when a new completed appointment date differs from the recorded `lastVisitDate`, completely eliminating polling inflation.
- **Unit Test Coverage**: Created [`PatientDirectoryDeduplicationTest.kt`](file:///C:/Users/notan/Documents/gitversiondactor/clinic-app/app/src/test/java/com/dactor/clinic/ui/patients/PatientDirectoryDeduplicationTest.kt) with 363 lines of comprehensive test cases covering composite key extraction, deduplication, and visit count stability under repeated polling loops.

---

### 2.6 Diagnostic Lab UI Policy & Advance Appointment Banner Cleanliness

#### Problem Statement
- For appointments scheduled on future dates, live queue trackers in both mobile and web portals were displaying active "Your Turn is Coming Up" callout banners, confusing patients.
- Diagnostic lab appointments were showing "Doctor's Clinical Remarks & Recommendations" placeholders even though lab bookings do not involve doctor consultations.

#### Solution & Implementation
- **Date Guarding on Callout Banners**: Updated [`PatientMainScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt), [`QueueStatusScreen.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt), and [`PatientPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/PatientPortal.tsx) to strictly suppress live turn callouts, sound notifications, and "inside" banners when the appointment date is not today.
- **Lab Remarks Suppression**: Hidden clinical remarks sections for diagnostic lab orders in [`PatientPortal.tsx`](file:///C:/Users/notan/Documents/gitversiondactor/web-app/src/pages/PatientPortal.tsx) and mobile apps in accordance with `DiagnosticLabPolicy`.
- **Timing Engine Advance Tests**: Added `testDifferentDayAdvanceLabAppointmentCalculatesAdvancePosition` in [`QueueTimingEngineTest.kt`](file:///C:/Users/notan/Documents/gitversiondactor/patient-app/app/src/test/java/com/dactor/patient/data/repository/QueueTimingEngineTest.kt).

---

## 3. Verification & Test Metrics

| Target / Component | Test / Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Patient Directory Deduplication Tests** | `PatientDirectoryDeduplicationTest.kt` | **PASSED** | 5 test cases passing (composite deduplication, single profile merge, waiting appointment non-overwrites, polling stability) |
| **Queue Timing Engine Tests** | `QueueTimingEngineTest.kt` | **PASSED** | Advance date lab calculation, multi-slot position computation, and doctor isolation verified |
| **Pay-at-Desk Numeric ID & Sync** | `node tests/pay_at_desk/test_numeric_id_and_queue_sync.cjs` | **PASSED** | 10-digit code generation, status transitions, and real-time live queue insertion verified |
| **Web Portal Synchronization** | `web-app` TypeScript & React | **PASSED** | Complete parity for PatientPortal, ClinicPortal, LiveQueue, cacheCleaner, and db service |

---

## 4. Git Commit History for November 20, 2026

1. `4ea39b3`: `test(clinic): add unit tests for patient directory deduplication and visit history preservation`
2. `4cec85e`: `fix(queue): suppress sample collection callout and hide today banners for different-day appointments`
3. `b7219f2`: `fix(queue): isolate public queue status and live queue metrics strictly per doctor and appointment date`
4. `b6f46ad`: `fix(web-app): scope LiveQueue waiting and consultation patient calculations by date and doctor`
5. `8a087b2`: `fix(queue): synchronize multi-slot position filtering by doctor and date across mobile and web`
6. `8237c7f`: `fix(patient-app): scope live queue consultation check strictly to doctor entries in AppointmentsTab`
7. `ff406d0`: `fix(pay-at-desk): enforce 10-digit numeric tracking codes and real-time live queue synchronization`
8. `e391b47`: `fix: purge auth cache on clinic logout and guard doctor portal session restore`
9. `fa0a380`: `chore(seo): automated daily sitemap and schema synchronization [skip ci]`
10. `f5c94ff`: `fix(walkin): restore patient details input form for diagnostic lab walk-ins`

---

## 5. Architectural Compliance & One-Way Sync Verification

In accordance with **Global Rule: One-Way Logic Synchronization (App -> Website)**:
- All business logic updates originating in `clinic-app` and `patient-app` (multi-slot position calculations, 10-digit tracking formatting, composite patient key extraction, diagnostic lab UI callout suppression, and auth cache cleanup) have been fully propagated to `web-app` (`PatientPortal.tsx`, `ClinicPortal.tsx`, `LiveQueue.tsx`, `DoctorPortal.tsx`, `db.ts`, and `cacheCleaner.ts`).
- No reverse backporting from website to mobile was introduced.
- Working tree is clean, verified, and pushed to `origin/main`.
