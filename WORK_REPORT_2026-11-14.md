# Dactor Platform — Work Report (November 13 – November 14, 2026)

**Reporting Window**: Friday, November 13, 2026 – Saturday, November 14, 2026  
**Primary Repository**: `gitversiondactor` (`origin/main`)  
**Status**: All deliverables merged, verified, and synchronized across mobile apps, backend, and web portal.

---

## 1. Executive Summary

Over the last 48 hours, engineering efforts addressed high-priority billing and payment infrastructure stability, implemented complete clinic expense and financial ledger management, hardened medical diagnostic access security, and instituted an automated **One-Way Logic Synchronization (App -> Website)** architectural policy.

---

## 2. Friday, November 13, 2026

### 2.1 Payment Infrastructure & eSewa Gateway Auto-Post Fix
* **Problem**: 
  - Payment method query failed with PostgreSQL error `record "v_creds" has no field "esewa_enabled"` (HTTP 500) during checkout initialization.
  - WebView checkout experienced infinite 302 redirect loops when redirecting through intermediate bridge handlers.
* **Solution**:
  - Replaced untyped record variables in `public.get_clinic_public_payment_methods(p_clinic_id UUID)` with explicit `public.clinic_payment_credentials%ROWTYPE` record typing.
  - Re-architected eSewa payment handling in Edge Functions (`appointment-payment/index.ts`) to directly return auto-submitting HTML forms (`buildAutoPostHtml`), eliminating bridge latency and redirect loops.
  - Standardized checkout HTML handlers in both `admin-panel/public/checkout.html` and `web-app/public/checkout.html` to request `action=get_form_payload`.
* **Key Files**:
  - `supabase/migration_fix_payment_methods_and_credentials.sql`
  - `supabase/functions/appointment-payment/index.ts`
  - `web-app/public/checkout.html`
  - `admin-panel/public/checkout.html`

### 2.2 Alphanumeric 10-Character Tracking Code Expansion
* **Problem**:
  - Tracking system was restricted strictly to numeric 10-digit codes, failing when clinics or systems generated alphanumeric tokens (e.g., `982DCE95B6`).
  - Guest/unregistered patients tracking queue positions could not perform reschedule verification.
* **Solution**:
  - Updated input sanitization and regex across `PatientMainScreen.kt` to accept `[0-9A-Z]` up to 10 characters.
  - Added uppercase fallback database querying in `AppointmentRepository.kt`.
  - Updated `QueueStatusScreen.kt` to extract patient identity from tracking metadata for guest users.
* **Key Files**:
  - `patient-app/app/src/main/java/com/dactor/patient/ui/main/PatientMainScreen.kt`
  - `patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt`
  - `patient-app/app/src/main/java/com/dactor/patient/data/repository/AppointmentRepository.kt`

### 2.3 Clinic Expense Tracking & Financial Ledger Overhaul
* **Problem**:
  - Clinic administrators were unable to track operating outflows (salaries, supplies, rent, maintenance), resulting in incomplete cash flow statements and inaccurate net profit reporting.
* **Solution**:
  - **Database**: Created `clinic_expenses` table with category constraints, receipt attachments, and Row-Level Security (RLS) in `supabase/migration_clinic_expenses.sql`.
  - **Mobile UI**: Built complete expense management inside `PaymentLogsScreen.kt` in `clinic-app`, supporting expense logging, categorization, receipt viewing, and inflow/outflow filtering.
  - **Financial Calculations**: Updated `PaymentLedgerHelper.kt` and `BillPdfDownloader.kt` to calculate and render the 4 standard financial KPIs:
    1. *Gross Collections*
    2. *Total Clinic Expenses*
    3. *Pay-at-Desk Service Commission (5%)*
    4. *Net Clinic Profit / Cash Flow*
  - **Automated Tests**: Implemented comprehensive unit tests verifying expense deduction math and edge cases.
* **Key Files**:
  - `supabase/migration_clinic_expenses.sql`
  - `clinic-app/app/src/main/java/com/dactor/clinic/data/model/ClinicExpense.kt`
  - `clinic-app/app/src/main/java/com/dactor/clinic/data/repository/BillingRepository.kt`
  - `clinic-app/app/src/main/java/com/dactor/clinic/ui/billing/PaymentLogsScreen.kt`
  - `clinic-app/app/src/main/java/com/dactor/clinic/domain/util/PaymentLedgerHelper.kt`
  - `clinic-app/app/src/main/java/com/dactor/clinic/domain/util/BillPdfDownloader.kt`
  - `clinic-app/app/src/test/java/com/dactor/clinic/domain/util/ClinicExpenseCalculationTest.kt`
  - `clinic-app/app/src/test/java/com/dactor/clinic/domain/util/PaymentLedgerHelperTest.kt`

