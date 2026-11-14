# Dactor Healthcare Platform: Comprehensive Security Audit Report

**Date:** 2026-11-14  
**Audit Standard:** Cloudflare Security Audit Methodology (`https://github.com/cloudflare/security-audit-skill`)  
**Scope:** Full Repository (`clinic-app`, `patient-app`, `web-app`, `admin-panel`, `supabase`)  
**Assessment Profile:** Standard Defensive Vulnerability Assessment (Source-First, Zero Unverified Speculative Claims)  
**Target Repository:** `dactor-healthcare` (`C:\Users\notan\Documents\gitversiondactor`)  
**Regulatory & Compliance Domain:** Healthcare / HIPAA ePHI Protection & Financial Transaction Integrity  

---

## 1. Executive Summary

A comprehensive source-code and architectural security audit was conducted across all components of the **Dactor Healthcare Platform** (`clinic-app`, `patient-app`, `web-app`, `admin-panel`, and `supabase`) using the defensive audit principles established by Cloudflare's Security Audit Framework. 

The audit identified **20 verified vulnerabilities** categorized across four severity tiers:
- **5 Critical Severity Findings**: Direct leakage of platform payment merchant private keys and banking credentials to unauthenticated users, public storage bucket exposure of patient medical lab reports, clinic gateway secrets serialized into public clinic records, unauthenticated remote push notification broadcast via Edge Function, and completely permissive RLS allowing public CRUD access to clinic financial expenses.
- **9 High Severity Findings**: Plaintext release keystore & hardcoded signing passwords in git history, R8 obfuscation disabled in release builds, unencrypted SharedPreferences for patient ePHI/invoices, database encryption passphrase fallback to plaintext, hardcoded Super Admin email authorization bypass, stored XSS in Super Admin document inspector, direct storage bucket insertion permitted for any authenticated user, client-side auth state manipulation via `localStorage` in the clinic portal, and overly permissive RLS on billing invoice transactions.
- **5 Medium Severity Findings**: Disconnected Firebase Auth vs Supabase RLS architecture, raw `clinics` table querying with `select('*')`, overly broad Android FileProvider cache mappings, custom deep links lacking App Links verification, and absence of SSL/TLS certificate pinning.
- **1 Low Severity Finding**: Missing Content Security Policy (CSP), clickjacking prevention headers, and SRI hashes in `web-app`.

Every finding in this report has been verified directly against the repository's source code, with exact file paths, line numbers, and concrete exploit chains.

---

## 2. Vulnerability Findings Summary Matrix

