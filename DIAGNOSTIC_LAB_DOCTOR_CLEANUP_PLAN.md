# Plan: Remove Doctor Logic from Diagnostic Lab Flows

**Status:** plan only. No code has been changed for this yet.

**Goal:** a diagnostic lab clinic works with **no doctor at all**. No screen in the clinic app or
patient app groups, filters, labels or tracks lab patients by doctor, and no fake/demo doctor
name ever appears.

---

## Why it happens (root causes)

1. **No single, reliable "is this a lab?" check.** Lab detection is copied in many places and
   uses guesses:
   - Clinic app: `Clinic.isDiagnosticLab()` returns true if the type **or name** contains "lab"
     or "diagnostic", or if a specialty matches. `QueueBoardScreen.isDiagnosticClinic()` adds its
     own per-item rules.
   - Patient app: `DiagnosticLabPolicy.isDiagnosticLabAppointment()` uses clinic type, clinic
     name, selected lab tests, lab reports and queue status.
   - Before the clinic record loads, screens assume "not a lab" (e.g. the tracker starts with
     `clinicType = "single_visit"`). So doctor UI shows first, and stays if the clinic fails to load.
   - Result: when one screen's check says "not a lab", the old doctor logic runs.
2. **Old lab data still has doctors attached.** Appointments, `queue_entries` and `slots`
   created before the lab decoupling migration can still have a `doctor_id`. Screens that look at
   `doctorId` treat these as doctor appointments.
3. **Screens that never got a lab check.** Payment Logs, the payment ledger helper, bills/PDFs,
   Billing, No-Show Manager, Pay-at-Desk Requests and the Dashboard have **no** lab handling at all.
4. **Hard-coded demo doctor names** used as fallbacks when no doctor exists.

---

## Phase 1: One source of truth for "is a lab" (do this first)

| Where | Change |
|---|---|
| Database `clinics.type` | Make `type = 'diagnostic_lab'` the **only** rule. One-off SQL to check every existing lab clinic has this type, and fix any that don't. |
| Clinic app `data/model/Clinic.kt` → `isDiagnosticLab()` | Change it to just `type == "diagnostic_lab"`. Remove the name/specialty guessing, which also wrongly matches normal clinics whose names contain "lab". |
| Clinic app `ui/queue/QueueBoardScreen.kt` → `isDiagnosticClinic()` | Delete it and use `clinic.isDiagnosticLab()` everywhere. |
| Patient app `util/DiagnosticLabPolicy.kt` | `isDiagnosticLabAppointment()` / `isDiagnosticOrPathologyLab()` rely on clinic type only. Keep the sample/report status helpers. |
| Both apps, startup | Don't render doctor-or-lab UI until the clinic type is known. Show a loading state instead of defaulting to "not a lab". Cache the clinic type with the appointment so the tracker knows it instantly. |

**Check:** search both apps for `contains("lab")` / `isDiagnostic` and confirm every lab check
goes through the one helper.

---

## Phase 2: Clean the data (database migration)

New migration, e.g. `supabase/migration_lab_remove_doctor_references.sql`:
1. `UPDATE appointments SET doctor_id = NULL` where the clinic is a diagnostic lab.
2. Same for `queue_entries.doctor_id` and `slots.doctor_id` in lab clinics.
3. Re-number active lab queue positions as **one** common queue per clinic and date, since old
   rows may have per-doctor positions.
4. Check RPCs return no doctor fields for labs: `get_doctor_live_queue` (lab path with
   `p_doctor_id = NULL`), the patient tracker delta RPC, `create_patient_appointment`, and the
   walk-in insert path. For labs, `doctor_name` / `doctor_is_in_clinic` should be NULL and
   "anyone inside" should be computed for the whole lab.
5. Optional safety: a trigger that forces `doctor_id = NULL` on insert/update for lab clinics.
   The anti-tampering trigger already does this for patient inserts, but staff inserts skip it.

**Check:** SQL count of rows with `doctor_id IS NOT NULL` in lab clinics should be 0.

