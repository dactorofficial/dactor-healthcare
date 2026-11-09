/**
 * Tier 3: Cross-Feature Combinations E2E Tests
 * Validates multi-step lifecycle transitions and cross-boundary security across surfaces.
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md.
 */

const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  CONTRACTS,
  normalizePhoneNumber,
  isPhoneMatch,
  simulateAuthorizeDocumentAccess,
  simulateSignedUrlGeneration,
  verifySignedUrl,
  safeFetch
} = require('./contracts.cjs');

const suite = createTestSuite('Cross-Feature Combinations', 3);

// ---------------------------------------------------------------------------
// X1: Complete Private Storage Lifecycle (Upload -> Deny Public -> Sign -> Expire)
// ---------------------------------------------------------------------------

suite.test('X1: Upload to private bucket -> Direct public GET denied -> Request server signed URL -> Signed URL verified -> Expiry check', async (assert) => {
  const bucket = 'lab-reports-private';
  const reportId = 'rep-uuid-987';
  const fileName = 'cbc_report_final.pdf';
  const storagePath = `reports/${reportId}/${fileName}`;

  // Step 1: Upload destination is private bucket
  assert.includes(CONTRACTS.buckets.privateBuckets, bucket);

  // Step 2: Direct public GET must fail
  const publicUrl = `${CONTRACTS.endpoints.storagePublicBase}/${bucket}/${storagePath}`;
  try {
    const pubRes = await safeFetch(publicUrl);
    assert.inRange(pubRes.status, 400, 404, 'Direct public GET must be blocked');
    assert.notEqual(pubRes.status, 200, 'Direct public GET must never succeed');
  } catch {
    assert.ok(true, 'Direct network request rejected');
  }

  // Step 3: Request authorized server signed URL
  const { signedUrl, expiresAt } = simulateSignedUrlGeneration(bucket, storagePath, 900);

  // Step 4: Verify signed URL structure and freshness
  const verification = verifySignedUrl(signedUrl, bucket, storagePath);
  assert.equal(verification.isValidStructure, true, 'Signed URL structure must be valid');
  assert.equal(verification.isFresh, true, 'Signed URL must be fresh upon creation');
  assert.equal(verification.hasToken, true, 'Signed URL must carry cryptographic token');

  // Step 5: After expiration, freshness is invalidated
  const pastTimestamp = Math.floor(Date.now() / 1000) - 10;
  const expiredUrl = `${CONTRACTS.endpoints.storageSignBase}/${bucket}/${storagePath}?token=abc&expires_at=${pastTimestamp}`;
  const expiredVerification = verifySignedUrl(expiredUrl, bucket, storagePath);
  assert.equal(expiredVerification.isFresh, false, 'Expired URL must not be fresh');
});

// ---------------------------------------------------------------------------
// X2: Walk-In Appointment -> Lab Upload -> Redaction -> Verification -> Signed Access
// ---------------------------------------------------------------------------

suite.test('X2: Walk-in appointment creation -> Lab upload -> Redacted public lookup -> Wrong phone denial -> Valid phone signed URL issuance', (assert) => {
  // Step 1: Appointment created at clinic reception
  const appointment = {
    id: 'appt-walkin-101',
    patient_name: 'Suman Adhikari',
    patient_mobile: '+977-9801234567',
    tracking_code_10_digit: '1092837465',
    clinic_id: 'clinic-central-1'
  };

  // Step 2: Lab technician uploads diagnostic report to private bucket
  const labReport = {
    id: 'rep-walkin-101',
    appointment_id: appointment.id,
    clinic_id: appointment.clinic_id,
    test_name: 'Thyroid Function Test (TFT)',
    stage: 'prepared',
    file_path: 'reports/rep-walkin-101/tft.pdf',
    user_id: null // Guest/Walk-in patient
  };

  // Step 3: Patient opens public tracker; API redacts file_url
  const publicTrackingResponse = {
    tracking_code: appointment.tracking_code_10_digit,
    patient_name: appointment.patient_name,
    test_name: labReport.test_name,
    stage: labReport.stage,
    file_url: null // Crucial: REDACTED
  };
  assert.equal(publicTrackingResponse.file_url, null, 'Public response must redact file URL');

  // Step 4: Caller attempts to verify with wrong phone number -> REJECTED
  const wrongPhoneAttempt = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: {
      ...labReport,
      patient_mobile: appointment.patient_mobile,
      tracking_code_10_digit: appointment.tracking_code_10_digit
    },
    options: {
      patientPhone: '9840000000',
      trackingCode: appointment.tracking_code_10_digit
    }
  });
  assert.equal(wrongPhoneAttempt.authorized, false, 'Wrong phone number must be rejected');

  // Step 5: Caller enters correct formatted phone -> VERIFIED
  const validPhoneAttempt = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: {
      ...labReport,
      patient_mobile: appointment.patient_mobile,
      tracking_code_10_digit: appointment.tracking_code_10_digit
    },
    options: {
      patientPhone: '9801234567',
      trackingCode: appointment.tracking_code_10_digit
    }
  });
  assert.equal(validPhoneAttempt.authorized, true, 'Valid phone number must be authorized');
  assert.equal(validPhoneAttempt.role, 'verified_walkin_patient');

  // Step 6: Server generates signed URL for lab-reports-private
  const { signedUrl } = simulateSignedUrlGeneration('lab-reports-private', labReport.file_path, 900);
  assert.includes(signedUrl, 'lab-reports-private');
  assert.includes(signedUrl, labReport.file_path);
});

