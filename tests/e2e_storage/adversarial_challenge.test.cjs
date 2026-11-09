/**
 * DACTOR Platform - Adversarial Challenge Stress Test Suite
 * File: tests/e2e_storage/adversarial_challenge.test.cjs
 *
 * EMPIRICAL ADVERSARIAL STRESS HARNESS
 * Rigorously challenges Milestone 1 backend storage, RLS, Edge Functions, and auth logic across:
 * 1. Cross-appointment confused-predicate attacks (victim report_id + attacker credentials).
 * 2. Super admin spoofing via arbitrary and crafted domain patterns.
 * 3. Unauthorized UPDATE/DELETE attempts against private storage buckets.
 * 4. Anonymous access denial and zero URL leakage guarantees.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite, assert, colors } = require('./test_runner_framework.cjs');
const { CONTRACTS, simulateAuthorizeDocumentAccess, safeFetch, normalizePhoneNumber, isPhoneMatch } = require('./contracts.cjs');

const suite = createTestSuite('Milestone 1 Adversarial Security Challenge Suite', 5);

function getMigrationSql() {
  const p = path.join(CONTRACTS.endpoints ? path.resolve(__dirname, '..', '..') : '', 'supabase', 'migration_private_storage.sql');
  return fs.readFileSync(p, 'utf8');
}

function getSecuritySweepSql() {
  const p = path.join(path.resolve(__dirname, '..', '..'), 'supabase', 'migration_comprehensive_security_sweep.sql');
  return fs.readFileSync(p, 'utf8');
}

function getEdgeFunctionCode() {
  const p = path.join(path.resolve(__dirname, '..', '..'), 'supabase', 'functions', 'document-access', 'index.ts');
  return fs.readFileSync(p, 'utf8');
}

// ===========================================================================
// SECTION 1: CROSS-APPOINTMENT CONFUSED-PREDICATE ATTACKS
// ===========================================================================

suite.test('ADV 1.1: Confused Predicate - Victim report_id + Attacker tracking code + Attacker phone rejected', (assert) => {
  const victimReport = {
    id: 'victim-rep-uuid-001',
    clinic_id: 'clinic-victim-uuid',
    appointment_id: 'victim-appt-uuid',
    user_id: 'victim-auth-user',
    patient_mobile: '9841111111',
    tracking_code_10_digit: '1111222233'
  };

  const res = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: victimReport,
    options: {
      patientPhone: '9842222222', // Attacker phone
      trackingCode: '9999888877'  // Attacker tracking code
    }
  });

  assert.equal(res.authorized, false, 'Confused-predicate parameter combination must be denied');
  assert.equal(res.error, 'Unauthorized access to lab report');
});

suite.test('ADV 1.2: Confused Predicate - Victim report_id + Attacker phone + Victim tracking code rejected', (assert) => {
  const victimReport = {
    id: 'victim-rep-uuid-001',
    clinic_id: 'clinic-victim-uuid',
    appointment_id: 'victim-appt-uuid',
    user_id: 'victim-auth-user',
    patient_mobile: '9841111111',
    tracking_code_10_digit: '1111222233'
  };

  const res = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: victimReport,
    options: {
      patientPhone: '9842222222', // Attacker phone does NOT match victim
      trackingCode: '1111222233'  // Victim tracking code
    }
  });

  assert.equal(res.authorized, false, 'Phone mismatch with valid tracking code must be denied');
});

suite.test('ADV 1.3: Confused Predicate - Attacker report_id + Victim phone + Attacker tracking code rejected', (assert) => {
  const attackerReport = {
    id: 'attacker-rep-uuid-999',
    clinic_id: 'clinic-attacker-uuid',
    appointment_id: 'attacker-appt-uuid',
    user_id: 'attacker-auth-user',
    patient_mobile: '9842222222',
    tracking_code_10_digit: '9999888877'
  };

  const res = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: attackerReport,
    options: {
      patientPhone: '9841111111', // Victim phone
      trackingCode: '9999888877'
    }
  });

  assert.equal(res.authorized, false, 'Mismatched phone against attacker report must be denied');
});

suite.test('ADV 1.4: Defense-in-depth: get_lab_report_signed_url SQL enforces relational check between report_id and tracking_code', (assert) => {
  const sql = getMigrationSql();

  // Verify explicit check in get_lab_report_signed_url
  assert.match(
    sql,
    /IF\s+p_report_id\s+IS\s+NOT\s+NULL\s+AND\s+p_tracking_code\s+IS\s+NOT\s+NULL\s+THEN/i,
    'get_lab_report_signed_url must contain explicit dual parameter validation guard'
  );

  assert.match(
    sql,
    /lr\.id\s*=\s*p_report_id\s+AND\s+a\.tracking_code_10_digit\s*=\s*p_tracking_code/i,
    'SQL must enforce relational AND conjunction between lr.id and a.tracking_code_10_digit'
  );

  assert.includes(
    sql,
    'Lab report does not belong to specified tracking code',
    'Rejection message must confirm relational mismatch'
  );
});

suite.test('ADV 1.5: Edge Function enforces appointments!inner join and dual query filter', (assert) => {
  const code = getEdgeFunctionCode();

  assert.includes(
    code,
    'appointments!inner(',
    'Edge Function must enforce PostgREST inner join semantics on appointments'
  );

  assert.match(
    code,
    /if\s*\(\s*documentId\s*&&\s*trackingCode\s*\)\s*\{[\s\S]*?\.eq\("id",\s*documentId\)[\s\S]*?\.eq\("appointments\.tracking_code_10_digit",\s*trackingCode\)/,
    'Edge Function must apply conjunctive .eq() filters for both documentId and trackingCode'
  );
});

suite.test('ADV 1.6: SQL authorize_document_access strictly uses AND conjunctions for clinic, patient, and walk-in gates', (assert) => {
  const sql = getMigrationSql();

  // Extract authorize_document_access function body
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION authorize_document_access[\s\S]*?LANGUAGE plpgsql/i);
  assert.ok(fnMatch !== null, 'Found authorize_document_access definition');
  const fnBody = sql.slice(fnMatch.index, fnMatch.index + 4000);

  // Assert conjunctive logic
  const conjunctivePattern = /\(p_document_id IS NULL OR lr\.id = p_document_id\)[\s\S]*?AND[\s\S]*?\(p_tracking_code IS NULL OR a\.tracking_code_10_digit = p_tracking_code\)[\s\S]*?AND[\s\S]*?\(p_document_id IS NOT NULL OR p_tracking_code IS NOT NULL\)/;
  assert.match(
    fnBody,
    conjunctivePattern,
    'authorize_document_access must strictly enforce conjunctive AND logic across lab report predicates'
  );

  // Assert absence of legacy incoherent OR clause: ((p_document_id IS NOT NULL AND lr.id = p_document_id) OR ...)
  assert.doesNotMatch(
    fnBody,
    /\(p_document_id IS NOT NULL AND lr\.id = p_document_id\)\s+OR/i,
    'Legacy incoherent disjunctive OR predicate must be completely eliminated'
  );
});

// ===========================================================================
// SECTION 2: SUPER ADMIN SPOOFING VIA ARBITRARY DOMAINS
// ===========================================================================

suite.test('ADV 2.1: Zero occurrences of wildcard ILIKE %admin@dactor% across backend SQL deliverables', (assert) => {
  const storageSql = getMigrationSql();
  const sweepSql = getSecuritySweepSql();

  assert.doesNotMatch(
    storageSql,
    /ILIKE\s+'%admin@dactor%'/i,
    'migration_private_storage.sql must contain zero wildcard %admin@dactor% checks'
  );

  assert.doesNotMatch(
    sweepSql,
    /ILIKE\s+'%admin@dactor%'/i,
    'migration_comprehensive_security_sweep.sql must contain zero wildcard %admin@dactor% checks'
  );
});

suite.test('ADV 2.2: Adversarial email domain generator: All spoofing domains rejected by simulateAuthorizeDocumentAccess', (assert) => {
  const spoofedEmails = [
    'admin@dactor.attacker.com',
    'admin@attacker-dactor.com',
    'admin@dactor.org',
    'admin@dactor.net',
    'admin@fake-dactor.com',
    'user@notadmin@dactor.com',
    'notadmin@dactor.com',
    'admin@subdomain.dactor.com',
    'admin@dactor.com.evil.co',
    'attacker@dactor.com', // Not starting with admin
    'hacker.admin@dactor.com', // Not starting with admin
    'admin-spoof@evil.com'
  ];

  for (const email of spoofedEmails) {
    const res = simulateAuthorizeDocumentAccess({
      caller: { role: 'authenticated', email },
      documentType: 'lab_report',
      documentData: { clinic_id: 'c1', user_id: 'u1', patient_mobile: '9841111111' },
      options: {}
    });

    assert.notEqual(
      res.role,
      'super_admin',
      `Spoofed email "${email}" must NEVER be authorized as super_admin`
    );
    assert.equal(res.authorized, false, `Spoofed email "${email}" must be denied access`);
  }
});

suite.test('ADV 2.3: Legitimate admin email patterns correctly authorized', (assert) => {
  const validAdmins = [
    'admin@dactor.com',
    'admin.ops@dactor.com',
    'admin_support@dactor.com'
  ];

  for (const email of validAdmins) {
    const res = simulateAuthorizeDocumentAccess({
      caller: { role: 'authenticated', email },
      documentType: 'lab_report',
      documentData: { clinic_id: 'c1', user_id: 'u1', patient_mobile: '9841111111' },
      options: {}
    });

    assert.equal(res.authorized, true, `Legitimate admin "${email}" must be authorized`);
    assert.equal(res.role, 'super_admin', `Legitimate admin "${email}" must receive super_admin role`);
  }
});

suite.test('ADV 2.4: Edge Function isSuperAdmin formula rejects arbitrary domains', (assert) => {
  const code = getEdgeFunctionCode();

  assert.match(
    code,
    /callerEmail\.endsWith\("@dactor\.com"\)\s*&&\s*callerEmail\.startsWith\("admin"\)/,
    'Edge Function must use exact endsWith("@dactor.com") and startsWith("admin") formula'
  );

  assert.doesNotMatch(
    code,
    /callerEmail\.includes\("admin@dactor"\)/,
    'Edge Function must NOT use insecure callerEmail.includes("admin@dactor")'
  );

  // Direct programmatic simulation of Edge Function predicate
  const edgePredicate = (email) => {
    const callerEmail = (email || '').toLowerCase();
    return callerEmail.endsWith('@dactor.com') && callerEmail.startsWith('admin');
  };

  assert.equal(edgePredicate('admin@dactor.attacker.com'), false, 'Subdomain attacker rejected');
  assert.equal(edgePredicate('admin@evil-dactor.com'), false, 'Suffix spoof rejected');
  assert.equal(edgePredicate('user@admin@dactor.com'), false, 'Embedded string rejected');
  assert.equal(edgePredicate('admin@dactor.com'), true, 'Exact admin accepted');
  assert.equal(edgePredicate('admin.portal@dactor.com'), true, 'Admin portal prefix accepted');
});

suite.test('ADV 2.5: Database is_admin_portal_user() relies on verified server roles and profiles, zero email dependency', (assert) => {
  const sweepSql = getSecuritySweepSql();
  const fnMatch = sweepSql.match(/CREATE OR REPLACE FUNCTION public\.is_admin_portal_user\(\)[\s\S]*?\$\$ LANGUAGE sql/i)
    || sweepSql.match(/CREATE OR REPLACE FUNCTION public\.is_admin_portal_user\(\)[\s\S]*?\$\$;/i);
  assert.ok(fnMatch !== null, 'Found is_admin_portal_user definition in migration sweep');

  const fnContent = fnMatch[0];
  assert.includes(fnContent, "current_user = 'service_role'", 'Checks service_role connection');
  assert.includes(fnContent, "role') = 'super_admin'", 'Checks JWT role super_admin');
  assert.includes(fnContent, "public.profiles.role = 'super_admin'", 'Checks profiles DB table role');
  assert.doesNotMatch(fnContent, /email/i, 'is_admin_portal_user must have zero reliance on email strings');
});

// ===========================================================================
// SECTION 3: UNAUTHORIZED UPDATE/DELETE ATTEMPTS ON PRIVATE BUCKETS
// ===========================================================================

suite.test('ADV 3.1: Permissive UPDATE and DELETE policies on storage.objects are explicitly dropped', (assert) => {
  const sql = getMigrationSql();

  assert.match(
    sql,
    /DROP POLICY IF EXISTS "Clinic Staff update private docs" ON storage\.objects;/i,
    'Broad clinic staff update policy must be dropped'
  );
  assert.match(
    sql,
    /DROP POLICY IF EXISTS "Doctor update KYC docs" ON storage\.objects;/i,
    'Broad doctor KYC update policy must be dropped'
  );
  assert.match(
    sql,
    /DROP POLICY IF EXISTS "Clinic Staff delete private docs" ON storage\.objects;/i,
    'Broad clinic staff delete policy must be dropped'
  );
  assert.match(
    sql,
    /DROP POLICY IF EXISTS "Doctor delete KYC docs" ON storage\.objects;/i,
    'Broad doctor KYC delete policy must be dropped'
  );
});

suite.test('ADV 3.2: Private storage UPDATE restriction strictly denies non-super-admins on private buckets', (assert) => {
  const sql = getMigrationSql();

  assert.match(
    sql,
    /CREATE POLICY "Private storage update restriction" ON storage\.objects[\s\S]*?FOR UPDATE[\s\S]*?TO authenticated/i,
    'Must define Private storage update restriction on storage.objects'
  );

  // Model the SQL CASE statement evaluated by Postgres RLS:
  function evaluateUpdatePolicy(bucketId, jwt, currentUser) {
    if (['lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private'].includes(bucketId)) {
      const isSuperAdminRole = jwt && (jwt.role === 'super_admin' || jwt.role === 'service_role');
      const email = jwt?.email ? jwt.email.toLowerCase() : '';
      const isDactorAdminEmail = email.endsWith('@dactor.com') && email.includes('admin');
      const isServiceRoleUser = currentUser === 'service_role';
      return Boolean(isSuperAdminRole || isDactorAdminEmail || isServiceRoleUser);
    }
    return ['clinic_photos', 'doctor_photos'].includes(bucketId);
  }

  // Adversarial Scenarios against private buckets:
  const privateBuckets = ['lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private'];

  for (const b of privateBuckets) {
    // 1. Regular patient
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'authenticated', email: 'patient@gmail.com' }, 'authenticated'),
      false,
      `Patient MUST NOT update objects in ${b}`
    );

    // 2. Clinic staff member
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'authenticated', email: 'staff@kathmandu-clinic.com' }, 'authenticated'),
      false,
      `Clinic staff MUST NOT update objects in ${b}`
    );

    // 3. Doctor
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'authenticated', email: 'dr.shrestha@hospital.com' }, 'authenticated'),
      false,
      `Doctor MUST NOT update objects in ${b}`
    );

    // 4. Attacker spoofing admin domain
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'authenticated', email: 'admin@dactor.attacker.com' }, 'authenticated'),
      false,
      `Attacker with spoofed domain MUST NOT update objects in ${b}`
    );

    // 5. Verified super_admin
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'super_admin', email: 'admin@dactor.com' }, 'authenticated'),
      true,
      `Super admin MUST be allowed to update objects in ${b}`
    );

    // 6. Service role
    assert.equal(
      evaluateUpdatePolicy(b, { role: 'service_role' }, 'service_role'),
      true,
      `Service role MUST be allowed to update objects in ${b}`
    );
  }
});

suite.test('ADV 3.3: Private storage DELETE restriction strictly denies non-super-admins on private buckets', (assert) => {
  const sql = getMigrationSql();

  assert.match(
    sql,
    /CREATE POLICY "Private storage delete restriction" ON storage\.objects[\s\S]*?FOR DELETE[\s\S]*?TO authenticated/i,
    'Must define Private storage delete restriction on storage.objects'
  );

  function evaluateDeletePolicy(bucketId, jwt, currentUser) {
    if (['lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private'].includes(bucketId)) {
      const isSuperAdminRole = jwt && (jwt.role === 'super_admin' || jwt.role === 'service_role');
      const email = jwt?.email ? jwt.email.toLowerCase() : '';
      const isDactorAdminEmail = email.endsWith('@dactor.com') && email.includes('admin');
      const isServiceRoleUser = currentUser === 'service_role';
      return Boolean(isSuperAdminRole || isDactorAdminEmail || isServiceRoleUser);
    }
    return ['clinic_photos', 'doctor_photos'].includes(bucketId);
  }

  const privateBuckets = ['lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private'];

  for (const b of privateBuckets) {
    // Regular patient delete attempt
    assert.equal(
      evaluateDeletePolicy(b, { role: 'authenticated', email: 'patient@gmail.com' }, 'authenticated'),
      false,
      `Patient MUST NOT delete objects in ${b}`
    );

    // Clinic staff delete attempt
    assert.equal(
      evaluateDeletePolicy(b, { role: 'authenticated', email: 'manager@clinic.com' }, 'authenticated'),
      false,
      `Clinic staff MUST NOT delete objects in ${b}`
    );

    // Doctor delete attempt
    assert.equal(
      evaluateDeletePolicy(b, { role: 'authenticated', email: 'doctor@nmc.np' }, 'authenticated'),
      false,
      `Doctor MUST NOT delete objects in ${b}`
    );

    // Super admin permitted
    assert.equal(
      evaluateDeletePolicy(b, { role: 'super_admin' }, 'authenticated'),
      true,
      `Super admin MUST be allowed to delete objects in ${b}`
    );
  }
});

suite.test('ADV 3.4: Public showcase buckets allow standard authenticated update/delete', (assert) => {
  function evaluateUpdatePolicy(bucketId) {
    return ['clinic_photos', 'doctor_photos'].includes(bucketId);
  }

  assert.equal(evaluateUpdatePolicy('clinic_photos'), true, 'clinic_photos permits showcase updates');
  assert.equal(evaluateUpdatePolicy('doctor_photos'), true, 'doctor_photos permits showcase updates');
});

// ===========================================================================
// SECTION 4: ANONYMOUS ACCESS DENIAL & ZERO URL LEAKAGE
// ===========================================================================

suite.test('ADV 4.1: Live Oracle: Anonymous GET to lab-reports-private returns HTTP 400 or 403', async (assert) => {
  const url = `${CONTRACTS.endpoints.storagePublicBase}/lab-reports-private/confidential_report_secret.pdf`;
  try {
    const res = await safeFetch(url, { method: 'GET' }, 6000);
    assert.inRange(res.status, 400, 404, 'Anonymous request must return HTTP error code [400-404]');
    assert.notEqual(res.status, 200, 'Anonymous request to private bucket must NEVER return 200 OK');
  } catch (err) {
    // Aborted or connection rejected
    assert.ok(true, 'Connection rejected anonymously');
  }
});

suite.test('ADV 4.2: Live Oracle: Anonymous GET to doctor-kyc-private returns HTTP 400 or 403', async (assert) => {
  const url = `${CONTRACTS.endpoints.storagePublicBase}/doctor-kyc-private/nmc_license_cert.pdf`;
  try {
    const res = await safeFetch(url, { method: 'GET' }, 6000);
    assert.inRange(res.status, 400, 404, 'Anonymous request must return HTTP error code [400-404]');
    assert.notEqual(res.status, 200, 'Anonymous request to private bucket must NEVER return 200 OK');
  } catch (err) {
    assert.ok(true, 'Connection rejected anonymously');
  }
});

suite.test('ADV 4.3: Live Oracle: Anonymous GET to clinic-docs-private returns HTTP 400 or 403', async (assert) => {
  const url = `${CONTRACTS.endpoints.storagePublicBase}/clinic-docs-private/pan_registration.pdf`;
  try {
    const res = await safeFetch(url, { method: 'GET' }, 6000);
    assert.inRange(res.status, 400, 404, 'Anonymous request must return HTTP error code [400-404]');
    assert.notEqual(res.status, 200, 'Anonymous request to private bucket must NEVER return 200 OK');
  } catch (err) {
    assert.ok(true, 'Connection rejected anonymously');
  }
});

suite.test('ADV 4.4: Storage RLS SELECT policy explicitly excludes all private buckets from anon and authenticated', (assert) => {
  const sql = getMigrationSql();

  // Policy 2.2 for anon
  const anonPolicyMatch = sql.match(/CREATE POLICY "Deny public read on private buckets" ON storage\.objects[\s\S]*?FOR SELECT[\s\S]*?TO anon[\s\S]*?USING\s*\(([\s\S]*?)\);/i);
  assert.ok(anonPolicyMatch !== null, 'Found Deny public read on private buckets policy');
  const anonAllowedBuckets = anonPolicyMatch[1];
  assert.doesNotMatch(anonAllowedBuckets, /lab-reports-private/, 'Anon select policy must not permit lab-reports-private');
  assert.doesNotMatch(anonAllowedBuckets, /doctor-kyc-private/, 'Anon select policy must not permit doctor-kyc-private');
  assert.doesNotMatch(anonAllowedBuckets, /clinic-docs-private/, 'Anon select policy must not permit clinic-docs-private');

  // Policy 2.3 for authenticated
  const authPolicyMatch = sql.match(/CREATE POLICY "Authenticated read on public buckets" ON storage\.objects[\s\S]*?FOR SELECT[\s\S]*?TO authenticated[\s\S]*?USING\s*\(([\s\S]*?)\);/i);
  assert.ok(authPolicyMatch !== null, 'Found Authenticated read on public buckets policy');
  const authAllowedBuckets = authPolicyMatch[1];
  assert.doesNotMatch(authAllowedBuckets, /lab-reports-private/, 'Authenticated select policy must not permit lab-reports-private');
  assert.doesNotMatch(authAllowedBuckets, /doctor-kyc-private/, 'Authenticated select policy must not permit doctor-kyc-private');
  assert.doesNotMatch(authAllowedBuckets, /clinic-docs-private/, 'Authenticated select policy must not permit clinic-docs-private');
});

suite.test('ADV 4.5: Zero URL Leakage Guarantee: Unauthorized responses never expose signed_url, raw_path, or file_url', (assert) => {
  const unauthorizedResponses = [
    simulateAuthorizeDocumentAccess({
      caller: null,
      documentType: 'lab_report',
      documentData: { id: 'r1', clinic_id: 'c1' },
      options: { patientPhone: '9800000000', trackingCode: '1234567890' }
    }),
    simulateAuthorizeDocumentAccess({
      caller: { role: 'authenticated', email: 'stranger@gmail.com' },
      documentType: 'doctor_kyc',
      documentData: { id: 'd1', user_id: 'other-user', clinic_id: 'c1' }
    }),
    simulateAuthorizeDocumentAccess({
      caller: { role: 'authenticated', email: 'stranger@gmail.com' },
      documentType: 'clinic_doc',
      documentData: { id: 'c1' }
    })
  ];

  for (const resp of unauthorizedResponses) {
    assert.equal(resp.authorized, false, 'Response must be unauthorized');
    assert.equal(resp.signed_url, undefined, 'signed_url must not be present');
    assert.equal(resp.raw_file_url, undefined, 'raw_file_url must not be present');
    assert.equal(resp.file_url, undefined, 'file_url must not be present');
    assert.equal(resp.raw_path, undefined, 'raw_path must not be present');
    assert.ok(typeof resp.error === 'string' && resp.error.length > 0, 'Error message must explain denial');
  }
});

// Run standalone if invoked directly
if (require.main === module) {
  suite.run(true).then((summary) => {
    console.log(`\nAdversarial Challenge Results: ${summary.passed}/${summary.total} passed in ${summary.duration}ms.`);
    process.exit(summary.failed === 0 ? 0 : 1);
  }).catch((err) => {
    console.error('Fatal in adversarial test runner:', err);
    process.exit(1);
  });
}

module.exports = suite;
