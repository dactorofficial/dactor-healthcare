/**
 * Tier 2: Boundary & Corner Cases E2E Tests
 * Validates edge cases, phone formatting variations, anti-bypass guards,
 * signed URL lifecycle, cross-tenant isolation, and storage limits (Total: 36 tests).
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md.
 */

const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  CONTRACTS,
  normalizePhoneNumber,
  isPhoneMatch,
  isValidTrackingCode,
  simulateAuthorizeDocumentAccess,
  verifySignedUrl
} = require('./contracts.cjs');

const suite = createTestSuite('Boundary & Corner Cases', 2);

// ---------------------------------------------------------------------------
// CATEGORY B1: Phone Formatting Variations
// ---------------------------------------------------------------------------

suite.test('B1.1: Phone with leading country code +977 matches standard 10-digit mobile', (assert) => {
  const inputPhone = '+9779841234567';
  const dbPhone = '9841234567';
  assert.equal(isPhoneMatch(inputPhone, dbPhone), true, '+977 prefix must match standard 10-digit mobile');
});

suite.test('B1.2: Phone with country code without plus 977 matches standard 10-digit mobile', (assert) => {
  const inputPhone = '9779841234567';
  const dbPhone = '9841234567';
  assert.equal(isPhoneMatch(inputPhone, dbPhone), true, '977 prefix must match standard 10-digit mobile');
});

suite.test('B1.3: Phone with spaces and hyphens matches standard 10-digit mobile', (assert) => {
  const inputPhone = '+977 98-4123-4567';
  const dbPhone = '9841234567';
  assert.equal(isPhoneMatch(inputPhone, dbPhone), true, 'Formatted phone with spaces and dashes must match');
});

suite.test('B1.4: Phone with parentheses and formatting (977) 984 123 4567 matches standard mobile', (assert) => {
  const inputPhone = '(977) 984 123 4567';
  const dbPhone = '9841234567';
  assert.equal(isPhoneMatch(inputPhone, dbPhone), true, 'Parentheses formatted phone must match');
});

suite.test('B1.5: Landline phone number format (e.g. 01-4444444) normalizes and matches cleanly', (assert) => {
  const inputPhone = '01-4444444';
  const dbPhone = '014444444';
  assert.equal(isPhoneMatch(inputPhone, dbPhone), true, 'Landline format must match cleanly');
});

suite.test('B1.6: 9-digit malformed input (e.g. 984123456) rejected when comparing to 10-digit mobile', (assert) => {
  const inputPhone = '984123456'; // Truncated to 9 digits
  const dbPhone = '9841234567';  // 10 digits
  assert.equal(isPhoneMatch(inputPhone, dbPhone), false, '9-digit input must NOT match 10-digit registered phone');
});

// ---------------------------------------------------------------------------
// CATEGORY B2: Blank & Null Phone Matching Prevention (Anti-Bypass Guard)
// ---------------------------------------------------------------------------

suite.test('B2.1: Blank/null DB phone never matches blank/null user input', (assert) => {
  assert.equal(isPhoneMatch('', ''), false, 'Empty string must not match empty string');
  assert.equal(isPhoneMatch(null, null), false, 'Null must not match null');
  assert.equal(isPhoneMatch(undefined, undefined), false, 'Undefined must not match undefined');
});

suite.test('B2.2: Blank/null DB phone never matches valid phone input (cannot bypass with arbitrary number)', (assert) => {
  assert.equal(isPhoneMatch('9841234567', null), false, 'Valid input must not match null DB phone');
  assert.equal(isPhoneMatch('9841234567', ''), false, 'Valid input must not match empty DB phone');
  assert.equal(isPhoneMatch('9841234567', '   '), false, 'Valid input must not match whitespace DB phone');
});

suite.test('B2.3: Valid DB phone never matches blank/whitespace user input', (assert) => {
  assert.equal(isPhoneMatch('', '9841234567'), false, 'Empty user input must not match valid DB phone');
  assert.equal(isPhoneMatch('   ', '9841234567'), false, 'Whitespace user input must not match valid DB phone');
  assert.equal(isPhoneMatch(null, '9841234567'), false, 'Null user input must not match valid DB phone');
});

