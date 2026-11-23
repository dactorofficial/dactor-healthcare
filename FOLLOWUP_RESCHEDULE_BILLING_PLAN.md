# Plan: Make Follow-up & Reschedule Safe (No Overwritten Visits or Bills)

**Status:** plan only. No code has been changed for this yet. Problems were found by reading the
code (clinic app, patient app, Supabase migrations), not by running the apps.

**Decisions (agreed):**
- **No time limit.** A follow-up can be booked any time after the original visit.
- **Clinic types** are exactly the 3 values of the database's `clinic_type_enum`: `single_visit`,
  `multi_visit`, `diagnostic_lab` (`supabase/schema.sql`). There is no separate "multi" type. The
  app code that checks `type.contains("multi")` should compare to `multi_visit` exactly.
- **Multi-visit clinics (`multi_visit`):** follow-ups are allowed **as many times as needed**, all free.
- **Single-visit clinics (`single_visit`):** **one free follow-up per original visit**. Further
  follow-ups on the same visit are charged the normal consultation fee.
- **Diagnostic labs (`diagnostic_lab`): one-time visit, no follow-ups at all.**
  - **Reschedule** is allowed **only until the sample is collected**.
  - Once the sample is collected, the visit can't be rescheduled.
  - Once the report is published, nothing more can be booked from that visit (no follow-up,
    no reschedule). A new test is a new booking.
- **Doctor-specific.** A follow-up is always with the **same doctor** as the original visit. The doctor
  can't be changed for a follow-up. A different doctor means a new (paid) appointment.

**Target rules:**
1. A **follow-up** is always a **new appointment** with its **own new code** and a link to the
   original visit. The original visit and its bill are never changed.
2. A **reschedule** only moves a visit that **hasn't happened yet**. A completed visit can never be
   rescheduled. The screen offers "Book follow-up" instead.
3. A **bill belongs to one appointment** and is never moved, merged into, or overwritten by
   another visit.
4. Every screen in both apps uses the same server functions for this, so the rules are the same everywhere.

---

## What's wrong today

### A. Follow-up by appointment code (the code-lookup problem)
| # | Problem | Where |
|---|---|---|
| A1 | **The patient app reuses the original code for the follow-up.** `bookFollowUpAppointment` creates the follow-up with `existing.copy(...)`, which keeps the same `tracking_code_10_digit`. After that, two appointments share one code. | `patient-app/.../data/repository/AppointmentRepository.kt` ~343–390 |
| A2 | **The clinic app expects one appointment per code.** `getAppointmentByTrackingCode` uses `decodeSingleOrNull`. When a code has 2+ rows (after A1) it throws, so the walk-in **"Follow-up by code" lookup fails** or falls back to an old copy on the phone. | `clinic-app/.../data/repository/AppointmentRepository.kt` ~495 |
| A3 | **The patient app picks the wrong row for a shared code.** It prefers today's or an upcoming appointment. If a follow-up already exists, a second follow-up **moves that follow-up** (reschedule) instead of creating a new one. | `patient-app/.../AppointmentRepository.kt` ~240–275, ~430 |
| A4 | **Codes aren't unique.** The clinic app makes codes locally with `TrackingCodeGenerator.generate()`: a random terminal number (900 options) × counter (999) × day of year. That's only about 900,000 codes per day, and **they repeat every year**. The database has no unique rule on `tracking_code_10_digit`. Clashes become likely as bookings grow. | `clinic-app/.../TrackingCodeGenerator.kt`, `supabase/*` |
| A5 | **A code clash returns someone else's appointment.** Before inserting, `createWalkinAppointment` returns any existing appointment with the same code ("idempotency guard 2"). | `clinic-app/.../AppointmentRepository.kt` ~760 |
| A6 | **Patient app follow-ups can "succeed" without saving.** The direct insert sends `payment_status='paid'` and a fee of 0. The anti-tampering trigger rejects that for patient users. Both retries fail, and the function **returns the unsaved object** as if it were created. | `patient-app/.../AppointmentRepository.kt` ~388–400, `supabase/migration_lab_booking_decoupling.sql` |
| A7 | **No follow-up rules.** Nothing checks that the original visit is in the **same clinic**, is actually completed, is within a follow-up time window, or hasn't already been used for a free follow-up. The clinic lookup isn't limited to the clinic either. | Both apps |
| A8 | **"Completed" is guessed differently in each app.** The patient app only treats `done`/`completed` as completed. A visit marked done in the queue but still `checked_in` on the appointment (or a lab visit at `report_prepared`) counts as "active" and gets **rescheduled in place**. | `patient-app/.../AppointmentRepository.kt` ~365 |
| A9 | **Desk-registered patients get fake codes.** In the Patient Directory, these patients get a made-up code (`getDeterministicAppointmentId`, a hash of the patient id) that doesn't exist in `appointments`. Typing it into Follow-up shows "No appointment record found". | `clinic-app/.../PatientDirectoryScreen.kt` ~308, ~596, ~2960; `PatientRepository.kt` ~142 |