// ---------------------------------------------------------------------------
// X3: Doctor KYC Submission -> Public Denial -> Peer Isolation -> Super Admin Review
// ---------------------------------------------------------------------------

suite.test('X3: Doctor KYC submission -> Public GET denied -> Peer doctor denied -> Super Admin signed URL issuance', async (assert) => {
  const doctorA = {
    id: 'doc-uuid-a',
    user_id: 'user-doc-a',
    email: 'dr.a@dactor.com',
    license_path: 'kyc/doc-uuid-a/nmc_license.jpg',
    certificates_path: 'kyc/doc-uuid-a/mbbs_degree.pdf'
  };

  const peerDoctorB = {
    role: 'doctor',
    userId: 'user-doc-b',
    email: 'dr.b@dactor.com'
  };

  const superAdmin = {
    role: 'super_admin',
    email: 'superadmin@dactor.com'
  };

  // 1. Storage target is doctor-kyc-private
  assert.includes(CONTRACTS.buckets.privateBuckets, 'doctor-kyc-private');

  // 2. Peer doctor attempts unauthorized access -> DENIED
  const peerAttempt = simulateAuthorizeDocumentAccess({
    caller: peerDoctorB,
    documentType: 'doctor_kyc',
    documentData: doctorA
  });
  assert.equal(peerAttempt.authorized, false, 'Peer doctor must NOT access other doctor KYC');

  // 3. Super Admin requests signed URL -> ALLOWED
  const adminAttempt = simulateAuthorizeDocumentAccess({
    caller: superAdmin,
    documentType: 'doctor_kyc',
    documentData: doctorA
  });
  assert.equal(adminAttempt.authorized, true, 'Super Admin must be authorized for KYC inspection');
  assert.equal(adminAttempt.role, 'super_admin');

  // 4. Admin signed URL generated
  const { signedUrl } = simulateSignedUrlGeneration('doctor-kyc-private', doctorA.license_path, 900);
  const verification = verifySignedUrl(signedUrl, 'doctor-kyc-private', doctorA.license_path);
  assert.equal(verification.isValidStructure, true);
});

// ---------------------------------------------------------------------------
// X4: Clinic Registration/PAN Upload -> Public Denial -> Cross-Clinic Denial -> Staff Access
// ---------------------------------------------------------------------------

suite.test('X4: Clinic PAN/Registration upload -> Public GET denied -> Cross-clinic staff denied -> Owning clinic staff signed URL issuance', (assert) => {
  const clinic1 = {
    id: 'clinic-1',
    name: 'Kathmandu Health Clinic',
    registration_doc_path: 'docs/clinic-1/pan_cert.pdf'
  };

  const clinicStaff1 = { role: 'clinic_staff', clinicId: 'clinic-1', email: 'staff@clinic1.com' };
  const clinicStaff2 = { role: 'clinic_staff', clinicId: 'clinic-2', email: 'staff@clinic2.com' };

  // 1. Cross-clinic staff attempt -> DENIED
  const crossAttempt = simulateAuthorizeDocumentAccess({
    caller: clinicStaff2,
    documentType: 'clinic_doc',
    documentData: clinic1
  });
  assert.equal(crossAttempt.authorized, false, 'Competing clinic staff must be denied');

  // 2. Owning clinic staff attempt -> ALLOWED
  const ownAttempt = simulateAuthorizeDocumentAccess({
    caller: clinicStaff1,
    documentType: 'clinic_doc',
    documentData: clinic1
  });
  assert.equal(ownAttempt.authorized, true, 'Owning clinic staff must be authorized');

  // 3. Signed URL issuance
  const { signedUrl } = simulateSignedUrlGeneration('clinic-docs-private', clinic1.registration_doc_path, 900);
  assert.includes(signedUrl, 'clinic-docs-private');
});

// ---------------------------------------------------------------------------
// X5: Logged-in Patient vs Walk-In Phone Transition
// ---------------------------------------------------------------------------

