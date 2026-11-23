# Fix plan: live queue tracker does not show the moving expected time

> **Status 2026-11-23:** plan only, not implemented. Audited on branch `tracker-speed-fix`
> (main + the tracker speed fix). Affects the **patient app tracker**, the **website live queue** and
> one database function.

## 1. Symptom

On the appointment day the notification says *"your turn … is expected at 10:42 AM (~ 18 min)"*, but the
live queue tracker screen does not show that time moving. It shows a wait such as "~ 20 min" that stays
the same between refreshes, or a 15-minute window, and does not count down while the current patient is
with the doctor.

## 2. Root causes

### 2.1 Patient app (`patient-app/.../ui/tracker/QueueStatusScreen.kt`)

1. **The doctor's running average is never loaded.** The variable `doctorAvgMinutes` (line ~140) is
   still declared, but the code that filled it from `get_public_queue_status` (added in `429228c`) was
   lost when the team reworked the tracker. `QueueRepository.getDoctorAvgConsultationSeconds()` exists
   but nothing calls it, and `lastFinishedCount` is unused. Today's estimate therefore uses the clinic's
   fixed average (default 10 min), not the doctor's real average.
2. **The calculation is not told who is inside, or since when.** In the live-status path (line ~509)
   only the patient's own entry is passed:
   `allClinicQueueEntries = listOf(qEntry…)`. `calculateLiveQueueTimingEstimate` therefore finds no one
   inside, ignores `liveDelta.isAnyoneInside`, and falls into the "no one inside" branch:
   **expected = now + patients ahead × average**. Recomputed every 10 s, this always gives the same
   "~ N min" and a time that moves *later* with the clock instead of counting down. The "late patient"
   check is also blind here (it needs the entry inside).
3. **The screen shows the wait and a window, not the expected time.** The "Expected window" card
   (`displayWait` / `displayWindow`, line ~2282–2310) shows `estimatedTimeLeftText` ("~ 20 min") and
   `timeWindowText` ("10:37 – 10:52"). The exact `expectedExactTimeText` appears only in a fallback that
   is never reached, because the window text is always filled. The notifications (line ~608 and the auto
   alerts) use `expectedExactTimeText`, which is why the notification has a time and the screen does not.
4. The estimate is only recalculated on each 10 s refresh, not by the 1 s clock already in the screen
   (`currentEpochSecond`), so the minutes left never count down between refreshes.

### 2.2 Website (`web-app/src/pages/LiveQueue.tsx`)

1. **The server's fixed estimate wins for today.** `estimatedWaitMinutes` (line ~875) uses
   `liveDelta.estimated_wait_minutes` whenever the live status is present. That value is computed in
   `get_live_queue_status` as `patients ahead × clinic.avg_consultation_time_minutes`
   (`supabase/migration_authoritative_queue_assignment_and_fast_delta.sql` ~:364), so it ignores the
   doctor's running average and when the current patient went inside. The device-side estimate (doctor
   average + overrun, added in `429228c`) only runs when there is no live status, i.e. almost never.
2. **Who is inside comes from the downloaded clinic list.** `inConsultationPatient` (line ~754) searches
   `clinicQueue`. Since the speed fix, that list is not downloaded when the live status is present, so
   the remaining time of the patient inside is never used. The live status already says
   `is_anyone_inside`, and `get_public_queue_status` (already fetched) gives `current_inside_since`.
3. **The expected time is frozen between changes.** The timing block is a `useMemo` (deps at line
   ~1455) that takes `now = new Date()` inside but does not depend on the 1 s ticker
   (`currentEpochSecond`). With the server's constant estimate, it does not re-run until the number of
   patients ahead changes, so "~20 min" and the window stay put, then jump.

### 2.3 Server

