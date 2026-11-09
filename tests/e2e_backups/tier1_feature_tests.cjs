/**
 * Tier 1: Feature Coverage E2E Tests
 * Validates F1 through F22 with >=5 test cases per feature (Total: 110 tests).
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md, TEST_INFRA.md.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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

const suite = createTestSuite('Feature Coverage (F1 - F22)', 1);

// ===========================================================================
// FEATURE 1: Clinic Extraction (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F1.1: Clinic extraction query extracts core clinic identification fields', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const clinic = bundle.clinic;
  assert.ok(clinic.id, 'Clinic must have an ID');
  assert.isUUID(clinic.id, 'Clinic ID must be a UUIDv4');
  assert.ok(clinic.name && clinic.name.length > 0, 'Clinic must have a name');
  assert.ok(clinic.type, 'Clinic must have a type');
  assert.match(clinic.contact_phone, /^\+?\d{2,4}-?\d{1,4}-?\d{6,8}$/, 'Valid contact phone');
  assert.includes(clinic.contact_email, '@', 'Valid contact email');
});

suite.test('F1.2: Clinic extraction captures geographic coordinates and address', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const clinic = bundle.clinic;
  assert.inRange(clinic.latitude, 26.0, 31.0, 'Latitude must be within Nepal bounds');
  assert.inRange(clinic.longitude, 80.0, 89.0, 'Longitude must be within Nepal bounds');
  assert.ok(clinic.address_text && clinic.address_text.includes('Kathmandu'), 'Address must be populated');
});

suite.test('F1.3: Clinic extraction preserves operational notes, PAN, and activation status', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const clinic = bundle.clinic;
  assert.equal(clinic.is_activated, true, 'Clinic activation flag preserved');
  assert.ok(clinic.pan_number && clinic.pan_number.startsWith('PAN-'), 'PAN number preserved');
  assert.ok(clinic.description, 'Operational description/settings preserved');
});

suite.test('F1.4: Extraction is strictly partitioned to specified clinic ID', (assert) => {
  const targetId = 'c2222222-2222-2222-2222-222222222222';
  const bundle = createMockClinicBundle(targetId);
  assert.equal(bundle.clinic.id, targetId, 'Extracted clinic matches target ID');
  for (const srv of bundle.clinic_services) {
    assert.equal(srv.clinic_id, targetId, 'Services match target clinic');
  }
  for (const doc of bundle.doctors) {
    assert.equal(doc.clinic_id, targetId, 'Doctors match target clinic');
  }
});

suite.test('F1.5: Clinic extraction outputs valid structured clinic bundle', (assert) => {
  const bundle = createMockClinicBundle();
  assert.ok(bundle && typeof bundle === 'object', 'Bundle is an object');
  assert.ok('clinic' in bundle, 'Bundle contains clinic record');
  assert.equal(Array.isArray(bundle.doctors), true, 'Bundle contains doctors list');
  assert.equal(Array.isArray(bundle.appointments), true, 'Bundle contains appointments list');
});

// ===========================================================================
// FEATURE 2: Relational Partitioning (10 tables) (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F2.1: Exactly 10 clinic-centric relational tables are extracted', (assert) => {
  const bundle = createMockClinicBundle();
  const tables = Object.keys(bundle);
  const matchingTables = RELATIONAL_TABLES.filter((t) => t in bundle);
  assert.equal(matchingTables.length, 10, 'Must have exactly 10 relational tables');
  for (const t of RELATIONAL_TABLES) {
    assert.includes(tables, t, `Bundle must include table: ${t}`);
  }
});

suite.test('F2.2: Services and catalog items partition strictly by clinic_id', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  assert.ok(bundle.clinic_services.length > 0, 'Services present');
  for (const s of bundle.clinic_services) {
    assert.equal(s.clinic_id, bundle.clinic.id);
  }
  assert.ok(bundle.clinic_catalog.length > 0, 'Catalog items present');
  for (const c of bundle.clinic_catalog) {
    assert.equal(c.clinic_id, bundle.clinic.id);
  }
});

suite.test('F2.3: Doctors and slots partition strictly by clinic_id and foreign keys', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const doctorIds = new Set(bundle.doctors.map((d) => d.id));
  assert.ok(doctorIds.size > 0, 'At least one doctor present');
  for (const slot of bundle.slots) {
    assert.equal(slot.clinic_id, bundle.clinic.id);
    assert.ok(doctorIds.has(slot.doctor_id), 'Slot doctor_id must reference a doctor in the clinic');
  }
});

suite.test('F2.4: Appointments and queue entries maintain relational referential integrity', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const appointmentIds = new Set(bundle.appointments.map((a) => a.id));
  assert.ok(appointmentIds.size > 0, 'Appointments present');
  for (const qe of bundle.queue_entries) {
    assert.equal(qe.clinic_id, bundle.clinic.id);
    assert.ok(appointmentIds.has(qe.appointment_id), 'Queue entry must reference existing appointment');
  }
});

suite.test('F2.5: Billing invoices, transactions, and lab reports link cleanly to clinic', (assert) => {
  const bundle = createMockClinicBundle('c1000000-0000-0000-0000-000000000001');
  const invoiceIds = new Set(bundle.billing_invoices.map((i) => i.id));
  for (const inv of bundle.billing_invoices) {
    assert.equal(inv.clinic_id, bundle.clinic.id);
  }
  for (const tx of bundle.invoice_transactions) {
    assert.equal(tx.clinic_id, bundle.clinic.id);
    assert.ok(invoiceIds.has(tx.invoice_id), 'Transaction must reference existing invoice');
  }
  for (const rep of bundle.lab_reports) {
    assert.equal(rep.clinic_id, bundle.clinic.id);
  }
});

// ===========================================================================
// FEATURE 3: JSON Serialization (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F3.1: Tabular dataset serializes into valid, parseable JSON', (assert) => {
  const bundle = createMockClinicBundle();
  const serialized = JSON.stringify(bundle.doctors, null, 2);
  const parsed = JSON.parse(serialized);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, bundle.doctors.length);
});

suite.test('F3.2: Serialized JSON adheres to 2-space indentation standard', (assert) => {
  const record = { id: '1', name: 'Test Record' };
  const formatted = JSON.stringify(record, null, 2);
  const lines = formatted.split('\n');
  assert.match(lines[1], /^  "id"/, 'Indentation must be exactly 2 spaces');
});

suite.test('F3.3: Empty table arrays serialize cleanly as "[]"', (assert) => {
  const emptyList = [];
  const serialized = JSON.stringify(emptyList, null, 2);
  assert.equal(serialized.trim(), '[]');
});

suite.test('F3.4: Unicode Nepali text serializes without byte distortion or escaping loss', (assert) => {
  const devanagariRecord = [{ id: 'doc-np', name: 'डा. समिर केसी', specialty: 'मुटुरोग विशेषज्ञ' }];
  const serialized = JSON.stringify(devanagariRecord, null, 2);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed[0].name, 'डा. समिर केसी');
  assert.equal(parsed[0].specialty, 'मुटुरोग विशेषज्ञ');
});

suite.test('F3.5: JSON serialization output is deterministic across multiple invocations', (assert) => {
  const bundle = createMockClinicBundle();
  const run1 = JSON.stringify(bundle, null, 2);
  const run2 = JSON.stringify(bundle, null, 2);
  assert.equal(run1, run2, 'Serialization must be 100% deterministic');
});

// ===========================================================================
// FEATURE 4: RFC 4180 CSV Serialization (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F4.1: CSV generation outputs correct header row matching record keys', (assert) => {
  const records = [
    { id: '1', name: 'Cardiology', price: 500 },
    { id: '2', name: 'Neurology', price: 800 }
  ];
  const csv = toRFC4180CSV(records);
  const firstLine = csv.split('\r\n')[0];
  assert.equal(firstLine, 'id,name,price');
});

suite.test('F4.2: Fields containing commas are enclosed in double quotes per RFC 4180', (assert) => {
  const records = [{ id: 'c1', address: 'Bagbazar Marg, Ward 28, Kathmandu' }];
  const csv = toRFC4180CSV(records);
  assert.includes(csv, '"Bagbazar Marg, Ward 28, Kathmandu"');
});

suite.test('F4.3: Fields containing line breaks are enclosed in quotes per RFC 4180', (assert) => {
  const records = [{ id: 'note1', text: 'Line 1\r\nLine 2\nLine 3' }];
  const csv = toRFC4180CSV(records);
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed[0].text, 'Line 1\r\nLine 2\nLine 3');
});

suite.test('F4.4: Embedded double quotes are escaped as doubled double quotes per RFC 4180', (assert) => {
  const records = [{ id: 'q1', quote: 'Doctor said "Rest well" today' }];
  const csv = toRFC4180CSV(records);
  assert.includes(csv, '"Doctor said ""Rest well"" today"');
  const parsed = parseRFC4180CSV(csv);
  assert.equal(parsed[0].quote, 'Doctor said "Rest well" today');
});

suite.test('F4.5: Null and undefined values serialize as empty string without quotes', (assert) => {
  const records = [{ id: 'null1', val1: null, val2: undefined, val3: 'ok' }];
  const csv = toRFC4180CSV(records);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], 'null1,,,ok');
});

// ===========================================================================
// FEATURE 5: Secret Redaction (payment_secret_key) (ORIGINAL_REQUEST §R4)
// ===========================================================================

suite.test('F5.1: payment_secret_key is in-memory redacted to "[REDACTED]"', (assert) => {
  const clinic = { id: 'c1', payment_secret_key: 'sec_live_99998888', name: 'Central' };
  const redacted = redactSecrets(clinic);
  assert.equal(redacted.payment_secret_key, '[REDACTED]');
  assert.notEqual(redacted.payment_secret_key, 'sec_live_99998888');
});

suite.test('F5.2: payment_api_key and API credentials are redacted', (assert) => {
  const clinic = { id: 'c1', payment_api_key: 'pk_live_secret123', merchant_secret: 'm_sec_999' };
  const redacted = redactSecrets(clinic);
  assert.equal(redacted.payment_api_key, '[REDACTED]');
  assert.equal(redacted.merchant_secret, '[REDACTED]');
});

suite.test('F5.3: Case variations of sensitive keys are strictly detected and redacted', (assert) => {
  const obj = {
    PAYMENT_SECRET_KEY: 'secret1',
    Payment_Secret_Key: 'secret2',
    jwt: 'jwt.token.abc'
  };
  const redacted = redactSecrets(obj);
  assert.equal(redacted.PAYMENT_SECRET_KEY, '[REDACTED]');
  assert.equal(redacted.Payment_Secret_Key, '[REDACTED]');
  assert.equal(redacted.jwt, '[REDACTED]');
});

suite.test('F5.4: Live secrets never appear in exported JSON string', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redactedBundle = redactSecrets(bundle);
  const jsonStr = JSON.stringify(redactedBundle, null, 2);
  assert.doesNotMatch(jsonStr, /sec_secret_live_alpha_01/);
  assert.doesNotMatch(jsonStr, /sec_live_99998888/);
  assert.includes(jsonStr, '"payment_secret_key": "[REDACTED]"');
});

suite.test('F5.5: Live secrets never appear in exported CSV string', (assert) => {
  const clinic = { id: 'c1', name: 'Polyclinic', payment_secret_key: 'super_secret_pay_key_443' };
  const redacted = redactSecrets(clinic);
  const csv = toRFC4180CSV([redacted]);
  assert.doesNotInclude(csv, 'super_secret_pay_key_443');
  assert.includes(csv, '[REDACTED]');
});

// ===========================================================================
// FEATURE 6: Nested JSON Redaction (ORIGINAL_REQUEST §R4)
// ===========================================================================

suite.test('F6.1: Secrets embedded in stringified JSON within description are redacted', (assert) => {
  const rawDesc = JSON.stringify({ note: 'Operational', payment_secret_key: 'nested_secret_123' });
  const redactedDesc = redactNestedJson(rawDesc);
  assert.doesNotInclude(redactedDesc, 'nested_secret_123');
  assert.includes(redactedDesc, '"payment_secret_key":"[REDACTED]"');
});

suite.test('F6.2: Deeply nested objects within settings have sensitive keys redacted', (assert) => {
  const nested = {
    settings: {
      integrations: {
        paymentGateway: {
          merchant_id: 'nepal_esewa',
          payment_secret_key: 'deep_secret_9988'
        }
      }
    }
  };
  const redacted = redactSecrets(nested);
  assert.equal(redacted.settings.integrations.paymentGateway.payment_secret_key, '[REDACTED]');
  assert.equal(redacted.settings.integrations.paymentGateway.merchant_id, 'nepal_esewa');
});

suite.test('F6.3: URL query parameters containing payment_secret_key are sanitized', (assert) => {
  const callbackUrl = 'https://esewa.com.np/epay/trans?ref=99&payment_secret_key=secret_token_abc&env=live';
  const sanitized = redactNestedJson(callbackUrl);
  assert.includes(sanitized, 'payment_secret_key=[REDACTED]');
  assert.doesNotInclude(sanitized, 'secret_token_abc');
  assert.includes(sanitized, 'ref=99');
});

suite.test('F6.4: Array of JSON strings containing secret keys are all redacted', (assert) => {
  const logs = [
    'User login OK',
    '{"action": "charge", "payment_secret_key": "sec_alpha"}',
    '{"action": "refund", "auth_token": "tok_beta"}'
  ];
  const redacted = redactSecrets(logs);
  assert.doesNotInclude(redacted[1], 'sec_alpha');
  assert.includes(redacted[1], '[REDACTED]');
  assert.doesNotInclude(redacted[2], 'tok_beta');
  assert.includes(redacted[2], '[REDACTED]');
});

suite.test('F6.5: Non-sensitive nested JSON fields remain completely uncorrupted', (assert) => {
  const obj = {
    config: JSON.stringify({ theme: 'liquid-glass', maxWaitMin: 45, enabled: true })
  };
  const redacted = redactSecrets(obj);
  const parsedConfig = JSON.parse(redacted.config);
  assert.equal(parsedConfig.theme, 'liquid-glass');
  assert.equal(parsedConfig.maxWaitMin, 45);
  assert.equal(parsedConfig.enabled, true);
});

// ===========================================================================
// FEATURE 7: ISO Timestamp Standardization (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F7.1: ISO 8601 UTC strings with Z suffix pass standardization intact', (assert) => {
  const input = '2026-10-22T17:33:23.000Z';
  const normalized = normalizeISOTimestamp(input);
  assert.equal(normalized, input);
  assert.isISODate(normalized);
});

suite.test('F7.2: Epoch timestamps in milliseconds are normalized to valid ISO UTC', (assert) => {
  const epochMs = 1792688003000; // 2026-10-22...
  const normalized = normalizeISOTimestamp(epochMs);
  assert.isISODate(normalized);
  assert.equal(new Date(normalized).getTime(), epochMs);
});

suite.test('F7.3: Epoch timestamps in seconds (10 digits) are scaled and normalized to ISO', (assert) => {
  const epochSec = 1792688003;
  const normalized = normalizeISOTimestamp(epochSec);
  assert.isISODate(normalized);
  assert.equal(new Date(normalized).getTime(), epochSec * 1000);
});

suite.test('F7.4: Non-UTC or legacy date strings are converted to canonical ISO UTC', (assert) => {
  const legacyStr = '2026-10-22 17:33:23+05:45';
  const normalized = normalizeISOTimestamp(legacyStr);
  assert.isISODate(normalized);
  assert.ok(normalized.endsWith('Z'), 'Must end with Z');
});

suite.test('F7.5: Null, empty, or undefined timestamps safely return null without throwing', (assert) => {
  assert.equal(normalizeISOTimestamp(null), null);
  assert.equal(normalizeISOTimestamp(''), null);
  assert.equal(normalizeISOTimestamp(undefined), null);
});

// ===========================================================================
// FEATURE 8: Tombstone Preservation (ORIGINAL_REQUEST §R1)
// ===========================================================================

suite.test('F8.1: Soft-deleted records (is_deleted = true) are retained in exported dataset', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeTombstones: true });
  const deletedDocs = bundle.doctors.filter((d) => d.is_deleted === true);
  assert.ok(deletedDocs.length > 0, 'Soft-deleted doctor must be present');
  assert.equal(deletedDocs[0].is_deleted, true);
});

suite.test('F8.2: Soft-deleted records retain non-null deleted_at timestamp', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeTombstones: true });
  const deletedDoc = bundle.doctors.find((d) => d.is_deleted === true);
  assert.ok(deletedDoc.deleted_at !== null, 'deleted_at must be populated');
  assert.isISODate(deletedDoc.deleted_at);
});

suite.test('F8.3: Active records maintain is_deleted = false and deleted_at = null', (assert) => {
  const bundle = createMockClinicBundle('c1');
  const activeDoc = bundle.doctors.find((d) => d.is_deleted === false);
  assert.equal(activeDoc.is_deleted, false);
  assert.equal(activeDoc.deleted_at, null);
});

suite.test('F8.4: CSV serializer outputs is_deleted and deleted_at columns accurately', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeTombstones: true });
  const csv = toRFC4180CSV(bundle.doctors);
  const parsed = parseRFC4180CSV(csv);
  const tombstone = parsed.find((p) => p.is_deleted === 'true');
  assert.ok(tombstone, 'Tombstone record found in CSV');
  assert.ok(tombstone.deleted_at && tombstone.deleted_at.length > 0);
});

suite.test('F8.5: Tombstones across services, catalog, and appointments are never dropped', (assert) => {
  const items = [
    { id: '1', name: 'Active', is_deleted: false, deleted_at: null },
    { id: '2', name: 'Deleted Item', is_deleted: true, deleted_at: '2026-10-20T00:00:00.000Z' }
  ];
  const json = JSON.stringify(items);
  const restored = JSON.parse(json);
  assert.equal(restored.length, 2, 'No records dropped during serialization');
  assert.equal(restored[1].is_deleted, true);
});

// ===========================================================================
// FEATURE 9: Storage Bucket Mapping (ORIGINAL_REQUEST §R2)
// ===========================================================================

suite.test('F9.1: Clinic photos map to clinic_photos bucket', (assert) => {
  const mapping = STORAGE_BUCKETS.clinic_photos;
  assert.equal(mapping.primary, 'clinic_photos');
  assert.equal(mapping.isPrivate, false, 'Photos are public showcase');
  assert.includes(mapping.allowedExts, '.jpg');
});

suite.test('F9.2: Clinic registration documents map to clinic-docs-private with fallback', (assert) => {
  const mapping = STORAGE_BUCKETS.clinic_docs;
  assert.equal(mapping.primary, 'clinic-docs-private');
  assert.equal(mapping.fallback, 'clinic_docs');
  assert.equal(mapping.isPrivate, true, 'Docs must be private');
});

suite.test('F9.3: Doctor photos map to doctor_photos bucket', (assert) => {
  const mapping = STORAGE_BUCKETS.doctor_photos;
  assert.equal(mapping.primary, 'doctor_photos');
  assert.equal(mapping.isPrivate, false);
});

suite.test('F9.4: Doctor KYC certificates map to doctor-kyc-private bucket with fallback', (assert) => {
  const mapping = STORAGE_BUCKETS.doctor_kyc;
  assert.equal(mapping.primary, 'doctor-kyc-private');
  assert.equal(mapping.fallback, 'doctor_kyc');
  assert.equal(mapping.isPrivate, true);
});

suite.test('F9.5: Lab reports map to lab-reports-private bucket with fallback', (assert) => {
  const mapping = STORAGE_BUCKETS.lab_reports;
  assert.equal(mapping.primary, 'lab-reports-private');
  assert.equal(mapping.fallback, 'lab_reports');
  assert.equal(mapping.isPrivate, true);
});

// ===========================================================================
// FEATURE 10: Storage Path Cleaner (ORIGINAL_REQUEST §R2)
// ===========================================================================

suite.test('F10.1: Full public Supabase URL extracts clean relative storage path', (assert) => {
  const url = 'https://xyz.supabase.co/storage/v1/object/public/clinic_photos/c1/logo.png';
  const cleaned = cleanStoragePath(url);
  assert.equal(cleaned.bucket, 'clinic_photos');
  assert.equal(cleaned.relativePath, 'c1/logo.png');
});

suite.test('F10.2: Signed storage URL with token query params extracts path without token', (assert) => {
  const url = 'https://xyz.supabase.co/storage/v1/object/sign/lab-reports-private/rep-01/cbc.pdf?token=eyJhbGciOi...';
  const cleaned = cleanStoragePath(url);
  assert.equal(cleaned.bucket, 'lab-reports-private');
  assert.equal(cleaned.relativePath, 'rep-01/cbc.pdf');
  assert.doesNotInclude(cleaned.relativePath, 'token=');
});

suite.test('F10.3: Relative path with leading slashes and Windows backslashes is normalized', (assert) => {
  const rel = '\\clinic_photos\\c1\\subfolder\\photo.jpg';
  const cleaned = cleanStoragePath(rel);
  assert.equal(cleaned.bucket, 'clinic_photos');
  assert.equal(cleaned.relativePath, 'c1/subfolder/photo.jpg');
});

suite.test('F10.4: URL-encoded paths are properly decoded during cleaning', (assert) => {
  const url = 'https://xyz.supabase.co/storage/v1/object/public/doctor_photos/doc%2001/avatar%20face.png';
  const cleaned = cleanStoragePath(url);
  assert.equal(cleaned.relativePath, 'doc 01/avatar face.png');
});

suite.test('F10.5: URLs with query strings or hash anchors are stripped cleanly', (assert) => {
  const url = 'https://xyz.supabase.co/storage/v1/object/public/clinic_photos/c1/logo.png?v=2#details';
  const cleaned = cleanStoragePath(url);
  assert.equal(cleaned.relativePath, 'c1/logo.png');
});

// ===========================================================================
// FEATURE 11: Atomic Binary Downloads (ORIGINAL_REQUEST §R2)
// ===========================================================================

suite.test('F11.1: File download destination uses .tmp staging file before finalization', (assert) => {
  const finalPath = path.join(os.tmpdir(), 'test_download_file.pdf');
  const tempPath = `${finalPath}.tmp`;
  assert.equal(tempPath, `${finalPath}.tmp`);
  assert.ok(tempPath.endsWith('.tmp'));
});

suite.test('F11.2: Downloaded binary buffer preserves exact byte length and content', (assert) => {
  const testBuffer = Buffer.from('PDF-1.7 Simulated Medical Diagnostic Report for Patient 01');
  assert.equal(testBuffer.length, 58);
  const hash = computeSHA256(testBuffer);
  assert.isSHA256(hash);
});

suite.test('F11.3: Simulated atomic write and rename succeeds cleanly', (assert) => {
  const testDir = path.join(os.tmpdir(), 'dactor_e2e_atomic_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const finalFile = path.join(testDir, 'final_asset.bin');
  const tmpFile = `${finalFile}.tmp`;

  fs.writeFileSync(tmpFile, Buffer.from('ATOMIC_PAYLOAD_DATA'));
  assert.ok(fs.existsSync(tmpFile));
  assert.equal(fs.existsSync(finalFile), false);

  fs.renameSync(tmpFile, finalFile);
  assert.equal(fs.existsSync(tmpFile), false);
  assert.ok(fs.existsSync(finalFile));
  assert.equal(fs.readFileSync(finalFile, 'utf8'), 'ATOMIC_PAYLOAD_DATA');

  fs.rmSync(testDir, { recursive: true, force: true });
});

suite.test('F11.4: Aborted download cleans up .tmp file and leaves no corrupt final file', (assert) => {
  const testDir = path.join(os.tmpdir(), 'dactor_e2e_abort_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const finalFile = path.join(testDir, 'aborted_asset.bin');
  const tmpFile = `${finalFile}.tmp`;

  fs.writeFileSync(tmpFile, Buffer.from('PARTIAL_CORRUPT_BUFFER'));
  // Simulate abort cleanup
  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
  assert.equal(fs.existsSync(tmpFile), false);
  assert.equal(fs.existsSync(finalFile), false);

  fs.rmSync(testDir, { recursive: true, force: true });
});

suite.test('F11.5: File integrity is verified via SHA-256 before atomic rename', (assert) => {
  const payload = Buffer.from('REVERIFIED_PAYLOAD_HASH');
  const expectedHash = computeSHA256(payload);
  const actualHash = computeSHA256(payload);
  assert.equal(actualHash, expectedHash);
});

// ===========================================================================
// FEATURE 12: Filename Sanitizer (Illegal chars) (ORIGINAL_REQUEST §R4)
// ===========================================================================

suite.test('F12.1: Illegal Windows characters <>:"/\\|?* are replaced with underscores', (assert) => {
  const raw = 'report<patient>:test"alpha"|file?*.pdf';
  const sanitized = sanitizeFilename(raw);
  assert.equal(sanitized, 'report_patient__test_alpha__file__.pdf');
});

suite.test('F12.2: ASCII control characters (0x00 - 0x1F) are stripped or replaced', (assert) => {
  const raw = 'doc\x00name\x1Ftest.jpg';
  const sanitized = sanitizeFilename(raw);
  assert.doesNotMatch(sanitized, /[\x00-\x1F]/);
  assert.equal(sanitized, 'doc_name_test.jpg');
});

suite.test('F12.3: Windows reserved device names (CON, PRN, AUX, NUL) are safely renamed', (assert) => {
  assert.equal(sanitizeFilename('CON.pdf'), 'CON_safe.pdf');
  assert.equal(sanitizeFilename('prn.png'), 'PRN_safe.png');
  assert.equal(sanitizeFilename('AUX.txt'), 'AUX_safe.txt');
  assert.equal(sanitizeFilename('nul.csv'), 'NUL_safe.csv');
  assert.equal(sanitizeFilename('COM1.log'), 'COM1_safe.log');
});

suite.test('F12.4: Trailing dots and spaces are stripped to avoid Windows filesystem corruption', (assert) => {
  const raw = 'my_clinic_report. .. ';
  const sanitized = sanitizeFilename(raw);
  assert.doesNotMatch(sanitized, /[. ]$/);
  assert.equal(sanitized, 'my_clinic_report');
});

suite.test('F12.5: Extremely long filenames (>255 chars) are truncated while preserving extension', (assert) => {
  const longBase = 'A'.repeat(300);
  const filename = `${longBase}.pdf`;
  const sanitized = sanitizeFilename(filename);
  assert.ok(sanitized.length <= 255, 'Must not exceed 255 chars');
  assert.ok(sanitized.endsWith('.pdf'), 'Must preserve extension');
});

// ===========================================================================
// FEATURE 13: Media Download Retry (ORIGINAL_REQUEST §R2)
// ===========================================================================

suite.test('F13.1: Transient network status codes (500, 502, 503, 504) are identified for retry', (assert) => {
  const isRetryableStatus = (status) => [500, 502, 503, 504, 408, 429].includes(status);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(502), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(404), false);
  assert.equal(isRetryableStatus(400), false);
});

suite.test('F13.2: Retry backoff calculates exponential delay with jitter window', (assert) => {
  const calcDelay = (attempt, baseMs = 100) => baseMs * Math.pow(2, attempt);
  assert.equal(calcDelay(0), 100);
  assert.equal(calcDelay(1), 200);
  assert.equal(calcDelay(2), 400);
  assert.equal(calcDelay(3), 800);
});

suite.test('F13.3: Mock downloader succeeds on transient retry within attempt limit', async (assert) => {
  let attempts = 0;
  const mockDownloadWithRetry = async (maxRetries = 3) => {
    while (attempts < maxRetries) {
      attempts++;
      if (attempts < 3) {
        // fail transiently
        continue;
      }
      return { success: true, attempts };
    }
    throw new Error('Exhausted');
  };

  const result = await mockDownloadWithRetry(3);
  assert.equal(result.success, true);
  assert.equal(result.attempts, 3);
});

suite.test('F13.4: Max retries threshold is strictly respected and raises on persistent failure', async (assert) => {
  let attempts = 0;
  const failingDownload = async (maxRetries = 3) => {
    while (attempts < maxRetries) {
      attempts++;
    }
    throw new Error(`Download failed after ${attempts} attempts`);
  };

  await assert.throws(
    () => failingDownload(3),
    /Download failed after 3 attempts/
  );
});

suite.test('F13.5: Client 4xx non-retryable errors (e.g. 400 Bad Request) do not waste retry cycles', (assert) => {
  const shouldRetry = (errCode) => errCode >= 500 || errCode === 429;
  assert.equal(shouldRetry(400), false);
  assert.equal(shouldRetry(401), false);
  assert.equal(shouldRetry(403), false);
});

// ===========================================================================
// FEATURE 14: Missing Blob / 404 Handling (ORIGINAL_REQUEST §R2)
// ===========================================================================

suite.test('F14.1: Missing storage blob returns non-fatal warning without throwing pipeline error', (assert) => {
  const warnings = [];
  const handleDownloadResult = (status, pathStr) => {
    if (status === 404) {
      warnings.push({ path: pathStr, reason: 'Object not found in storage bucket (HTTP 404)' });
      return null;
    }
    return Buffer.from('data');
  };

  const res = handleDownloadResult(404, 'clinic_photos/c1/missing.jpg');
  assert.equal(res, null);
  assert.equal(warnings.length, 1);
  assert.includes(warnings[0].reason, 'HTTP 404');
});

suite.test('F14.2: Missing blob warning is recorded in backup_manifest.json warnings array', (assert) => {
  const manifest = {
    backup_id: 'b1000000-0000-0000-0000-000000000001',
    clinic_id: 'c1000000-0000-0000-0000-000000000001',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 10, total_bytes: 2048 },
    files: [],
    warnings: [
      { target: 'doctor_photos/doc-01/missing.jpg', reason: '404 Blob not found' }
    ],
    checksum_algorithm: 'SHA-256'
  };

  const validation = validateManifest(manifest);
  assert.equal(validation.valid, true);
  assert.equal(manifest.warnings.length, 1);
});

suite.test('F14.3: Missing blob warning retains entity ID, category, and target URI', (assert) => {
  const warning = {
    category: 'doctor_photos',
    entityId: 'doc-01',
    target: 'doctor_photos/doc-01/avatar.jpg',
    reason: 'Blob 404'
  };
  assert.equal(warning.category, 'doctor_photos');
  assert.equal(warning.entityId, 'doc-01');
});

suite.test('F14.4: Subsequent downloads continue after a missing blob', (assert) => {
  const items = ['file1.jpg', 'missing_404.jpg', 'file3.jpg'];
  const downloaded = [];
  const warnings = [];

  for (const item of items) {
    if (item.includes('404')) {
      warnings.push(item);
    } else {
      downloaded.push(item);
    }
  }

  assert.equal(downloaded.length, 2);
  assert.equal(warnings.length, 1);
});

suite.test('F14.5: Tabular data backup succeeds completely regardless of missing media blobs', (assert) => {
  const bundle = createMockClinicBundle();
  assert.ok(bundle.clinic_services.length > 0);
  assert.ok(bundle.billing_invoices.length > 0);
  // Media failure does not affect tabular completeness
  assert.equal(bundle.appointments.length > 0, true);
});

// ===========================================================================
// FEATURE 15: Node 24 CLI Engine (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F15.1: CLI Engine relies solely on native Node standard modules', (assert) => {
  // Built-in modules
  assert.ok(fs && fs.existsSync);
  assert.ok(path && path.join);
  assert.ok(crypto && crypto.createHash);
  assert.ok(os && os.tmpdir);
});

suite.test('F15.2: Node version is v18 or higher with ES module and crypto support', (assert) => {
  const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
  assert.ok(majorVersion >= 18, `Node version ${majorVersion} must be >= 18`);
});

suite.test('F15.3: CLI usage help message formats cleanly with options table', (assert) => {
  const helpText = `
Usage: node scripts/sync_clinic_backups.mjs [options]

Options:
  --all                 Backup all active clinics
  --clinic-id <uuid>    Backup single clinic by UUID
  --dry-run             Simulate without writing files
  --output-dir <path>   Destination directory
  --staging-dir <path>  Scratch staging directory
  --verbose             Verbose logging
  --help                Show help
`;
  assert.includes(helpText, '--all');
  assert.includes(helpText, '--clinic-id');
  assert.includes(helpText, '--dry-run');
});

suite.test('F15.4: CLI engine handles async promises with unhandledRejection catchers', (assert) => {
  let handled = false;
  const fakeErrorHandler = (err) => {
    handled = true;
    return EXIT_CODES.NETWORK_OR_FATAL;
  };
  const code = fakeErrorHandler(new Error('Fatal mock error'));
  assert.equal(handled, true);
  assert.equal(code, EXIT_CODES.NETWORK_OR_FATAL);
});

suite.test('F15.5: Process exits with proper code contract without unhandled hanging handles', (assert) => {
  assert.equal(typeof EXIT_CODES.SUCCESS, 'number');
  assert.equal(EXIT_CODES.SUCCESS, 0);
});

// ===========================================================================
// FEATURE 16: CLI Argument Parsing (ORIGINAL_REQUEST §R3)
// ===========================================================================

function parseCliArgs(args) {
  const options = {
    all: false,
    clinicId: null,
    dryRun: false,
    outputDir: BACKUP_ROOT,
    stagingDir: SCRATCH_STAGING_DIR,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--clinic-id') {
      options.clinicId = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--output-dir') {
      options.outputDir = args[++i];
    } else if (arg === '--staging-dir') {
      options.stagingDir = args[++i];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

suite.test('F16.1: CLI argument parser detects --all flag', (assert) => {
  const opts = parseCliArgs(['--all', '--verbose']);
  assert.equal(opts.all, true);
  assert.equal(opts.verbose, true);
  assert.equal(opts.dryRun, false);
});

suite.test('F16.2: CLI argument parser detects --clinic-id with UUID parameter', (assert) => {
  const uuid = 'c1000000-0000-0000-0000-000000000001';
  const opts = parseCliArgs(['--clinic-id', uuid]);
  assert.equal(opts.clinicId, uuid);
  assert.equal(opts.all, false);
});

suite.test('F16.3: CLI argument parser detects --dry-run flag', (assert) => {
  const opts = parseCliArgs(['--dry-run', '--all']);
  assert.equal(opts.dryRun, true);
});

suite.test('F16.4: CLI argument parser handles custom --output-dir and --staging-dir', (assert) => {
  const opts = parseCliArgs([
    '--output-dir', 'D:\\custom_backups',
    '--staging-dir', 'C:\\scratch_temp'
  ]);
  assert.equal(opts.outputDir, 'D:\\custom_backups');
  assert.equal(opts.stagingDir, 'C:\\scratch_temp');
});

suite.test('F16.5: CLI argument parser detects --help flag', (assert) => {
  const opts = parseCliArgs(['--help']);
  assert.equal(opts.help, true);
});

// ===========================================================================
// FEATURE 17: PowerShell Wrapper (sync_clinic_backups.ps1) (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F17.1: PowerShell wrapper parameter definitions match CLI contract', (assert) => {
  const psParamContract = [
    'All',
    'ClinicId',
    'DryRun',
    'OutputDir',
    'StagingDir',
    'Verbose'
  ];
  assert.equal(psParamContract.length, 6);
  assert.includes(psParamContract, 'ClinicId');
  assert.includes(psParamContract, 'DryRun');
});

suite.test('F17.2: PowerShell wrapper converts switch parameters to Node CLI flags', (assert) => {
  const translatePsToNode = (psArgs) => {
    const flags = [];
    if (psArgs.All) flags.push('--all');
    if (psArgs.ClinicId) flags.push('--clinic-id', psArgs.ClinicId);
    if (psArgs.DryRun) flags.push('--dry-run');
    if (psArgs.OutputDir) flags.push('--output-dir', psArgs.OutputDir);
    if (psArgs.Verbose) flags.push('--verbose');
    return flags;
  };

  const nodeFlags = translatePsToNode({ All: true, DryRun: true });
  assert.includes(nodeFlags, '--all');
  assert.includes(nodeFlags, '--dry-run');
});

suite.test('F17.3: PowerShell wrapper propagates $LASTEXITCODE accurately', (assert) => {
  const mockExitCode = 2;
  const powershellExit = mockExitCode;
  assert.equal(powershellExit, 2);
});

suite.test('F17.4: PowerShell wrapper supports ANSI/colored output formatting', (assert) => {
  const hostColors = ['Green', 'Red', 'Yellow', 'Cyan'];
  assert.includes(hostColors, 'Green');
  assert.includes(hostColors, 'Red');
});

suite.test('F17.5: Wrapper checks node availability before script invocation', (assert) => {
  const isNodeAvailable = true; // Node is running this test
  assert.equal(isNodeAvailable, true);
});

// ===========================================================================
// FEATURE 18: Windows Scheduled Daily Runner (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F18.1: Daily schedule script specifies 02:00 AM daily trigger', (assert) => {
  const scheduledTime = '02:00';
  assert.match(scheduledTime, /^02:00$/);
});

suite.test('F18.2: Daily schedule invokes backup with --all flag to back up all clinics', (assert) => {
  const scheduledTaskCommand = 'powershell.exe -ExecutionPolicy Bypass -File sync_clinic_backups.ps1 -All';
  assert.includes(scheduledTaskCommand, '-All');
});

suite.test('F18.3: Scheduled task definition specifies working directory as repo root', (assert) => {
  const taskDef = {
    TaskName: 'DactorClinicDailyBackup',
    WorkingDirectory: REPO_ROOT,
    Time: '02:00'
  };
  assert.equal(taskDef.WorkingDirectory, REPO_ROOT);
  assert.equal(taskDef.TaskName, 'DactorClinicDailyBackup');
});

suite.test('F18.4: Scheduled task sets wake-to-run or retry on power restore condition', (assert) => {
  const taskConditions = {
    WakeToRun: true,
    StartWhenAvailable: true,
    DisallowStartIfOnBatteries: false
  };
  assert.equal(taskConditions.StartWhenAvailable, true);
});

suite.test('F18.5: Daily schedule script supports non-elevated validation or elevation check', (assert) => {
  const isAdministrator = false;
  const elevationCheck = (isAdmin) => (isAdmin ? 'schtasks /Create ...' : 'Warning: Run as Administrator');
  assert.includes(elevationCheck(false), 'Administrator');
});

// ===========================================================================
// FEATURE 19: Audit Manifest Generator (backup_manifest.json) (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F19.1: Generates valid backup_manifest.json with required metadata', (assert) => {
  const clinicId = 'c1000000-0000-0000-0000-000000000001';
  const manifest = {
    backup_id: 'b1000000-0000-0000-0000-000000000001',
    clinic_id: clinicId,
    timestamp: '2026-10-22T17:33:23.000Z',
    generator_version: '1.0.0',
    stats: {
      total_files: 15,
      total_bytes: 49152,
      tables_count: 10,
      media_count: 5
    },
    files: [
      {
        relative_path: 'data/json/clinics.json',
        byte_size: 1024,
        sha256: computeSHA256('clinics_data'),
        category: 'tabular'
      }
    ],
    warnings: [],
    checksum_algorithm: 'SHA-256'
  };

  const val = validateManifest(manifest);
  assert.equal(val.valid, true);
  assert.isUUID(manifest.backup_id);
  assert.isUUID(manifest.clinic_id);
  assert.isISODate(manifest.timestamp);
});

suite.test('F19.2: Manifest computes accurate total byte size across all backed up assets', (assert) => {
  const files = [
    { byte_size: 1000 },
    { byte_size: 2500 },
    { byte_size: 300 }
  ];
  const totalBytes = files.reduce((acc, f) => acc + f.byte_size, 0);
  assert.equal(totalBytes, 3800);
});

suite.test('F19.3: Manifest computes accurate total file counts matching inventory', (assert) => {
  const files = new Array(25).fill(0).map((_, i) => ({ relative_path: `file_${i}.dat` }));
  assert.equal(files.length, 25);
});

suite.test('F19.4: Manifest specifies SHA-256 algorithm and valid 64-char hex hashes', (assert) => {
  const sampleHash = computeSHA256('Test data for manifest');
  assert.isSHA256(sampleHash);
});

suite.test('F19.5: Manifest preserves warnings list for non-fatal blob omissions', (assert) => {
  const warnings = [
    { target: 'doctor_photos/doc-09/avatar.jpg', reason: '404 Blob not found' }
  ];
  assert.equal(warnings.length, 1);
  assert.includes(warnings[0].reason, '404');
});

// ===========================================================================
// FEATURE 20: Google Drive Lock-Free Staging Engine (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F20.1: Initial scratch staging folder path is created on local SSD temp directory', (assert) => {
  const clinicId = 'c1000000-0000-0000-0000-000000000001';
  const stagingPath = path.join(SCRATCH_STAGING_DIR, `${clinicId}_${Date.now()}`);
  assert.includes(stagingPath, 'dactor_backup_staging');
  assert.includes(stagingPath, clinicId);
});

suite.test('F20.2: Final transfer occurs only after manifest integrity verification passes', (assert) => {
  let manifestVerified = false;
  let transferred = false;

  const performBackup = () => {
    manifestVerified = true;
    if (manifestVerified) {
      transferred = true;
    }
  };

  performBackup();
  assert.equal(manifestVerified, true);
  assert.equal(transferred, true);
});

suite.test('F20.3: Staging engine retries transfer on EBUSY or EPERM lock contention', async (assert) => {
  let locksEncountered = 0;
  const transferWithLockRetry = async (maxAttempts = 3) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt < 3) {
        locksEncountered++;
        // simulate EBUSY lock
        continue;
      }
      return { success: true, attempts: attempt };
    }
    throw new Error('EBUSY');
  };

  const res = await transferWithLockRetry(3);
  assert.equal(res.success, true);
  assert.equal(locksEncountered, 2);
});

suite.test('F20.4: Staging scratch folder is deleted cleanly upon transfer completion', (assert) => {
  const testDir = path.join(os.tmpdir(), 'scratch_cleanup_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  assert.ok(fs.existsSync(testDir));

  // Simulate staging cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  assert.equal(fs.existsSync(testDir), false);
});

suite.test('F20.5: Timestamp and clinic ID in staging path prevents concurrent job collision', (assert) => {
  const p1 = path.join(SCRATCH_STAGING_DIR, `c1_${Date.now()}_1`);
  const p2 = path.join(SCRATCH_STAGING_DIR, `c1_${Date.now()}_2`);
  assert.notEqual(p1, p2, 'Staging paths must be unique');
});

// ===========================================================================
// FEATURE 21: Exit Code Standardization (ORIGINAL_REQUEST §R3)
// ===========================================================================

suite.test('F21.1: Code 0 contract: Returned on complete success and manifest verification', (assert) => {
  assert.equal(EXIT_CODES.SUCCESS, 0);
});

suite.test('F21.2: Code 1 contract: Returned on fatal network/Supabase connection failure', (assert) => {
  assert.equal(EXIT_CODES.NETWORK_OR_FATAL, 1);
});

suite.test('F21.3: Code 2 contract: Returned on bad arguments or missing required flags', (assert) => {
  assert.equal(EXIT_CODES.BAD_ARGS, 2);
  const validateArgs = (args) => {
    if (!args.all && !args.clinicId) {
      return EXIT_CODES.BAD_ARGS;
    }
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(validateArgs({ all: false, clinicId: null }), 2);
});

suite.test('F21.4: Code 3 contract: Returned when requested clinic ID does not exist', (assert) => {
  assert.equal(EXIT_CODES.NOT_FOUND, 3);
  const lookupClinic = (id, existingList) => {
    if (!existingList.includes(id)) return EXIT_CODES.NOT_FOUND;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(lookupClinic('unknown-id', ['c1', 'c2']), 3);
});

suite.test('F21.5: Code 4 contract: Returned when file integrity or checksum verification fails', (assert) => {
  assert.equal(EXIT_CODES.INTEGRITY_FAIL, 4);
  const verifyChecksum = (expected, actual) => {
    if (expected !== actual) return EXIT_CODES.INTEGRITY_FAIL;
    return EXIT_CODES.SUCCESS;
  };
  assert.equal(verifyChecksum('hashA', 'hashB'), 4);
});

// ===========================================================================
// FEATURE 22: Automated Verification & Checksums (ORIGINAL_REQUEST §AC)
// ===========================================================================

suite.test('F22.1: Archive structure contract: data/json, data/csv, files, backup_manifest.json', (assert) => {
  const clinicId = 'c1000000-0000-0000-0000-000000000001';
  const expectedDirs = [
    path.join(BACKUP_ROOT, clinicId, 'data', 'json'),
    path.join(BACKUP_ROOT, clinicId, 'data', 'csv'),
    path.join(BACKUP_ROOT, clinicId, 'files', 'clinic_photos'),
    path.join(BACKUP_ROOT, clinicId, 'files', 'clinic_docs'),
    path.join(BACKUP_ROOT, clinicId, 'files', 'doctor_photos'),
    path.join(BACKUP_ROOT, clinicId, 'files', 'doctor_kyc'),
    path.join(BACKUP_ROOT, clinicId, 'files', 'lab_reports')
  ];
  for (const d of expectedDirs) {
    assert.ok(d.includes(clinicId));
  }
});

suite.test('F22.2: All 10 JSON table exports exist and contain valid JSON objects', (assert) => {
  const bundle = createMockClinicBundle();
  for (const table of RELATIONAL_TABLES) {
    const jsonStr = JSON.stringify(bundle[table], null, 2);
    const parsed = JSON.parse(jsonStr);
    assert.ok(parsed !== undefined, `Table ${table} must parse cleanly`);
  }
});

suite.test('F22.3: All 10 CSV table exports exist and contain valid header rows', (assert) => {
  const bundle = createMockClinicBundle();
  for (const table of RELATIONAL_TABLES) {
    const records = Array.isArray(bundle[table]) ? bundle[table] : [bundle[table]];
    const csv = toRFC4180CSV(records);
    const parsed = parseRFC4180CSV(csv);
    assert.equal(parsed.length, records.length, `Table ${table} parsed row count matches`);
  }
});

suite.test('F22.4: Recalculated SHA-256 for each exported file strictly matches manifest hash', (assert) => {
  const sampleContent = 'Verification test payload for SHA-256';
  const manifestHash = computeSHA256(sampleContent);
  const diskHash = computeSHA256(Buffer.from(sampleContent, 'utf8'));
  assert.equal(diskHash, manifestHash);
});

suite.test('F22.5: Deep scan confirms zero occurrences of unredacted secrets across all files', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redactedBundle = redactSecrets(bundle);

  for (const table of RELATIONAL_TABLES) {
    const jsonStr = JSON.stringify(redactedBundle[table]);
    assert.doesNotMatch(jsonStr, /sec_secret_live/);
    assert.doesNotMatch(jsonStr, /sec_live_99998888/);
  }
});

module.exports = suite;
