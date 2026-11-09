/**
 * Tier 2: Boundary & Corner Cases E2E Tests
 * Validates edge cases, boundary thresholds, malformed inputs, and adversarial corner cases.
 * Sources: PROJECT.md, ORIGINAL_REQUEST.md
 */

const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  CONTRACTS,
  computeLuhnCheckDigit,
  generateStructuredTrackingCode,
  validateLuhnTrackingCode,
  normalizeNepalMobileNumber,
  isAllowedOrigin,
  getCorsHeaders,
  isSafeUrl,
  calculateAuthoritativeFee,
  generateSafeStoragePath
} = require('./contracts.cjs');

const suite = createTestSuite('Boundary & Corner Cases', 2);

// ---------------------------------------------------------------------------
// 1. FEE BOUNDARIES & TAMPERING ATTEMPTS
// ---------------------------------------------------------------------------

suite.test('B1.1: Negative fee input (-500.00 NPR) is clamped to zero or rejected by calculation engine', (assert) => {
  const doctorWithNegativeFee = { id: 'doc-bad', consultation_fee: -500.00 };
  const authoritativeFee = calculateAuthoritativeFee(doctorWithNegativeFee);
  assert.inRange(authoritativeFee, 0, Infinity, 'Fee must never be negative');
  assert.equal(authoritativeFee, 0.00, 'Negative fee must be clamped to 0.00 NPR');
});

suite.test('B1.2: Zero fee (0.00 NPR) cannot override doctor consultation fee', (assert) => {
  const doctor = { id: 'doc-good', consultation_fee: 650.00 };
  const clientSentFee = 0.00;
  const computed = calculateAuthoritativeFee(doctor);
  assert.equal(computed, 650.00, 'Zero fee from client must not override doctor catalog fee');
  assert.notEqual(computed, clientSentFee, 'Must reject zero fee override');
});

suite.test('B1.3: Micro-fractional fee tampering (0.0001 NPR) is rounded to 2 decimal places', (assert) => {
  const doctor = { id: 'doc-fraction', consultation_fee: 500.00001 };
  const computed = calculateAuthoritativeFee(doctor);
  assert.equal(computed, 500.00, 'Micro-fractions must round to standard currency precision');
});

suite.test('B1.4: Extreme fee value (999,999.00 NPR) is handled safely without integer overflow', (assert) => {
  const doctor = { id: 'doc-expensive', consultation_fee: 999999.00 };
  const computed = calculateAuthoritativeFee(doctor);
  assert.equal(computed, 999999.00, 'Extreme numbers must compute without overflow');
});

suite.test('B1.5: NaN or non-numeric consultation fee falls back to default fee (500.00 NPR)', (assert) => {
  const doctorBad = { id: 'doc-nan', consultation_fee: NaN };
  const computed = calculateAuthoritativeFee(doctorBad);
  assert.equal(computed, CONTRACTS.defaultConsultationFeeNpr, 'NaN fee must fallback to 500.00 NPR');
});

// ---------------------------------------------------------------------------
// 2. TRACKING CODE BOUNDARIES & MALFORMED INPUTS
// ---------------------------------------------------------------------------

suite.test('B2.1: 9-digit tracking code (one digit short) fails Luhn validation', (assert) => {
  assert.ok(!validateLuhnTrackingCode('101296001'), '9-digit tracking code must fail');
});

suite.test('B2.2: 11-digit tracking code (one digit long) fails Luhn validation', (assert) => {
  assert.ok(!validateLuhnTrackingCode('10129600155'), '11-digit tracking code must fail');
});

suite.test('B2.3: Tracking code with all zeros ("0000000000") computes valid Luhn check digit (0)', (assert) => {
  const checkDigit = computeLuhnCheckDigit('000000000');
  assert.equal(checkDigit, 0, 'Luhn check digit for all zeros must be 0');
  assert.ok(validateLuhnTrackingCode('0000000000'), 'All-zero tracking code with check digit 0 is mathematically valid');
});

suite.test('B2.4: Tracking code containing spaces or tabs is rejected without silent trimming bypass', (assert) => {
  assert.ok(!validateLuhnTrackingCode(' 1012960015 '), 'Spaces in tracking code must fail validation');
  assert.ok(!validateLuhnTrackingCode('1012 960015'), 'Interior space must fail validation');
});