| ID | Title | Severity | CWE | Affected Subsystem | Primary Code Location |
|---|---|---|---|---|---|
| **VULN-01** | Platform Payment Gateway Private Keys & Secrets Exposed to Anonymous Users | **CRITICAL** | CWE-284 / CWE-798 | `supabase` | `supabase/migration_admin_payment_gateways_and_demo_mode.sql:143-146` |
| **VULN-02** | Confidential Patient Medical Lab Reports Uploaded to Public Photo Storage | **CRITICAL** | CWE-200 / CWE-359 | `clinic-app` / `supabase` | `clinic-app/app/src/main/java/com/dactor/clinic/data/repository/LabReportRepository.kt:265-283` |
| **VULN-03** | Clinic Gateway Credentials & Private Keys Serialized into Public Clinics Table | **CRITICAL** | CWE-200 / CWE-798 | `admin-panel` / `patient-app` | `admin-panel/src/pages/PaymentGateways.tsx:484-519`, `patient-app/.../ClinicRepository.kt:165` |
| **VULN-04** | Unauthenticated Remote Push Notification Broadcast via Edge Function | **CRITICAL** | CWE-284 / CWE-306 | `supabase` | `supabase/functions/send-fcm-alert/index.ts:325-343, 435-453, 553-560` |
| **VULN-05** | Public Read, Insert, Update, and Delete on Clinic Expenses Table | **CRITICAL** | CWE-284 / CWE-285 | `supabase` | `supabase/migration_clinic_expenses.sql:22-36` |
| **VULN-06** | Production Android Release Signing Keystore & Passwords Committed in Plaintext | **HIGH** | CWE-798 / CWE-522 | `shared-keystore` / mobile | `shared-keystore/dactor-upload.jks`, `clinic-app/build.gradle.kts:37-44`, `patient-app/build.gradle.kts:37-44` |
| **VULN-07** | R8 Code Obfuscation and Minification Disabled in Release Builds | **HIGH** | CWE-656 | `clinic-app` / `patient-app` | `clinic-app/app/build.gradle.kts:55`, `patient-app/app/build.gradle.kts:55` |
| **VULN-08** | Unencrypted SharedPreferences for Patient ePHI, Invoices, and Payment Sessions | **HIGH** | CWE-312 / CWE-922 | `patient-app` | `patient-app/app/src/main/java/com/dactor/patient/data/local/UserSessionManager.kt:13, 25-38` |
| **VULN-09** | Master Database Encryption Passphrase Stored in Plaintext Fallback Preferences | **HIGH** | CWE-312 / CWE-320 | `clinic-app` | `clinic-app/app/src/main/java/com/dactor/clinic/data/local/security/DatabaseKeyManager.kt:74-81, 95-97` |
| **VULN-10** | Hardcoded Super Administrator Email Authorization Bypass | **HIGH** | CWE-285 / CWE-798 | `admin-panel` | `admin-panel/src/pages/Login.tsx:61-67`, `admin-panel/src/App.tsx:113-122` |
| **VULN-11** | Stored XSS via Unsanitized `javascript:` URIs in Super Admin Document Inspector | **HIGH** | CWE-79 | `admin-panel` | `admin-panel/src/pages/DoctorKYC.tsx:161-186, 784-791` |
| **VULN-12** | Direct Storage Bucket Insertion Permitted for Any Authenticated User | **HIGH** | CWE-284 / CWE-732 | `supabase` | `supabase/migration_private_storage.sql:78-95` |
| **VULN-13** | Client-Side Auth State Manipulation via `localStorage` in Clinic Portal | **HIGH** | CWE-306 / CWE-602 | `web-app` | `web-app/src/pages/ClinicPortal.tsx:494-495, 1736-1741, 1787-1793` |
| **VULN-14** | Permissive Read and Insert RLS on Billing Invoice Transactions | **HIGH** | CWE-284 / CWE-285 | `supabase` | `supabase/migration_fix_patient_booking_and_missing_tables.sql:164-168` |
| **VULN-15** | Architectural Mismatch: Frontend Firebase Auth Disconnected from Supabase RLS | **MEDIUM** | CWE-287 / CWE-693 | `web-app` | `web-app/src/lib/supabase.ts:6-11`, `web-app/src/lib/firebase.ts:88-111` |
| **VULN-16** | Web App Queries Raw `clinics` Table with `select('*')` Instead of Sanitized View | **MEDIUM** | CWE-200 | `web-app` | `web-app/src/services/db.ts:74-89, 132-146`, `supabase/schema.sql:108-111` |
| **VULN-17** | Overly Broad FileProvider Path Mapping Exposing Entire Internal & External Cache | **MEDIUM** | CWE-22 / CWE-732 | `clinic-app` / `patient-app` | `clinic-app/.../res/xml/file_paths.xml:4-6`, `patient-app/.../res/xml/file_paths.xml:4-6` |
| **VULN-18** | Custom Deep Link Schemes Lack Cryptographic App Links Verification | **MEDIUM** | CWE-939 / CWE-926 | `patient-app` | `patient-app/app/src/main/AndroidManifest.xml:60-85` |
| **VULN-19** | Absence of SSL / TLS Certificate Pinning for Cloud APIs and Gateways | **MEDIUM** | CWE-295 | `clinic-app` / `patient-app` | `clinic-app/.../network_security_config.xml:1-10`, `patient-app/.../network_security_config.xml:1-10` |
| **VULN-20** | Missing Content Security Policy (CSP), Clickjacking Headers, and SRI Hashes | **LOW** | CWE-1021 / CWE-353 | `web-app` | `web-app/index.html:1-16, 322-323` |

---

## 3. Detailed Vulnerability Analyses

### 3.1 Critical Severity Findings

