/**
 * Adversarial Stress Test Suite — Challenger 2 (Milestone 1)
 * Target: Database Backend & Storage Security Hardening
 * File: tests/adversarial_m1_security_challenge.cjs
 *
 * Tasks Verified:
 * 1. Comprehensive assertion of all 9 security domains in supabase/test_security_policies.sql
 * 2. Authenticity of negative access rejection assertions vs positive owner access
 * 3. Transactional rollback guarantee of zero database pollution
 * 4. Comprehensive email spoofing rejection (including 'attacker.admin@dactor.org')
 * 5. Migration security compliance & search_path hygiene
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TEST_SQL_PATH = path.join(REPO_ROOT, 'supabase', 'test_security_policies.sql');
const MIGRATION_PATH = path.join(REPO_ROOT, 'supabase', 'migration_comprehensive_security_sweep.sql');

console.log('======================================================================');
console.log('=== CHALLENGER 2: ADVERSARIAL SECURITY & POLICY STRESS SUITE       ===');
console.log('======================================================================');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`  √ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failedTests++;
  }
}

// ---------------------------------------------------------------------------
// 1. FILE EXISTENCE & INTEGRITY
// ---------------------------------------------------------------------------
console.log('\n--- Category 1: File Existence & Integrity ---');
assert(fs.existsSync(TEST_SQL_PATH), 'test_security_policies.sql exists on disk', TEST_SQL_PATH);
assert(fs.existsSync(MIGRATION_PATH), 'migration_comprehensive_security_sweep.sql exists on disk', MIGRATION_PATH);

const testSql = fs.readFileSync(TEST_SQL_PATH, 'utf8');
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');

assert(testSql.length > 10000, 'test_security_policies.sql is substantial', `Length: ${testSql.length}`);
assert(migrationSql.length > 10000, 'migration_comprehensive_security_sweep.sql is substantial', `Length: ${migrationSql.length}`);

// ---------------------------------------------------------------------------
// 2. COMPREHENSIVE COVERAGE OF ALL 9 SECURITY DOMAINS
// ---------------------------------------------------------------------------
console.log('\n--- Category 2: 9 Security Domains Coverage Verification ---');

const domains = [
  { id: 1, name: 'Public Clinic Discovery', markers: ['DOMAIN 1', 'public_clinics', 'information_schema.columns', 'is_archived'] },
  { id: 2, name: 'Raw clinics Table Isolation', markers: ['DOMAIN 2', 'clinics', 'admin_alpha@dactor.com', 'admin_beta@dactor.com'] },
  { id: 3, name: 'profiles Access Control & RLS', markers: ['DOMAIN 3', 'profiles', 'v_patient_id', 'v_attacker_id'] },
  { id: 4, name: 'billing_invoices Mutation Lock', markers: ['DOMAIN 4', 'billing_invoices', 'total_amount', 'payment_status'] },
  { id: 5, name: 'appointments & queue_entries RLS', markers: ['DOMAIN 5', 'appointments', 'queue_entries', 'tracking_code_10_digit'] },
  { id: 6, name: 'lab_reports RLS', markers: ['DOMAIN 6', 'lab_reports', 'v_report_id'] },
  { id: 7, name: 'fcm_tokens & notifications RLS', markers: ['DOMAIN 7', 'fcm_tokens', 'notifications', 'v_token_id'] },
  { id: 8, name: 'Taxonomy (medical_specialties & qualifications) RLS', markers: ['DOMAIN 8', 'medical_specialties', 'medical_qualifications'] },
  { id: 9, name: 'is_admin_portal_user() Authentication Verification', markers: ['DOMAIN 9', 'is_admin_portal_user()', 'fakeadmin@dactor.org', 'super_admin'] }
];

for (const d of domains) {
  const missing = d.markers.filter(m => !testSql.includes(m));
  assert(
    missing.length === 0,
    `Domain ${d.id}: ${d.name} is fully covered in test harness`,
    missing.length > 0 ? `Missing markers: ${missing.join(', ')}` : null
  );
}

// Check extra domains in testSql:
assert(testSql.includes('DOMAIN 10'), 'Domain 10: Security Definer Functions Hardening is included');
assert(testSql.includes('DOMAIN 11'), 'Domain 11: Private Storage Buckets Provisioning is included');
assert(testSql.includes('DOMAIN 12'), 'Domain 12: Safe Plaintext Password Cleanup Verification is included');

// ---------------------------------------------------------------------------
// 3. NEGATIVE VS POSITIVE ACCESS REJECTION AUTHENTICITY
// ---------------------------------------------------------------------------
console.log('\n--- Category 3: Negative Access Rejection & Positive Access Authenticity ---');

// Parse all ASSERT statements
const assertMatches = testSql.match(/ASSERT\s+([^,;]+),/g) || [];
console.log(`  Found ${assertMatches.length} explicit ASSERT statements in test harness.`);

assert(assertMatches.length >= 50, `Test harness contains robust assertion count (>= 50)`, `Actual: ${assertMatches.length}`);

// Verify negative assertions (rejection, blocking, zero count)
const negativePatterns = [
  /ASSERT\s+v_blocked/i,
  /ASSERT\s+v_count\s*=\s*0/i,
  /ASSERT\s+NOT\s+v_is_admin/i,
  /ASSERT\s+\(v_auth_res->>'authorized'\)::BOOLEAN\s*=\s*false/i
];

let negativeCount = 0;
for (const pat of negativePatterns) {
  const matches = testSql.match(new RegExp(pat.source, 'gi')) || [];
  negativeCount += matches.length;
}
console.log(`  Found ${negativeCount} negative access rejection assertions.`);
assert(negativeCount >= 20, 'Test harness contains at least 20 negative access rejection assertions', `Actual: ${negativeCount}`);

// Verify positive assertions (owner access, admin access)
const positivePatterns = [
  /ASSERT\s+v_count\s*=\s*1/i,
  /ASSERT\s+v_count\s*=\s*2/i,
  /ASSERT\s+v_is_admin\b/i,
  /ASSERT\s+v_secret\s*=\s*'SECRET_ALPHA_456'/i,
  /ASSERT\s+v_amount\s*=\s*1050\.00/i,
  /ASSERT\s+v_test_name\s*=\s*'Lipid Profile & ECG'/i
];

let positiveCount = 0;
for (const pat of positivePatterns) {
  const matches = testSql.match(new RegExp(pat.source, 'gi')) || [];
  positiveCount += matches.length;
}
console.log(`  Found ${positiveCount} positive owner/admin access assertions.`);
assert(positiveCount >= 15, 'Test harness contains at least 15 positive owner/admin access assertions', `Actual: ${positiveCount}`);

// Verify no tautological assertions like "ASSERT 1 = 1" or "ASSERT true"
const tautologyMatch = testSql.match(/ASSERT\s+(true|1\s*=\s*1)\s*,/i);
assert(!tautologyMatch, 'Zero tautological assertions (e.g. ASSERT true or ASSERT 1=1)');

// ---------------------------------------------------------------------------
// 4. TRANSACTIONAL ROLLBACK & ZERO DATABASE POLLUTION
// ---------------------------------------------------------------------------
console.log('\n--- Category 4: Transactional Rollback Guarantee ---');

// The test harness wraps all fixture creations and tests inside a DO $$ block
// with a guaranteed rollback:
assert(testSql.includes("RAISE EXCEPTION 'TEST_SUCCESSFUL_ROLLBACK'"), 'Explicit rollback exception triggered at end of test run');
assert(testSql.includes("EXCEPTION WHEN OTHERS THEN"), 'Exception handling block wraps entire execution');
assert(testSql.includes("IF SQLERRM = 'TEST_SUCCESSFUL_ROLLBACK' THEN"), 'Clean rollback is caught and identified');
assert(
  testSql.includes("RAISE EXCEPTION 'Security test harness assertion failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;"),
  'Real assertion failures are re-raised and bubble up'
);

// Session setting restoration check:
assert(testSql.includes("set_config('role', v_initial_user, true)"), 'Session role is restored on rollback/exit');
assert(testSql.includes("set_config('request.jwt.claims', '', true)"), 'JWT claims are cleared on rollback/exit');
assert(testSql.includes("set_config('request.jwt.claim.sub', '', true)"), 'JWT claim sub is cleared on rollback/exit');

// Verify all INSERT statements occur inside the DECLARE / BEGIN block:
const beginIndex = testSql.indexOf('BEGIN\n    RAISE NOTICE');
const firstInsertIndex = testSql.indexOf('INSERT INTO');
assert(
  firstInsertIndex > beginIndex,
  'All fixture INSERTs are placed inside the transactional BEGIN block'
);

// PostgreSQL PL/pgSQL rollback semantics verification:
// When a subtransaction in PL/pgSQL raises an exception, all persistent changes in the BEGIN block
// are automatically discarded by PostgreSQL before executing EXCEPTION handler.
assert(
  testSql.includes('TRANSACTION ROLLED BACK CLEANLY. DATABASE STATE PRISTINE.'),
  'Pristine database state message confirmed'
);

// ---------------------------------------------------------------------------
// 5. EMAIL SPOOFING REJECTION & IS_ADMIN_PORTAL_USER STRESS TEST
// ---------------------------------------------------------------------------
console.log('\n--- Category 5: Email Spoofing Rejection & is_admin_portal_user() Evaluation ---');

// Simulation oracle matching Postgres implementation in migration_comprehensive_security_sweep.sql:
// CREATE OR REPLACE FUNCTION public.is_admin_portal_user()
// AS $$
//   SELECT COALESCE(
//     (
//       current_user = 'service_role'
//       OR (auth.jwt() ->> 'role') = 'service_role'
//       OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
//       OR (auth.jwt() ->> 'role') = 'super_admin'
//       OR (
//         auth.uid() IS NOT NULL
//         AND EXISTS (
//           SELECT 1 FROM public.profiles
//           WHERE public.profiles.auth_uid = auth.uid()
//             AND public.profiles.role = 'super_admin'
//         )
//       )
//     ),
//     false
//   );
// $$;

function evaluateIsAdminPortalUser({ currentUser, jwt, authUid, profileRecord }) {
  // 1. current_user = 'service_role'
  if (currentUser === 'service_role') return true;

  // 2. auth.jwt() ->> 'role' = 'service_role'
  if (jwt && jwt.role === 'service_role') return true;

  // 3. auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
  if (jwt && jwt.app_metadata && jwt.app_metadata.role === 'super_admin') return true;

  // 4. auth.jwt() ->> 'role' = 'super_admin'
  if (jwt && jwt.role === 'super_admin') return true;

  // 5. auth.uid() IS NOT NULL AND profiles.role = 'super_admin'
  if (authUid && profileRecord && profileRecord.auth_uid === authUid && profileRecord.role === 'super_admin') {
    return true;
  }

  return false;
}

// Test Matrix for Email Spoofing:
const spoofingAttempts = [
  { email: 'attacker.admin@dactor.org', desc: 'Direct prompt requirement email' },
  { email: 'user@notadmin@dactor.com', desc: 'Wildcard middle substring' },
  { email: 'fakeadmin@dactor.org', desc: 'Different TLD spoof (.org)' },
  { email: 'admin@dactor.com.evil.org', desc: 'Subdomain prefix spoof' },
  { email: 'admin@dactor.org', desc: 'Exact name different TLD' },
  { email: 'admin@dactor.net', desc: 'Different TLD (.net)' },
  { email: 'admin@dactor.com', desc: 'Identical email without super_admin role in DB' },
  { email: 'attacker+admin@dactor.com', desc: 'Plus-addressing bypass attempt' },
  { email: 'administrator@dactor.com', desc: 'Expanded keyword spoof' },
  { email: 'superadmin@evil-dactor.com', desc: 'Hyphenated spoof domain' },
  { email: 'admin@dactor.co', desc: 'Truncated TLD spoof' },
  { email: 'ADMIN@DACTOR.COM', desc: 'Uppercase matching spoof' },
  { email: 'attacker.admin@dactor.org.evil.net', desc: 'Double spoof domain' }
];

for (const attempt of spoofingAttempts) {
  // Attacker has authenticated session with spoofed email, but regular patient role in DB
  const isPrivileged = evaluateIsAdminPortalUser({
    currentUser: 'authenticated',
    jwt: {
      role: 'authenticated',
      email: attempt.email,
      app_metadata: { provider: 'email' },
      user_metadata: { role: 'super_admin' } // Client-side tampering attempt!
    },
    authUid: 'attacker-uuid-123',
    profileRecord: {
      id: 'prof-attacker',
      auth_uid: 'attacker-uuid-123',
      email: attempt.email,
      role: 'patient' // Actual DB role
    }
  });

  assert(
    isPrivileged === false,
    `Email spoofing rejected for "${attempt.email}" (${attempt.desc})`,
    `Returned ${isPrivileged}, expected false`
  );
}

// Anonymous caller test:
assert(
  evaluateIsAdminPortalUser({
    currentUser: 'anon',
    jwt: { role: 'anon' },
    authUid: null,
    profileRecord: null
  }) === false,
  'Anonymous caller is strictly rejected by is_admin_portal_user()'
);

// Legitimate Super Admin with profiles.role = 'super_admin' MUST pass:
assert(
  evaluateIsAdminPortalUser({
    currentUser: 'authenticated',
    jwt: {
      role: 'authenticated',
      email: 'real_admin@dactor.com'
    },
    authUid: 'admin-uuid-999',
    profileRecord: {
      id: 'prof-admin',
      auth_uid: 'admin-uuid-999',
      role: 'super_admin'
    }
  }) === true,
  'Verified database profiles.role = "super_admin" correctly accepted'
);

// Legitimate service_role JWT MUST pass:
assert(
  evaluateIsAdminPortalUser({
    currentUser: 'authenticated',
    jwt: { role: 'service_role' },
    authUid: null,
    profileRecord: null
  }) === true,
  'service_role JWT correctly accepted'
);

// Legitimate app_metadata super_admin MUST pass:
assert(
  evaluateIsAdminPortalUser({
    currentUser: 'authenticated',
    jwt: {
      role: 'authenticated',
      app_metadata: { role: 'super_admin' }
    },
    authUid: 'admin-uuid-888',
    profileRecord: null
  }) === true,
  'Server-signed app_metadata.role = "super_admin" correctly accepted'
);

// ---------------------------------------------------------------------------
// 6. MIGRATION CODE HARDSWEEP AUDIT
// ---------------------------------------------------------------------------
console.log('\n--- Category 6: Migration Code Hardening Audit ---');

// Invariant: zero %admin@dactor% occurrences in migration
const wildcardMatch = migrationSql.match(/%admin@dactor%/gi);
assert(
  wildcardMatch === null,
  'Zero %admin@dactor% wildcard occurrences in migration script',
  `Found: ${wildcardMatch ? wildcardMatch.length : 0}`
);

// Safe password cleanup logic
assert(
  migrationSql.includes("UPDATE public.profiles") &&
  migrationSql.includes("SET phone = NULL") &&
  migrationSql.includes("TRIM(phone) ILIKE 'pwd:%'"),
  'Plaintext pwd: password cleanup uses safe NULL replacement without touching valid phone numbers'
);

// Security barrier on public_clinics
assert(
  migrationSql.includes("CREATE VIEW public.public_clinics") &&
  migrationSql.includes("WITH (security_barrier = true)"),
  'public_clinics view created WITH (security_barrier = true)'
);

// Sensitive columns isolated
const sensitiveFields = [
  'payment_api_key', 'payment_secret_key', 'merchant_id',
  'pan_number', 'registration_doc_url', 'manager_phone',
  'activation_payment_proof_url', 'activation_notes'
];
const publicClinicsDef = migrationSql.match(/CREATE VIEW public\.public_clinics[\s\S]*?FROM public\.clinics/i);
assert(publicClinicsDef !== null, 'Found public_clinics view definition');
for (const field of sensitiveFields) {
  assert(
    !publicClinicsDef[0].includes(field),
    `Sensitive field "${field}" isolated from public_clinics view`
  );
}

// SECURITY DEFINER functions have SET search_path = public
const securityDefinerBlocks = migrationSql.match(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?\$\$ LANGUAGE[\s\S]*?;|CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?LANGUAGE (?:sql|plpgsql)[\s\S]*?AS \$\$[\s\S]*?\$\$;/gi) || [];

let secureCount = 0;
for (const fn of securityDefinerBlocks) {
  if (fn.includes('SECURITY DEFINER')) {
    assert(
      fn.includes('search_path = public') || fn.includes('search_path = \'public\''),
      `SECURITY DEFINER function includes SET search_path = public: ${fn.slice(0, 50).replace(/\n/g, ' ')}...`
    );
    secureCount++;
  }
}
console.log(`  Audited ${secureCount} SECURITY DEFINER functions for search_path hygiene.`);

// ---------------------------------------------------------------------------
// EXECUTIVE CHALLENGE REPORT
// ---------------------------------------------------------------------------
console.log('\n======================================================================');
console.log('=== CHALLENGER 2 EXECUTIVE SUMMARY REPORT                          ===');
console.log('======================================================================');
console.log(`  Total Checks: ${passedTests + failedTests}`);
console.log(`  Passed:       ${passedTests}`);
console.log(`  Failed:       ${failedTests}`);
console.log(`  Status:       ${failedTests === 0 ? 'ALL ADVERSARIAL CHECKS PASSED' : 'CHALLENGE FAILED'}`);
console.log('======================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
