# Clinic Search Fix: Patient Portal (Website + Android App)

**Date:** 2026-11-23
**Branch:** `claude/intelligent-faraday-989tnw`
**Commit:** `55c89bd` — fix(search): show the searched clinic first in patient portal (web + app)

## The problem

When a patient searched for a clinic by name in the Patient Portal, the clinic did not show up properly:

- The searched clinic was buried in the list, often in 4th or 5th place.
- Unrelated clinics appeared in the results. Searching "Patan Dental Clinic" listed **every** clinic.
- On the website, results were in alphabetical order rather than ordered by how well they matched.

## Root causes

The website (`web-app/src/utils/searchEngine.ts`) and the Android app (`MedicalSearchEngine.kt`) use the same search logic, so both had the same bugs.

1. **Symptom keywords matched inside other words.**
   The search checked whether a keyword appeared *anywhere* in the query:
   - "Cent**er**" contains `ent` → treated as an ENT search
   - "**Hear**t" contains `ear` → treated as an ENT search
   - "D**ent**al" contains `ent` → treated as an ENT search

   So "Kantipur Health Center" pulled in every ENT clinic.

2. **Common words matched every clinic.**
   Words such as "clinic", "polyclinic", "hospital", "health" and "center" were searched on their own. A big polyclinic got about 135 points for **each** doctor whose bio mentioned "clinic", so it scored far above the clinic the patient actually typed.

3. **The website never sorted results by score.**
   `PatientPortal.tsx` filtered the clinics but never sorted them, so they stayed in alphabetical order. The Android app did sort, but because of problem 2 the wrong clinic still came first.

## Changes made

### Website

| File | Change |
|---|---|
| `web-app/src/utils/searchEngine.ts` | Keywords now match only at the start of a word, so "center" no longer means ENT. |
| | Common words (clinic, polyclinic, hospital, health, healthcare, center, centre, care, medical, pvt, ltd, and, the, of) are ignored when the search also contains a more specific word. Searching just "polyclinic" still works. |
| | When every word typed starts a word in a clinic's name, that clinic gets +1000 points so it appears first, labelled **"Matched Clinic Name"**. Partial names work too: "everest lab" finds "Everest Diagnostic Lab". |
| | Doctor search also ignores common words, so a doctor at "City Care Polyclinic" no longer appears when you search "Sunrise Polyclinic". |
| | Changed `import { ... } from '../types'` to `import type`. This is type-only, has no runtime effect, and lets the tests run under Node. |
| `web-app/src/pages/PatientPortal.tsx` | Clinic results are now sorted by match score, best first. With an empty search the order is unchanged. |
| `web-app/tests/search/clinicNameSearch.test.ts` | **New** regression test (23 checks). |

### Android app

| File | Change |
|---|---|
| `patient-app/app/src/main/java/com/dactor/patient/util/MedicalSearchEngine.kt` | The same four logic changes as the website, so both platforms behave identically. The app already sorted by score. |
| `patient-app/app/src/test/java/com/dactor/patient/util/MedicalSearchEngineClinicNameSearchTest.kt` | **New** regression test (6 tests). |

## Results (tested with 6 sample clinics)

| Search | Before | After |
|---|---|---|
| Patan Dental Clinic | All 6 clinics, Patan 5th | Patan Dental Clinic only |
| Kantipur Health Center | 5 clinics, Kantipur 4th | Kantipur Health Center only |
| Sunrise Polyclinic | City Care listed first | Sunrise Polyclinic only |

These searches still work as before: "ent", "ear pain", "chest pain", "dentist", "child", "blood test", "polyclinic".

## Verification

- ✅ Web regression test: all 23 checks pass. On the old code, 12 checks fail.
- ✅ Android tests: 10 of 10 pass (6 new + 4 existing). All 6 new tests fail on the old code.
- ✅ Web TypeScript check (`tsc --noEmit`): no errors.
- ✅ Web production build (`vite build`): succeeds.
- ✅ Ran the real web Patient Portal in a browser against a local copy of the data and confirmed the before/after table above.

### How to run the tests

```bash
cd web-app && node --experimental-strip-types tests/search/clinicNameSearch.test.ts
```

```bash
cd patient-app && ./gradlew testDebugUnitTest --tests "com.dactor.patient.util.MedicalSearchEngine*"
```

## Changes still needed

### To ship this fix (required)

1. **Website:** merge the branch into `main` and redeploy the web app.
2. **Android app:** build a new Patient App APK/AAB, bump the version, and release it. The fix doesn't reach phones until users update the app.
3. **Test on real data:** search a few real clinic names on the live site and on a phone. This environment had no database key or Android SDK, so testing used sample data and the app's search code was run on its own rather than as a full app build.

### Known issues not fixed (outside this change)

1. **Searching just "ent" still lists unrelated clinics** such as "Kantipur Health **Cent**er" and "Patan **Dent**al Clinic", because the clinic name/description check still matches inside words. The real ENT clinic does come first. To fix it, apply the same word-start matching in the clinic name, address and description checks.
2. **Homepage search (`web-app/src/pages/Home.tsx`) doesn't sort by score.** It now gets cleaner results from the fixed search logic, but the order is still not "best match first". Add a sort by `match.score`, the same as `FindClinics.tsx`.
3. **The doctor list in the web Patient Portal isn't sorted by score.** It uses its own simple matching and keeps the original order.
4. **Clinic names in Nepali script** don't get the "Matched Clinic Name" boost, because name matching uses English letters and numbers only. This is no worse than before.