#### VULN-01: Platform Payment Gateway Private Keys & Secrets Exposed to Anonymous Users
- **Severity**: Critical (CVSS: 9.8)
- **CWE**: CWE-284 (Improper Access Control), CWE-798 (Use of Hard-coded Credentials)
- **Affected Subsystem**: `supabase`
- **Location**: `supabase/migration_admin_payment_gateways_and_demo_mode.sql:143-146`
- **Source Trace**:
  ```sql
  DROP POLICY IF EXISTS "Allow select platform_payment_settings" ON public.platform_payment_settings;
  CREATE POLICY "Allow select platform_payment_settings" ON public.platform_payment_settings
      FOR SELECT TO anon, authenticated, service_role
      USING (true);
  ```
- **Vulnerability Details**: Lines 78–130 define the default record in `platform_payment_settings`, storing raw production and sandbox configurations in `platform_gateways JSONB`, including:
  - eSewa `secret_key` (`"8gBm/:&EnhH.1/q"`)
  - Khalti `public_key` and `secret_key` (`"test_secret_key_f59e8b7d18b2499f886f23e7e073c7f5"`)
  - Fonepay `merchant_id`, `secret_key`, `username`, `password`
  - ConnectIPS `merchant_id`, `app_id`, `app_name`, `app_password`, `private_key_pem`, `pfx_base64`, `pfx_password`
  Because `anon` is granted unconditional SELECT access, any client possessing the public Supabase anon key can query:
  `supabase.from('platform_payment_settings').select('*')` and exfiltrate all platform payment credentials.
- **Impact**: Full compromise of platform payment processing, financial fraud via forged payment callbacks, and unauthorized fund settlements.
- **Remediation**:
  1. Revoke `SELECT` permissions on `platform_payment_settings` for `anon` and non-admin `authenticated` roles.
  2. Migrate secret keys and certificates to encrypted environment variables within Supabase Edge Functions or Supabase Vault.

---

#### VULN-02: Confidential Patient Medical Lab Reports Uploaded to Public Photo Storage
- **Severity**: Critical (CVSS: 9.1)
- **CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor), CWE-359 (Exposure of Private Personal Information)
- **Affected Subsystem**: `clinic-app` / `supabase`
- **Location**: `clinic-app/app/src/main/java/com/dactor/clinic/data/repository/LabReportRepository.kt:265-283`
- **Source Trace**:
  ```kotlin
  suspend fun uploadReportDocument(reportId: String, fileName: String, bytes: ByteArray): String? = withContext(Dispatchers.IO) {
      val candidateBuckets = listOf("clinic_photos", "doctor_photos")
      val compressed = com.dactor.clinic.domain.util.FileCompressor.compressBytes(bytes, fileName)
      val cleanName = compressed.fileName.replace("\\s+".toRegex(), "_")
      val path = "lab_reports/${reportId}_$cleanName"
      for (bName in candidateBuckets) {
          try {
              val bucket = supabaseClient.storage[bName]
              bucket.upload(path, compressed.bytes, upsert = true)
              val url = bucket.publicUrl(path)
              if (!url.isNullOrBlank()) {
                  return@withContext url
              }
  ```
- **Vulnerability Details**: `uploadReportDocument` uploads patient diagnostic reports to `clinic_photos` or `doctor_photos`. In `supabase/migration_private_storage.sql:58-63`, these buckets are explicitly public image repositories with unauthenticated read access. The resulting URL is generated via `bucket.publicUrl(path)`, exposing confidential pathology tests, bloodwork, and medical reports to the open internet.
- **Impact**: Severe HIPAA ePHI breach and medical confidentiality violation. Unauthenticated third parties can view and download patient medical diagnostic records without authorization.
- **Remediation**:
  1. Retarget upload operations strictly to `lab-reports-private`.
  2. Require access to go through the `document-access` Edge Function or generated signed URLs with short expiration periods (e.g., 5 minutes).
  3. Purge existing medical reports from public photo buckets.

---

