# Follow-Up Overwrite Fix

**Problem:** booking a follow-up overwrote the previous appointment instead of creating a new one.
The old visit's date, slot and doctor were replaced, its status was reset to `not_checked_in`,
`consultation_completed_at` was cleared and its queue entries were deleted, so the completed visit
disappeared from history.

**Cause:** a regression from commit `88ba173` (2026-11-21, "fix: prevent reschedule from creating new
appointment or overwriting bill as 0"). It routed every follow-up through the in-place reschedule
path, and it removed the database guard that stopped completed visits from being rescheduled.

## The rule now

| Previous visit is... | "Follow-up" does | "Reschedule" does |
|---|---|---|
| Completed | **New appointment** (new tracking code, Rs. 0, note `Follow-Up Consultation (Ref: #oldCode)`) | Refused |
| Active / upcoming (not completed yet) | **New appointment** (same as above) | Moves it in place (unchanged) |
| Cancelled | Restores the cancelled booking in place (unchanged behaviour, keeps its bill) | Moves it in place (unchanged) |

The previous appointment is never modified by a follow-up. Each follow-up gets its **own** 10-digit
code, because `appointments.tracking_code_10_digit` is `UNIQUE`. It is linked to the old visit
through its notes.

---

## 1. What was changed (app + web, done in this branch)

### Patient app (Android)

| File | Change |
|---|---|
| `patient-app/.../ui/booking/BookingScreen.kt` | Restored the branch removed by `88ba173`. When "Book Follow-Up" is used on a **completed** (non-lab) visit, it calls `bookFollowUpAppointment` and creates a new appointment instead of `rescheduleAppointment`. Other visits still reschedule in place. |
| `patient-app/.../data/repository/AppointmentRepository.kt` → `bookFollowUpAppointment` | Always inserts a **new** row. Previously an active visit was rescheduled in place. Generates a fresh unused tracking code; before, the old code was copied, which broke the `UNIQUE` constraint. Returns `null` if the insert fails; before, it returned the unsaved object, so the app showed "booked" when nothing was saved. Adds the `Ref: #oldCode` note. |
| `patient-app/.../data/repository/AppointmentRepository.kt` → `rescheduleAppointment` | Refuses (`false`) to reschedule a visit whose `checkin_status` is `done` / `completed` / `finished`. This matters because its direct-update fallback skips the database RPC. |
| `patient-app/.../ui/booking/BookingFormScreen.kt` | Returning patient by code: only a **cancelled** visit is rescheduled in place; active and completed visits book a new follow-up. Labels updated ("Active Appointment Found • New Follow-Up", "Confirm Follow-Up"). |

### Web app

| File | Change |
|---|---|
| `web-app/src/pages/ClinicDetail.tsx` | Returning-patient follow-up: any non-cancelled visit gets a new appointment. Before, an active visit was shifted in place. No longer passes the old tracking code to `createAppointment`. Text now says the follow-up gets its own ID. |
| `web-app/src/pages/PatientPortal.tsx` | The free follow-up used to **shift the old appointment in place and then record a Rs. 0 transaction against it**, which also wiped the old bill. It now creates a new appointment; only a cancelled visit is restored in place. |
| `web-app/src/components/LiveTrackerModal.tsx` | "Reschedule Visit" was shown for every status. For completed visits it is now "Book Follow-Up" and opens booking in non-reschedule mode. |
| `web-app/src/services/db.ts` → `shiftAppointmentDate` | Refuses to shift a completed visit, as a client-side guard. |

### Tests

`tests/test_reschedule_in_place_and_bill_preservation.cjs`: two assertions enforced the buggy
behaviour (`BookingScreen` must never call `bookFollowUpAppointment`; the RPC must not block completed
visits). Both are replaced, and new checks cover every path above.

```bash
node tests/test_reschedule_in_place_and_bill_preservation.cjs
```

Result: 11/11 pass. The 5 new or changed checks fail on the old `main` code. `web-app` `tsc --noEmit` passes.

The clinic app is **not** changed. Its follow-up flows (Patient Directory, Patient Detail, Walk-in)
already insert a new appointment with a new ID.

---

## 2. What must be updated in the backend (NOT applied, to do manually)

### 2.1 Apply the RPC guard (required)

Run **`supabase/migration_block_completed_reschedule.sql`** in the Supabase SQL editor (production).

- It re-creates `public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT)`,
  identical to `migration_reschedule_appointment_rpc.sql` except for one guard that returns
  `{ success: false, error: 'Completed appointments cannot be rescheduled. Book a follow-up instead.' }`
  when `checkin_status` is `completed` / `done` / `finished` **or** `consultation_completed_at` is set.
- Bill preservation (fee, total, invoices) is unchanged.

Check after applying:

```sql
-- pick any completed appointment id
select public.reschedule_patient_appointment('<completed-appointment-uuid>', current_date + 1, '10:00', null, null, 'test');
-- expected: {"success": false, "error": "Completed appointments cannot be rescheduled. ..."}
-- and the row is unchanged
```

### 2.2 Check for the legacy RPC signature (required)

Both apps fall back to an older signature when the new one is missing (`PGRST202`):
`reschedule_patient_appointment(p_appointment_id, p_new_date, p_new_time, p_slot_id, p_doctor_id, p_tracking_code)`.
If that version still exists in production, it has no guard either. Check:

```sql
select oid::regprocedure from pg_proc where proname = 'reschedule_patient_appointment';
```

If more than one row is returned, add the same completed-visit guard to the legacy one or drop it.

### 2.3 Patient insert permissions (verify)

The patient app's `bookFollowUpAppointment` inserts directly into `appointments` from the patient's
session. The web uses the `create_patient_appointment` RPC. Before this fix, active visits never reached
this insert, so confirm RLS and the `prevent_patient_appointment_privilege_escalation` trigger allow a
patient to insert a Rs. 0 `APPROVED` follow-up row. If they don't, the app now shows "Failed to book
follow-up" instead of silently overwriting. The proper fix is then to route this insert through
`create_patient_appointment`, the same way the web does.

### 2.4 Repair visits overwritten since 2026-11-21 (recommended)

Every reschedule through the RPC writes an `Appointment Rescheduled` notification, so this lists
candidates to review:

```sql
select a.id, a.tracking_code_10_digit, a.patient_name, a.appointment_date, a.checkin_status,
       a.consultation_completed_at, b.payment_status as invoice_status, n.created_at as rescheduled_at
from public.notifications n
join public.appointments a on a.id = n.appointment_id
left join public.billing_invoices b on b.appointment_id = a.id
where n.title = 'Appointment Rescheduled'
  and n.created_at >= '2026-11-21'
order by n.created_at desc;
```

Rows that were completed visits (for example a paid invoice, a lab report, or doctor notes) were
overwritten. Restore their original date, slot and `checkin_status = 'completed'` from `backups/`
or by hand. If the patient really wanted the new date, insert that as a separate follow-up row.

---

## 3. Known limitations / not done

- **Kotlin not compiled here:** this environment has no Android SDK. Please build the Patient App once
  (`patient-app/gradlew assembleDebug`) before release.
- **Web follow-up buttons don't prefill the code** (existing behaviour, unchanged): `ClinicDetail`
  only auto-fills the tracking code in reschedule mode, so after "Book Follow-Up" / "Follow-Up Visit"
  the patient re-enters their code.
- A follow-up has a **new** tracking code. Patients track it with the new code shown on the
  confirmation screen; the patient app also saves it to their saved codes automatically.
