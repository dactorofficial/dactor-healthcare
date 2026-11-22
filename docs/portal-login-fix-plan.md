# Fix plan: clinic app says "already associated with a Clinic Portal account" after sign-out

> **Status 2026-11-22:** plan only, not implemented.

Status: proposal. Audit of `main` (commit `163c36e`). Affects the **clinic app** only.
Estimate: **1–2 days** including tests.

## 1. Symptom

On a phone where a clinic account was signed in, after signing out and trying the Doctor / Specialist
Portal (clinic app), login is refused with:

> This Google account (…) is already associated with a Clinic Portal account (<clinic name>). You cannot
> log in to the Doctor / Specialist Portal with this Google ID.

even for a Google account that has never been a clinic.

## 2. Root cause

The doctor-portal login checks whether the email already belongs to a clinic
(`clinic-app/.../ui/auth/ClinicLoginScreen.kt` ~:391–511):

```kotlin
val existingClinic = clinicRepository?.getClinicByEmail(trimmedEmail)
…
if (existingClinic != null || …) { errorMessage = "…already associated with a Clinic Portal account…" }
```

`ClinicRepository.getClinicByEmail` (`clinic-app/.../data/repository/ClinicRepository.kt`) does **not**
return "not found" when the server finds no clinic for that email:

```kotlin
enriched ?: getCachedClinicByEmail(targetEmail) ?: getLastCachedClinic()   // server said: no clinic
…catch → getCachedClinicByEmail(targetEmail) ?: getLastCachedClinic()       // network error
```

`getLastCachedClinic()` returns **any clinic held in memory** (`cachedClinicsById.values.firstOrNull()`)
or the saved `last_active_clinic`. That memory is filled by the previous clinic session and by screens
that load clinic lists, so for an email with **no** clinic the check gets **some other clinic** and
blocks the login, showing that clinic's name.

The website does not have this problem: its `getClinicByEmail` returns `null` when nothing is found, and
it uses a shared check (`checkEmailPortalAssociation`, `web-app/src/services/db.ts:5276`).

## 3. Worse: possible sign-in into another clinic

The same lookup decides **who is signed in**:
- pending-verification resume (`ClinicLoginScreen.kt` ~:328): `if (clinic != null) { if approved → saveClinicSession(clinic.id …) → open dashboard }`
- `checkVerificationStatus()` (~:1337): same pattern.
- clinic-portal login branch (~:430–490) uses `existingClinic` to continue as that clinic.

With the fallback, a Google account that has **no** clinic can be given **the previously cached clinic**
and its dashboard. Treat this as a security bug (verify by reproducing on a test phone, §6).

Other callers that also accept the fallback (lower risk, but wrong data):
`QueueBoardScreen.kt:252`, `WorkingHoursBreakScreen.kt:84`, `DashboardScreen.kt:178`, and
`getLastCachedClinic()` fallbacks in `QueueBoardScreen.kt:197`, `WalkinBookingScreen.kt:120`,
`DashboardScreen.kt:64/190`.

## 4. Fix

### 4.1 `getClinicByEmail` must say "not found" (repository)
- Return a typed result instead of a nullable clinic with fallbacks:
  `sealed class ClinicLookup { data class Found(val clinic: Clinic); object NotFound; data class Unknown(val error: Throwable) }`.
- Server answered with no row → `NotFound`. Network/other error → `Unknown`.
- **Never** fall back to `getLastCachedClinic()` or to a clinic with a different email.
- Keep `getCachedClinicByEmail(sameEmail)` only as an explicit **offline display** helper, never for
  sign-in or portal decisions.

### 4.2 Login decisions only from server answers (login screen)
- Portal association check (doctor and clinic branches, pending resume, `checkVerificationStatus`):
  - `Found` → existing rules (block other portal / continue as that clinic).
  - `NotFound` → not a clinic.
  - `Unknown` → "Could not verify your account. Check your internet connection and try again." (no
    block, no sign-in).
- Before `saveClinicSession(clinic.id …)`, assert `clinic.contactEmail` equals the signed-in email
  (case-insensitive); otherwise refuse.

### 4.3 One shared association check (app = website)
- Add a database function `get_account_portal(p_email)` returning `clinic | doctor | patient | none`
  (+ id/name), from `clinics.contact_email`, `doctors.email` and `profiles.role` — the same rules as the
  website's `checkEmailPortalAssociation`.
- Clinic app and website both call it, so the rule lives in one place.

### 4.4 Remove "last cached clinic" fallbacks after sign-in
- Dashboard, queue board, working hours, walk-in: use the clinic matching the **current session's**
  clinic id/email only; if none is cached and the network fails, show an offline message instead of
  another clinic.
- `getLastCachedClinic()`: return a clinic only if its id equals the session's clinic id (or delete the
  function once callers are updated).

### 4.5 Sign-out
- Already clears in-memory clinic/doctor caches (`signOutKeepingData`). Also make the login screen
  clear them on open, so a crash or process restore cannot leave another clinic in memory.

## 5. Same Google account case (by design)

If the **same** Google account really is a clinic account, the doctor portal refusal is the intended
"one Google account = one portal" rule. The message should say so and offer **"Use another Google
account"**, which signs out of Google (`googleSignInClient.signOut()`) and reopens the account picker.

## 6. Tests

| Case | Expected |
|---|---|
| Clinic A signs in, signs out; new Google account (no clinic/doctor) → Doctor portal | allowed to register/sign in as doctor |
| Same as above → Clinic portal | goes to clinic **registration**, never to clinic A's dashboard |
| Pending-verification resume with a different email | does not open clinic A |
| Clinic A's own Google account → Doctor portal | refused (by design), "Use another Google account" offered |
| Doctor account → Clinic portal | refused (existing rule) |
| Network off during check | "Could not verify…", no block, no sign-in |
| Clinic list screens opened before sign-out (memory full of clinics) | no effect on the next login |
| Unit tests for `getClinicByEmail`: server row / no row / error | `Found` / `NotFound` / `Unknown` |

## 7. Rollout

1. Clinic app release with §4.1, §4.2, §4.4, §4.5 (fixes the bug and the possible wrong sign-in).
2. `get_account_portal` migration + switch clinic app and website to it (§4.3).
3. Until the release is out: on shared clinic phones, after signing out a clinic, **clear the app's
   storage** (Android Settings → Apps → Dactor Clinic → Storage → Clear) before another person signs in.