#### VULN-03: Clinic Gateway Credentials & Private Keys Serialized into Public Clinics Table
- **Severity**: Critical (CVSS: 9.3)
- **CWE**: CWE-200 (Exposure of Sensitive Information), CWE-798 (Use of Hard-coded Credentials)
- **Affected Subsystem**: `admin-panel` / `patient-app`
- **Location**: `admin-panel/src/pages/PaymentGateways.tsx:484-519`, `patient-app/app/src/main/java/com/dactor/patient/data/repository/ClinicRepository.kt:165`
- **Source Trace**:
  ```typescript
  // PaymentGateways.tsx:496-517
  meta.payment_gateways_json = gatewaysJsonStr
  meta.payment_secret_key = primaryItem.secret_key || null
  packedDesc = JSON.stringify(meta)

  await supabase.from('clinics').update({
      description: packedDesc,
      payment_secret_key: primaryItem.secret_key || null,
  }).eq('id', selectedClinicId)
  ```
  ```kotlin
  // ClinicRepository.kt:165-168
  val list = supabaseClient.postgrest["clinics"].select().decodeList<Clinic>().map { enrichClinic(it) }
  ```
- **Vulnerability Details**: Because the `clinic_payment_credentials` table update was restricted to `service_role`, the admin panel falls back to packing gateway configurations into `clinics.description` and updating `clinics.payment_secret_key`. However, `clinics` is queried publicly by patients during discovery, exposing clinic payment secret keys, merchant IDs, and ConnectIPS certificates to all mobile and web clients.
- **Impact**: Exfiltration of individual clinic merchant banking credentials and payment processing keys.
- **Remediation**:
  1. Remove `payment_secret_key` and serialized credentials from `clinics.description`.
  2. Route clinic gateway credential management through a secure backend RPC or Edge Function restricted to verified clinic administrators.

---

#### VULN-04: Unauthenticated Remote Push Notification Broadcast via Edge Function
- **Severity**: Critical (CVSS: 9.1)
- **CWE**: CWE-284 (Improper Access Control), CWE-306 (Missing Authentication for Critical Function)
- **Affected Subsystem**: `supabase` Edge Functions
- **Location**: `supabase/functions/send-fcm-alert/index.ts:325-343, 435-453, 553-560`
- **Source Trace**:
  ```typescript
  if (!authorized && clinicId) {
    const callerEmail = typeof body?.clinicEmail === "string" ? body.clinicEmail.trim().toLowerCase() : "";
    if (callerEmail) {
      // checks email match
    } else {
      const { data: clinicRow } = await service
        .from("clinics")
        .select("id")
        .eq("id", clinicId)
        .maybeSingle();
      if (clinicRow) authorized = true;
    }
  }
  ```
- **Vulnerability Details**: When invoking `send-fcm-alert`, if `callerEmail` is omitted or empty, the authorization logic checks only if the clinic exists in the database using `SUPABASE_SERVICE_ROLE_KEY`. Because clinic UUIDs are public, any unauthenticated attacker with the public anon key can supply a valid `clinicId` and trigger global broadcasts (Scenario 0), clinic broadcasts (Scenario 1), or targeted appointment notifications (Scenario 2).
- **Impact**: Platform-wide notification spam, spoofed clinical alerts, mass phishing dispatch, and denial of service via Firebase quota exhaustion.
- **Remediation**:
  1. Eliminate the `else` branch that grants authorization solely on clinic ID existence.
  2. Require verified JWT authentication from Supabase Auth and verify that `auth.uid()` corresponds to the verified clinic manager or platform admin.

---

#### VULN-05: Public Read, Insert, Update, and Delete on Clinic Expenses Table
- **Severity**: Critical (CVSS: 9.1)
- **CWE**: CWE-284 (Improper Access Control), CWE-285 (Improper Authorization)
- **Affected Subsystem**: `supabase`
- **Location**: `supabase/migration_clinic_expenses.sql:22-36`
- **Source Trace**:
  ```sql
  ALTER TABLE public.clinic_expenses ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Public read clinic_expenses" ON public.clinic_expenses FOR SELECT USING (true);
  CREATE POLICY "Allow insert to clinic_expenses" ON public.clinic_expenses FOR INSERT WITH CHECK (true);
  CREATE POLICY "Allow update to clinic_expenses" ON public.clinic_expenses FOR UPDATE USING (true);
  CREATE POLICY "Allow delete to clinic_expenses" ON public.clinic_expenses FOR DELETE USING (true);
  ```
