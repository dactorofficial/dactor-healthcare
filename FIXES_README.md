# Clinic App Fixes: Live Queue Timer & Patient Directory

Branch: `claude/pensive-edison-qg6rww`

Both fixes below are committed and pushed. They have **not** been compiled or tested on a
device yet (no Android SDK was available in the environment where they were made), so the
"Still to do" section matters.

---

## 1. Live queue: consultation timer stops / resets after "Call Inside"

### Problem
After a patient was called inside, the "In Consultation • mm:ss" timer started, then
dropped back to `00:00` a few seconds later and stayed there.

### Cause
The timer parsed the `inside_at` timestamp with `Instant.parse(...)`.

- Right after the tap, the app uses its own timestamp (`2026-11-23T10:00:00Z`), which parses fine.
- The next live refresh replaces it with the server's timestamp (`2026-11-23T10:00:00.123456+00:00`).
  On Android's `java.time` (including the desugared library on older devices), `Instant.parse`
  rejects the `+00:00` offset. The exception was caught and the elapsed time fell back to `0`.
- Also, if a refresh arrived before the server had written `inside_at`, the app's
  start time was replaced with `null`, which also reset the timer.

### Changes
| File | Change |
|---|---|
| `clinic-app/.../ui/queue/components/DoctorQueueItemCard.kt` | Parse `insideAt` with `OffsetDateTime.parse(...).toEpochSecond()` (accepts both `Z` and `+00:00`). Removed the now-unused `java.time.Instant` import. |
| `clinic-app/.../ui/queue/QueueBoardScreen.kt` | Same parsing change in all 4 places: the live "Inside: Xm Ys" timer, `formatConsultationDuration`, the duration calculated when a status changes optimistically, and the duration calculated when mapping server entries. |
| `clinic-app/.../ui/queue/DoctorQueueViewModel.kt` | When mapping server entries, if the server has no `inside_at` yet but the item is `inside`, keep the app's own start time instead of replacing it with `null`. |

---

## 2. Patient directory doesn't show all patients

### Problem
Patient Directory → All Patients showed only some patients (often just today's, or a
handful from the live queue).

### Cause
The directory builds its list from `AppointmentRepository.getAppointmentsByClinic()`.
That function returned early with incomplete data in two ways:

1. **The shared clinic appointment cache was filled with only a few appointments.** The live
   queue's background refresh (`refreshAppointmentsByIds`, every ~5 s), `checkNewAppointments`,
   and the two approval flows added appointments to `clinicAppointmentsCache[clinicId]`
   even when that cache was empty. The directory then found a non-empty cache (3–4
   appointments), treated it as the full clinic list, and never fetched the rest from the server.
2. **The partial on-device (Room) copy was used as the full list.** With the in-memory cache
   empty, it returned `appointmentDao.getApprovedAppointmentsForClinicList()`. That copy only
   holds what other screens happened to save (e.g. today's queue).

### Changes
| File | Change |
|---|---|
| `clinic-app/.../data/repository/AppointmentRepository.kt` | In 4 places (`refreshAppointmentsByIds`, `checkNewAppointments`, and the two approval flows), appointments are merged into `clinicAppointmentsCache` **only if a full list is already loaded**. This matches how the doctor-level cache already worked. |
| `clinic-app/.../data/repository/AppointmentRepository.kt` | `getAppointmentsByClinic()` no longer returns the on-device copy on the normal path. The first call per app launch fetches the full list from the server. The on-device copy is still used when the server can't be reached. |

### Side effect
Other screens that call `getAppointmentsByClinic()` (Billing, Payment Logs, Walk-in booking,
Future Appointments, No-Show manager, Lab workflow) now also load the full list from the server
once per app launch instead of reading the partial on-device copy. That's one extra
network call per launch, and these screens get complete data too.

---

## Still to do

1. **Build the clinic app** (`cd clinic-app && ./gradlew assembleDebug`) and fix any compile
   errors. None are expected.
2. **Test the timer:** in the doctor's live queue and the reception queue board, call a patient
   inside and wait at least 10–15 s, through a couple of refreshes. The timer should keep
   counting up and not drop to `00:00`. Also check that completed consultations show the right duration.
3. **Test the patient directory:** open the live queue for a minute, then go to
   Patient Directory → All Patients. Past patients, not just today's, should appear. The
   refresh button in the header should also load everything.
4. **Run unit tests:** `./gradlew testDebugUnitTest`.
5. **Open a pull request** from `claude/pensive-edison-qg6rww` once testing passes.

### Known issue not fixed here (decide if needed)
- **Patients who share a phone number or account are merged into one.** The directory (and
  `PatientRepository.upsertFromAppointments`) identifies a patient by app account
  (`user_id`), then email, then phone. If family members are booked from the same
  account, or share a phone number, they collapse into one entry, and only one name shows.
  If this is happening, the patient-matching logic needs to change, for example by also
  comparing the patient's name.
- **Large clinics:** `getAppointmentsByClinic()` fetches all of a clinic's appointments in one
  request without paging. If the Supabase API row limit (default 1000) is reached, older
  appointments, and the patients from them, will still be missing. Add paging if a clinic
  goes past that limit.
