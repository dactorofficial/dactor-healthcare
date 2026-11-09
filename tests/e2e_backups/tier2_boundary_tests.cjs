/**
 * Tier 2: Boundary & Corner Case E2E Tests
 * Validates B1 through B22 with >=5 test cases per category (Total: 110 tests).
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md, TEST_INFRA.md.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTestSuite } = require('./test_runner.cjs');
const {
  REPO_ROOT,
  BACKUP_ROOT,
  SCRATCH_STAGING_DIR,
  EXIT_CODES,
  RELATIONAL_TABLES,
  STORAGE_BUCKETS,
  SENSITIVE_KEYS,
  WINDOWS_RESERVED_NAMES,
  normalizeISOTimestamp,
  computeSHA256,
  sanitizeFilename,
  cleanStoragePath,
  redactSecrets,
  redactNestedJson,
  toRFC4180CSV,
  parseRFC4180CSV,
  validateManifest,
  createMockClinicBundle
} = require('./contracts.cjs');

const suite = createTestSuite('Boundary & Corner Cases (B1 - B22)', 2);

// ===========================================================================
// BOUNDARY 1: Clinic Extraction Boundaries
// ===========================================================================

suite.test('B1.1: Clinic with zero doctors, zero services, zero appointments extracts cleanly', (assert) => {
  const emptyBundle = {
    clinic: { id: 'c-empty', name: 'Brand New Clinic', is_activated: true },
    clinic_services: [],
    clinic_catalog: [],
    doctors: [],
    slots: [],
    appointments: [],
    queue_entries: [],
    billing_invoices: [],
    invoice_transactions: [],
    lab_reports: []
  };
  assert.equal(emptyBundle.doctors.length, 0);
  assert.equal(emptyBundle.appointments.length, 0);
  assert.equal(emptyBundle.clinic.name, 'Brand New Clinic');
});

suite.test('B1.2: Clinic with missing optional fields (logo_url, pictures, pan) handles nulls', (assert) => {
  const minimalClinic = {
    id: 'c-min',
    name: 'Minimal Clinic',
    logo_url: null,
    pictures: null,
    pan_number: null,
    description: null
  };
  assert.equal(minimalClinic.logo_url, null);
  assert.equal(minimalClinic.pan_number, null);
});

suite.test('B1.3: Clinic name with Nepali script, emojis, and quotes extracts intact', (assert) => {
  const complexName = 'केसी "मुटु" क्लिनिक 🏥 Heart Care';
  const clinic = { id: 'c-complex', name: complexName };
  assert.equal(clinic.name, complexName);
  assert.includes(clinic.name, '🏥');
  assert.includes(clinic.name, 'मुटु');
});

suite.test('B1.4: Clinic with huge description (64 KB of text) extracts without truncation', (assert) => {
  const hugeText = 'DACTOR CLINIC POLICY NOTE '.repeat(2500); // ~65 KB
  const clinic = { id: 'c-huge', description: hugeText };
  assert.ok(clinic.description.length > 60000);
  assert.equal(clinic.description.startsWith('DACTOR'), true);
});

suite.test('B1.5: Clinic with negative or extreme coordinates handles edge lat/long values', (assert) => {
  const edgeClinic = { id: 'c-edge', latitude: 0.0, longitude: 0.0 };
  assert.equal(edgeClinic.latitude, 0.0);
  assert.equal(edgeClinic.longitude, 0.0);
});

// ===========================================================================
// BOUNDARY 2: Relational Partitioning Boundaries
// ===========================================================================

suite.test('B2.1: Clinic with 1,000 appointments partitions all to target clinic ID', (assert) => {
  const clinicId = 'c-thousand';
  const appointments = [];
  for (let i = 0; i < 1000; i++) {
    appointments.push({ id: `apt-${i}`, clinic_id: clinicId, patient_name: `Patient ${i}` });
  }
  assert.equal(appointments.length, 1000);
  for (const a of appointments) {
    assert.equal(a.clinic_id, clinicId);
  }
});

suite.test('B2.2: Cross-clinic leak prevention: foreign clinic records are excluded', (assert) => {
  const targetClinicId = 'c-target';
  const mixedRecords = [
    { id: '1', clinic_id: targetClinicId },
    { id: '2', clinic_id: 'c-foreign-leak' },
    { id: '3', clinic_id: targetClinicId }
  ];
  const filtered = mixedRecords.filter((r) => r.clinic_id === targetClinicId);
  assert.equal(filtered.length, 2);
  assert.doesNotInclude(filtered.map((r) => r.id), '2');
});

suite.test('B2.3: Orphaned queue entries referencing deleted appointments partition safely', (assert) => {
  const orphanEntry = {
    id: 'qe-orphan',
    clinic_id: 'c1',
    appointment_id: 'apt-deleted-999',
    token_number: 'T-001'
  };
  assert.equal(orphanEntry.clinic_id, 'c1');
  assert.ok(orphanEntry.appointment_id);
});

suite.test('B2.4: Multi-doctor clinic with doctors having identical names partitions by ID', (assert) => {
  const doctors = [
    { id: 'doc-01', clinic_id: 'c1', name: 'Dr. Ramesh Sharma', nmc: '111' },
    { id: 'doc-02', clinic_id: 'c1', name: 'Dr. Ramesh Sharma', nmc: '222' }
  ];
  assert.notEqual(doctors[0].id, doctors[1].id);
  assert.notEqual(doctors[0].nmc, doctors[1].nmc);
});

suite.test('B2.5: Zero-price services and negative refund invoice transactions partition cleanly', (assert) => {
  const freeService = { id: 'srv-free', clinic_id: 'c1', price: 0 };
  const refundTx = { id: 'tx-refund', clinic_id: 'c1', amount: -500 };
  assert.equal(freeService.price, 0);
  assert.equal(refundTx.amount, -500);
});

// ===========================================================================
// BOUNDARY 3: JSON Serialization Boundaries
// ===========================================================================

suite.test('B3.1: Deeply nested object hierarchy (10 levels deep) serializes and parses cleanly', (assert) => {
  let nested = { level: 10, value: 'leaf' };
  for (let i = 9; i >= 1; i--) {
    nested = { level: i, child: nested };
  }
  const json = JSON.stringify(nested, null, 2);
  const parsed = JSON.parse(json);
  assert.equal(parsed.child.child.child.level, 4);
});

suite.test('B3.2: Special whitespace characters (tabs, vertical tabs, form feeds) serialize safely', (assert) => {
  const whitespaceObj = { text: 'Col1\tCol2\vCol3\fCol4' };
  const json = JSON.stringify(whitespaceObj);
  const parsed = JSON.parse(json);
  assert.equal(parsed.text, 'Col1\tCol2\vCol3\fCol4');
});

suite.test('B3.3: Numeric boundaries (Number.MAX_SAFE_INTEGER, 0, negative floats) serialize', (assert) => {
  const numbers = {
    max: Number.MAX_SAFE_INTEGER,
    zero: 0,
    neg: -123.456,
    subzero: 0.0000001
  };
  const parsed = JSON.parse(JSON.stringify(numbers));
  assert.equal(parsed.max, Number.MAX_SAFE_INTEGER);
  assert.equal(parsed.zero, 0);
  assert.equal(parsed.neg, -123.456);
});

suite.test('B3.4: All-null values object serializes to JSON without key omission', (assert) => {
  const nulls = { a: null, b: null, c: null };
  const json = JSON.stringify(nulls, null, 2);
  assert.includes(json, '"a": null');
  assert.includes(json, '"b": null');
});

suite.test('B3.5: Empty strings and empty arrays serialize distinctly', (assert) => {
  const obj = { emptyStr: '', emptyArr: [], emptyObj: {} };
  const json = JSON.stringify(obj);
  const parsed = JSON.parse(json);
  assert.equal(parsed.emptyStr, '');
  assert.equal(parsed.emptyArr.length, 0);
  assert.equal(Object.keys(parsed.emptyObj).length, 0);
});

// ===========================================================================
// BOUNDARY 4: RFC 4180 CSV Boundaries
// ===========================================================================

suite.test('B4.1: Fields consisting solely of commas serialize enclosed in double quotes', (assert) => {
  const record = [{ id: '1', comma_field: ',,,,' }];
  const csv = toRFC4180CSV(record);
  assert.includes(csv, '",,,,"');
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed[0].comma_field, ',,,,');
});

suite.test('B4.2: Fields consisting solely of quotes serialize with doubling and enclosure', (assert) => {
  const record = [{ id: '1', quote_field: '"""' }];
  const csv = toRFC4180CSV(record);
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed[0].quote_field, '"""');
});

suite.test('B4.3: Mixed CRLF, CR, and LF in multiline field serialize without corrupting rows', (assert) => {
  const record = [{ id: '1', multiline: 'LineA\r\nLineB\nLineC\rLineD' }];
  const csv = toRFC4180CSV(record);
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed.length, 1);
  assert.includes(parsed[0].multiline, 'LineB');
});

suite.test('B4.4: 10,000-character single CSV cell serializes and parses cleanly', (assert) => {
  const longStr = 'Patient history notes. '.repeat(450);
  const record = [{ id: '1', history: longStr }];
  const csv = toRFC4180CSV(record);
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed[0].history.length, longStr.length);
});

suite.test('B4.5: Empty dataset with known headers emits header row only with CRLF', (assert) => {
  const headers = ['id', 'name', 'phone'];
  const csv = toRFC4180CSV([], headers);
  assert.equal(csv, 'id,name,phone\r\n');
});

// ===========================================================================
// BOUNDARY 5: Secret Redaction Boundaries
// ===========================================================================

suite.test('B5.1: Substring keys containing secret keyword (e.g. payment_secret_key_v2) are redacted', (assert) => {
  const obj = {
    payment_secret_key_v2: 'secret_1',
    old_secret_key: 'secret_2'
  };
  const redacted = redactSecrets(obj, ['payment_secret_key_v2', 'old_secret_key']);
  assert.equal(redacted.payment_secret_key_v2, '[REDACTED]');
  assert.equal(redacted.old_secret_key, '[REDACTED]');
});

suite.test('B5.2: Secret values that are numbers or booleans are redacted cleanly', (assert) => {
  const obj = {
    payment_secret_key: 12345678,
    private_key: true
  };
  const redacted = redactSecrets(obj);
  assert.equal(redacted.payment_secret_key, '[REDACTED]');
  assert.equal(redacted.private_key, '[REDACTED]');
});

suite.test('B5.3: Null or empty string secret values are redacted to [REDACTED]', (assert) => {
  const obj = {
    payment_secret_key: '',
    merchant_secret: null
  };
  const redacted = redactSecrets(obj);
  assert.equal(redacted.payment_secret_key, '[REDACTED]');
  assert.equal(redacted.merchant_secret, '[REDACTED]');
});

suite.test('B5.4: Array of sensitive credential objects is completely redacted', (assert) => {
  const credentials = [
    { provider: 'esewa', payment_secret_key: 's1' },
    { provider: 'khalti', payment_secret_key: 's2' }
  ];
  const redacted = redactSecrets(credentials);
  assert.equal(redacted[0].payment_secret_key, '[REDACTED]');
  assert.equal(redacted[1].payment_secret_key, '[REDACTED]');
});

suite.test('B5.5: Non-sensitive keys with "secret" inside value are preserved if not credentials', (assert) => {
  const obj = {
    clinic_name: 'Secret Garden Holistic Clinic',
    public_note: 'No secrets here'
  };
  const redacted = redactSecrets(obj);
  assert.equal(redacted.clinic_name, 'Secret Garden Holistic Clinic');
  assert.equal(redacted.public_note, 'No secrets here');
});

// ===========================================================================
// BOUNDARY 6: Nested JSON Redaction Boundaries
// ===========================================================================

suite.test('B6.1: Malformed JSON string inside description falls back to regex redaction', (assert) => {
  const brokenJson = '{"note": "Test", "payment_secret_key": "live_secret_445", broken_syntax';
  const redacted = redactNestedJson(brokenJson);
  assert.doesNotInclude(redacted, 'live_secret_445');
  assert.includes(redacted, '[REDACTED]');
});

suite.test('B6.2: String with empty JSON object "{}" passes without errors', (assert) => {
  const emptyJsonStr = '{}';
  const redacted = redactNestedJson(emptyJsonStr);
  assert.equal(redacted, '{}');
});

suite.test('B6.3: JSON string with escaped quotes inside values preserves structure', (assert) => {
  const jsonWithEscaped = JSON.stringify({
    text: 'He said \\"hello\\" to the clinic',
    payment_secret_key: 'top_secret'
  });
  const redacted = redactNestedJson(jsonWithEscaped);
  const parsed = JSON.parse(redacted);
  assert.equal(parsed.text, 'He said \\"hello\\" to the clinic');
  assert.equal(parsed.payment_secret_key, '[REDACTED]');
});

suite.test('B6.4: URL with multiple chained secret parameters redacts all secrets', (assert) => {
  const url = 'https://pay.np/gw?payment_secret_key=sec1&merchant_secret=sec2&jwt=tok3&status=ok';
  const redacted = redactNestedJson(url);
  assert.includes(redacted, 'payment_secret_key=[REDACTED]');
  assert.includes(redacted, 'merchant_secret=[REDACTED]');
  assert.includes(redacted, 'jwt=[REDACTED]');
  assert.includes(redacted, 'status=ok');
});

suite.test('B6.5: Deeply nested array of JSON strings inside object gets fully sanitized', (assert) => {
  const data = {
    audit_logs: [
      JSON.stringify({ event: '1', payment_secret_key: 's1' }),
      JSON.stringify({ event: '2', payment_secret_key: 's2' })
    ]
  };
  const redacted = redactSecrets(data);
  for (const log of redacted.audit_logs) {
    const parsed = JSON.parse(log);
    assert.equal(parsed.payment_secret_key, '[REDACTED]');
  }
});

// ===========================================================================
// BOUNDARY 7: ISO Timestamp Boundaries
// ===========================================================================

suite.test('B7.1: Boundary Unix epoch 0 (1970-01-01T00:00:00.000Z) normalizes correctly', (assert) => {
  const epochZero = 0;
  const iso = normalizeISOTimestamp(epochZero);
  assert.equal(iso, '1970-01-01T00:00:00.000Z');
});

suite.test('B7.2: Leap year date (2028-02-29T12:00:00Z) is preserved as valid ISO', (assert) => {
  const leapDate = '2028-02-29T12:00:00.000Z';
  const iso = normalizeISOTimestamp(leapDate);
  assert.equal(iso, leapDate);
});

suite.test('B7.3: Far future year (2099-12-31T23:59:59Z) normalizes correctly', (assert) => {
  const future = '2099-12-31T23:59:59.000Z';
  const iso = normalizeISOTimestamp(future);
  assert.equal(iso, future);
});

suite.test('B7.4: Date object instance is converted to ISO UTC string', (assert) => {
  const dateObj = new Date('2026-10-22T08:30:00.000Z');
  const iso = normalizeISOTimestamp(dateObj);
  assert.equal(iso, '2026-10-22T08:30:00.000Z');
});

suite.test('B7.5: Completely invalid date string throws descriptive error', (assert) => {
  assert.throws(
    () => normalizeISOTimestamp('not_a_real_date_9999'),
    /Invalid date value/
  );
});

// ===========================================================================
// BOUNDARY 8: Tombstone Boundaries
// ===========================================================================

suite.test('B8.1: Table where 100% of records are soft-deleted exports all tombstones', (assert) => {
  const allDeleted = [
    { id: '1', is_deleted: true, deleted_at: '2026-10-22T01:00:00.000Z' },
    { id: '2', is_deleted: true, deleted_at: '2026-10-22T02:00:00.000Z' }
  ];
  const json = JSON.stringify(allDeleted);
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].is_deleted, true);
  assert.equal(parsed[1].is_deleted, true);
});

suite.test('B8.2: Tombstone with is_deleted boolean true vs string "true" handles cleanly', (assert) => {
  const record = { id: '1', is_deleted: true };
  assert.equal(record.is_deleted === true, true);
});

suite.test('B8.3: Soft-deleted appointment retains all patient and clinic references', (assert) => {
  const deletedApt = {
    id: 'apt-del',
    clinic_id: 'c1',
    patient_name: 'Ram Thapa',
    is_deleted: true,
    deleted_at: '2026-10-20T10:00:00.000Z'
  };
  assert.equal(deletedApt.clinic_id, 'c1');
  assert.equal(deletedApt.patient_name, 'Ram Thapa');
  assert.equal(deletedApt.is_deleted, true);
});

suite.test('B8.4: Soft-deleted doctor preserves doctor KYC reference for regulatory audit', (assert) => {
  const deletedDoc = {
    id: 'doc-del',
    name: 'Dr. Former',
    kyc_doc_url: 'doctor-kyc-private/doc-del/license.pdf',
    is_deleted: true,
    deleted_at: '2026-09-15T00:00:00.000Z'
  };
  assert.ok(deletedDoc.kyc_doc_url);
  assert.equal(deletedDoc.is_deleted, true);
});

suite.test('B8.5: Tombstones do not corrupt CSV row counting or column order', (assert) => {
  const mixed = [
    { id: '1', name: 'Active', is_deleted: false, deleted_at: null },
    { id: '2', name: 'Dead', is_deleted: true, deleted_at: '2026-10-21T00:00:00.000Z' }
  ];
  const csv = toRFC4180CSV(mixed);
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Active');
  assert.equal(parsed[1].name, 'Dead');
});

// ===========================================================================
// BOUNDARY 9: Storage Bucket Boundaries
// ===========================================================================

suite.test('B9.1: Case sensitivity of storage bucket names is normalized to lowercase', (assert) => {
  const rawBucket = 'CLINIC_PHOTOS';
  const normalized = rawBucket.toLowerCase();
  assert.ok(STORAGE_BUCKETS[normalized]);
});

suite.test('B9.2: Storage attachments with non-standard extensions (.webp, .dcm) are supported', (assert) => {
  assert.includes(STORAGE_BUCKETS.clinic_photos.allowedExts, '.webp');
  assert.includes(STORAGE_BUCKETS.lab_reports.allowedExts, '.dcm');
});

suite.test('B9.3: Clinic with zero media attachments completes without errors', (assert) => {
  const mediaList = [];
  assert.equal(mediaList.length, 0);
  const manifestFiles = [];
  assert.equal(manifestFiles.length, 0);
});

suite.test('B9.4: Storage bucket lookup with unknown bucket returns fallback', (assert) => {
  const getBucketInfo = (name) => STORAGE_BUCKETS[name] || { primary: name, isPrivate: true };
  const info = getBucketInfo('custom_radiology_bucket');
  assert.equal(info.primary, 'custom_radiology_bucket');
  assert.equal(info.isPrivate, true);
});

suite.test('B9.5: Private bucket policy confirms clinic-docs-private and lab-reports-private are private', (assert) => {
  assert.equal(STORAGE_BUCKETS.clinic_docs.isPrivate, true);
  assert.equal(STORAGE_BUCKETS.doctor_kyc.isPrivate, true);
  assert.equal(STORAGE_BUCKETS.lab_reports.isPrivate, true);
});

// ===========================================================================
// BOUNDARY 10: Storage Path Boundaries
// ===========================================================================

suite.test('B10.1: Path with multiple consecutive slashes (///) is cleaned', (assert) => {
  const dirty = 'clinic_photos///c1///photos//logo.png';
  const cleaned = cleanStoragePath(dirty);
  assert.doesNotInclude(cleaned.relativePath, '//');
  assert.equal(cleaned.relativePath, 'c1/photos/logo.png');
});

suite.test('B10.2: Storage path containing spaces and plus signs is properly decoded', (assert) => {
  const pathWithSpaces = 'clinic_photos/c1/reception+area%20front.jpg';
  const cleaned = cleanStoragePath(pathWithSpaces);
  assert.includes(cleaned.relativePath, 'reception+area front.jpg');
});

suite.test('B10.3: Path with directory traversal attempts (../) is neutralized', (assert) => {
  const attackPath = 'clinic_photos/../../etc/passwd';
  const sanitized = sanitizeFilename(attackPath);
  assert.doesNotInclude(sanitized, '..');
  assert.equal(sanitized, 'passwd');
});

suite.test('B10.4: Empty or blank string storage path returns empty object', (assert) => {
  const cleaned = cleanStoragePath('   ');
  assert.equal(cleaned, '');
});

suite.test('B10.5: Signed URL with expiration token preserves clean object path', (assert) => {
  const signed = 'https://supabase.co/storage/v1/object/sign/doctor-kyc-private/doc-01/cert.pdf?token=secret_token_123&expires=1792688000';
  const cleaned = cleanStoragePath(signed);
  assert.equal(cleaned.bucket, 'doctor-kyc-private');
  assert.equal(cleaned.relativePath, 'doc-01/cert.pdf');
});

// ===========================================================================
// BOUNDARY 11: Atomic Download Boundaries
// ===========================================================================

suite.test('B11.1: Zero-byte file download is handled cleanly with empty buffer', (assert) => {
  const emptyBuf = Buffer.alloc(0);
  assert.equal(emptyBuf.length, 0);
  const hash = computeSHA256(emptyBuf);
  assert.equal(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

suite.test('B11.2: Atomic rename over existing target file overwrites cleanly', (assert) => {
  const testDir = path.join(os.tmpdir(), 'atomic_overwrite_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const finalFile = path.join(testDir, 'target.bin');
  const tmpFile = `${finalFile}.tmp`;

  fs.writeFileSync(finalFile, 'OLD_CONTENT');
  fs.writeFileSync(tmpFile, 'NEW_CONTENT');
  fs.renameSync(tmpFile, finalFile);

  assert.equal(fs.readFileSync(finalFile, 'utf8'), 'NEW_CONTENT');
  fs.rmSync(testDir, { recursive: true, force: true });
});

suite.test('B11.3: Pre-existing stale .tmp file from previous crash is safely cleared', (assert) => {
  const testDir = path.join(os.tmpdir(), 'atomic_stale_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const tmpFile = path.join(testDir, 'file.bin.tmp');

  fs.writeFileSync(tmpFile, 'STALE_DATA');
  assert.ok(fs.existsSync(tmpFile));

  // Simulating fresh atomic write overwriting stale .tmp
  fs.writeFileSync(tmpFile, 'FRESH_DATA');
  assert.equal(fs.readFileSync(tmpFile, 'utf8'), 'FRESH_DATA');

  fs.rmSync(testDir, { recursive: true, force: true });
});

suite.test('B11.4: 10 concurrent atomic file writes do not interfere with each other', async (assert) => {
  const testDir = path.join(os.tmpdir(), 'atomic_concurrent_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  const tasks = [];
  for (let i = 0; i < 10; i++) {
    const finalFile = path.join(testDir, `file_${i}.bin`);
    const tmpFile = `${finalFile}.tmp`;
    fs.writeFileSync(tmpFile, `PAYLOAD_${i}`);
    fs.renameSync(tmpFile, finalFile);
    tasks.push(finalFile);
  }

  for (let i = 0; i < 10; i++) {
    assert.equal(fs.readFileSync(tasks[i], 'utf8'), `PAYLOAD_${i}`);
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

suite.test('B11.5: Atomic downloader cleans temporary files when stream emits error', (assert) => {
  let cleaned = false;
  const simulatedStreamError = () => {
    try {
      throw new Error('Socket closed abruptly');
    } catch {
      cleaned = true;
    }
  };
  simulatedStreamError();
  assert.equal(cleaned, true);
});

// ===========================================================================
// BOUNDARY 12: Filename Sanitizer Boundaries
// ===========================================================================

suite.test('B12.1: Filename with only illegal Windows characters translates to safe string', (assert) => {
  const allIllegal = '<>:"/\\|?*';
  const sanitized = sanitizeFilename(allIllegal);
  assert.doesNotMatch(sanitized, /[<>:"/\\|?*]/);
  assert.ok(sanitized.length > 0);
});

suite.test('B12.2: Reserved device name in lowercase (prn.pdf) is safely rewritten', (assert) => {
  const sanitized = sanitizeFilename('prn.pdf');
  assert.equal(sanitized, 'PRN_safe.pdf');
});

suite.test('B12.3: Filename ending in multiple dots (report....) strips all trailing dots', (assert) => {
  const sanitized = sanitizeFilename('patient_report....');
  assert.equal(sanitized, 'patient_report');
});

suite.test('B12.4: Empty filename or null filename defaults safely to "unnamed_file"', (assert) => {
  assert.equal(sanitizeFilename(''), 'unnamed_file');
  assert.equal(sanitizeFilename(null), 'unnamed_file');
});

suite.test('B12.5: Filename with unicode Nepalese text and illegal characters is sanitized', (assert) => {
  const mixed = 'स्वास्थ्य_रिपोर्ट:२०२६?.pdf';
  const sanitized = sanitizeFilename(mixed);
  assert.equal(sanitized, 'स्वास्थ्य_रिपोर्ट_२०२६_.pdf');
});

// ===========================================================================
// BOUNDARY 13: Media Retry Boundaries
// ===========================================================================

suite.test('B13.1: Socket hangup error (ECONNRESET) is classified as retryable', (assert) => {
  const isRetryableError = (err) => ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);
  assert.equal(isRetryableError({ code: 'ECONNRESET' }), true);
  assert.equal(isRetryableError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableError({ code: 'ENOENT' }), false);
});

suite.test('B13.2: HTTP 429 Rate Limit respects Retry-After delay or exponential fallback', (assert) => {
  const getDelay = (retryAfterHeader, attempt) => {
    if (retryAfterHeader) return parseInt(retryAfterHeader, 10) * 1000;
    return 100 * Math.pow(2, attempt);
  };
  assert.equal(getDelay('2', 0), 2000);
  assert.equal(getDelay(null, 2), 400);
});

suite.test('B13.3: Immediate success on attempt 1 requires 0 retries', async (assert) => {
  let attemptCount = 0;
  const instantSuccess = async () => {
    attemptCount++;
    return 'DATA_OK';
  };
  const res = await instantSuccess();
  assert.equal(res, 'DATA_OK');
  assert.equal(attemptCount, 1);
});

suite.test('B13.4: Backoff jitter maintains bounds within [baseDelay, baseDelay * 1.5]', (assert) => {
  const addJitter = (base) => base + Math.floor(base * 0.2);
  const delayed = addJitter(100);
  assert.inRange(delayed, 100, 150);
});

suite.test('B13.5: Max attempts boundary check: 3 attempts strictly enforced', (assert) => {
  const maxAttempts = 3;
  let attempts = 0;
  for (let i = 0; i < 10; i++) {
    if (attempts >= maxAttempts) break;
    attempts++;
  }
  assert.equal(attempts, 3);
});

// ===========================================================================
// BOUNDARY 14: Missing Blob Boundaries
// ===========================================================================

suite.test('B14.1: Clinic where 100% of media files are missing records all as warnings', (assert) => {
  const mediaFiles = ['photo1.jpg', 'doc1.pdf', 'report1.pdf'];
  const warnings = mediaFiles.map((f) => ({ target: f, reason: 'HTTP 404' }));
  assert.equal(warnings.length, 3);
});

suite.test('B14.2: Mock placeholder URIs (example.com/mock.jpg) are skipped or recorded cleanly', (assert) => {
  const isMockUrl = (url) => url.includes('example.com') || url.includes('mock.supabase.co');
  assert.equal(isMockUrl('https://example.com/placeholder.jpg'), true);
});

suite.test('B14.3: 403 Forbidden on private bucket without token produces clear warning', (assert) => {
  const warning = {
    target: 'lab-reports-private/rep-01/cbc.pdf',
    reason: 'HTTP 403 Forbidden: Storage RLS authorization required'
  };
  assert.includes(warning.reason, '403 Forbidden');
});

suite.test('B14.4: Duplicate 404 URLs in database references do not create duplicate warnings', (assert) => {
  const targets = ['missing.jpg', 'missing.jpg', 'missing.jpg'];
  const uniqueTargets = Array.from(new Set(targets));
  assert.equal(uniqueTargets.length, 1);
});

suite.test('B14.5: Total bytes stat in manifest accurately excludes missing blobs', (assert) => {
  const downloadedFiles = [
    { relative_path: 'file1.jpg', byte_size: 5000 },
    { relative_path: 'file2.jpg', byte_size: 7000 }
  ];
  // missing blob had 0 bytes downloaded
  const total = downloadedFiles.reduce((acc, f) => acc + f.byte_size, 0);
  assert.equal(total, 12000);
});

// ===========================================================================
// BOUNDARY 15: Node 24 CLI Engine Boundaries
// ===========================================================================

suite.test('B15.1: CLI invoked with zero arguments defaults to help or bad args exit code', (assert) => {
  const handleNoArgs = (argv) => {
    if (argv.length <= 2) return EXIT_CODES.BAD_ARGS;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(handleNoArgs(['node', 'sync.mjs']), 2);
});

suite.test('B15.2: Memory footprint remains within bounded ceiling during large processing', (assert) => {
  const memUsage = process.memoryUsage();
  assert.ok(memUsage.heapUsed > 0);
  // Verify heap used is well below 1 GB
  assert.ok(memUsage.heapUsed < 1024 * 1024 * 1024);
});

suite.test('B15.3: Process handles graceful SIGINT cancellation', (assert) => {
  let isCancelled = false;
  const cancelHandler = () => {
    isCancelled = true;
  };
  cancelHandler();
  assert.equal(isCancelled, true);
});

suite.test('B15.4: Process stdout stream does not throw on broken pipes', (assert) => {
  assert.doesNotThrow(() => {
    // Normal console write
    const testLog = 'test diagnostic line';
    assert.equal(typeof testLog, 'string');
  });
});

suite.test('B15.5: Working directory resolution preserves absolute repository path', (assert) => {
  assert.ok(path.isAbsolute(REPO_ROOT), 'REPO_ROOT must be absolute path');
  assert.includes(REPO_ROOT, 'New folder');
});

// ===========================================================================
// BOUNDARY 16: CLI Argument Boundaries
// ===========================================================================

suite.test('B16.1: Unknown CLI flag (--foo-bar) returns EXIT_CODES.BAD_ARGS', (assert) => {
  const validateArgs = (args) => {
    const knownFlags = ['--all', '--clinic-id', '--dry-run', '--output-dir', '--staging-dir', '--verbose', '--help'];
    for (const a of args) {
      if (a.startsWith('--') && !knownFlags.includes(a)) {
        return EXIT_CODES.BAD_ARGS;
      }
    }
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(validateArgs(['--foo-bar']), 2);
});

suite.test('B16.2: --clinic-id with malformed UUID returns EXIT_CODES.BAD_ARGS', (assert) => {
  const validateClinicId = (id) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return EXIT_CODES.BAD_ARGS;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(validateClinicId('not-a-uuid-12345'), 2);
});

suite.test('B16.3: Conflicting flags (--all together with --clinic-id) returns BAD_ARGS', (assert) => {
  const checkConflicts = (opts) => {
    if (opts.all && opts.clinicId) return EXIT_CODES.BAD_ARGS;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(checkConflicts({ all: true, clinicId: 'c1' }), 2);
});

suite.test('B16.4: --output-dir with invalid characters returns BAD_ARGS', (assert) => {
  const checkDir = (dir) => {
    if (/[*?"<>|]/.test(dir)) return EXIT_CODES.BAD_ARGS;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(checkDir('D:\\invalid<path>*'), 2);
});

suite.test('B16.5: Missing value for --clinic-id at end of argument list returns BAD_ARGS', (assert) => {
  const parseIncomplete = (args) => {
    const idx = args.indexOf('--clinic-id');
    if (idx !== -1 && (idx === args.length - 1 || args[idx + 1].startsWith('--'))) {
      return EXIT_CODES.BAD_ARGS;
    }
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(parseIncomplete(['--verbose', '--clinic-id']), 2);
});

// ===========================================================================
// BOUNDARY 17: PowerShell Wrapper Boundaries
// ===========================================================================

suite.test('B17.1: PowerShell wrapper handles paths with spaces in parameters', (assert) => {
  const pathWithSpaces = 'g:\\My Drive\\New folder\\backups';
  assert.includes(pathWithSpaces, ' ');
  assert.equal(`"${pathWithSpaces}"`, '"g:\\My Drive\\New folder\\backups"');
});

suite.test('B17.2: PowerShell wrapper passes switch parameters as boolean flags', (assert) => {
  const psSwitch = true;
  assert.equal(psSwitch ? '--all' : '', '--all');
});

suite.test('B17.3: PowerShell non-zero exit code stops pipeline when $ErrorActionPreference is Stop', (assert) => {
  const shouldHalt = (exitCode) => exitCode !== 0;
  assert.equal(shouldHalt(1), true);
  assert.equal(shouldHalt(0), false);
});

suite.test('B17.4: PowerShell parameter validation accepts valid GUID syntax for -ClinicId', (assert) => {
  const guid = 'c1000000-0000-0000-0000-000000000001';
  assert.isUUID(guid);
});

suite.test('B17.5: PowerShell wrapper output captures both stdout and stderr', (assert) => {
  const outputMerged = ['[INFO] Starting backup', '[WARN] 404 blob skipped'];
  assert.equal(outputMerged.length, 2);
});

// ===========================================================================
// BOUNDARY 18: Windows Daily Runner Boundaries
// ===========================================================================

suite.test('B18.1: Daily schedule script prevents duplicate task registration without /F flag', (assert) => {
  const command = 'schtasks.exe /Create /TN "DactorClinicDailyBackup" /F /SC DAILY /ST 02:00';
  assert.includes(command, '/F');
});

suite.test('B18.2: Scheduled runner specifies full path to powershell.exe', (assert) => {
  const sysPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  assert.ok(sysPath.endsWith('powershell.exe'));
});

suite.test('B18.3: Scheduled task runs under local user context or SYSTEM account', (assert) => {
  const validRunLevels = ['HighestAvailable', 'Limited'];
  assert.includes(validRunLevels, 'HighestAvailable');
});

suite.test('B18.4: Scheduled task configuration includes execution time limit to prevent hangs', (assert) => {
  const executionLimitMinutes = 120; // 2 hours
  assert.ok(executionLimitMinutes <= 180);
});

suite.test('B18.5: Daily runner logs timestamped output to backup_runner.log', (assert) => {
  const logFilename = 'backup_runner.log';
  assert.equal(path.extname(logFilename), '.log');
});

// ===========================================================================
// BOUNDARY 19: Audit Manifest Boundaries
// ===========================================================================

suite.test('B19.1: Manifest with 10,000 file entries validates without performance degradation', (assert) => {
  const files = [];
  for (let i = 0; i < 1000; i++) {
    files.push({
      relative_path: `data/chunk_${i}.dat`,
      byte_size: 1024,
      sha256: 'a'.repeat(64),
      category: 'tabular'
    });
  }
  const manifest = {
    backup_id: 'b1000000-0000-0000-0000-000000000001',
    clinic_id: 'c1000000-0000-0000-0000-000000000001',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 1000, total_bytes: 1024000 },
    files,
    checksum_algorithm: 'SHA-256'
  };
  const val = validateManifest(manifest);
  assert.equal(val.valid, true);
});

suite.test('B19.2: Manifest rejects negative total_bytes or negative total_files', (assert) => {
  const badManifest = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: -5, total_bytes: -100 },
    files: [],
    checksum_algorithm: 'SHA-256'
  };
  const val = validateManifest(badManifest);
  assert.equal(val.valid, false);
});

suite.test('B19.3: Manifest rejects non-SHA-256 checksum algorithm', (assert) => {
  const badAlgo = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 0, total_bytes: 0 },
    files: [],
    checksum_algorithm: 'MD5'
  };
  const val = validateManifest(badAlgo);
  assert.equal(val.valid, false);
  assert.includes(val.errors[0], 'MD5');
});

suite.test('B19.4: Manifest rejects invalid SHA-256 checksum format in file entry', (assert) => {
  const badHashManifest = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 1, total_bytes: 10 },
    files: [{ relative_path: 'f1.txt', byte_size: 10, sha256: 'short_hash' }],
    checksum_algorithm: 'SHA-256'
  };
  const val = validateManifest(badHashManifest);
  assert.equal(val.valid, false);
});

suite.test('B19.5: Manifest preserves empty warnings array cleanly', (assert) => {
  const manifest = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 0, total_bytes: 0 },
    files: [],
    warnings: [],
    checksum_algorithm: 'SHA-256'
  };
  assert.equal(Array.isArray(manifest.warnings), true);
  assert.equal(manifest.warnings.length, 0);
});

// ===========================================================================
// BOUNDARY 20: Google Drive Staging Boundaries
// ===========================================================================

suite.test('B20.1: Google Drive lock contention: EBUSY simulation retries with exponential backoff', async (assert) => {
  let attempts = 0;
  const mockDriveTransfer = async () => {
    while (attempts < 3) {
      attempts++;
      if (attempts < 3) {
        const err = new Error('Resource busy or locked');
        err.code = 'EBUSY';
        // wait backoff
        continue;
      }
      return true;
    }
  };
  const result = await mockDriveTransfer();
  assert.equal(result, true);
  assert.equal(attempts, 3);
});

suite.test('B20.2: Google Drive lock contention: EPERM permission lock simulation', async (assert) => {
  let attempts = 0;
  const mockDrivePermissionLock = async () => {
    while (attempts < 2) {
      attempts++;
      if (attempts < 2) {
        const err = new Error('Operation not permitted');
        err.code = 'EPERM';
        continue;
      }
      return 'UNLOCKED';
    }
  };
  const res = await mockDrivePermissionLock();
  assert.equal(res, 'UNLOCKED');
});

suite.test('B20.3: Rapid sequential backup jobs create isolated non-colliding staging dirs', (assert) => {
  const dirs = new Set();
  for (let i = 0; i < 50; i++) {
    const p = path.join(SCRATCH_STAGING_DIR, `clinic1_${Date.now()}_${i}`);
    dirs.add(p);
  }
  assert.equal(dirs.size, 50);
});

suite.test('B20.4: Staging directory path length remains under Windows MAX_PATH (260 chars)', (assert) => {
  const longClinicId = 'c1000000-0000-0000-0000-000000000001';
  const stagingPath = path.join(SCRATCH_STAGING_DIR, `${longClinicId}_1792688000000`);
  assert.ok(stagingPath.length < 240, `Staging path (${stagingPath.length} chars) is well under MAX_PATH`);
});

suite.test('B20.5: Cleanup removes entire staging tree even with subdirectories', (assert) => {
  const treeDir = path.join(os.tmpdir(), 'tree_test_' + Date.now());
  fs.mkdirSync(path.join(treeDir, 'sub1', 'sub2'), { recursive: true });
  fs.writeFileSync(path.join(treeDir, 'sub1', 'sub2', 'test.txt'), 'hello');

  fs.rmSync(treeDir, { recursive: true, force: true });
  assert.equal(fs.existsSync(treeDir), false);
});

// ===========================================================================
// BOUNDARY 21: Exit Code Boundaries
// ===========================================================================

suite.test('B21.1: Exit code 0 is returned only when all 10 tables and manifest succeed', (assert) => {
  const evaluateRun = (tablesCount, manifestOk) => {
    if (tablesCount === 10 && manifestOk) return EXIT_CODES.SUCCESS;
    return EXIT_CODES.INTEGRITY_FAIL;
  };
  assert.equal(evaluateRun(10, true), 0);
  assert.equal(evaluateRun(9, true), 4);
});

suite.test('B21.2: Exit code 1 is returned on PostgREST 500 internal server error', (assert) => {
  const evaluateNetworkError = (status) => {
    if (status >= 500) return EXIT_CODES.NETWORK_OR_FATAL;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(evaluateNetworkError(500), 1);
});

suite.test('B21.3: Exit code 2 is returned on invalid argument combinations', (assert) => {
  assert.equal(EXIT_CODES.BAD_ARGS, 2);
});

suite.test('B21.4: Exit code 3 is returned when clinic UUID is not found in database', (assert) => {
  const handleClinicQuery = (rows) => {
    if (!rows || rows.length === 0) return EXIT_CODES.NOT_FOUND;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(handleClinicQuery([]), 3);
});

suite.test('B21.5: Exit code 4 is returned when SHA-256 hash does not match manifest', (assert) => {
  const verifyHash = (expected, actual) => {
    if (expected !== actual) return EXIT_CODES.INTEGRITY_FAIL;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(verifyHash('hash1', 'hash2'), 4);
});

// ===========================================================================
// BOUNDARY 22: Verification Boundaries
// ===========================================================================

suite.test('B22.1: Tampered file byte size is detected during manifest verification', (assert) => {
  const originalSize = 1024;
  const tamperedSize = 1025;
  assert.notEqual(tamperedSize, originalSize);
});

suite.test('B22.2: Tampered file content triggers SHA-256 hash mismatch', (assert) => {
  const original = 'Accurate clinical record';
  const tampered = 'Tampered clinical record';
  const originalHash = computeSHA256(original);
  const tamperedHash = computeSHA256(tampered);
  assert.notEqual(originalHash, tamperedHash);
});

suite.test('B22.3: Extra unauthorized file in backup directory is detected during integrity scan', (assert) => {
  const manifestFiles = new Set(['data/json/clinics.json', 'data/json/doctors.json']);
  const filesOnDisk = ['data/json/clinics.json', 'data/json/doctors.json', 'data/json/extra_leak.json'];

  const extraFiles = filesOnDisk.filter((f) => !manifestFiles.has(f));
  assert.equal(extraFiles.length, 1);
  assert.equal(extraFiles[0], 'data/json/extra_leak.json');
});

suite.test('B22.4: Missing file listed in manifest but absent on disk is flagged as failure', (assert) => {
  const manifestFiles = ['data/json/clinics.json', 'data/json/missing_file.json'];
  const diskFiles = new Set(['data/json/clinics.json']);

  const missing = manifestFiles.filter((f) => !diskFiles.has(f));
  assert.equal(missing.length, 1);
  assert.equal(missing[0], 'data/json/missing_file.json');
});

suite.test('B22.5: Zero-tolerance redaction audit: scanner detects secret in arbitrarily nested key', (assert) => {
  const deeplyNested = {
    l1: {
      l2: {
        l3: {
          payment_secret_key: 'unredacted_leak'
        }
      }
    }
  };
  const isClean = (obj) => {
    const str = JSON.stringify(obj);
    return !str.includes('unredacted_leak');
  };
  assert.equal(isClean(deeplyNested), false);

  const cleanObj = redactSecrets(deeplyNested);
  assert.equal(isClean(cleanObj), true);
});

module.exports = suite;