- **Vulnerability Details**: `clinic_expenses` records confidential clinic operational expenditures (`title`, `amount`, `payment_method`, `voucher_number`, `remarks`). RLS policies grant unrestricted SELECT, INSERT, UPDATE, and DELETE permissions to the public `anon` role. These policies were not restricted in subsequent hardening sweeps.
- **Impact**: Any unauthenticated actor can extract financial bookkeeping data across all clinics, alter expense ledgers, insert fraudulent vouchers, or delete all expense records.
- **Remediation**:
  1. Replace permissive policies with scoped policies checking clinic affiliation:
     `auth.jwt() ->> 'email' IN (SELECT email FROM clinics WHERE id = clinic_id)`.
  2. Disallow anonymous access completely (`TO authenticated`).

---

### 3.2 High Severity Findings

#### VULN-06: Production Android Release Signing Keystore & Passwords Committed in Plaintext
- **Severity**: High (CVSS: 7.5)
- **CWE**: CWE-798 (Use of Hard-coded Credentials), CWE-522 (Insufficiently Protected Credentials)
- **Affected Subsystem**: `shared-keystore` / mobile build configurations
- **Location**: `shared-keystore/dactor-upload.jks`, `clinic-app/app/build.gradle.kts:37-44`, `patient-app/app/build.gradle.kts:37-44`
- **Vulnerability Details**: The production Play Store release upload signing keystore `dactor-upload.jks` and credentials (`storePassword = "DactorUpload2026!"`, `keyPassword = "DactorUpload2026!"`) are committed directly to the git repository.
- **Impact**: Any individual with access to source control or historical commits can sign malicious APK updates impersonating official Dactor applications.
- **Remediation**: Remove `dactor-upload.jks` from version control, rotate the upload key with Google Play App Signing, and inject signing credentials via CI/CD secrets or local `gradle.properties`.

---

#### VULN-07: R8 Code Obfuscation and Minification Disabled in Release Builds
- **Severity**: High (CVSS: 7.2)
- **CWE**: CWE-656 (Reliance on Security through Obscurity)
- **Affected Subsystem**: `clinic-app` / `patient-app`
- **Location**: `clinic-app/app/build.gradle.kts:55`, `patient-app/app/build.gradle.kts:55`
- **Vulnerability Details**: Release build types specify `isMinifyEnabled = false`. Decompiled APKs and AABs produced by the build system expose unobfuscated class names, methods, internal cryptographic schemes, and endpoint definitions.
- **Impact**: Facilitates automated reverse engineering, vulnerability extraction, and API abuse by malicious actors.
- **Remediation**: Enable R8 minification (`isMinifyEnabled = true`) and configure proper ProGuard rules (`proguard-rules.pro`).

---

#### VULN-08: Unencrypted SharedPreferences for Patient ePHI, Invoices, and Payment Sessions
- **Severity**: High (CVSS: 7.4)
- **CWE**: CWE-312 (Cleartext Storage of Sensitive Information), CWE-922 (Insecure Storage of Sensitive Information)
- **Affected Subsystem**: `patient-app`
- **Location**: `patient-app/app/src/main/java/com/dactor/patient/data/local/UserSessionManager.kt:13, 25-38`
- **Vulnerability Details**: `UserSessionManager` stores full patient identities (name, phone, email, gender, age), appointment histories, invoice records, and active payment session identifiers in unencrypted `SharedPreferences` (`dactor_patient_session.xml`).
- **Impact**: Rooted devices, ADB backup extraction, or malware with local storage access can harvest unencrypted patient health and financial records.
- **Remediation**: Migrate patient session storage to `EncryptedSharedPreferences` backed by Android Keystore `MasterKey`.

---