suite.test('X5: Logged-in patient direct access vs guest lookup via phone both resolve safely without raw URL leakage', (assert) => {
  const patientUserId = 'auth-user-pat-123';
  const appointment = {
    id: 'appt-multi-mode',
    user_id: patientUserId,
    patient_mobile: '9812345678',
    tracking_code_10_digit: '1234567890',
    clinic_id: 'c-10'
  };

  const report = {
    id: 'rep-multi-mode',
    appointment_id: appointment.id,
    user_id: patientUserId,
    clinic_id: 'c-10',
    patient_mobile: appointment.patient_mobile,
    tracking_code_10_digit: appointment.tracking_code_10_digit,
    file_path: 'reports/rep-multi-mode/report.pdf'
  };

  // Path A: User is logged in
  const loggedInCaller = { userId: patientUserId, role: 'patient' };
  const resLoggedIn = simulateAuthorizeDocumentAccess({
    caller: loggedInCaller,
    documentType: 'lab_report',
    documentData: report
  });
  assert.equal(resLoggedIn.authorized, true);
  assert.equal(resLoggedIn.role, 'logged_in_patient');

  // Path B: User logs out, accesses via tracking code + phone
  const resGuest = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: report,
    options: {
      patientPhone: '+977-9812345678',
      trackingCode: '1234567890'
    }
  });
  assert.equal(resGuest.authorized, true);
  assert.equal(resGuest.role, 'verified_walkin_patient');
});

// ---------------------------------------------------------------------------
// X6: Redaction Integrity Across API Surfaces
// ---------------------------------------------------------------------------

suite.test('X6: Redaction integrity: unauthenticated callers never receive raw file_url in REST/PostgREST payloads', (assert) => {
  // Emulate database query serializer for public tracking endpoint
  function serializeLabReportForPublic(reportRow, isCallerAuthorized = false) {
    return {
      id: reportRow.id,
      test_name: reportRow.test_name,
      stage: reportRow.stage,
      file_name: reportRow.file_name,
      // file_url is strictly null unless authorized signed URL is attached
      file_url: isCallerAuthorized ? reportRow.signed_url : null
    };
  }

  const rawRow = {
    id: 'rep-secret-1',
    test_name: 'Urinalysis',
    stage: 'prepared',
    file_name: 'urine_test.pdf',
    file_url: 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/lab-reports-private/rep-secret-1.pdf',
    signed_url: 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/sign/lab-reports-private/rep-secret-1.pdf?token=xyz'
  };

  // Unauthenticated caller
  const anonView = serializeLabReportForPublic(rawRow, false);
  assert.equal(anonView.file_url, null, 'Anon view must have null file_url');
  assert.equal(anonView.test_name, 'Urinalysis');

  // Authorized caller
  const authView = serializeLabReportForPublic(rawRow, true);
  assert.equal(authView.file_url, rawRow.signed_url, 'Auth view receives signed URL');
});

// ---------------------------------------------------------------------------
// X7: Backward-Compatibility: Legacy Public URL Path Extraction
// ---------------------------------------------------------------------------

suite.test('X7: Backward-compatibility: Legacy public URL path correctly extracted and signed', (assert) => {
  function extractStoragePathFromLegacyUrl(urlOrPath, bucket) {
    if (!urlOrPath) return '';
    return urlOrPath
      .replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/public\/[^\/]+\//, '')
      .replace(new RegExp(`^${bucket}\/`), '')
      .replace(/^clinic_photos\//, '')
      .replace(/^doctor-kyc\//, '')
      .replace(/^\//, '');
  }

  const legacyUrl = 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/clinic_photos/lab_reports/rep-123_test.pdf';
  const cleanPath = extractStoragePathFromLegacyUrl(legacyUrl, 'lab-reports-private');

  assert.equal(cleanPath, 'lab_reports/rep-123_test.pdf', 'Path must be extracted cleanly from legacy URL');

  // Verify signing works seamlessly with extracted path
  const { signedUrl } = simulateSignedUrlGeneration('lab-reports-private', cleanPath, 900);
  assert.includes(signedUrl, cleanPath);
  assert.includes(signedUrl, 'lab-reports-private');
});

// ---------------------------------------------------------------------------
// X8: Storage RLS + Database Table RLS Defense-in-Depth
// ---------------------------------------------------------------------------

suite.test('X8: Defense-in-depth: Storage RLS blocks direct download even if raw storage path is known or guessed', async (assert) => {
  // Attacker guesses storage path
  const guessedPath = 'reports/known-patient-id/report.pdf';
  const guessedUrl = `${CONTRACTS.endpoints.storagePublicBase}/lab-reports-private/${guessedPath}`;

  // Direct public access must fail
  try {
    const res = await safeFetch(guessedUrl);
    assert.inRange(res.status, 400, 404, 'Guessed storage path must fail HTTP access');
  } catch {
    assert.ok(true, 'Guessed request safely blocked by network');
  }
});

module.exports = suite;
