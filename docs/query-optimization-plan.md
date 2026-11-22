# Query optimization plan: stop re-downloading data that does not change

> **Status 2026-11-22:** plan only, not implemented.

Audit of `main` (commit `163c36e`, which includes the merged scaling work). Covers the clinic app,
the website (patient live queue, clinic portal, doctor portal, patient portal) and remaining patient
app items. Each item: **problem → location → change → expected effect → how to check**.

Rule applied everywhere:
1. **Static data** (doctor profiles, clinic details, specialty lists, all-clinic lists) is loaded once
   and reused from a saved copy; refreshed only on demand or when stale.
2. **Live data** (queue position, status) is fetched with the **smallest query that answers the
   question**: only the needed columns, only rows that changed, only the needed date range.
3. **History** (invoices, transactions, past appointments) is paged by date, never loaded in full.

Estimate: **about 6–8 working days** for one developer, plus testing.

---

## Step 0 — Measure first (½ day)

- Supabase → Reports / API logs: note requests per minute and egress for a normal clinic day.
- Browser network panel on the clinic portal and live-queue page, and Android Studio Network
  Inspector on the clinic app: record request count and bytes for 5 minutes on each screen below.
- Keep the numbers in this file's table (§8) to compare after each step.

---

## Step 1 — Website: stop copying doctor and clinic into every appointment row (🔴 largest)

**Problem.** 27 queries in `web-app/src/services/db.ts` select appointments as
`*, doctor:doctors(*), clinic:clinics(*), queue_entries(*)` (e.g. `getAppointmentsByClinic` at :704).
Every row carries the **full** doctor profile and the **full** clinic record; 100 appointments repeat the
same ~3–5 KB clinic and ~2 KB doctor 100 times. `mapAppointment` (:4475) uses only the ids; a few
places read short fields from the copies:
- clinic: `name` (also `address_text`, `contact_phone` in printed documents)
- doctor: `full_name`, `specialty`

**Change.**
- Replace in all 27 queries:
  - `doctor:doctors(*)` → `doctor:doctors(id,full_name,specialty)`
  - `clinic:clinics(*)` → `clinic:clinics(id,name,address_text,contact_phone)`
  - `queue_entries(*)` → `queue_entries(id,status,queue_position,called_at,inside_at,completed_at,consultation_duration_seconds,doctor_id)`
    (the fields `mapAppointment` reads — confirm while editing)
- Before replacing, grep every reader of `.clinic?.` / `.doctor?.` on raw rows
  (e.g. db.ts :1159, :6090, :6300, :6425–6426, :6500–6501, `utils/medicalDocPrinter.ts:19`) and add any
  extra column it needs to the list above.

**Expected effect.** Each appointment row drops from ~6–8 KB to ~1 KB.

**Check.** Printed bills/prescriptions, patient records and clinic portal lists still show clinic name,
address, phone, doctor name and specialty; payload size per row in the network panel ≤ ~1.5 KB.

---

## Step 2 — Website clinic portal: load appointments by date range (🔴)

**Problem.** `ClinicPortal.tsx` calls `getAppointmentsByClinic(selectedClinic.id)` **without a date**
at :1445, :1526, :1542, :1570, :1602, :2509, :8428, :9798 → the clinic's **entire appointment history**,
on load, after staff actions and on live updates. `getClinicPatientDirectory` (db.ts :6344) also loads all
history.

**Change.**
- Add `getAppointmentsByClinicRange(clinicId, fromDate, toDate)` (`.gte/.lte('appointment_date')`).
- Live queue / today views: **today only**.
- Upcoming views: today → +30 days.
- Records / history views: last 30 days with **"Load older"** (paging by date).
- After staff actions (:2509, :8428, :9798) and live updates (:1526, :1542): reload **only today**, or
  update the one changed row locally from the action's result instead of reloading.
- Patient directory (db.ts :6344): build from appointments **since the last directory build**, stored in
  the browser, like the clinic app's directory (new or newly approved bookings only).