#### VULN-09: Master Database Encryption Passphrase Stored in Plaintext Fallback Preferences
- **Severity**: High (CVSS: 7.5)
- **CWE**: CWE-312 (Cleartext Storage of Sensitive Information), CWE-320 (Key Management Errors)
- **Affected Subsystem**: `clinic-app`
- **Location**: `clinic-app/app/src/main/java/com/dactor/clinic/data/local/security/DatabaseKeyManager.kt:74-81, 95-97`
- **Vulnerability Details**: When Android Keystore or `EncryptedSharedPreferences` fails, `DatabaseKeyManager` writes the raw 256-bit AES encryption passphrase for SQLCipher into an unencrypted preference file `dactor_vault_db_sec_fb.xml`.
- **Impact**: Defeats SQLCipher local database encryption at rest on devices where fallback is triggered.
- **Remediation**: Remove plaintext preference fallback. Implement biometric key derivation or PBKDF2/Argon2 passphrase derivation.

---

#### VULN-10: Hardcoded Super Administrator Email Authorization Bypass
- **Severity**: High (CVSS: 7.7)
- **CWE**: CWE-285 (Improper Authorization), CWE-798 (Use of Hard-coded Credentials)
- **Affected Subsystem**: `admin-panel`
- **Location**: `admin-panel/src/pages/Login.tsx:61-67`, `admin-panel/src/App.tsx:113-122`
- **Vulnerability Details**: Authentication routines contain explicit logic: `const isSuperAdminEmail = trimmedEmail === 'rajanpurbey55@gmail.com'`. If this email is matched, database role checks (`role !== 'super_admin'`) are bypassed.
- **Impact**: Single point of failure; account takeover of this email address grants unchallengeable administrative superuser status.
- **Remediation**: Remove hardcoded email strings from client bundles; enforce RBAC strictly through cryptographic Supabase JWT claims and server-side RPC checks.

---

#### VULN-11: Stored XSS via Unsanitized `javascript:` URIs in Super Admin Document Inspector
- **Severity**: High (CVSS: 7.6)
- **CWE**: CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **Affected Subsystem**: `admin-panel`
- **Location**: `admin-panel/src/pages/DoctorKYC.tsx:161-186, 784-791`
- **Vulnerability Details**: `DoctorKYC.tsx` directly binds `previewDoc.url` (populated from doctor KYC submission records) into `<a href={previewDoc.url} target="_blank">`. If an applicant submits a `javascript:` URI as their license document URL, clicking it in the admin panel executes arbitrary script in the super admin's browser.
- **Impact**: Super administrator session hijacking and full compromise of the admin console.
- **Remediation**: Validate all rendered URLs with strict protocol regex matching `^https?:\/\/` or route document viewing through `URL.createObjectURL(blob)`.

---

#### VULN-12: Direct Storage Bucket Insertion Permitted for Any Authenticated User
- **Severity**: High (CVSS: 7.1)
- **CWE**: CWE-284 (Improper Access Control), CWE-732 (Incorrect Permission Assignment for Critical Resource)
- **Affected Subsystem**: `supabase` Storage Policies
- **Location**: `supabase/migration_private_storage.sql:78-95`
- **Vulnerability Details**: PostgreSQL storage RLS policies permit any `authenticated` user (including regular patient accounts) to execute `INSERT` into `lab-reports-private`, `clinic-docs-private`, and `doctor-kyc-private` without path prefix verification or clinic ownership checks.
- **Impact**: Authenticated patients can overwrite, inject, or tamper with doctor KYC files or other clinics' private medical records.
- **Remediation**: Restrict uploads strictly to server-authorized signed URLs generated by the `document-access` Edge Function.

---

#### VULN-13: Client-Side Auth State Manipulation via `localStorage` in Clinic Portal
- **Severity**: High (CVSS: 7.4)
- **CWE**: CWE-306 (Missing Authentication for Critical Function), CWE-602 (Client-Side Enforcement of Server-Side Security)
- **Affected Subsystem**: `web-app`
- **Location**: `web-app/src/pages/ClinicPortal.tsx:494-495, 1736-1741, 1787-1793`
- **Vulnerability Details**: The web portal checks `localStorage.getItem('dactor_clinic_logged_in')` and `localStorage.getItem('dactor_clinic_email')`. Setting these values manually in DevTools causes `processLoginForEmail` to query `getClinicByEmail` and load clinic data without verifying a valid session token.
- **Impact**: Unauthorized access to clinic operational desks for clinics lacking restrictive database-level RLS.
- **Remediation**: Validate an active Supabase user session and match `auth.jwt() ->> 'email'` with the clinic manager's verified identity.