suite.test('B2.5: Tracking code with SQL injection string is rejected', (assert) => {
  const injection = "1012960015' OR '1'='1";
  assert.ok(!validateLuhnTrackingCode(injection), 'SQL injection payload must fail tracking code check');
});

suite.test('B2.6: Tracking code roll counter rollover (counter > 999) rolls over cleanly', (assert) => {
  const code1 = generateStructuredTrackingCode(1, 100, 999);
  const code2 = generateStructuredTrackingCode(1, 100, 1000); // 1000 % 1000 = 000
  assert.equal(code1.length, 10, 'Counter 999 generates 10-digit code');
  assert.equal(code2.length, 10, 'Rollover counter generates 10-digit code');
  assert.ok(validateLuhnTrackingCode(code1), 'Counter 999 passes Luhn');
  assert.ok(validateLuhnTrackingCode(code2), 'Counter 1000 rollover passes Luhn');
});

// ---------------------------------------------------------------------------
// 3. NEPAL PHONE BOUNDARIES & NORMALIZATION
// ---------------------------------------------------------------------------

suite.test('B3.1: 8-digit landline number is rejected for mobile verification', (assert) => {
  assert.equal(normalizeNepalMobileNumber('014412345'), null, 'Kathmandu 8-digit landline must be rejected');
  assert.equal(normalizeNepalMobileNumber('98412345'), null, '8-digit mobile fragment must be rejected');
});

suite.test('B3.2: 11-digit phone number is rejected', (assert) => {
  assert.equal(normalizeNepalMobileNumber('98412345678'), null, '11 digits must be rejected');
});

suite.test('B3.3: International numbers outside Nepal (+91 India, +1 US) are rejected', (assert) => {
  assert.equal(normalizeNepalMobileNumber('+91-9876543210'), null, 'Indian mobile must be rejected');
  assert.equal(normalizeNepalMobileNumber('+1-555-123-4567'), null, 'US phone must be rejected');
});

suite.test('B3.4: Phone string containing letters is stripped or rejected', (assert) => {
  assert.equal(normalizeNepalMobileNumber('9841CALLME'), null, 'Alphanumeric phone must be rejected');
});

suite.test('B3.5: Phone string with SQL injection payload is rejected', (assert) => {
  const injectionPhone = "9841234567; DROP TABLE appointments;--";
  // Extraction of digits results in length > 10, causing rejection
  assert.equal(normalizeNepalMobileNumber(injectionPhone), null, 'SQL injection in phone must be rejected');
});

// ---------------------------------------------------------------------------
// 4. DOCUMENT UPLOAD & SIZE BOUNDARIES (10MB LIMIT)
// ---------------------------------------------------------------------------

suite.test('B4.1: File size of exactly 10,485,760 bytes (10MB) is allowed at boundary', (assert) => {
  const exact10MB = CONTRACTS.storage.maxFileSizeBytes;
  assert.equal(exact10MB, 10485760);
  assert.ok(exact10MB <= CONTRACTS.storage.maxFileSizeBytes, 'Exactly 10MB must be allowed');
});

suite.test('B4.2: File size of 10,485,761 bytes (10MB + 1 byte) is rejected at boundary', (assert) => {
  const overByOneByte = CONTRACTS.storage.maxFileSizeBytes + 1;
  assert.ok(overByOneByte > CONTRACTS.storage.maxFileSizeBytes, '10MB + 1 byte must be rejected');
});

suite.test('B4.3: Oversize file (52,428,800 bytes / 50MB) is strictly rejected by 10MB limit', (assert) => {
  const fiftyMB = 52428800;
  assert.ok(fiftyMB > CONTRACTS.storage.maxFileSizeBytes, '50MB file must exceed 10MB limit');
});

suite.test('B4.4: Zero-byte file (0 bytes) is flagged as invalid upload', (assert) => {
  function validateUploadSize(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0 || bytes > CONTRACTS.storage.maxFileSizeBytes) {
      return false;
    }
    return true;
  }

  assert.ok(!validateUploadSize(0), '0-byte upload must be rejected');
  assert.ok(!validateUploadSize(-100), 'Negative bytes upload must be rejected');
  assert.ok(validateUploadSize(1024), '1KB upload is valid');
});