### B. Reschedule overwrites completed visits
| # | Problem | Where |
|---|---|---|
| B1 | **The reschedule server function allows completed visits** and resets them in place: `checkin_status → not_checked_in`, `consultation_completed_at → NULL`, new date. **The original visit disappears from history.** | `supabase/migration_reschedule_appointment_rpc.sql` (comment at ~line 43) |
| B2 | **The clinic app's fallback does the same** with a direct table update when the server call fails. | `clinic-app/.../AppointmentRepository.kt` `rescheduleAppointment` ~1043 |
| B3 | **"Reschedule past appointment" in Patient Detail** (`editingPastApptDate`) calls reschedule on **past/completed** visits. | `clinic-app/.../PatientDetailScreen.kt` ~1048 |
| B4 | **Rescheduling resets the queue entry** (`inside_at`, `completed_at` → NULL), so a completed visit's timing and duration data is lost too. | `clinic-app/.../AppointmentRepository.kt` ~1080 |

### C. Bills get overwritten or mislabelled
| # | Problem | Where |
|---|---|---|
| C1 | **The bill moves with a rescheduled visit.** Because B1–B3 reuse the same appointment, the old visit's bill (items, paid amount, payment history) now belongs to the new date. Any new charges are **added into the old bill**. | `BillingRepository.saveInvoice` / `saveFollowUpBill` (keyed by `appointment_id`) |
| C2 | **Saving a bill overwrites the appointment's fee.** `saveInvoice` sets `appointments.fee_amount = invoice.totalAmount`. A free follow-up that gets extra items (tests, medicines) then has `fee_amount > 0`. | `BillingRepository.kt` ~150 |
| C3 | **Whether a visit is a follow-up is guessed from the fee.** `checkIsFollowUp` = "fee is 0". After C2, a follow-up is relabelled as a paid new visit in Billing, Payment Logs ("NEW PATIENT / FOLLOW-UP") and doctor stats. | `BillingScreen.kt` ~58, `PaymentLedgerHelper.kt` |
| C4 | **Follow-up payment fields are inconsistent.** Patient Detail follow-ups are created with `payment_status='pending'` and no payment mode, so a free follow-up shows as unpaid. The walk-in insert doesn't send `payment_mode`, `status` or `total_amount` at all (missing from `AppointmentInsertDto`), so the "FREE" mode set on screen is dropped. | `PatientDetailScreen.kt` ~1135, `AppointmentRepository.kt` `AppointmentInsertDto` |
| C5 | **Payment history lives in a free-text `remarks` field**, combined with clinical notes and rebuilt on each save (`buildCombinedRemarks`). A bug in parsing or rebuilding loses payment records. Payments are also logged separately in `invoice_transactions`. | `BillingRepository.kt`, `PaymentLedgerHelper.kt` |

### D. Patient records overwritten when booking (walk-in / follow-up)
| # | Problem | Where |
|---|---|---|
| D1 | **Every walk-in rewrites `user_id` on all past appointments** with the same phone/email, across **all clinics**. Family members sharing a phone get merged into one patient. | `createWalkinAppointment` ~720 |
| D2 | **A booking overwrites an existing profile's** name, age, gender and phone (matched by email). Booking a follow-up for a family member renames the account holder. | `createWalkinAppointment` ~655 |
| D3 | **The directory uses a fake phone number.** "Schedule" falls back to `patientMobile = "9841000000"`. Together with D1, this links unrelated patients who have no phone. | `PatientDirectoryScreen.kt` ~2725 |

---

## The fix

### Phase 1: Database (one migration)
File: `supabase/migration_followup_reschedule_integrity.sql`

1. **New columns on `appointments`:**
   - `visit_type` text: `'new' | 'follow_up' | 'rescheduled'` (default `'new'`)
   - `follow_up_of_appointment_id uuid` references `appointments(id)` (the visit this follows up)
   - `rescheduled_from_date date` (optional, for history)
