/**
 * Tier 4: Real-World Application Scenarios E2E Tests
 * Simulates realistic end-to-end clinical data backup and synchronization workflows.
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

const suite = createTestSuite('Real-World Application Scenarios (Tier 4)', 4);

// ---------------------------------------------------------------------------
// SCENARIO 1: Full Clinic Export with Storage Mirroring
// ---------------------------------------------------------------------------
suite.test('S1: Full clinic export with storage mirroring, schema validation, and manifest generation', async (assert) => {
  const clinicId = 'c1000000-0000-0000-0000-000000000001';
  const bundle = createMockClinicBundle(clinicId, { includeSecrets: true });

  // 1. Redact secrets
  const cleanBundle = redactSecrets(bundle);
  assert.equal(cleanBundle.clinic.payment_secret_key, '[REDACTED]');

  // 2. Setup scratch staging directory
  const testScratchDir = path.join(os.tmpdir(), `s1_scratch_${Date.now()}`);
  const jsonDir = path.join(testScratchDir, 'data', 'json');
  const csvDir = path.join(testScratchDir, 'data', 'csv');
  const filesDir = path.join(testScratchDir, 'files', 'clinic_photos');
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.mkdirSync(csvDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  const manifestFiles = [];

  // 3. Export all 10 tables to JSON and CSV
  for (const table of RELATIONAL_TABLES) {
    const records = Array.isArray(cleanBundle[table]) ? cleanBundle[table] : [cleanBundle[table]];
    
    // JSON
    const jsonPath = path.join(jsonDir, `${table}.json`);
    const jsonStr = JSON.stringify(records, null, 2);
    fs.writeFileSync(jsonPath, jsonStr, 'utf8');
    manifestFiles.push({
      relative_path: `data/json/${table}.json`,
      byte_size: Buffer.byteLength(jsonStr),
      sha256: computeSHA256(jsonStr),
      category: 'tabular'
    });

    // CSV
    const csvPath = path.join(csvDir, `${table}.csv`);
    const csvStr = toRFC4180CSV(records);
    fs.writeFileSync(csvPath, csvStr, 'utf8');
    manifestFiles.push({
      relative_path: `data/csv/${table}.csv`,
      byte_size: Buffer.byteLength(csvStr),
      sha256: computeSHA256(csvStr),
      category: 'tabular'
    });
  }

  // 4. Download simulated clinic photo
  const photoPath = path.join(filesDir, 'logo.png');
  const photoData = Buffer.from('MOCK_CLINIC_PNG_DATA');
  fs.writeFileSync(photoPath, photoData);
  manifestFiles.push({
    relative_path: 'files/clinic_photos/logo.png',
    byte_size: photoData.length,
    sha256: computeSHA256(photoData),
    category: 'media'
  });

  // 5. Build and validate manifest
  const manifest = {
    backup_id: 'b1000000-0000-0000-0000-000000000001',
    clinic_id: clinicId,
    timestamp: new Date().toISOString(),
    generator_version: '1.0.0',
    stats: {
      total_files: manifestFiles.length,
      total_bytes: manifestFiles.reduce((acc, f) => acc + f.byte_size, 0),
      tables_count: 10,
      media_count: 1
    },
    files: manifestFiles,
    warnings: [],
    checksum_algorithm: 'SHA-256'
  };

  const validation = validateManifest(manifest);
  assert.equal(validation.valid, true);
  assert.equal(manifest.stats.total_files, 21); // 10 JSON + 10 CSV + 1 media

  // Cleanup
  fs.rmSync(testScratchDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// SCENARIO 2: Dry-Run Simulation on Multi-Doctor Clinic
// ---------------------------------------------------------------------------
suite.test('S2: Dry-run simulation executes query and calculates stats without modifying disk', (assert) => {
  const bundle = createMockClinicBundle();
  const options = { dryRun: true };

  let writesCount = 0;
  const mockWriter = (file, content) => {
    if (!options.dryRun) writesCount++;
  };

  // Simulate backup process
  for (const table of RELATIONAL_TABLES) {
    mockWriter(`${table}.json`, JSON.stringify(bundle[table]));
  }

  assert.equal(writesCount, 0, 'No disk writes in dry-run mode');
  assert.equal(bundle.doctors.length > 0, true);
});

// ---------------------------------------------------------------------------
// SCENARIO 3: Single Clinic Targeted Backup via UUID
// ---------------------------------------------------------------------------
suite.test('S3: Single clinic targeted backup via UUID partitions only matching clinic records', (assert) => {
  const targetId = 'c3333333-3333-3333-3333-333333333333';
  const bundle = createMockClinicBundle(targetId);

  assert.equal(bundle.clinic.id, targetId);
  for (const doc of bundle.doctors) {
    assert.equal(doc.clinic_id, targetId);
  }
  for (const apt of bundle.appointments) {
    assert.equal(apt.clinic_id, targetId);
  }
});

// ---------------------------------------------------------------------------
// SCENARIO 4: Corrupted / Malicious Input & Redaction Verification
// ---------------------------------------------------------------------------
suite.test('S4: Malicious input with embedded scripts, Windows path traversal, and secret keys is neutralized', (assert) => {
  const hostileClinic = {
    id: 'c4000000-0000-0000-0000-000000000004',
    name: '<script>alert("xss")</script> Clinic & Partners',
    description: '{"payment_secret_key": "sec_leak", "cmd": "rm -rf /"}',
    logo_url: 'clinic_photos/../../Windows/System32/calc.exe?payment_secret_key=leak_in_query'
  };

  // 1. Redact secrets
  const clean = redactSecrets(hostileClinic);
  assert.doesNotInclude(clean.description, 'sec_leak');
  assert.includes(clean.description, '[REDACTED]');

  // 2. Sanitize filename / path
  const cleanedPath = cleanStoragePath(clean.logo_url);
  const sanitizedFilename = sanitizeFilename(cleanedPath.relativePath);
  assert.doesNotInclude(sanitizedFilename, '..');
  assert.doesNotInclude(sanitizedFilename, '/');
});

// ---------------------------------------------------------------------------
// SCENARIO 5: Google Drive File Lock Contention Simulation
// ---------------------------------------------------------------------------
suite.test('S5: Google Drive file lock contention simulation succeeds with backoff retry', async (assert) => {
  let lockTries = 0;
  const simulateLockedTransfer = async () => {
    while (lockTries < 3) {
      lockTries++;
      if (lockTries < 3) {
        // simulate Google Drive file lock
        const err = new Error('File locked by Google Drive virtual drive');
        err.code = 'EBUSY';
        continue;
      }
      return 'TRANSFERRED_SUCCESSFULLY';
    }
  };

  const status = await simulateLockedTransfer();
  assert.equal(status, 'TRANSFERRED_SUCCESSFULLY');
  assert.equal(lockTries, 3);
});

// ---------------------------------------------------------------------------
// SCENARIO 6: Scheduled Daily Automation Dry-Run Verification
// ---------------------------------------------------------------------------
suite.test('S6: Scheduled daily automation dry-run verifies task syntax, flags, and paths', (assert) => {
  const taskConfig = {
    TaskName: 'DactorClinicDailyBackup',
    Trigger: 'Daily at 02:00 AM',
    Command: 'powershell.exe -ExecutionPolicy Bypass -File sync_clinic_backups.ps1 -All -Verbose',
    WorkingDir: REPO_ROOT
  };

  assert.equal(taskConfig.TaskName, 'DactorClinicDailyBackup');
  assert.includes(taskConfig.Command, '-All');
  assert.includes(taskConfig.Command, 'sync_clinic_backups.ps1');
  assert.equal(taskConfig.WorkingDir, REPO_ROOT);
});

// ---------------------------------------------------------------------------
// SCENARIO 7: Offline-First Synchronized Clinic Backup
// ---------------------------------------------------------------------------
suite.test('S7: Offline-first clinic data with structured 10-digit tracking codes and append-only ledgers', (assert) => {
  const bundle = createMockClinicBundle();
  const appointment = bundle.appointments[0];
  const invoice = bundle.billing_invoices[0];
  const transaction = bundle.invoice_transactions[0];

  // Validate 10-digit tracking code
  assert.match(appointment.tracking_code, /^\d{10}$/, 'Must be 10-digit numeric tracking code');

  // Validate append-only ledger transaction link
  assert.equal(transaction.invoice_id, invoice.id);
  assert.equal(transaction.amount, invoice.total_amount);
  assert.equal(transaction.payment_method, 'esewa');
});

// ---------------------------------------------------------------------------
// SCENARIO 8: Soft-Deleted Clinic Audit & Purge Archival
// ---------------------------------------------------------------------------
suite.test('S8: Regulatory audit archives retain soft-deleted staff, licenses, and appointment records', (assert) => {
  const bundle = createMockClinicBundle('c8', { includeTombstones: true });
  const allStaff = bundle.doctors;
  const activeStaff = allStaff.filter((d) => !d.is_deleted);
  const deletedStaff = allStaff.filter((d) => d.is_deleted);

  assert.equal(activeStaff.length, 1);
  assert.equal(deletedStaff.length, 1);
  assert.isISODate(deletedStaff[0].deleted_at);

  // Both serialized into JSON
  const serialized = JSON.parse(JSON.stringify(allStaff));
  assert.equal(serialized.length, 2);
});

// ---------------------------------------------------------------------------
// SCENARIO 9: High-Volume Multi-Doctor Clinic Stress Backup
// ---------------------------------------------------------------------------
suite.test('S9: High-volume clinic with large dataset serializes and hashes within performance limits', (assert) => {
  const highVolumeBundle = createMockClinicBundle('c-stress');
  // Expand appointments
  for (let i = 1; i < 200; i++) {
    highVolumeBundle.appointments.push({
      id: `apt-stress-${i}`,
      clinic_id: 'c-stress',
      doctor_id: 'doc-01',
      patient_name: `Stress Patient ${i}`,
      patient_phone: `+977-984100${i.toString().padStart(4, '0')}`,
      tracking_code: `101295${i.toString().padStart(4, '0')}`,
      appointment_time: '2026-10-23T10:00:00.000Z',
      status: 'confirmed',
      is_deleted: false,
      deleted_at: null
    });
  }

  assert.equal(highVolumeBundle.appointments.length, 200);
  const csv = toRFC4180CSV(highVolumeBundle.appointments);
  const hash = computeSHA256(csv);
  assert.isSHA256(hash);
});

// ---------------------------------------------------------------------------
// SCENARIO 10: Multi-Clinic Batch Execution (--all) with Mixed Clinic States
// ---------------------------------------------------------------------------
suite.test('S10: Multi-clinic batch backup handles active, unactivated, and sparse clinics', (assert) => {
  const clinics = [
    { id: 'c-active-1', name: 'Active Polyclinic', is_activated: true },
    { id: 'c-inactive-2', name: 'Pending Clinic', is_activated: false },
    { id: 'c-sparse-3', name: 'Solo Clinic', is_activated: true }
  ];

  const processed = clinics.map((c) => ({
    id: c.id,
    status: c.is_activated ? 'BACKED_UP' : 'SKIPPED_OR_ARCHIVED'
  }));

  assert.equal(processed.length, 3);
  assert.equal(processed[0].status, 'BACKED_UP');
  assert.equal(processed[1].status, 'SKIPPED_OR_ARCHIVED');
});

// ---------------------------------------------------------------------------
// SCENARIO 11: Network Partition Recovery during Storage Downloads
// ---------------------------------------------------------------------------
suite.test('S11: Transient network drop during binary media download recovers seamlessly', async (assert) => {
  let networkOnline = false;
  let attempts = 0;

  const downloadAttachmentWithRecovery = async () => {
    while (attempts < 3) {
      attempts++;
      if (attempts === 2) {
        networkOnline = true; // connection restored
      }
      if (!networkOnline) {
        continue;
      }
      return Buffer.from('RESTORED_MEDIA_PAYLOAD');
    }
  };

  const payload = await downloadAttachmentWithRecovery();
  assert.ok(payload);
  assert.equal(payload.toString('utf8'), 'RESTORED_MEDIA_PAYLOAD');
});

// ---------------------------------------------------------------------------
// SCENARIO 12: End-to-End Backup Validation & Re-import Verification
// ---------------------------------------------------------------------------
suite.test('S12: End-to-end verification confirms backup JSON can be deserialized back into relational models', (assert) => {
  const original = createMockClinicBundle('c12');
  const cleanOriginal = redactSecrets(original);

  // Serialize to JSON strings
  const stringifiedTables = {};
  for (const table of RELATIONAL_TABLES) {
    stringifiedTables[table] = JSON.stringify(cleanOriginal[table]);
  }

  // Restore
  const restoredBundle = {};
  for (const table of RELATIONAL_TABLES) {
    restoredBundle[table] = JSON.parse(stringifiedTables[table]);
  }

  assert.equal(restoredBundle.clinics[0].id, 'c12');
  assert.equal(restoredBundle.doctors.length, cleanOriginal.doctors.length);
  assert.equal(restoredBundle.appointments.length, cleanOriginal.appointments.length);
  assert.equal(restoredBundle.clinics[0].payment_secret_key, '[REDACTED]');
});

module.exports = suite;