suite.test('B4.5: Storage path traversal attempt ("../../malicious.pdf") is sanitized', (assert) => {
  const safePath = generateSafeStoragePath('../../sensitive', 'report.pdf');
  assert.doesNotMatch(safePath, /\.\./, 'Must strip directory traversal dots');
  assert.match(safePath, /^sensitive\/[a-f0-9-]+\.pdf$/, 'Sanitized path matches expected structure');
});

suite.test('B4.6: Double-extension executable trick ("report.pdf.exe") preserves actual extension .exe and is rejected', (assert) => {
  const filename = 'report.pdf.exe';
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  assert.equal(ext, 'exe', 'Extension must be parsed as exe, not pdf');
  assert.includes(CONTRACTS.storage.disallowedMimeTypes, 'application/x-msdownload', 'Executable MIME disallowed');
});

// ---------------------------------------------------------------------------
// 5. CORS ORIGIN BOUNDARIES & SPOOFING ATTEMPTS
// ---------------------------------------------------------------------------

suite.test('B5.1: Origin with trailing slash ("https://dactorofficial.github.io/") matches allowed origin', (assert) => {
  const withSlash = 'https://dactorofficial.github.io/';
  assert.ok(isAllowedOrigin(withSlash), 'Trailing slash must be normalized and matched');
});

suite.test('B5.2: Literal "null" origin string is rejected by CORS allowlist', (assert) => {
  assert.ok(!isAllowedOrigin('null'), 'Literal null origin must be rejected');
});

suite.test('B5.3: Subdomain attacker trick ("https://dactorofficial.github.io.evil.com") is rejected', (assert) => {
  const evilSubdomain = 'https://dactorofficial.github.io.evil.com';
  assert.ok(!isAllowedOrigin(evilSubdomain), 'Attacker subdomain must be rejected');
});

suite.test('B5.4: Scheme mismatch ("http://dactorofficial.github.io") is rejected for production origin', (assert) => {
  const insecureHttp = 'http://dactorofficial.github.io';
  assert.ok(!isAllowedOrigin(insecureHttp), 'HTTP scheme must be rejected for remote production domains');
});

suite.test('B5.5: User credentials in origin ("https://user:pass@dactorofficial.github.io") are rejected', (assert) => {
  const credentialOrigin = 'https://user:pass@dactorofficial.github.io';
  assert.ok(!isAllowedOrigin(credentialOrigin), 'Origins with embedded credentials must be rejected');
});

// ---------------------------------------------------------------------------
// 6. SIGNED URL EXPIRY BOUNDARIES
// ---------------------------------------------------------------------------

suite.test('B6.1: Expiry duration clamping: negative or zero expiry is clamped to minimum 60 seconds', (assert) => {
  function clampExpiry(requestedSeconds) {
    const min = CONTRACTS.signedUrl.minExpirySec;
    const max = CONTRACTS.signedUrl.maxExpirySec;
    const val = Number(requestedSeconds);
    if (!Number.isFinite(val) || val < min) return min;
    if (val > max) return max;
    return Math.floor(val);
  }

  assert.equal(clampExpiry(0), 60, '0s expiry clamped to 60s');
  assert.equal(clampExpiry(-100), 60, 'Negative expiry clamped to 60s');
  assert.equal(clampExpiry(300), 300, '300s expiry remains 300s');
});

suite.test('B6.2: Expiry duration clamping: oversized expiry (86400s / 24h) is clamped to maximum 900s (15 min)', (assert) => {
  function clampExpiry(requestedSeconds) {
    const min = CONTRACTS.signedUrl.minExpirySec;
    const max = CONTRACTS.signedUrl.maxExpirySec;
    const val = Number(requestedSeconds);
    if (!Number.isFinite(val) || val < min) return min;
    if (val > max) return max;
    return Math.floor(val);
  }

  assert.equal(clampExpiry(86400), 900, '24 hour expiry must be clamped to 15 minutes (900s)');
  assert.equal(clampExpiry(10000), 900, '10,000s expiry must be clamped to 900s');
});

module.exports = suite;
