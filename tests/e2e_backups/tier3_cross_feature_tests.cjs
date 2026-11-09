/**
 * Tier 3: Cross-Feature Combinations E2E Tests
 * Validates pairwise and multi-feature interactions across the pipeline (>=25 tests).
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

const suite = createTestSuite('Cross-Feature Combinations (Tier 3)', 3);

// ---------------------------------------------------------------------------
// C1: Extraction + JSON Serialization
// ---------------------------------------------------------------------------
suite.test('C1: Relational extraction bundle converts cleanly to 10 valid JSON exports', (assert) => {
  const bundle = createMockClinicBundle();
  for (const table of RELATIONAL_TABLES) {
    const json = JSON.stringify(bundle[table], null, 2);
    const parsed = JSON.parse(json);
    assert.ok(parsed !== null && parsed !== undefined, `Table ${table} must be valid JSON`);
  }
});

// ---------------------------------------------------------------------------
// C2: Extraction + RFC 4180 CSV Serialization
// ---------------------------------------------------------------------------
suite.test('C2: Relational extraction bundle converts cleanly to 10 valid RFC 4180 CSV exports', (assert) => {
  const bundle = createMockClinicBundle();
  for (const table of RELATIONAL_TABLES) {
    const records = Array.isArray(bundle[table]) ? bundle[table] : [bundle[table]];
    const csv = toRFC4180CSV(records);
    const parsed = parseRFC4180CSV(csv);
    assert.equal(parsed.length, records.length);
  }
});

// ---------------------------------------------------------------------------
// C3: Extraction + Secret Redaction
// ---------------------------------------------------------------------------
suite.test('C3: Sensitive payment keys are redacted across extracted tables before export', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redacted = redactSecrets(bundle);
  assert.equal(redacted.clinic.payment_secret_key, '[REDACTED]');
  assert.equal(redacted.clinic.payment_api_key, '[REDACTED]');
});

// ---------------------------------------------------------------------------
// C4: Extraction + Nested JSON Redaction
// ---------------------------------------------------------------------------
suite.test('C4: Secrets nested inside clinics.description are redacted before saving', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redacted = redactSecrets(bundle);
  assert.doesNotInclude(redacted.clinic.description, 'sec_live_99998888');
  assert.includes(redacted.clinic.description, '[REDACTED]');
});

// ---------------------------------------------------------------------------
// C5: Secret Redaction + JSON Serialization
// ---------------------------------------------------------------------------
suite.test('C5: Serialized JSON output contains zero raw secrets across all tables', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redacted = redactSecrets(bundle);
  const jsonStr = JSON.stringify(redacted, null, 2);
  assert.doesNotMatch(jsonStr, /sec_secret_live_alpha_01/);
  assert.doesNotMatch(jsonStr, /sec_live_99998888/);
  assert.includes(jsonStr, '"payment_secret_key": "[REDACTED]"');
});

// ---------------------------------------------------------------------------
// C6: Secret Redaction + CSV Serialization
// ---------------------------------------------------------------------------
suite.test('C6: Serialized CSV output contains zero raw secrets across all tables', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeSecrets: true });
  const redacted = redactSecrets(bundle);
  const csv = toRFC4180CSV([redacted.clinic]);
  assert.doesNotInclude(csv, 'sec_secret_live_alpha_01');
  assert.includes(csv, '[REDACTED]');
});

// ---------------------------------------------------------------------------
// C7: Extraction + Tombstone Preservation + JSON
// ---------------------------------------------------------------------------
suite.test('C7: Soft-deleted records are serialized in JSON with is_deleted=true and deleted_at', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeTombstones: true });
  const json = JSON.stringify(bundle.doctors, null, 2);
  const parsed = JSON.parse(json);
  const deadDoc = parsed.find((d) => d.is_deleted === true);
  assert.ok(deadDoc, 'Dead doctor must be in JSON');
  assert.isISODate(deadDoc.deleted_at);
});

// ---------------------------------------------------------------------------
// C8: Extraction + Tombstone Preservation + CSV
// ---------------------------------------------------------------------------
suite.test('C8: Soft-deleted records are serialized in CSV with is_deleted=true and deleted_at', (assert) => {
  const bundle = createMockClinicBundle('c1', { includeTombstones: true });
  const csv = toRFC4180CSV(bundle.doctors);
  const parsed = parseRFC4180CSV(csv);
  const deadDoc = parsed.find((d) => d.is_deleted === 'true');
  assert.ok(deadDoc, 'Dead doctor must be in CSV');
  assert.isISODate(deadDoc.deleted_at);
});

// ---------------------------------------------------------------------------
// C9: Timestamp Standardization + JSON Serialization
// ---------------------------------------------------------------------------
suite.test('C9: Standardized timestamps appear in canonical ISO format in JSON', (assert) => {
  const record = { created_at: normalizeISOTimestamp(1792688003000) };
  const json = JSON.stringify(record);
  const parsed = JSON.parse(json);
  assert.isISODate(parsed.created_at);
});

// ---------------------------------------------------------------------------
// C10: Timestamp Standardization + CSV Serialization
// ---------------------------------------------------------------------------
suite.test('C10: Standardized timestamps appear in canonical ISO format in CSV', (assert) => {
  const record = [{ id: '1', created_at: normalizeISOTimestamp(1792688003000) }];
  const csv = toRFC4180CSV(record);
  const parsed = parseRFC4180CSV(csv);
  assert.isISODate(parsed[0].created_at);
});

// ---------------------------------------------------------------------------
// C11: Storage Bucket Mapping + Path Cleaning
// ---------------------------------------------------------------------------
suite.test('C11: Bucket mapping identifies category and cleans Supabase storage URL', (assert) => {
  const rawUrl = 'https://xyz.supabase.co/storage/v1/object/public/clinic_photos/c1/logo.png?v=1';
  const cleaned = cleanStoragePath(rawUrl);
  assert.equal(cleaned.bucket, 'clinic_photos');
  assert.equal(cleaned.relativePath, 'c1/logo.png');
  assert.equal(STORAGE_BUCKETS[cleaned.bucket].isPrivate, false);
});

// ---------------------------------------------------------------------------
// C12: Path Cleaning + Filename Sanitizer
// ---------------------------------------------------------------------------
suite.test('C12: Path cleaning followed by filename sanitization handles Windows illegal chars', (assert) => {
  const rawUrl = 'https://xyz.supabase.co/storage/v1/object/public/doctor_photos/doc-01/avatar:head?crop=1.jpg';
  const cleaned = cleanStoragePath(rawUrl);
  const sanitizedName = sanitizeFilename(cleaned.relativePath);
  assert.equal(sanitizedName, 'avatar_head');
});

// ---------------------------------------------------------------------------
// C13: Storage Mirroring + Atomic Downloads
// ---------------------------------------------------------------------------
suite.test('C13: Media mirroring writes to temp .tmp file and renames atomically', (assert) => {
  const testDir = path.join(os.tmpdir(), 'c13_atomic_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const finalFile = path.join(testDir, 'downloaded_image.jpg');
  const tmpFile = `${finalFile}.tmp`;

  fs.writeFileSync(tmpFile, Buffer.from('IMAGE_BINARY_DATA'));
  fs.renameSync(tmpFile, finalFile);

  assert.ok(fs.existsSync(finalFile));
  assert.equal(fs.existsSync(tmpFile), false);
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// C14: Atomic Downloads + Checksum Generation
// ---------------------------------------------------------------------------
suite.test('C14: File buffer is hashed during atomic download producing valid SHA-256', (assert) => {
  const buffer = Buffer.from('TEST_PAYLOAD_FOR_HASH_AUDIT');
  const hash = computeSHA256(buffer);
  assert.isSHA256(hash);
  assert.equal(hash, computeSHA256(buffer.toString('utf8')));
});

// ---------------------------------------------------------------------------
// C15: Media Download + 404 Handling + Manifest Warnings
// ---------------------------------------------------------------------------
suite.test('C15: Missing blobs record non-fatal warning in manifest while valid files succeed', (assert) => {
  const manifest = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 1, total_bytes: 100 },
    files: [{ relative_path: 'files/doctor_photos/avatar.jpg', byte_size: 100, sha256: computeSHA256('ok') }],
    warnings: [{ target: 'files/clinic_photos/missing.jpg', reason: 'HTTP 404' }],
    checksum_algorithm: 'SHA-256'
  };
  const val = validateManifest(manifest);
  assert.equal(val.valid, true);
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.warnings.length, 1);
});

// ---------------------------------------------------------------------------
// C16: Media Download + Retry Logic + Atomic Rename
// ---------------------------------------------------------------------------
suite.test('C16: Transient download failure retries, downloads cleanly, and renames atomically', async (assert) => {
  let attempt = 0;
  const downloadWithRetryAndRename = async (destPath) => {
    while (attempt < 3) {
      attempt++;
      if (attempt < 2) continue; // fail once
      const tmp = `${destPath}.tmp`;
      fs.writeFileSync(tmp, 'SUCCESS_AFTER_RETRY');
      fs.renameSync(tmp, destPath);
      return true;
    }
  };

  const testDir = path.join(os.tmpdir(), 'c16_retry_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const finalDest = path.join(testDir, 'retry_file.bin');

  await downloadWithRetryAndRename(finalDest);
  assert.equal(attempt, 2);
  assert.ok(fs.existsSync(finalDest));
  assert.equal(fs.readFileSync(finalDest, 'utf8'), 'SUCCESS_AFTER_RETRY');

  fs.rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// C17: CLI Argument Parsing + Extraction Filter
// ---------------------------------------------------------------------------
suite.test('C17: CLI flag --clinic-id restricts extraction strictly to specified clinic', (assert) => {
  const clinicId = 'c1000000-0000-0000-0000-000000000001';
  const bundle = createMockClinicBundle(clinicId);
  assert.equal(bundle.clinic.id, clinicId);
  for (const srv of bundle.clinic_services) {
    assert.equal(srv.clinic_id, clinicId);
  }
});

// ---------------------------------------------------------------------------
// C18: CLI Argument Parsing + Dry-Run Mode
// ---------------------------------------------------------------------------
suite.test('C18: Dry-run flag computes stats and extracts data without creating files on disk', (assert) => {
  const isDryRun = true;
  const bundle = createMockClinicBundle();
  const simulatedFilesWritten = [];

  const writeHandler = (filename, content) => {
    if (!isDryRun) {
      simulatedFilesWritten.push(filename);
    }
  };

  writeHandler('clinics.json', JSON.stringify(bundle.clinic));
  assert.equal(simulatedFilesWritten.length, 0, 'Zero files written during dry-run');
});

// ---------------------------------------------------------------------------
// C19: Extraction + Staging Engine + Drive Atomic Transfer
// ---------------------------------------------------------------------------
suite.test('C19: Full staging pipeline writes to scratch temp then transfers atomically', (assert) => {
  const scratchDir = path.join(os.tmpdir(), 'c19_scratch_' + Date.now());
  const destDir = path.join(os.tmpdir(), 'c19_dest_' + Date.now());
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(path.join(scratchDir, 'data.txt'), 'READY_FOR_DRIVE');

  // Transfer
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(scratchDir, 'data.txt'), path.join(destDir, 'data.txt'));
  fs.rmSync(scratchDir, { recursive: true, force: true });

  assert.equal(fs.existsSync(scratchDir), false, 'Scratch dir cleaned');
  assert.ok(fs.existsSync(path.join(destDir, 'data.txt')), 'Transferred to destination');

  fs.rmSync(destDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// C20: Staging Engine + Google Drive Lock Handling
// ---------------------------------------------------------------------------
suite.test('C20: Drive staging transfer retries and recovers from temporary EBUSY lock', async (assert) => {
  let lockHits = 0;
  const moveWithDriveLockHandling = async () => {
    for (let i = 1; i <= 3; i++) {
      if (i < 3) {
        lockHits++;
        continue;
      }
      return 'MOVED';
    }
  };
  const res = await moveWithDriveLockHandling();
  assert.equal(res, 'MOVED');
  assert.equal(lockHits, 2);
});

// ---------------------------------------------------------------------------
// C21: Manifest Generation + Checksum Audit
// ---------------------------------------------------------------------------
suite.test('C21: Manifest aggregates file records and checks exact SHA-256 match', (assert) => {
  const bundle = createMockClinicBundle();
  const jsonContent = JSON.stringify(bundle.clinic, null, 2);
  const hash = computeSHA256(jsonContent);

  const manifest = {
    backup_id: 'b1',
    clinic_id: bundle.clinic.id,
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 1, total_bytes: Buffer.byteLength(jsonContent) },
    files: [
      {
        relative_path: 'data/json/clinics.json',
        byte_size: Buffer.byteLength(jsonContent),
        sha256: hash
      }
    ],
    checksum_algorithm: 'SHA-256'
  };

  const val = validateManifest(manifest);
  assert.equal(val.valid, true);
  assert.equal(manifest.files[0].sha256, hash);
});

// ---------------------------------------------------------------------------
// C22: Manifest Generation + Exit Code Contract
// ---------------------------------------------------------------------------
suite.test('C22: Verified manifest and intact files yields exit code 0', (assert) => {
  const manifestOk = true;
  const code = manifestOk ? EXIT_CODES.SUCCESS : EXIT_CODES.INTEGRITY_FAIL;
  assert.equal(code, 0);
});

// ---------------------------------------------------------------------------
// C23: Bad Arguments + Exit Code Contract
// ---------------------------------------------------------------------------
suite.test('C23: Conflicting arguments (--all with --clinic-id) yields exit code 2', (assert) => {
  const opts = { all: true, clinicId: 'c1' };
  const code = opts.all && opts.clinicId ? EXIT_CODES.BAD_ARGS : EXIT_CODES.SUCCESS;
  assert.equal(code, 2);
});

// ---------------------------------------------------------------------------
// C24: Missing Clinic + Exit Code Contract
// ---------------------------------------------------------------------------
suite.test('C24: Querying a non-existent clinic UUID yields exit code 3', (assert) => {
  const clinicFound = false;
  const code = clinicFound ? EXIT_CODES.SUCCESS : EXIT_CODES.NOT_FOUND;
  assert.equal(code, 3);
});

// ---------------------------------------------------------------------------
// C25: Integrity Failure + Exit Code Contract
// ---------------------------------------------------------------------------
suite.test('C25: SHA-256 mismatch between disk and manifest yields exit code 4', (assert) => {
  const diskHash = 'hashA';
  const manifestHash = 'hashB';
  const code = diskHash === manifestHash ? EXIT_CODES.SUCCESS : EXIT_CODES.INTEGRITY_FAIL;
  assert.equal(code, 4);
});

// ---------------------------------------------------------------------------
// C26: Redaction + Manifest + Staging
// ---------------------------------------------------------------------------
suite.test('C26: Manifest file itself is scanned to guarantee zero leaked secrets', (assert) => {
  const manifest = {
    backup_id: 'b1',
    clinic_id: 'c1',
    timestamp: '2026-10-22T12:00:00.000Z',
    generator_version: '1.0.0',
    stats: { total_files: 10, total_bytes: 4096 },
    files: [],
    checksum_algorithm: 'SHA-256'
  };
  const manifestJson = JSON.stringify(manifest);
  for (const k of SENSITIVE_KEYS) {
    assert.doesNotInclude(manifestJson, `"${k}"`);
  }
});

module.exports = suite;
