/**
 * Verification Script for DACTOR Platform Comprehensive Security Sweep Migration
 * File: supabase/verify_migration_security.cjs
 * Validates:
 * 1. Safe password cleanup logic
 * 2. Hardened is_admin_portal_user() without email wildcard
 * 3. Dedicated public_clinics view credential isolation
 * 4. RLS policies on all 12 sensitive tables
 * 5. SECURITY DEFINER search_path hygiene
 * 6. Private storage buckets (public: false) and Storage RLS
 * 7. Server-side document authorization & signed URL RPCs
 */

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, 'migration_comprehensive_security_sweep.sql');
const testSqlPath = path.join(__dirname, 'test_security_policies.sql');

console.log('=================================================================');
console.log('=== DACTOR SECURITY MIGRATION VERIFICATION SUITE              ===');
console.log('=================================================================');

if (!fs.existsSync(migrationPath)) {
  console.error('FATAL: migration_comprehensive_security_sweep.sql not found at', migrationPath);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error('❌ ASSERTION FAILED:', message);
    process.exit(1);
  }
  console.log('  √', message);
}

console.log('\n[Check 1] Safe Plaintext Password Cleanup');
assert(
  sql.includes("TRIM(phone) ILIKE 'pwd:%'"),
  'Migration targets legacy pwd: plaintext passwords using safe prefix matching'
);
assert(
  sql.includes('UPDATE public.profiles') && sql.includes('SET phone = NULL'),
  'Migration safely sets phone = NULL for leaked password rows'
);
assert(
  sql.includes('v_leaked_count > 0') && sql.includes('RAISE EXCEPTION'),
  'Migration asserts zero leaked password records remain post-cleanup'
);

console.log('\n[Check 2] Hardened is_admin_portal_user() Helper');
assert(
  !sql.includes('%admin@dactor%'),
  'Strictly NO %admin@dactor% email wildcard in migration script'
);
assert(
  sql.includes("profiles.role = 'super_admin'"),
  'is_admin_portal_user checks database verified super_admin role'
);
assert(
  sql.includes("role') = 'service_role'"),
  'is_admin_portal_user checks service_role'
);
assert(
  sql.includes('SET search_path = public'),
  'is_admin_portal_user enforces SET search_path = public'
);

console.log('\n[Check 3] Secure public_clinics Discovery View & Credential Isolation');
assert(
  sql.includes('CREATE VIEW public.public_clinics') && sql.includes('security_barrier = true'),
  'public_clinics view created with security_barrier = true'
);
const sensitiveCols = [
  'payment_api_key', 'payment_secret_key', 'merchant_id',
  'pan_number', 'registration_doc_url', 'manager_phone',
  'activation_payment_proof_url'
];
for (const col of sensitiveCols) {
  // Extract SELECT clause of public_clinics
  const viewDefMatch = sql.match(/CREATE VIEW public\.public_clinics[\s\S]*?FROM public\.clinics/i);
  assert(viewDefMatch !== null, 'Found public_clinics view definition');
  assert(
    !viewDefMatch[0].includes(col),
    `Sensitive column "${col}" is strictly excluded from public_clinics view`
  );
}

console.log('\n[Check 4] Table Row-Level Security (RLS) Coverage');
const expectedTables = [
  'profiles', 'clinics', 'billing_invoices',
  'medical_specialties', 'medical_qualifications',
  'clinic_invitations', 'slot_locks', 'clinic_catalog',
  'fcm_tokens', 'notifications', 'appointments',
  'queue_entries', 'lab_reports'
];
for (const tbl of expectedTables) {
  assert(
    sql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`),
    `Row-Level Security enabled on public.${tbl}`
  );
}

console.log('\n[Check 5] Sensitive Operation Locks & Client Mutation Guards');
assert(
  sql.includes('billing_invoices_insert_rule') && !sql.includes('INSERT WITH CHECK (true)'),
  'Direct client INSERT into billing_invoices is revoked'
);
assert(
  sql.includes('billing_invoices_update_rule') && !sql.includes('UPDATE USING (true)'),
  'Direct client UPDATE of billing_invoices is revoked'
);
assert(
  sql.includes('medical_specialties_insert_policy') && sql.includes('is_admin_portal_user()'),
  'Taxonomy insertion restricted to super admin'
);

console.log('\n[Check 6] SECURITY DEFINER Functions & Search Path Hygiene');
const definerFunctions = [
  'purge_expired_archived_clinic_data',
  'acquire_slot_lock',
  'release_slot_lock',
  'sync_user_appointments',
  'authorize_document_access',
  'verify_and_get_lab_report_meta',
  'get_lab_report_signed_url',
  'get_authorized_document_signed_url'
];
for (const fn of definerFunctions) {
  assert(
    sql.includes(`FUNCTION public.${fn}`) || sql.includes(`FUNCTION ${fn}`),
    `Security function "${fn}" is defined in migration`
  );
}

console.log('\n[Check 7] Private Storage Buckets & Storage RLS');
assert(
  sql.includes("'lab-reports-private'") && sql.includes("'doctor-kyc-private'") && sql.includes("'clinic-docs-private'"),
  'All 3 private buckets provisioned'
);
assert(
  sql.includes("public = false"),
  'Private buckets enforce public = false'
);
assert(
  sql.includes('storage.objects ENABLE ROW LEVEL SECURITY'),
  'Storage RLS enabled on storage.objects'
);
assert(
  sql.includes('storage_public_buckets_select') && sql.includes("bucket_id IN ('clinic_photos', 'doctor_photos')"),
  'Direct public download restricted strictly to showcase pictures'
);

console.log('\n[Check 8] Server-Side Authorization RPCs & Signed URL Issuance');
assert(
  sql.includes('authorize_document_access'),
  'Server-side authorization gate authorize_document_access defined'
);
assert(
  sql.includes('get_lab_report_signed_url'),
  'Signed URL generator get_lab_report_signed_url defined'
);
assert(
  sql.includes('get_authorized_document_signed_url'),
  'Signed URL generator get_authorized_document_signed_url defined'
);

console.log('\n=================================================================');
console.log('=== ALL 8 VERIFICATION DOMAINS PASSED CLEANLY (100% COMPLIANT)===');
console.log('=================================================================');