### 2.4 Diagnostic Lab Report Security Hardening
* **Problem**:
  - Medical report URLs needed cryptographic protection and expiration guarantees to prevent unauthorized document scraping.
* **Solution**:
  - Implemented `supabase/migration_platform_security_hardening.sql` and `supabase/functions/document-access/index.ts` generating short-lived cryptographic tokens and signed URLs.
  - Added an automated end-to-end security test suite verifying authorization boundaries across clinics, doctors, and patients.
* **Key Files**:
  - `supabase/migration_platform_security_hardening.sql`
  - `supabase/functions/document-access/index.ts`
  - `tests/e2e_security/test_report_access_control.cjs`
  - `clinic-app/app/src/main/java/com/dactor/clinic/ui/labreport/LabReportScreen.kt`

---

## 3. Saturday, November 14, 2026

### 3.1 Architectural Rule: One-Way App-to-Web Logic Synchronization
* **Policy**:
  - Any feature, business logic, calculation, validation, database query, data model, or workflow introduced in mobile apps (`clinic-app` / `patient-app`) must **always** be propagated to the website (`web-app`).
  - Changes made directly to `web-app` must **never** be backported to mobile apps.
* **Implementation**:
  - Formally codified as **Mandatory Global Rule 7** across `GEMINI.md`, global agent rules, and repository configurations.

### 3.2 Web Application Parity Synchronization
* **Tracking Code Parity**:
  - Updated `web-app/src/services/db.ts` and `web-app/src/pages/PatientPortal.tsx` to accept 10-character alphanumeric uppercase codes (`/^[0-9A-Z]{10}$/i`).
  - Standardized tracking code formatting in `LabReportModal.tsx`, `LabReports.tsx`, `LiveQueue.tsx`, `LiveTrackerModal.tsx`, and `ClinicPortal.tsx`.
* **Financial Ledger & Statement Parity**:
  - Updated `web-app/src/utils/paymentLedger.ts` to support `serviceChargeAmount`, prevent double-counting Pay-at-Desk service fees, and compute exact Net Clinic Receivables for CSV exports.
  - Updated `web-app/src/utils/medicalDocPrinter.ts` to render the 4 official KPI metric cards (Gross Revenue, Total Expenses, Desk Fees, Net Profit) and dedicated expense statement tables identical to mobile's `BillPdfDownloader.kt`.
  - Updated `web-app/src/components/ClinicPaymentLogsView.tsx` with date-filtered audit periods, expense breakdown details, and transaction drawer commission reconciliations.
  - Cleaned payment metadata tags (`[PAYMENT_LOGS]...[/PAYMENT_LOGS]`) from user-facing notes and remarks.
* **Key Files**:
  - `web-app/src/services/db.ts`
  - `web-app/src/pages/PatientPortal.tsx`
  - `web-app/src/components/ClinicPaymentLogsView.tsx`
  - `web-app/src/utils/paymentLedger.ts`
  - `web-app/src/utils/medicalDocPrinter.ts`
  - `web-app/src/pages/ClinicPortal.tsx`
  - `web-app/src/pages/LabReports.tsx`
  - `web-app/src/pages/LiveQueue.tsx`

---

## 4. Git Commit History

| Commit Hash | Date & Time (NPT) | Type / Scope | Description |
| :--- | :--- | :--- | :--- |
| `6797a13` | 2026-11-14 01:39:30 | `feat(web-app)` | Sync app logic changes from yesterday and add one-way app-to-web global rule |
| `4a559c9` | 2026-11-13 14:17:12 | `feat` | Add clinic expense tracking to payment logs and financial ledger |
| `355317f` | 2026-11-13 13:29:30 | `fix(payments,patient)` | Fix eSewa auto-post form loop, public methods RPC, and alphanumeric tracking code |

---

## 5. Verification & System Health
* **Working Directory**: Clean, zero uncommitted or pending files.
* **Git Status**: Branch `main` is up-to-date with `origin/main`.
* **Database & Edge Functions**: All SQL migrations and Supabase Edge Functions tested and deployed.
