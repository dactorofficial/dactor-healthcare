# Fix plan: rescheduled and follow-up visits missing from the live queue

> **Status 2026-11-22:** plan only, not implemented.

Status: proposal. Audit of `main` (commit `163c36e`).
Estimate: **2–3 days** for one developer, including tests.

## 1. Problem

In multi-visit clinics, rescheduled appointments and free follow-up visits do not appear in the
clinic's live queue (queue board, doctor queue) on the day of the visit.

## 2. Root cause

All reschedules and all free follow-ups end in the database function
`reschedule_patient_appointment` (`supabase/migration_reschedule_appointment_rpc.sql`), which:

1. **deletes** the appointment's queue entry
   (`DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;`), then
2. re-creates it **only when the new date is today**
   (`IF p_new_date = v_today_ktm AND v_target_status <> 'WAITING_FOR_APPROVAL' THEN INSERT …`).

New bookings get their queue entry at booking time **for any date** (e.g.
`finalize_online_appointment_payment` inserts it with no date condition). So a reschedule or follow-up
to a **future** date removes the queue entry and never puts it back; the queue screens list queue
entries, so the patient is missing on that day.

Multi-visit clinics hit this on almost every follow-up (single-visit clinics do not allow follow-ups).
It looks random because the patient app's tracker creates a missing entry when the patient opens it
on the day (`ensureQueueEntryForAppointment`).

The website's fallback inside `shiftAppointmentDate` (`web-app/src/services/db.ts` ~:2135–2200) has the
same "today only" rule.

### Second problem: follow-ups overwrite the previous visit

Free follow-ups do not create a new visit; they **move the existing (often completed) visit** to the
new date:
- website `PatientPortal.tsx` ~:1869 ("Update/Shift existing appointment in-place for free follow-up"),
- website `ClinicDetail.tsx` ~:1059,
- patient app `AppointmentRepository.bookFollowUpAppointment` (:327 → `rescheduleAppointment` :418).

The database function then resets it (`checkin_status = 'not_checked_in'`,
`consultation_completed_at = NULL`, new date/time/slot/doctor). The first visit's record is lost and the
patient's history shows one visit instead of two.

### Third problem: queue position ignores the date

When today's entry is created, the position is `MAX(queue_position) + 1` over **all** waiting/inside
entries of the clinic/doctor, without a date filter; leftover entries from earlier days push the
patient back.

## 3. Call sites

| Kind | Location |
|---|---|
| Reschedule | web `ClinicPortal.tsx:3114`, `LiveQueue.tsx:1046`, `PatientPortal.tsx:1822`, `:2499`, `ClinicDetail.tsx:983`; patient app `BookingScreen.kt:464`, `BookingFormScreen.kt:422`; clinic app `PatientDetailScreen.kt:1022`, `PatientDirectoryScreen.kt:2180`, `FutureAppointmentsScreen.kt:1350`, `NoShowManagerScreen.kt:985` |
| Follow-up (moves the old visit today) | web `PatientPortal.tsx:1874`, `ClinicDetail.tsx:1059`; patient app `AppointmentRepository.bookFollowUpAppointment` (:327) |
| Shared helpers | web `db.ts` `shiftAppointmentDate` (:1978, RPC at :2004/:2018, fallback ~:2135); patient app `AppointmentRepository.kt:1286/1297`; clinic app `AppointmentRepository.kt:1013/1025` |

## 4. Fix

### 4.1 Reschedule always keeps a queue entry (database)
New migration `supabase/migration_reschedule_queue_fix.sql`, replacing `reschedule_patient_appointment`:

- Keep the existing appointment update, slot-capacity check and slot counts.
- Replace "delete, then insert only if today" with: when the target status is `APPROVED`,
  **upsert** the queue entry for **any date** (`ON CONFLICT (appointment_id) DO UPDATE`), status
  `waiting`, new doctor, new position. `WAITING_FOR_APPROVAL` keeps no entry (unchanged; approval adds it).
- Position: `MAX(queue_position) + 1` among entries of the **same queue** (same clinic + same doctor,
  or the single common queue for diagnostic labs) **whose appointment is on the same date**
  (join `appointments` on `appointment_date = p_new_date`), status `waiting`/`inside`.