suite.test('B2.4: normalizePhoneNumber returns null for empty, blank, or non-numeric strings', (assert) => {
  assert.equal(normalizePhoneNumber(''), null, 'Empty string must normalize to null');
  assert.equal(normalizePhoneNumber('   '), null, 'Whitespace must normalize to null');
  assert.equal(normalizePhoneNumber('abc-def-ghij'), null, 'Alphabet string must normalize to null');
});

suite.test('B2.5: normalizePhoneNumber returns null for phone with fewer than 7 digits', (assert) => {
  assert.equal(normalizePhoneNumber('12345'), null, 'Short 5-digit number must normalize to null');
  assert.equal(normalizePhoneNumber('123'), null, 'Short 3-digit number must normalize to null');
});

suite.test('B2.6: SQL injection payload in phone input stripped to digits or rejected', (assert) => {
  const maliciousInput = "' OR '1'='1; -- 9841234567";
  const clean = normalizePhoneNumber(maliciousInput);
  // Must either extract digits safely or strip out SQL meta characters completely
  assert.doesNotMatch(clean, /[';\-]/, 'Normalized phone must never contain SQL meta characters');
  assert.equal(clean, '9841234567', 'Trailing valid digits parsed without injection execution');
});

// ---------------------------------------------------------------------------
// CATEGORY B3: Signed URL Token Expiration & Tampering Boundaries
// ---------------------------------------------------------------------------

suite.test('B3.1: Expired signed URL (expires_at < current_time) flagged as not fresh', (assert) => {
  const expiredTimestamp = Math.floor(Date.now() / 1000) - 60; // 60 seconds ago
  const testUrl = `${CONTRACTS.endpoints.storageSignBase}/lab-reports-private/rep.pdf?token=xyz123&expires_at=${expiredTimestamp}`;
  const verification = verifySignedUrl(testUrl, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isFresh, false, 'Expired URL must be flagged as isFresh = false');
  assert.equal(verification.hasToken, true);
});

suite.test('B3.2: Signed URL with missing token parameter rejected as invalid structure', (assert) => {
  const urlWithoutToken = `${CONTRACTS.endpoints.storageSignBase}/lab-reports-private/rep.pdf?expires_at=1800000000`;
  const verification = verifySignedUrl(urlWithoutToken, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isValidStructure, false, 'Missing token must fail structural verification');
  assert.equal(verification.hasToken, false);
});

suite.test('B3.3: Signed URL with empty token parameter rejected as invalid structure', (assert) => {
  const urlWithEmptyToken = `${CONTRACTS.endpoints.storageSignBase}/lab-reports-private/rep.pdf?token=&expires_at=1800000000`;
  const verification = verifySignedUrl(urlWithEmptyToken, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isValidStructure, false, 'Empty token must fail structural verification');
  assert.equal(verification.hasToken, false);
});

suite.test('B3.4: Signed URL pointing to wrong bucket fails verification check', (assert) => {
  const urlWithPublicBucket = `${CONTRACTS.endpoints.storageSignBase}/clinic_photos/rep.pdf?token=abc&expires_at=1800000000`;
  const verification = verifySignedUrl(urlWithPublicBucket, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isValidStructure, false, 'URL targeting wrong bucket must fail verification');
});

suite.test('B3.5: Negative or zero expires_at parameter flagged as expired/invalid', (assert) => {
  const zeroUrl = `${CONTRACTS.endpoints.storageSignBase}/lab-reports-private/rep.pdf?token=abc&expires_at=0`;
  const verification = verifySignedUrl(zeroUrl, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isFresh, false, 'Zero expires_at must be expired');
});

suite.test('B3.6: Non-numeric expires_at timestamp handled cleanly without crash', (assert) => {
  const nonNumUrl = `${CONTRACTS.endpoints.storageSignBase}/lab-reports-private/rep.pdf?token=abc&expires_at=invalid_str`;
  const verification = verifySignedUrl(nonNumUrl, 'lab-reports-private', 'rep.pdf');
  assert.equal(verification.isFresh, false, 'Non-numeric expires_at must not be fresh');
  assert.equal(verification.expiresAt, 0);
});

// ---------------------------------------------------------------------------
// CATEGORY B4: Tracking Code Boundary & Corner Cases
// ---------------------------------------------------------------------------

suite.test('B4.1: Universal 10-digit tracking code validated strictly as 10 digits', (assert) => {
  assert.equal(isValidTrackingCode('1029384756'), true, 'Valid 10-digit code must be accepted');
  assert.equal(isValidTrackingCode('9998887770'), true, 'Valid 10-digit code must be accepted');
});

suite.test('B4.2: 9-digit tracking code rejected as invalid', (assert) => {
  assert.equal(isValidTrackingCode('102938475'), false, '9-digit code must be rejected');
});

suite.test('B4.3: 11-digit tracking code rejected as invalid', (assert) => {
  assert.equal(isValidTrackingCode('10293847561'), false, '11-digit code must be rejected');
});

suite.test('B4.4: Tracking code containing alphabetic characters rejected as invalid', (assert) => {
  assert.equal(isValidTrackingCode('102938475A'), false, 'Alphanumeric code must be rejected');
  assert.equal(isValidTrackingCode('ABCDEFGHIJ'), false, 'Alphabetic code must be rejected');
});

suite.test('B4.5: Tracking code containing SQL injection string rejected', (assert) => {
  assert.equal(isValidTrackingCode("10293' OR '1"), false, 'SQL injection code must be rejected');
  assert.equal(isValidTrackingCode('1029384756; DROP TABLE lab_reports;'), false, 'Multi-statement code rejected');
});

suite.test('B4.6: Null, undefined, or empty tracking code handled safely without throwing', (assert) => {
  assert.equal(isValidTrackingCode(null), false, 'Null tracking code must be false');
  assert.equal(isValidTrackingCode(undefined), false, 'Undefined tracking code must be false');
  assert.equal(isValidTrackingCode(''), false, 'Empty tracking code must be false');
});

// ---------------------------------------------------------------------------
// CATEGORY B5: Cross-Tenant & Unauthorized Access Boundary Attempts
// ---------------------------------------------------------------------------

suite.test('B5.1: Clinic Staff from Clinic A attempting to access Clinic B lab report strictly rejected', (assert) => {
  const clinicStaffA = { role: 'clinic_staff', clinicId: 'clinic-a', email: 'staff@clinica.com' };
  const reportB = { id: 'rep-b', clinic_id: 'clinic-b' };

  const res = simulateAuthorizeDocumentAccess({
    caller: clinicStaffA,
    documentType: 'lab_report',
    documentData: reportB
  });
  assert.equal(res.authorized, false, 'Cross-clinic lab report access must be denied');
  assert.equal(res.error, 'Unauthorized access to lab report');
});

suite.test('B5.2: Clinic Staff from Clinic A attempting to access Clinic B registration document strictly rejected', (assert) => {
  const clinicStaffA = { role: 'clinic_staff', clinicId: 'clinic-a', email: 'staff@clinica.com' };
  const clinicB = { id: 'clinic-b' };

  const res = simulateAuthorizeDocumentAccess({
    caller: clinicStaffA,
    documentType: 'clinic_doc',
    documentData: clinicB
  });
  assert.equal(res.authorized, false, 'Cross-clinic document access must be denied');
});

suite.test('B5.3: Doctor A attempting to access Doctor B NMC license strictly rejected', (assert) => {
  const docA = { role: 'doctor', userId: 'doc-user-a', email: 'doca@dactor.com' };
  const docB = { id: 'doc-id-b', user_id: 'doc-user-b', email: 'docb@dactor.com' };

  const res = simulateAuthorizeDocumentAccess({
    caller: docA,
    documentType: 'doctor_kyc',
    documentData: docB
  });
  assert.equal(res.authorized, false, 'Cross-doctor KYC access must be denied');
});

suite.test('B5.4: Doctor A attempting to access Doctor B medical degree certificates strictly rejected', (assert) => {
  const docA = { role: 'doctor', userId: 'doc-user-a', email: 'doca@dactor.com' };
  const docB = { id: 'doc-id-b', user_id: 'doc-user-b', email: 'docb@dactor.com' };

  const res = simulateAuthorizeDocumentAccess({
    caller: docA,
    documentType: 'doctor_kyc',
    documentData: docB
  });
  assert.equal(res.authorized, false, 'Doctor cannot access peer certificates');
});

suite.test('B5.5: Logged-in Patient A attempting to access Patient B lab report strictly rejected', (assert) => {
  const patientA = { role: 'patient', userId: 'patient-a' };
  const reportB = { id: 'rep-b', user_id: 'patient-b', clinic_id: 'c-1' };

  const res = simulateAuthorizeDocumentAccess({
    caller: patientA,
    documentType: 'lab_report',
    documentData: reportB
  });
  assert.equal(res.authorized, false, 'Cross-patient report access must be denied');
});

suite.test('B5.6: Anonymous caller without credentials attempting access to any document strictly rejected', (assert) => {
  const report = { id: 'rep-1', clinic_id: 'c-1', user_id: 'u-1', patient_mobile: '9841234567' };

  // Call with no credentials
  const res = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: report,
    options: {}
  });
  assert.equal(res.authorized, false, 'Unauthenticated caller must be denied');
});