---

## Phase 3: Clinic app screens

| Screen / file | What's wrong for labs | Fix |
|---|---|---|
| **Live Queue board** `ui/queue/QueueBoardScreen.kt` | The filter chip row (~line 1345) shows whenever the clinic has doctors. For labs it says "All Services" but the chips are still **doctor names**. Patients are arranged per doctor. The doctor badge/"Attending Physician" text depends on per-item checks. | For labs: hide the doctor chip row entirely (or replace it with sample-status filters: Waiting / Sample Collected / Processing / Report Ready). One queue sorted by queue position. Never call the per-doctor queue loader. |
| **Payment Logs** `ui/billing/PaymentLogsScreen.kt` | "Doctors" tab, "Doctor Tracker", "All Doctors" filter chips, `Dr. <name>` on every row, "NEW PATIENT / FOLLOW-UP (Free OPD)" labels. | For labs: remove the Doctors tab and doctor filter. Replace with a **Tests / Services** breakdown (revenue per lab test from `selected_lab_tests`). Rows show the tests, not a doctor. Drop the new/follow-up wording (not meaningful for labs). |
| **Ledger helper** `domain/util/PaymentLedgerHelper.kt` | Falls back to `doctorName = "Doctor"` (lines ~207, 293, 342). Computes `isNewPatientForDoctor` and per-doctor stats. | Add the lab case: leave the doctor name empty, skip doctor stats, add per-test stats. |
| **Bills / Billing** `domain/util/BillPdfDownloader.kt`, `ui/billing/BillingScreen.kt` | Bill shows "Doctor:" and "ATTENDING DOCTOR". Line item "OPD Doctor Consultation" can appear. | For labs: hide doctor fields on the bill and show "Lab Technician / Pathologist" only if one is recorded. Line items are always the lab tests, never OPD consultation. |
| **Doctor Live Queue / dashboard** `ui/queue/DoctorQueueViewModel.kt`, `ui/dashboard/DoctorDashboardScreen.kt` | A lab is still reachable through the doctor portal. | Decide: labs use only the clinic Live Queue (recommended), and the doctor portal doesn't list lab clinics. |
| **Clinic Dashboard** `ui/dashboard/DashboardScreen.kt` | "Enlisted Doctors & Presence" card; "No Doctors Enlisted — invite doctors…"; "Doctor Slot Management" text. | For labs: hide the doctor card. Show lab stats instead (samples today, reports pending). Change wording to "Collection Slots". |
| **Patient Directory** `ui/patients/PatientDirectoryScreen.kt` | Hard-coded demo name `"Dr. Rajanpurbey55"` (line ~1173). Doctor column / last doctor. | Remove the demo name (empty or hidden). For labs: hide doctor info and show the last tests done. |
| **Patient Detail** `ui/patients/PatientDetailScreen.kt` | Partly lab-aware. | Check every doctor label is hidden for labs. |
| **No-Show Manager** `ui/appointments/NoShowManagerScreen.kt` | "Doctor:" filter, "All Doctors", "Consulting Doctor" picker when rescheduling. | For labs: hide all of these. Reschedule picks only a collection slot. |
| **Pay-at-Desk Requests** `ui/appointments/PayAtDeskRequestsScreen.kt` | Falls back to `"Assigned Doctor"` (lines ~385, 606). | For labs: show the selected tests instead of a doctor row. |
| **Future Appointments, Slot Manager, Walk-in** | Partly lab-aware already. | Go through and remove leftover doctor pickers/labels for labs. Slots are created with `doctor_id = NULL`. |
| **Notifications / queue alerts** `ui/notifications/ClinicNotificationsScreen.kt`, `domain/usecase/queue/SendPatientQueueAlertUseCase.kt` | Templates like "Doctor has arrived". | Lab templates: "Sample collection counter is open", "Your report is ready". |
| **Consultation Fee Manager** `ui/billing/ConsultationFeeManagerScreen.kt` | Doctor fees only. | Hide for labs (test prices are managed under Clinic Services). |