`get_live_queue_status` returns `estimated_wait_minutes` (fixed clinic average) but not the two inputs the
devices need (`current_inside_since`, doctor's `avg_consultation_seconds`). Those are only in
`get_public_queue_status`, so each client needs a second request for them.

## 3. Fix

### 3.1 Server (one migration)
- Add `current_inside_since timestamptz` and `avg_consultation_seconds int` to the result of
  `get_live_queue_status`, using the same sources as `get_public_queue_status` (`inside_at` of the entry
  currently inside for that doctor and date, `queue_avg_seconds()` for the doctor with the clinic average
  as fallback). Changing the return columns needs `DROP FUNCTION` and then `CREATE`, then `GRANT EXECUTE`
  to `anon, authenticated` again.
- Keep `estimated_wait_minutes` in the result for older app versions, but clients stop using it.
- Then the tracker needs **one** request per refresh for everything that changes, and the extra
  `get_public_queue_status` call on the website can be removed.
- Check before release: older app builds must ignore the new columns (supabase-kt decoding must have
  `ignoreUnknownKeys`; verify with an old APK against a test database).

### 3.2 One calculation on the device (app and website)
Inputs: patients ahead, `is_anyone_inside`, `current_inside_since`, doctor average, slot start, break.
- Patient inside: its end = later of (`inside_since` + average) and (now + 1 min). An overrun pushes
  everyone later.
- **Expected time = end of the current patient + (patients ahead − 1) × average**; with no one inside,
  now (or clinic opening / slot start, as today) + patients ahead × average.
- Minutes left = expected time − now, re-evaluated **every second** from the clock already on the screen.
- Expected time only changes when an input changes (someone finishes, someone goes in, the average
  changes), not with the clock. It no longer drifts later while waiting.
- Existing rules stay: no earlier than the slot start for patient #1 with a future slot, break handling,
  "Your turn, arrive soon", late detection.

### 3.3 Patient app changes
- `LiveQueueDelta`: add `currentInsideSince`, `avgConsultationSeconds`.
- In the live-status branch, set `doctorAvgMinutes` from the delta and pass the inside information to
  `calculateLiveQueueTimingEstimate`. Either add parameters `insideSince` / `isAnyoneInside`, or pass a
  synthetic "inside" entry with `insideAt = currentInsideSince` and a position ahead of the patient.
  Prefer the explicit parameters, so late detection and the "no one inside" branch stay correct.
- Recompute the estimate from the saved inputs on the 1 s tick (cheap, no network), not only on refresh.
- "Expected window" card: show **"Expected at 10:42 AM"** as the main line and "~ 18 min left" under it
  (the same text the notification uses). Keep the window as a small hint, or drop it.
- Remove the unused `lastFinishedCount` and `getDoctorAvgConsultationSeconds` once the delta carries the
  average.
- Home screen card (`PatientMainScreen.kt` ~6166) calls the same calculation without the doctor average.
  Pass the same inputs there so the home card and the tracker show the same time.

### 3.4 Website changes
- `LiveQueueDelta` type (`web-app/src/services/db.ts` ~7980): add the two fields.
- `estimatedWaitMinutes`: always use the device calculation (§3.2). Stop using
  `liveDelta.estimated_wait_minutes`.
- Inside information: use `liveDelta.is_anyone_inside` + `current_inside_since`, not `clinicQueue`.
- Timing `useMemo`: add `currentEpochSecond` to its inputs (or split it: the expected time is
  memoised on the inputs, and minutes left = expected − now is computed on each tick).
- Card: main line **"Expected at 10:42 AM"**, second line "~ 18 min left · window 10:37–10:52".
- Remove the separate `get_public_queue_status` call once the live status carries both fields.

### 3.5 Notifications use the same result
The tracker's own notifications and auto alerts already read `expectedExactTimeText`. After the fix
they read the same numbers as the screen, so the two can never disagree. The 1-hour reminder check
(`estimatedTimeLeftText.contains("min")`) should compare minutes left as a number instead of text.

## 4. Tests

| Case | Expected |
|---|---|
| 3 ahead, one inside since 4 min, doctor average 8 min | expected = inside + 8 + 2×8 = now + 20 min; minutes left count down each second |
| Same, the consultation runs to 12 min | expected moves later (overrun), never shows less than 1 min for the current patient |
| Patient inside finishes, next goes in | ahead −1, expected time recalculated from the new `inside_since` |
| No one inside, doctor in, 2 ahead | now + 2 × average |
| Doctor not in yet | from opening time / slot start (existing rule) |
| Clinic on break | break end + ahead × average (existing rule) |
| Patient #1, slot in the future | slot start time |
| Screen vs notification at the same moment | same expected time |
| Old app version against the new function | still decodes, still works |
| Unit tests | extend `QueueTimingEstimateTest` for the explicit inside-since input; web: a small test for the calculation helper |

## 5. Effort and order

1. Migration for `get_live_queue_status` (0.5 day, deploy first; old clients unaffected).
2. App: delta fields, calculation inputs, 1 s re-evaluation, card text (1 day).
3. Website: same (0.5–1 day).
4. Device test on a real queue (two phones: clinic marks patients inside/done; patient watches tracker).

No extra server requests: the fix removes one (`get_public_queue_status`) per tracker load.