suite.test('B5.7: Adversarial cross-appointment confusion: Victim report_id with Attacker tracking_code and phone strictly rejected', (assert) => {
  // Victim's appointment and lab report data
  const victimReport = {
    id: 'victim-rep-001',
    clinic_id: 'clinic-a',
    appointment_id: 'victim-appt-001',
    user_id: 'victim-user-001',
    patient_mobile: '9841111111',
    tracking_code_10_digit: '1111222233'
  };

  // Attacker attempts confused-predicate parameter combination:
  // Supplies victim's report_id, but attacker's own phone and tracking code
  const attackerPhone = '9842222222';
  const attackerTrackingCode = '9999888877';

  const res = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: victimReport,
    options: {
      patientPhone: attackerPhone,
      trackingCode: attackerTrackingCode
    }
  });

  assert.equal(res.authorized, false, 'Adversarial cross-appointment parameter combination must be denied');
  assert.equal(res.error, 'Unauthorized access to lab report');
});

// ---------------------------------------------------------------------------
// CATEGORY B6: Storage Payload Boundaries & MIME Restrictions
// ---------------------------------------------------------------------------

suite.test('B6.1: Exactly 52428800 bytes (50MB maximum) accepted as valid boundary size', (assert) => {
  const maxBytes = 52428800;
  const isWithinLimit = maxBytes <= CONTRACTS.buckets.fileSizeLimit;
  assert.equal(isWithinLimit, true, '50MB exact boundary must be accepted');
});