---

#### VULN-14: Permissive Read and Insert RLS on Billing Invoice Transactions
- **Severity**: High (CVSS: 7.2)
- **CWE**: CWE-284 (Improper Access Control), CWE-285 (Improper Authorization)
- **Affected Subsystem**: `supabase`
- **Location**: `supabase/migration_fix_patient_booking_and_missing_tables.sql:164-168`
- **Vulnerability Details**: `invoice_transactions` has policies granting `USING (true)` for SELECT and `WITH CHECK (true)` for INSERT. Unauthenticated callers can exfiltrate financial ledger transactions across all clinics and insert forged payment transaction logs.
- **Impact**: Exposure of financial transaction details and falsification of payment records.
- **Remediation**: Restrict SELECT and INSERT to authenticated staff belonging to the clinic associated with the parent invoice.

---

### 3.3 Medium & Low Severity Findings

#### VULN-15: Architectural Mismatch: Frontend Firebase Auth Disconnected from Supabase RLS
- **Severity**: Medium (CVSS: 6.5)
- **CWE**: CWE-287 (Improper Authentication), CWE-693 (Protection Mechanism Failure)
- **Affected Subsystem**: `web-app`
- **Location**: `web-app/src/lib/supabase.ts:6-11`, `web-app/src/lib/firebase.ts:88-111`
- **Vulnerability Details**: The frontend authenticates users via Firebase Google Auth dialogs, but the resulting token is never passed to Supabase (`supabase.auth.setSession` is never invoked). Supabase operates under the `anon` role, causing RLS policies checking `auth.jwt()` to fail and driving reliance on permissive workarounds.
- **Remediation**: Implement Firebase third-party auth exchange or migrate web authentication to Supabase Auth.

---

#### VULN-16: Web App Queries Raw `clinics` Table with `select('*')` Instead of Sanitized View
- **Severity**: Medium (CVSS: 5.3)
- **CWE**: CWE-200 (Exposure of Sensitive Information)
- **Affected Subsystem**: `web-app`
- **Location**: `web-app/src/services/db.ts:74-89, 132-146`, `supabase/schema.sql:108-111`
- **Vulnerability Details**: Despite the existence of `public_clinics` (which strips sensitive gateway columns and PAN numbers), `db.ts` continues querying `from('clinics').select('*')` in multiple functions.
- **Remediation**: Update `db.ts` to query `public_clinics` for public discovery and booking flows.

---

#### VULN-17: Overly Broad FileProvider Path Mapping Exposing Entire Internal & External Cache
- **Severity**: Medium (CVSS: 5.5)
- **CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory), CWE-732 (Incorrect Permission Assignment)
- **Affected Subsystem**: `clinic-app` / `patient-app`
- **Location**: `clinic-app/app/src/main/res/xml/file_paths.xml:4-6`, `patient-app/app/src/main/res/xml/file_paths.xml:4-6`
- **Vulnerability Details**: Declaring `<cache-path name="cache" path="." />` and `<external-cache-path name="external_cache" path="." />` maps the root directory of the application's cache to FileProvider URIs.
- **Remediation**: Restrict `path` attributes to dedicated subdirectories (e.g., `path="documents"`).

---

#### VULN-18: Custom Deep Link Schemes Lack Cryptographic App Links Verification
- **Severity**: Medium (CVSS: 5.3)
- **CWE**: CWE-939 (Improper Authorization in Handler for Custom URL Scheme), CWE-926 (Improper Export of Android Application Components)
- **Affected Subsystem**: `patient-app`
- **Location**: `patient-app/app/src/main/AndroidManifest.xml:60-85`
- **Vulnerability Details**: `autoVerify="true"` is declared on custom schemes `dactor://` and `dactorpatient://`, which Android cannot cryptographically verify. Malicious apps on the device can register matching custom schemes to intercept intent data.
- **Remediation**: Migrate deep links to standard verified Android App Links (`https://dactor.com/...`) verified via Digital Asset Links (`assetlinks.json`).

---

