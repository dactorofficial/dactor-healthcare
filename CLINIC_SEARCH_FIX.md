# Changes from 2026-11-23 Session

This file covers two fixes:

1. [Clinic search in the Patient Portal](#clinic-search-fix-patient-portal-website--android-app)
2. [Pay at Desk collections not reaching Super Admin](#pay-at-desk-collections-not-reaching-super-admin)

---

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

---

# Pay at Desk Collections Not Reaching Super Admin

## The problem

When a clinic collected a Pay-at-Desk payment, the money (and Dactor's 5% commission) did not show up correctly on the Super Admin **Pay at Desk Settlements** and **Payment Logs** pages.

## Root causes

1. **"Push Bill / Settle Payment" bypassed the Pay-at-Desk logic** (clinic portal website and clinic Android app).
   For a Pay-at-Desk patient, the bill total already includes the 5% (e.g. 500 + 25 = **525**). Saving the bill wrote 525 straight into the appointment's base fee. Two things could then go wrong:
   - **The database rejected the direct write.** This happens when the clinic login doesn't match the database's clinic-staff identity checks. The write changes **0 rows with no error**, so the bill looks saved, but the appointment stays `unpaid`. Super Admin never counts it.
   - **The write went through.** The 5% trigger then charged 5% again on 525: commission **26.25** instead of 25, and total **551.25** instead of 525.
2. **The clinic app's "Collect at desk" button sent no clinic ID** to `mark_pay_at_desk_collected`. When the login wasn't matched as clinic staff, the database answered **"Access denied"**. The app then fell back to a direct write that could also silently do nothing, and still showed "✓ Collected". The website already sent the clinic ID.
3. **Super Admin pages only loaded part of the data.** Supabase returns at most 1,000 rows per request. **Payment Logs** loaded appointments *oldest first*, so once there were more than 1,000 appointments, new desk collections were never loaded or added. **Pay at Desk Settlements** had the same 1,000-row ceiling.

## Changes made

| File | Change |
|---|---|
| `web-app/src/services/db.ts` (`saveOrUpdateInvoicePayment`) | For Pay-at-Desk appointments, no longer overwrites `fee_amount` with the 5%-inclusive total. When the bill is fully paid, it calls `mark_pay_at_desk_collected` with the clinic ID. Other appointments behave as before. |
| `clinic-app/.../data/repository/BillingRepository.kt` (`saveInvoice`) | Same change for the clinic Android app's billing. |
| `clinic-app/.../data/repository/AppointmentRepository.kt` (`markPaymentCollectedAtDesk`) | Accepts the clinic ID and sends it to `mark_pay_at_desk_collected`. |
| `clinic-app/.../ui/queue/QueueBoardScreen.kt` | The "Collect at desk" button passes the current clinic ID. |
| `admin-panel/src/pages/PaymentLogs.tsx` | Loads **all** appointments in pages of 1,000 instead of only the oldest 2,500 (which Supabase cut to 1,000). |
| `admin-panel/src/pages/PayAtDeskSettlements.tsx` | Loads **all** Pay-at-Desk appointments in pages of 1,000. |

No database migration is needed. The fix uses the existing `mark_pay_at_desk_collected` RPC, which marks the appointment paid, keeps the correct 5% commission, keeps the clinic's own bill items, and writes the `PAY_AT_DESK` ledger entry.

## Verification

- ✅ Ran the repo's **real** 5% trigger and `mark_pay_at_desk_collected` SQL in a Postgres engine (PGlite), with a clinic login the database doesn't recognize as staff:

  | Path | Paid? | Commission | Counted by Super Admin |
  |---|---|---|---|
  | Old "Settle Payment", write goes through | paid | 26.25 ❌ | yes, wrong amount |
  | Old "Settle Payment", write blocked | unpaid ❌ | 25 | **no** ❌ |
  | Old clinic app "Collect" (no clinic ID) | "Access denied" ❌ | — | **no** ❌ |
  | **New** | paid ✅ | 25 ✅ | **yes** ✅ |

- ✅ Admin panel and web app type-check (`tsc --noEmit`) with no errors. The admin panel production build succeeds.
- ⚠️ **Not tested:** the clinic Android app was not compiled (no Android SDK here), and nothing was tested against the live database.

## Resolution of Remaining Items (2026-11-24)

### 1. Automated Historical Bookings Repair
- Created migration [`supabase/migration_repair_pay_at_desk_settlements.sql`](file:///c:/Users/dell/.gemini/antigravity/scratch/dactor-healthcare/supabase/migration_repair_pay_at_desk_settlements.sql) introducing `public.repair_pay_at_desk_historical_bookings()`:
  - Automatically identifies all Pay-at-Desk bookings where `billing_invoices` was marked `paid` but `appointments.payment_status` remained `unpaid`.
  - Fixes rows with "double 5%" platform commission by restoring the doctor's base fee and recalculating `service_charge_amount` and `total_amount`.
  - Re-synchronizes `billing_invoices` and `invoice_transactions` audit ledgers.
  - Returns a detailed JSON payload of repaired bookings and recovered commission.
  - Automatically runs upon migration application in Supabase.

### 2. Security Hardening for Clinic Staff Authorization
- Hardened `public.is_authorized_clinic_staff(p_clinic_id UUID)` in [`supabase/migration_repair_pay_at_desk_settlements.sql`](file:///c:/Users/dell/.gemini/antigravity/scratch/dactor-healthcare/supabase/migration_repair_pay_at_desk_settlements.sql):
  - Validates caller against `clinics.contact_email`, accepted `clinic_invitations`, `doctors` records, and user profiles (`raw_user_meta_data ->> 'clinic_id'`), plus `is_admin_portal_user()`.
  - Guarded `mark_pay_at_desk_collected(UUID, UUID)` with base fee normalization to prevent double 5% charges even on manual collections.

### 3. Super Admin Portal Settlement UI Overhaul
- Updated [`admin-panel/src/pages/PayAtDeskSettlements.tsx`](file:///c:/Users/dell/.gemini/antigravity/scratch/dactor-healthcare/admin-panel/src/pages/PayAtDeskSettlements.tsx):
  - Added **"Sync & Repair Data"** action button in top toolbar calling `repair_pay_at_desk_historical_bookings()` with an executive result banner.
  - Added **Payment Status** badges (`PAID` in emerald, `UNPAID` in amber) across both Master List (Tab 3) and Clinic Drilldown Modal.
  - Added one-click **"Mark Paid"** collection button for any unpaid booking directly from the table.
  - Added double 5% audit detection badge flagging fee discrepancies.
  - Added payment filter buttons (`All`, `Paid`, `Unpaid`) on the bookings master list.