---

## Phase 4: Patient app screens

| Screen / file | What's wrong for labs | Fix |
|---|---|---|
| **Live Queue Tracker** `ui/tracker/QueueStatusScreen.kt` | "Doctor is inside the clinic / Doctor Temporarily Away" card (~3137–3170), doctor banner (~1265), "present reports to Dr. X" text (~3261), doctor name/specialty in the header (~4749). Guarded only by `hasDoctorAssigned = !isLabClinic && …`, so it shows whenever lab detection fails (see Phase 1) or old lab data has a `doctorId` (Phase 2). Wait time uses the doctor's average. | Use the Phase 1 helper. For labs: replace the doctor card with a **"Sample collection counter: Open / On break"** card (driven by `clinics.is_on_break`). Show the lab's average collection time. Queue position comes from the common lab queue. Remove doctor text everywhere in the lab path. |
| **Booking form / confirmation** `ui/booking/BookingFormScreen.kt` (~467), `ui/booking/AppointmentConfirmedScreen.kt` (~60) | Hard-coded demo name **`"Dr. Kshitiz"`** used when no doctor exists. **This is the "demo doctor name" problem.** | Remove the fallback. For labs: show "Diagnostic Lab: <lab name>" and the tests. For OPD with a missing doctor, show nothing, not a fake name. |
| **Home / Discovery / Search** `ui/main/PatientMainScreen.kt`, `ui/discovery/*`, `ui/search/PatientSearchScreen.kt` | "Doctor in clinic" badges and "in_clinic" sorting are based on `doctors`. A lab with no doctors looks closed/empty. | For lab clinics: show the lab's open/break status and test list instead of doctor presence. |
| **History / Transactions / Bill PDF** `ui/profile/PatientTransactionHistoryDialog.kt`, `util/BillPdfDownloader.kt` | Doctor name on receipts. | Lab receipts show tests and the lab name only. |
| **Notifications** `service/NotificationSyncWorker.kt` etc. | Doctor-worded messages. | Lab wording. |

---

## Phase 5: Testing

1. Create a test lab clinic with **zero doctors** and one with an old appointment that still
   had a `doctor_id` (before the Phase 2 cleanup).
2. Clinic app: Live Queue (no doctor chips, one queue), Walk-in, Payment Logs (no Doctors tab,
   per-test totals), bill PDF, Dashboard, Patient Directory, No-Show, Pay-at-Desk.
   **No screen shows "Dr.", "Doctor" or a demo name.**
3. Patient app: book a lab test → confirmation → tracker. The tracker shows the
   collection-counter card, the correct position in the common queue, and no doctor text, even
   while the clinic data is still loading.
4. Regression: run the same checks on a normal OPD clinic. Doctor features must still work there.
5. Update the existing e2e suites (`tests/e2e_doctor_live_queue/*`) and add a lab-only suite.

---

## Suggested order and rough size

| Step | Work | Size |
|---|---|---|
| 1 | Phase 1 single lab check (both apps) | Small–medium; unblocks everything |
| 2 | Phase 2 migration + RPC checks | Small |
| 3 | Remove demo names (`Dr. Kshitiz`, `Dr. Rajanpurbey55`, `"Doctor"`, `"Assigned Doctor"`) | Small, quick win |
| 4 | Patient tracker lab card | Medium |
| 5 | Clinic Live Queue board chips/sorting | Medium |
| 6 | Payment Logs + ledger helper + bills | Medium–large |
| 7 | Dashboard, No-Show, Pay-at-Desk, notifications, discovery | Medium |
| 8 | Testing (Phase 5) | Medium |

## Decisions needed before starting
1. Should lab clinics be hidden from the **doctor portal** completely? (Recommended: yes.)
2. In Payment Logs for labs, should the Doctors tab become a **per-test revenue** tab, or just be removed?
3. Should labs be able to record a **pathologist / lab technician** name for reports and bills,
   or show no person at all?