**Check.** Queue, upcoming, records and directory tabs show the same data as before; requests after a
staff action return only today's rows.

---

## Step 3 — Website patient live queue: one small query per refresh (🔴)

**Problem.** `web-app/src/pages/LiveQueue.tsx` every 15 s (signed-in path, `fetchQueueData` :193–604):
the patient's booking (up to 3 lookups), `get_public_queue_status`, **full doctor profile every time**
(`getDoctorById`, :336), the clinic every 4th time, and **all of the clinic's appointments for today**
with copied doctor/clinic (:334). Guest path (:256–257) downloads the clinic and doctor **every refresh**.

**Change.**
- On open: booking, clinic, doctor, lab reports **once**.
- Every 15 s while visible: **only `get_public_queue_status`** (position, people ahead, status, doctor in
  clinic, current-inside time, doctor average). Booking re-read only when that reply shows the status
  changed.
- Remove the per-refresh `getAppointmentsByClinic(…, today)`. If the multi-slot position is still
  needed for future-day bookings, compute it once on open (or add those numbers to the RPC).
- Guest path: clinic and doctor once on open.
- Privacy check while here: confirm row-level security stops a patient reading other patients'
  appointments; the page must not need them after this change.

**Check.** Network panel: one request per 15 s while the page is open; token, ahead count, doctor
status and expected time still update.

---

## Step 4 — Clinic app doctor queue: slow and slim the "next 4" check (🔴)

**Problem.** `clinic-app/.../ui/queue/DoctorQueueScreen.kt:135–146` calls
`refreshUpcomingPatientsAndCheckNew()` **every 2 s**, which re-downloads the **full booking records** of the
next 4 patients (`DoctorQueueViewModel.kt` ~:673–705 → `refreshAppointmentsByIds`). Each live update or
action also re-reads the clinic (`DoctorQueueViewModel.kt:122`, no saved copy).

**Change.**
- Run the check every **20 s** while the screen is visible (live updates and the doctor's own actions
  already refresh instantly).
- New `getAppointmentStatusByIds(ids)` selecting only `id,status,checkin_status,appointment_date`.
- Clinic break flag from the saved clinic (Step 6) instead of a fresh clinic read on every update.

**Check.** Cancelled/rescheduled patients still disappear from the list within ~20 s; requests from
this screen drop from ~30/min to ~3/min.

---

## Step 5 — Clinic app: doctor list from the saved copy everywhere (🟠)

**Problem.** `DoctorRepository.getDoctorsByClinic` always goes to the server (3–4+ requests with full
profiles). Called on open by: patient detail, payment logs, billing, future appointments, no-show
manager, pay-at-desk requests (and the directory once). A saved copy already exists
(`dactor_doctor_persistent_cache`, `savedDoctorsAgeMs`).

**Change.** `getDoctorsByClinic(clinicId, forceRefresh = false)`: return the saved list when it is under
24 h old; otherwise fetch and save. Pass `forceRefresh = true` only from refresh buttons and after the
clinic adds/removes a doctor or accepts an invitation. Remove the screen-level copies of this rule
(dashboard, queue board) so the repository is the only place it lives.

**Check.** Opening those six screens makes no doctor requests when the saved list is fresh.

---

## Step 6 — Clinic app: saved copy for the clinic record (🟠)

**Problem.** `ClinicRepository.getClinicById` has no saved copy. `WorkingHoursBreakScreen.kt:112` reads
the full clinic **every 6 s**; the doctor queue reads it on every update.

**Change.**
- `getClinicById(id, maxAgeMs = 60_000)`: return the in-memory copy if younger than `maxAgeMs`.
- Break/open toggles done on this device update the saved copy immediately.
- Working hours screen: refresh every **60 s** while visible (or only on open + after own changes).
- For the doctor queue's break flag, add a tiny `getClinicFlags(id)` (`is_on_break,is_open`).

**Check.** Working hours screen: ≤ 1 clinic request/minute; toggling break still shows instantly.

---

## Step 7 — "All clinics" → only this clinic (🟠)