#### VULN-19: Absence of SSL / TLS Certificate Pinning for Cloud APIs and Gateways
- **Severity**: Medium (CVSS: 4.8)
- **CWE**: CWE-295 (Improper Certificate Validation)
- **Affected Subsystem**: `clinic-app` / `patient-app`
- **Location**: `clinic-app/app/src/main/res/xml/network_security_config.xml:1-10`, `patient-app/app/src/main/res/xml/network_security_config.xml:1-10`
- **Vulnerability Details**: Android network security configs rely purely on system trust anchors without certificate pinning for `*.supabase.co` or payment domains.
- **Remediation**: Add certificate/public-key pinsets in `network_security_config.xml` for critical API endpoints.

---

#### VULN-20: Missing Content Security Policy (CSP), Clickjacking Headers, and SRI Hashes
- **Severity**: Low (CVSS: 3.7)
- **CWE**: CWE-1021 (Improper Restriction of Rendered UI Layers or Frames), CWE-353 (Missing Support for Integrity Check)
- **Affected Subsystem**: `web-app`
- **Location**: `web-app/index.html:1-16, 322-323`
- **Vulnerability Details**: `web-app` lacks Content-Security-Policy meta tags and framing protections (`X-Frame-Options` or `frame-ancestors`), and loads external Firebase SDK scripts without Subresource Integrity (`integrity`) hashes.
- **Remediation**: Define a strict CSP, configure anti-framing headers, and add SRI hashes for CDN scripts.

---

## 4. Remediation Roadmap

```
+----------------------------------------------------------------------------------------------------+
|                                    RECOMMENDED REMEDIATION PHASES                                  |
+----------------------------------------------------------------------------------------------------+
|  PHASE 1: IMMEDIATE CRITICAL HARDENING (Day 1 - 2)                                                 |
|  - Revoke SELECT on platform_payment_settings for anon role (VULN-01)                              |
|  - Retarget lab report uploads to lab-reports-private bucket (VULN-02)                             |
|  - Purge gateway secrets from clinics table and description JSON (VULN-03)                         |
|  - Fix send-fcm-alert Edge Function authorization logic (VULN-04)                                  |
|  - Revoke public CRUD policies on clinic_expenses and invoice_transactions (VULN-05, VULN-14)       |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|  PHASE 2: CREDENTIAL & CLIENT HYGIENE (Day 3 - 5)                                                 |
|  - Rotate Android release keystore and remove dactor-upload.jks from git (VULN-06)                 |
|  - Enable R8 minification across clinic-app and patient-app (VULN-07)                              |
|  - Migrate patient SharedPreferences to EncryptedSharedPreferences (VULN-08)                       |
|  - Remove plaintext fallback in DatabaseKeyManager (VULN-09)                                       |
|  - Eliminate hardcoded Super Admin email check in admin-panel (VULN-10)                            |
|  - Sanitize document URLs in DoctorKYC.tsx to prevent stored XSS (VULN-11)                         |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|  PHASE 3: ARCHITECTURAL SYNCHRONIZATION & DEEP LINK HARDENING (Week 2)                             |
|  - Restrict private storage bucket INSERT to service_role / signed URLs (VULN-12)                 |
|  - Replace localStorage auth check with verified Supabase session tokens (VULN-13)                 |
|  - Synchronize web-app Firebase Auth tokens with Supabase RLS (VULN-15)                             |
|  - Refactor web-app db.ts queries to use public_clinics view (VULN-16)                             |
|  - Narrow Android FileProvider paths and implement verified App Links (VULN-17, VULN-18)          |
|  - Implement SSL certificate pinning and web-app CSP / SRI headers (VULN-19, VULN-20)              |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Verification & Audit Certification

This audit was conducted by adhering to Cloudflare's Security Audit Framework standards:
- **Trace Validation**: Every finding was verified by reading actual project source files and identifying the complete flow from entrypoint to vulnerable sink.
- **Mitigating Controls Verified**: Existing database triggers, RLS policies, and utility sanitizers were examined to ensure findings were not mitigated by upstream controls.
- **No Speculative Claims**: Claims requiring non-visible runtime environments or hypothetical external factors were excluded from this confirmed inventory.

*Report compiled for Dactor Healthcare Platform repository.*