2. **Unique codes:**
   - Find existing duplicate `tracking_code_10_digit` values. Keep the code on the **oldest** row.
     Give the other rows (the follow-ups made by A1) **new codes** from
     `generate_unique_tracking_code_10()`, and set their `visit_type='follow_up'` and
     `follow_up_of_appointment_id` to the oldest row.
   - Then add `UNIQUE (tracking_code_10_digit)`.
3. **New server function `create_follow_up_appointment(...)`** (SECURITY DEFINER; callable by clinic staff and by
   the patient who owns the original visit):
   - Input: `p_source_tracking_code` or `p_source_appointment_id`, `p_clinic_id`, `p_slot_id`,
     `p_doctor_id`, `p_date`, `p_time`, `p_is_free boolean`, `p_remarks`.
   - Checks: the original visit exists, is in **the same clinic**, is **completed** (one shared rule, see step 5),
     and is not cancelled. **No date limit.**
   - **Doctor:** the follow-up's `doctor_id` is always taken from the original visit. `p_doctor_id`
     is ignored, or rejected with `FOLLOW_UP_DOCTOR_MISMATCH` if it's different. The slot must
     belong to that doctor (or be a general slot of the clinic) for the chosen date. If the original
     visit has no doctor (old/walk-in data), or the original doctor is no longer affiliated with the
     clinic, allow choosing another doctor of the same clinic (see "Agreed: original doctor no longer at the clinic" below).
   - **Free or charged:**
     - `multi_visit` clinic → follow-ups are unlimited and every one is free.
     - any other clinic type → free if no earlier follow-up exists for this original visit
       (`count(*) where follow_up_of_appointment_id = source and not cancelled = 0`).
       Otherwise it's charged the doctor's normal consultation fee, still `visit_type='follow_up'`
       and still linked to the original visit.
     - The server decides this. The app's `p_is_free` is only a display hint, never trusted.
   - Follow-ups of follow-ups: if the original code is itself a follow-up, link to the **first**
     visit (`follow_up_of_appointment_id` = the first visit), so the free-follow-up count is per
     first visit and a chain of codes can't be used to get more free follow-ups.
   - **Diagnostic labs:** always refused with `LAB_NO_FOLLOW_UP` (one-time visit). The lab screens hide
     the follow-up option completely.
   - Creates a **new row** with a **new code** from `generate_unique_tracking_code_10()`,
     `visit_type='follow_up'`, the link to the original, the original's doctor, the fee/payment
     fields from the free-or-charged rule (free → fee 0, `payment_mode='FREE'`,
     `payment_status='paid'`; charged → doctor's fee, `payment_status='pending'`), and `status='APPROVED'`.
   - Adds a queue entry if the date is today, and updates the slot's booked count.
   - **Never updates the original visit or its bill.**
   - Returns the new appointment.
4. **Change `reschedule_patient_appointment`:**
   - **Refuse** if the visit is completed (step 5 rule), cancelled, or a no-show. Return a clear
     error code such as `VISIT_COMPLETED_USE_FOLLOW_UP`.
   - Remove the "completed → reset in place" branch.
   - **Diagnostic lab rule:** refuse with `LAB_SAMPLE_ALREADY_COLLECTED` once the sample is collected,
     meaning any of:
     - the appointment's `checkin_status` is `sample_collected`, `processing`, `report_prepared` or `done`
     - the queue entry status is `sample_collected`, `processing`, `report_prepared` or `done`
     - a `lab_reports` row exists for the appointment (`sample_collected_at` set)

     If the report is published (`lab_reports.prepared_at IS NOT NULL` or `stage = 'report_prepared'`),
     refuse with `LAB_REPORT_PUBLISHED`. Before sample collection, the lab reschedule works normally
     (date/collection slot only, no doctor).
   - Store `rescheduled_from_date`. Leave fee, payment and the bill untouched (same visit, new time).
5. **One "is completed" rule** (SQL function `is_visit_completed(appointment_id)`): true if
   `consultation_completed_at IS NOT NULL`, or `checkin_status` is in
   `completed/done/visited`, or the queue entry status is in `done/report_prepared`, or a lab status
   is past sample collection. Both functions above use it.
6. **Appointment side effects only for the right clinic:** move the D1/D2 logic into a server
   function. Only link past appointments that have **no `user_id`** and are in **the same clinic**.
   Never overwrite an existing profile's name/age/gender.

### Phase 2: Clinic app
| Area | Change |
|---|---|
| Code lookup (`AppointmentRepository.getAppointmentByTrackingCode`) | Use `decodeList`, limit to the current clinic, and pick the visit by the shared completed rule. Once codes are unique there will be just one. |
| Code generation | Stop making codes locally with `TrackingCodeGenerator.generate()` for new bookings. Use the server's `generate_unique_tracking_code_10()` (or let the server functions assign the code). Remove idempotency guard 2's "return the existing appointment with this code". |
| Walk-in follow-up (`WalkinBookingScreen`) | Call `create_follow_up_appointment` instead of `createWalkinAppointment`. After the code lookup, **lock the doctor** to the original visit's doctor (doctor picker disabled, showing "Follow-up with Dr. X") and show only that doctor's slots. Show the fee from the rule: "Free follow-up", or for non-multi-visit clinics once the free one is used, "Free follow-up already used: Rs. <fee>". The fee/label on the button follows. Clear errors: "code not found in this clinic", "visit not completed yet: use Reschedule", "original visit has no doctor: book a new appointment". |
| Patient Directory "Schedule" (follow-up mode) | Use `create_follow_up_appointment` with the patient's **latest completed visit** as the original. Remove the `"9841000000"` phone fallback (ask for a phone if it's missing). |
| Patient Directory codes | Stop showing fake codes (`getDeterministicAppointmentId`) as appointment codes. Show the latest real visit code, or "No visit yet". |
| Patient Detail "Schedule follow-up" | Use `create_follow_up_appointment` (fixes C4's "pending" payment). Remove the `followUpDoctorId` picker. The doctor is fixed to the original visit's doctor. |
| Patient Directory "Schedule" doctor picker | In follow-up mode, lock the doctor to the original visit's doctor. Free mode uses the same free-or-charged rule. |
| Patient Detail "Reschedule past appointment" (`editingPastApptDate`) | Remove for completed visits. Show **"Book follow-up"**, which opens the follow-up dialog with this visit preselected. Keep Reschedule only for upcoming or not-yet-seen visits. |
| `rescheduleAppointment` fallback | Remove the direct table update fallback (B2) and the queue-timestamp reset for completed entries (B4). If the server refuses with `VISIT_COMPLETED_USE_FOLLOW_UP`, show that message. |
| Future Appointments / No-Show Manager reschedule | Keep (these are not-yet-seen visits). The server function now enforces the rule. |
| Diagnostic lab screens (Live Queue, Lab Workflow, Patient Directory/Detail, Walk-in) | No follow-up option anywhere for labs (the walk-in "New / Follow-up" toggle is already hidden for labs; check the rest). Show **Reschedule** only while the sample isn't collected. After that, the button is hidden and the visit shows "Sample collected" / "Report published". |
| `type.contains("multi")` checks (`PatientDirectoryScreen.kt` ~156, `DashboardScreen.kt` ~1738) | Compare to `multi_visit` exactly. These checks also match "poly", "hospital" and "center" in the type text. Check whether those screens should use the 3 enum values only. |
| `AppointmentInsertDto` | Add `payment_mode`, `status`, `total_amount`, `visit_type` so what the screen sets is actually saved (C4). |

### Phase 3: Patient app
| Area | Change |
|---|---|
| `bookFollowUpAppointment` | Replace the `existing.copy(...)` insert and the reschedule branch with one `create_follow_up_appointment` call. If the original visit isn't completed, show "Your visit hasn't happened yet. Use Reschedule" instead of moving it. **Never return an unsaved object.** On failure, return null and show the error (fixes A6). |
| `getAppointmentByTrackingCode` | Keep handling duplicates until the Phase 1 cleanup has run. After that, one row per code. |
| Lab bookings (tracker, Active Appointments, history) | No "Book follow-up" for lab visits. "Reschedule" only before sample collection. After the report is published, only "View / download report". |
| Booking form follow-up code check | A code from a lab visit is refused ("Lab tests are one-time visits. Please book a new test"). After the code is entered, lock the doctor to the original visit's doctor and show only that doctor's slots. Show "Free" or the fee from the rule. Show the server's error messages (wrong clinic, not completed, no doctor on the original visit). |
| Tracker / history | Show "Follow-up of #<original code>" using `follow_up_of_appointment_id`. Each visit has its own code. |

### Phase 4: Bills
| Area | Change |
|---|---|
| One bill per visit | `billing_invoices.appointment_id` gets a **UNIQUE** rule (after merging existing duplicate rows the same way `getInvoicesForClinic` already picks the "best" one). A follow-up gets **its own** bill. It never adds to the original's bill. |
| Stop writing the appointment's fee from the bill | Remove `appointments.fee_amount = invoice.totalAmount` in `saveInvoice` (C2). `fee_amount` stays the booked consultation fee. The bill total lives only on the invoice. |
| Follow-up label | `checkIsFollowUp` and `PaymentLedgerHelper` read `visit_type == 'follow_up'` instead of guessing from the fee (C3). Payment Logs' NEW / FOLLOW-UP labels and doctor stats use the same field. |
| Reschedule | The bill stays with the same appointment and isn't changed (same visit, new time). Since completed visits can no longer be rescheduled, a paid bill can't end up on a different visit. |
| Payment history | Use `invoice_transactions` as the record of payments, and recompute `paid_amount` from it. Keep `remarks` for clinical notes only. Move existing payment lines out of `remarks` into transactions once. |
| Edits to a bill | `saveFollowUpBill` / `pushQuickPayment` only change the bill of the visit being billed (they already look it up by that visit's `appointment_id`; once visits stop being reused, that is correct). |

### Phase 5: Testing
1. **Follow-up by code, clinic walk-in:** complete a visit, then book a follow-up with its code. You get a
   **new code**, the original visit and its bill are unchanged, and the new visit shows
   "Follow-up of #…" with the **same doctor** (the doctor can't be changed).
   - **Single-visit clinic:** the 1st follow-up is free; the 2nd follow-up on the same visit
     (including using the 1st follow-up's code) is charged the doctor's fee.
   - **Multi-visit clinic:** the 2nd, 3rd, 4th, … follow-ups are all allowed and free.
   - **Diagnostic lab:** using a lab code for a follow-up is refused in both apps.
   - **Lab reschedule:** works before sample collection. Refused after sample collection.
     Refused after the report is published.
   - A follow-up booked a long time after the visit (e.g. 1 year) is still allowed.
2. **Follow-up by code, patient app:** same as 1. Check the row actually exists in the database (no fake success).
3. **Code of an upcoming (not done) visit used for a follow-up:** you get the "use Reschedule" message, and nothing changes.
4. **Code from another clinic:** you get "not found in this clinic".
5. **Reschedule an upcoming paid visit:** the date moves, and the bill (amount and payments) is the same.
6. **Try to reschedule a completed visit** (Patient Detail, directory, patient app): it's refused, and "Book follow-up" is offered.
7. **Bill a follow-up with extra items:** it stays labelled FOLLOW-UP, its own bill only, and the original bill is unchanged.
8. **Family members sharing a phone:** booking for one doesn't rename or merge the other.
9. **Duplicate-code cleanup:** after the migration, `SELECT tracking_code_10_digit, count(*) … HAVING count(*) > 1` returns 0.
10. Run the e2e suites (`tests/e2e_doctor_live_queue/*`) and add follow-up/reschedule cases.

---

## Suggested order
| Step | Work | Size |
|---|---|---|
| 1 | Phase 1 migration: columns, duplicate-code cleanup + unique rule, `is_visit_completed`, `create_follow_up_appointment`, reschedule change | Medium |
| 2 | Patient app `bookFollowUpAppointment` → server function (fixes fake success + shared codes) | Small–medium |
| 3 | Clinic app code lookup + walk-in / directory / patient detail follow-up → server function | Medium |
| 4 | Remove reschedule-of-completed UI and the direct update fallback | Small |
| 5 | Bills: unique per visit, stop writing `fee_amount`, `visit_type` labels | Medium |
| 6 | Payment history → transactions; profile/user_id overwrite fixes (D1–D3) | Medium |
| 7 | Testing | Medium |

## Agreed: original doctor no longer at the clinic (Option B)
If the original visit's doctor is no longer affiliated with the clinic, the follow-up is **allowed
with another doctor of the same clinic**. It still counts as a follow-up, stays linked to the
original visit, and uses the normal free/charged rules for the clinic type.
- `create_follow_up_appointment` accepts `p_doctor_id` **only in this case** (original doctor not
  affiliated). Otherwise the original doctor is forced, as above.
- Screens: when the original doctor has left, unlock the doctor picker and show the note
  "Dr. X is no longer at this clinic. Choose another doctor for this follow-up."
- Test: remove the doctor from the clinic, then book a follow-up with the old code → the picker
  unlocks, the follow-up is created with the new doctor, and it's still free (first one / multi-visit).