**Problem.** These load **every clinic on the platform** just to find the current one:
`clinic-app/.../PatientDirectoryScreen.kt` (~:291, also passed as `clinicsMap` at :1807),
`PatientDetailScreen.kt` (`getClinics()`), `WorkingHoursBreakScreen.kt` (`getClinics()`),
website `ClinicPortal.tsx:1404, :2269`, `DoctorPortal.tsx:511`.

**Change.** Load only the clinic(s) the user belongs to (`getClinicById`, or the doctor's affiliated
clinics). Where a map of clinic names is genuinely needed (e.g. a patient who visited other clinics),
use the saved public clinic list (`HomeDataCache`-style, 6 h) with only `id,name`.

**Check.** No `clinics?select=*` without an id filter in these screens' network traces.

---

## Step 8 — History screens: page by date (🟠, grows over time)

**Problem.** Full history on every open:
- Payment logs (`PaymentLogsScreen.kt`): `getInvoicesForClinic`, `getTransactionsForClinic`,
  `getSubscriptionPaymentsForClinic` — `eq(clinic_id)` only.
- Billing (`BillingScreen.kt`): `getInvoicesForClinic`, `getAppointmentsByClinic` (all), catalog, services.
- No-show manager (`NoShowManagerScreen.kt`): `getQueueForClinic` (full queue history) +
  `getAppointmentsByClinic` (all).

**Change.**
- Default range **last 30 days**, newest first, with a date picker and **"Load more"**.
- Totals/summaries that need all-time numbers: a server function returning the totals, not the rows.
- Billing: appointments for **today** (and the selected invoice's appointment), not all.
- No-show manager: only uncompleted appointments of past days (`status/date` filter), not all history.
- Catalog and services: saved copy, refreshed when edited.

**Check.** Each screen's first load returns ≤ 30 days of rows; totals match the previous version.

---

## Step 9 — Smaller items (🟡)

- **Queue board "next 4" check** (`QueueBoardScreen.kt`, `refreshAppointmentsByIds` in the delta load):
  same slim `getAppointmentStatusByIds` as Step 4.
- **Website patient portal:** all clinics + all doctors on open (`PatientPortal.tsx:909`, :2304) and
  `getDoctorsByClinic` in 4 places → saved lists (6 h), like the app's `HomeDataCache`.
- **Website doctor portal:** reloads appointments on each live update (`getDoctorAppointments`, 14 call
  sites) → today only, or update the changed row locally.
- **Patient app** (already in `implementation-plan.md` Phase 7): search screen saved lists, slot
  availability RPC.

---

## Step 10 — Guard against regressions

- A small helper in each client that logs (debug builds only) request count and bytes per screen.
- A checklist item in code review: no `select('*')` with embedded `(*)`; no list query without a date or
  id filter; no timer under 10 s that hits the server.
- Re-run Step 0's measurements after each step and fill §8.

---

## Order and estimates

| Order | Step | Area | Estimate |
|---|---|---|---|
| 1 | 0 | measure | ½ day |
| 2 | 1 | website appointment query columns | 1 day |
| 3 | 2 | clinic portal date ranges | 1–1½ days |
| 4 | 3 | website live queue | 1 day |
| 5 | 4 | clinic app doctor queue | ½ day |
| 6 | 5 + 6 | clinic app saved doctor/clinic | 1 day |
| 7 | 7 | only this clinic | ½ day |
| 8 | 8 | history paging | 1–1½ days |
| 9 | 9 + 10 | small items, guards | 1 day |

Release: website changes deploy independently; clinic app changes ship in the next app release
(no server changes needed except optional total/flag RPCs in Steps 6 and 8).

## 8. Measurements (fill in)

| Screen | Before (requests / 5 min, KB) | After |
|---|---|---|
| Clinic portal (staff, normal use) | | |
| Website live queue (signed in) | | |
| Website live queue (guest) | | |
| Clinic app queue board | | |
| Clinic app doctor queue | | |
| Clinic app working hours | | |
| Clinic app payment logs (open) | | |