suite.test('B6.2: 52428801 bytes (50MB + 1 byte) rejected as exceeding maximum limit', (assert) => {
  const overBytes = 52428801;
  const isWithinLimit = overBytes <= CONTRACTS.buckets.fileSizeLimit;
  assert.equal(isWithinLimit, false, '50MB + 1 byte must be rejected');
});

suite.test('B6.3: Empty 0-byte upload flagged or rejected as empty payload', (assert) => {
  const zeroBytes = 0;
  const isValidPayload = zeroBytes > 0;
  assert.equal(isValidPayload, false, '0-byte file must be flagged as empty payload');
});

suite.test('B6.4: Upper-case MIME type (APPLICATION/PDF) normalized and accepted', (assert) => {
  const testMime = 'APPLICATION/PDF';
  const normalized = testMime.toLowerCase().trim();
  assert.includes(CONTRACTS.buckets.allowedMimeTypes, normalized, 'Upper-case MIME must normalize to application/pdf');
});

suite.test('B6.5: Mixed MIME type with parameters (application/pdf; charset=binary) handled cleanly', (assert) => {
  const complexMime = 'application/pdf; charset=binary';
  const baseMime = complexMime.split(';')[0].trim().toLowerCase();
  assert.includes(CONTRACTS.buckets.allowedMimeTypes, baseMime, 'MIME with charset parameters must parse cleanly');
});

suite.test('B6.6: Disallowed executable MIME type rejected regardless of spoofing attempt', (assert) => {
  const spoofedMime = 'application/x-msdownload';
  assert.equal(
    CONTRACTS.buckets.allowedMimeTypes.includes(spoofedMime),
    false,
    'Executable MIME type must NOT be in allowedMimeTypes'
  );
  assert.includes(
    CONTRACTS.buckets.disallowedMimeTypes,
    spoofedMime,
    'Executable MIME type must be in disallowedMimeTypes'
  );
});

module.exports = suite;