- Same rule as booking for labs: `doctor_id = NULL`, common queue (`is_diagnostic_lab_clinic`).

### 4.2 Follow-ups create a new visit (database + clients)
New function `book_follow_up_visit(p_source_appointment_id, p_new_date, p_new_time, p_new_slot_id,
p_new_doctor_id, p_reason)`:

- Checks the source appointment exists, belongs to a **multi-visit** clinic (or the clinic allows
  follow-ups) and is eligible (server-side rule, e.g. completed within the follow-up window; fee 0
  decided **here**, not by the client).
- Inserts a **new** appointment: same patient details and **same tracking code** (linked visit),
  `attempt_number = source + 1`, `fee_amount = 0`, `payment_status = 'paid'` (free) or as the clinic's
  rule says, status `APPROVED` (or `WAITING_FOR_APPROVAL` if the clinic requires approval).
- Creates its queue entry with the §4.1 position rule, updates slot counts, notifies the clinic.
- Leaves the source visit untouched.
- Returns the new appointment.

Client changes:
- web `PatientPortal.tsx` free-follow-up branch (~:1869–1898) and `ClinicDetail.tsx` (~:1059): call
  `book_follow_up_visit` instead of `shiftAppointmentDate`.
- patient app `bookFollowUpAppointment`: call `book_follow_up_visit` instead of `rescheduleAppointment`.
- Screens that read "the appointment for this tracking code" must pick the **latest active** visit
  (order by date/attempt), not the first row: web `getAppointmentByTrackingCodeOrContact` (db.ts :487),
  patient app `getAppointmentByTrackingCode`, linked-consultation views. Visit history shows all visits.

### 4.3 Remove duplicate queue logic from the website
`shiftAppointmentDate` fallback (~:2135–2200) writes queue entries itself with the "today only" rule.
Remove the queue part; the server function is the single owner of queue entries.

### 4.4 One-time repair
In the migration (idempotent):
- Create missing queue entries for appointments with `status = 'APPROVED'`, date **today or later**,
  not cancelled / no-show, and **no** queue entry, using the §4.1 position rule (ordered by
  appointment time, then created time).
- Report (do not change) appointments whose history was overwritten: rows with a reschedule reason
  starting "Follow-Up Consultation" in notifications/audit, so the clinic can review. The old values are
  not stored anywhere except backups.

## 5. Tests

On a local Postgres (same approach as the scaling migration tests):

| Case | Expected |
|---|---|
| Reschedule approved appointment to today | entry `waiting`, position after today's same-doctor entries only |
| Reschedule to a future date | entry exists for that date; appears in that day's queue |
| Reschedule `WAITING_FOR_APPROVAL` | no entry (unchanged) |
| Reschedule into a full slot | rejected, appointment and entry unchanged |
| Reschedule in a diagnostic lab | `doctor_id NULL`, common queue position |
| Stale waiting entry from yesterday exists | not counted in today's position |
| Follow-up to a future date | **new** appointment row, same tracking code, attempt +1, own entry; source visit unchanged |
| Follow-up not eligible (single-visit clinic / outside window / client fee tampered) | rejected |
| Repair on a database with missing entries | entries created once; re-running creates none |

Clients: reschedule and follow-up from website, patient app and clinic app → patient visible on the
queue board and doctor queue for that day **without** opening the patient tracker.

## 6. Rollout

1. Apply `migration_reschedule_queue_fix.sql` (new reschedule function, `book_follow_up_visit`, repair).
   Reschedule is fixed immediately for all clients (same function name and parameters).
2. Deploy the website (follow-up calls, fallback removal, latest-visit lookup).
3. Release the patient app (follow-up call, latest-visit lookup). Until then, old app versions still
   move the old visit for follow-ups, but the moved visit now keeps its queue entry.
4. Ask multi-visit clinics to check for overwritten visits using the repair report.

## 7. Done when

- A follow-up booked for a future date appears on that day's queue board and doctor queue.
- The patient's history shows both visits.
- The repair query finds no approved, today-or-later appointment without a queue entry.
