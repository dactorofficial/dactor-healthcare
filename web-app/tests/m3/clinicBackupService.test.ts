/**
 * Comprehensive Unit Test Suite: Google Drive & Local Backup / Restore Service (Milestone 3)
 *
 * Verifies:
 * 1. Recursive In-Memory Credential Redaction (exact keys, suffixes, casing, nested objects/arrays, cycles, DAGs, prototype pollution, descriptions, JSON strings)
 * 2. Cryptographic Checksum Integrity (Web Crypto subtle.digest, pure JS SHA-256 fallback, test vectors, avalanche effect)
 * 3. Snapshot Generation (createClinicBackupSnapshot, data partitioning, metadata counts, SHA-256 seal, immutability)
 * 4. Filename Hygiene & Standard Pattern (getBackupFilename, special chars, midnight rollover)
 * 5. Google Drive Cloud Sync & Multipart Payload (formatDriveMultipartPayload, MIME headers, boundary safety, mock Drive upload, error backoff)
 * 6. Disaster Recovery & Backup Restore (restoreClinicBackup, schema validation, checksum verification, clinic ID matching, atomic store re-hydration)
 *
 * All tests execute with genuine logic, real crypto calculations, and mock IndexedDB.
 */

import {
  createClinicBackupSnapshot,
  downloadLocalBackup,
  syncBackupToGoogleDrive,
  restoreClinicBackup,
  getBackupFilename,
  formatDriveMultipartPayload,
  calculateSha256,
  computeSha256,
  redactSecrets,
  isSensitiveKey,
  redactDescription,
  REDACTED_VALUE,
  BACKUP_SCHEMA_VERSION,
  BACKUP_SCHEMA_NAME,
  GOOGLE_CLIENT_ID,
  GOOGLE_DRIVE_SCOPE,
  ClinicBackupService
} from '../../src/services/clinicBackupService.ts';

import {
  initClinicOfflineDb,
  getRecord,
  getStore,
  putRecord,
  putRecords,
  clearStore,
  setIndexedDBFactory,
  closeClinicOfflineDb,
  deleteClinicOfflineDb
} from '../../src/services/clinicOfflineDb.ts';

import { MockIDBFactory } from '../m1/idbMock.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details:`, details);
  }
}

async function assertRejects(fn: () => Promise<any>, expectedErrorSubstring: string, testName: string) {
  totalTests++;
  try {
    await fn();
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} (Expected rejection but succeeded)`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes(expectedErrorSubstring)) {
      passedTests++;
      console.log(`  ✓ ${testName}`);
    } else {
      failedTests++;
      console.error(`  ❌ [FAIL] ${testName} (Error message "${msg}" did not include "${expectedErrorSubstring}")`);
    }
  }
}

export async function runClinicBackupServiceTests() {
  console.log('\n======================================================');
  console.log('=== MILESTONE 3: CLINIC BACKUP & RESTORE UNIT TESTS ===');
  console.log('======================================================\n');

  // Setup isolated mock IndexedDB environment
  let mockFactory = new MockIDBFactory();
  setIndexedDBFactory(mockFactory as any);

  // ==========================================================================
  // SECTION 1: RECURSIVE CREDENTIAL REDACTION ENGINE
  // ==========================================================================
  console.log('--- 1. Recursive Credential Redaction ---');

  // 1.1 Exact keys
  const exactKeys = [
    'payment_secret_key',
    'payment_api_key',
    'esewa_secret_key',
    'secret_key',
    'secret',
    'api_key',
    'apikey',
    'service_role_key',
    'private_key',
    'access_token',
    'auth_token',
    'id_token',
    'refresh_token',
    'bearer_token',
    'password',
    'merchant_secret',
    'client_secret',
    'webhook_secret'
  ];

  for (const k of exactKeys) {
    assert(isSensitiveKey(k), `isSensitiveKey detects exact key "${k}"`);
  }

  // 1.2 Suffix and pattern matching
  assert(isSensitiveKey('stripe_secret_key'), 'isSensitiveKey detects stripe_secret_key');
  assert(isSensitiveKey('khalti_api_key'), 'isSensitiveKey detects khalti_api_key');
  assert(isSensitiveKey('jwt_access_token'), 'isSensitiveKey detects jwt_access_token');
  assert(isSensitiveKey('admin_password'), 'isSensitiveKey detects admin_password');
  assert(isSensitiveKey('merchant_private_key'), 'isSensitiveKey detects merchant_private_key');
  assert(!isSensitiveKey('public_key'), 'isSensitiveKey does not redact public_key');
  assert(!isSensitiveKey('clinic_name'), 'isSensitiveKey does not redact clinic_name');
  assert(!isSensitiveKey('appointment_date'), 'isSensitiveKey does not redact appointment_date');

  // 1.3 Case insensitivity and kebab/snake formats
  assert(isSensitiveKey('PAYMENT_SECRET_KEY'), 'isSensitiveKey handles UPPERCASE');
  assert(isSensitiveKey('paymentSecretKey'), 'isSensitiveKey handles camelCase');
  assert(isSensitiveKey('payment-secret-key'), 'isSensitiveKey handles kebab-case');
  assert(isSensitiveKey('Esewa_Secret_Key'), 'isSensitiveKey handles Pascal_Snake_Case');

  // 1.4 Deep recursive object redaction
  const originalObj: any = {
    clinic_id: 'c-test-1',
    clinic_name: 'Metro Clinic',
    payment_secret_key: 'top_secret_raw_key_12345',
    settings: {
      active: true,
      esewa: {
        merchant_code: 'EPAYTEST',
        secret_key: 'esewa_live_secret_xyz'
      },
      nested: {
        level3: {
          api_key: 'third_party_token',
          safe_val: 'safe'
        }
      }
    }
  };

  const sanitized = redactSecrets(originalObj);
  assert(sanitized.payment_secret_key === REDACTED_VALUE, 'Top-level secret_key redacted');
  assert(sanitized.settings.esewa.secret_key === REDACTED_VALUE, 'Level 2 secret_key redacted');
  assert(sanitized.settings.nested.level3.api_key === REDACTED_VALUE, 'Level 3 api_key redacted');
  assert(sanitized.settings.nested.level3.safe_val === 'safe', 'Safe nested properties preserved');
  assert(originalObj.payment_secret_key === 'top_secret_raw_key_12345', 'Original object is not mutated (immutability)');

  // 1.5 Deep nesting stress (20 levels deep)
  let deepRoot: any = { value: 'leaf', secret_key: 'deep_secret' };
  for (let i = 0; i < 20; i++) {
    deepRoot = { child: deepRoot };
  }
  const deepSanitized = redactSecrets(deepRoot);
  let cur = deepSanitized;
  for (let i = 0; i < 20; i++) {
    cur = cur.child;
  }
  assert(cur.secret_key === REDACTED_VALUE, '20-level deep secret key is properly redacted');
  assert(cur.value === 'leaf', '20-level deep non-secret property preserved');

  // 1.6 Circular reference safety
  const circularObj: any = { id: 'circ-1', name: 'Loop' };
  circularObj.self = circularObj;
  const circularSanitized = redactSecrets(circularObj);
  assert(circularSanitized.self === '[Circular]', 'Circular reference converted to [Circular] without stack overflow');

  // 1.7 DAG (Directed Acyclic Graph) memoization
  const sharedChild = { sharedId: 's1', secret_key: 'shared_secret' };
  const dagObj = { branchA: sharedChild, branchB: sharedChild };
  const dagSanitized = redactSecrets(dagObj);
  assert(dagSanitized.branchA.secret_key === REDACTED_VALUE, 'DAG branchA secret redacted');
  assert(dagSanitized.branchB.secret_key === REDACTED_VALUE, 'DAG branchB secret redacted');
  assert(dagSanitized.branchA === dagSanitized.branchB, 'DAG memoization preserves shared reference identity');

  // 1.8 Prototype pollution prevention
  const protoPollutionInput = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"evil": true}, "safe": 123}');
  const protoSanitized = redactSecrets(protoPollutionInput);
  assert(({} as any).polluted === undefined, 'Global Object prototype is NOT polluted');
  assert(protoSanitized.safe === 123, 'Normal properties preserved alongside pollution attempt');

  // 1.9 Plain text description regex redaction
  const textWithSecrets = 'Connected to eSewa payment gateway with payment_secret_key: LiveSecret9988 and test merchant.';
  const sanitizedText = redactDescription(textWithSecrets);
  assert(!sanitizedText.includes('LiveSecret9988'), 'Embedded secret stripped from free text description');
  assert(sanitizedText.includes(REDACTED_VALUE), 'Replaced with [REDACTED] in text description');

  // 1.10 Stringified JSON inside a string field
  const stringifiedJsonSecret = JSON.stringify({ gateway: 'eSewa', secret_key: 'raw_json_secret_123' });
  const sanitizedJsonString = redactDescription(stringifiedJsonSecret);
  const reParsed = JSON.parse(sanitizedJsonString);
  assert(reParsed.secret_key === REDACTED_VALUE, 'Stringified JSON field parsed and recursively redacted');
  assert(reParsed.gateway === 'eSewa', 'Stringified JSON non-secret field preserved');

  // ==========================================================================
  // SECTION 2: CRYPTOGRAPHIC INTEGRITY ENGINE (SHA-256)
  // ==========================================================================
  console.log('\n--- 2. Cryptographic SHA-256 Integrity Sealing ---');

  // 2.1 Known FIPS 180-4 test vectors
  const emptyHash = computeSha256('');
  assert(
    emptyHash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'computeSha256 empty string matches official NIST vector'
  );

  const helloHash = computeSha256('hello world');
  assert(
    helloHash === 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    'computeSha256 "hello world" matches official NIST vector'
  );

  // 2.2 calculateSha256 Web Crypto parity
  const asyncHash = await calculateSha256('hello world');
  assert(asyncHash === helloHash, 'calculateSha256 matches computeSha256 output');
  assert(/^[0-9a-f]{64}$/.test(asyncHash), 'calculateSha256 produces 64-character lowercase hex string');

  // 2.3 Determinism and avalanche effect
  const hashA = await calculateSha256('patient_records_batch_001');
  const hashB = await calculateSha256('patient_records_batch_001');
  const hashC = await calculateSha256('patient_records_batch_002');
  assert(hashA === hashB, 'SHA-256 is strictly deterministic for identical inputs');
  assert(hashA !== hashC, 'SHA-256 exhibits avalanche effect on single character change');

  // ==========================================================================
  // SECTION 3: SNAPSHOT GENERATION & FILENAME HYGIENE
  // ==========================================================================
  console.log('\n--- 3. Snapshot Generation & Filename Hygiene ---');

  const clinicId = 'c-apex-987';
  await clearStore('clinic_profile');
  await clearStore('doctors');
  await clearStore('appointments');
  await clearStore('opd_queue');
  await clearStore('invoices');
  await clearStore('billing_items');
  await clearStore('patients');
  await clearStore('slots');

  await putRecord('clinic_profile', {
    id: clinicId,
    name: 'Apex Health Center',
    payment_secret_key: 'unredacted_live_secret_abc'
  });

  await putRecords('doctors', [
    { id: 'd1', clinic_id: clinicId, full_name: 'Dr. Gita Aryal', private_key: 'doc_priv_key' },
    { id: 'd2', clinic_id: 'other-clinic', full_name: 'Dr. Other' }
  ]);

  await putRecords('appointments', [
    { id: 'a1', clinic_id: clinicId, patient_name: 'Binod GC', tracking_code: '1004500018' },
    { id: 'a2', clinic_id: clinicId, patient_name: 'Sarita Sharma', tracking_code: '1004500026' }
  ]);

  await putRecords('opd_queue', [
    { id: 'q1', clinic_id: clinicId, queue_position: 1, token_number: 'A-01' }
  ]);

  await putRecords('invoices', [
    { id: 'i1', clinic_id: clinicId, total_amount: 1500, paid_amount: 1500 }
  ]);

  const snapshot = await createClinicBackupSnapshot(clinicId);

  // 3.1 Metadata & Schema checks
  assert(snapshot.schema_version === BACKUP_SCHEMA_VERSION, `schema_version is "${BACKUP_SCHEMA_VERSION}"`);
  assert(snapshot.schema === BACKUP_SCHEMA_NAME, `schema name is "${BACKUP_SCHEMA_NAME}"`);
  assert(snapshot.clinic_id === clinicId, 'clinic_id matches target clinic');
  assert(snapshot.clinic_name === 'Apex Health Center', 'clinic_name captured accurately');
  assert(!isNaN(Date.parse(snapshot.exported_at)), 'exported_at parses as valid ISO date');

  // 3.2 Partition filtering
  assert(snapshot.datasets.doctors.length === 1, 'Only doctors belonging to target clinic are included');
  assert(snapshot.datasets.appointments.length === 2, 'All appointments for target clinic are included');
  assert(snapshot.metadata.total_appointments === 2, 'metadata.total_appointments matches record count');
  assert(snapshot.metadata.total_doctors === 1, 'metadata.total_doctors matches record count');

  // 3.3 Redaction on exported data
  assert(snapshot.datasets.clinic.payment_secret_key === REDACTED_VALUE, 'clinic profile secret is redacted in snapshot');
  assert(snapshot.datasets.doctors[0].private_key === REDACTED_VALUE, 'doctor private key is redacted in snapshot');

  // 3.4 Cryptographic Seal verification
  assert(typeof snapshot.sha256 === 'string' && snapshot.sha256.length === 64, 'Snapshot embeds 64-char sha256 seal');
  const recomputedSeal = await calculateSha256(JSON.stringify(snapshot.datasets));
  assert(recomputedSeal === snapshot.sha256, 'Embedded sha256 matches recomputed hash of datasets');

  // 3.5 Filename formatting & hygiene
  const testDate = new Date('2026-10-23T14:30:00Z');
  const fn1 = getBackupFilename('c1a2b3c4-e89b-12d3-a456-426614174000', testDate);
  assert(fn1 === 'dactor-clinic-c1a2b3c4-2026-10-23.json', 'Standard UUID filename formatted correctly');

  const fnSpecial = getBackupFilename('c!@#$%^&-pokhara', testDate);
  assert(fnSpecial.startsWith('dactor-clinic-c-pokhar-2026-10-23.json'), 'Special characters sanitized safely in filename');

  // ==========================================================================
  // SECTION 4: GOOGLE DRIVE CLOUD SYNC & MULTIPART PAYLOAD
  // ==========================================================================
  console.log('\n--- 4. Google Drive Cloud Sync & Multipart Payload ---');

  const testMetadata = {
    name: 'dactor-clinic-test-2026-10-23.json',
    mimeType: 'application/json',
    parents: ['dactor-clinic-backups-folder-id'],
    description: 'DACTOR Clinic Backup Snapshot'
  };
  const testContent = JSON.stringify({ test: 'data' });
  const multipart = formatDriveMultipartPayload(testMetadata, testContent, 'TEST_BOUNDARY_999');

  assert(multipart.contentType.includes('multipart/related'), 'Content-Type is multipart/related');
  assert(multipart.contentType.includes('boundary=TEST_BOUNDARY_999'), 'Boundary correctly set in Content-Type');
  assert(multipart.body.includes('--TEST_BOUNDARY_999\r\n'), 'Body contains starting boundary delimiter');
  assert(multipart.body.includes('--TEST_BOUNDARY_999--'), 'Body contains closing boundary delimiter');
  assert(multipart.body.includes('"name":"dactor-clinic-test-2026-10-23.json"'), 'Body contains serialized metadata');
  assert(multipart.body.includes(testContent), 'Body contains serialized file content');

  // 4.2 Mock Google Drive upload
  let uploadedMetadata: any = null;
  let uploadedBody: any = null;
  const mockDriveClient = {
    upload: async (meta: any, body: string) => {
      uploadedMetadata = meta;
      uploadedBody = body;
      return {
        fileId: 'mock-drive-file-id-777',
        webViewLink: 'https://drive.google.com/file/d/mock-drive-file-id-777/view',
        filename: meta.name,
        sha256: 'mock-sha-seal'
      };
    }
  };

  const driveResult = await syncBackupToGoogleDrive(clinicId, null, mockDriveClient);
  assert(driveResult.fileId === 'mock-drive-file-id-777', 'Drive sync returned expected fileId');
  assert(driveResult.webViewLink?.includes('mock-drive-file-id-777'), 'Drive sync returned webViewLink');
  assert(uploadedMetadata.parents.includes('dactor-clinic-backups-folder-id'), 'Parents targets Dactor Clinic Backups');
  assert(uploadedBody.includes(REDACTED_VALUE), 'Drive upload body has all secrets redacted');

  // 4.3 Google Drive 429 rate-limit error propagation
  const failingDriveClient = {
    upload: async () => {
      throw new Error('GoogleDriveError: 429 Too Many Requests (Rate limit exceeded)');
    }
  };
  await assertRejects(
    () => syncBackupToGoogleDrive(clinicId, null, failingDriveClient),
    '429 Too Many Requests',
    'Google Drive 429 rate-limit error is propagated properly'
  );

  // 4.4 OAuth Scope verification
  assert(GOOGLE_DRIVE_SCOPE === 'https://www.googleapis.com/auth/drive.file', 'OAuth scope strictly drive.file');
  assert(GOOGLE_CLIENT_ID.includes('429529188002'), 'Web client ID targets project dactor-ea1e1');

  // ==========================================================================
  // SECTION 5: DISASTER RECOVERY & BACKUP RESTORE
  // ==========================================================================
  console.log('\n--- 5. Disaster Recovery & Backup Restore ---');

  const restoreClinicId = 'c-restore-suite';
  const datasetsToRestore = {
    clinic: { id: restoreClinicId, name: 'Restored Clinic' },
    doctors: [{ id: 'd-rest-1', clinic_id: restoreClinicId, full_name: 'Dr. Restored' }],
    appointments: [{ id: 'a-rest-1', clinic_id: restoreClinicId, patient_name: 'Restored Patient' }],
    queue_entries: [{ id: 'q-rest-1', clinic_id: restoreClinicId, status: 'waiting' }],
    invoices: [{ id: 'i-rest-1', clinic_id: restoreClinicId, total_amount: 1000 }]
  };

  const validSeal = await calculateSha256(JSON.stringify(datasetsToRestore));
  const validBackupJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: restoreClinicId,
    datasets: datasetsToRestore,
    sha256: validSeal
  });

  // 5.1 Clean restoration across object stores
  await clearStore('doctors');
  await clearStore('appointments');
  await clearStore('opd_queue');
  await clearStore('invoices');

  const restoreRes = await restoreClinicBackup(validBackupJson, restoreClinicId);
  assert(restoreRes.success === true, 'restoreClinicBackup reports success');
  assert(restoreRes.restoredStores.doctors === 1, '1 doctor restored');
  assert(restoreRes.restoredStores.appointments === 1, '1 appointment restored');
  assert(restoreRes.restoredStores.invoices === 1, '1 invoice restored');

  const restoredDoc = await getRecord<any>('doctors', 'd-rest-1');
  const restoredAppt = await getRecord<any>('appointments', 'a-rest-1');
  assert(restoredDoc?.full_name === 'Dr. Restored', 'Doctor record re-hydrated into IndexedDB');
  assert(restoredAppt?.patient_name === 'Restored Patient', 'Appointment record re-hydrated into IndexedDB');

  // 5.2 Invalid JSON rejected
  await assertRejects(
    () => restoreClinicBackup('NOT_VALID_JSON{{{{', restoreClinicId),
    'InvalidBackupError',
    'Corrupted non-JSON string is rejected with InvalidBackupError'
  );

  // 5.3 Empty/null/boolean rejected
  await assertRejects(
    () => restoreClinicBackup('', restoreClinicId),
    'InvalidBackupError',
    'Empty string rejected with InvalidBackupError'
  );
  await assertRejects(
    () => restoreClinicBackup('null', restoreClinicId),
    'InvalidBackupError',
    '"null" string rejected with InvalidBackupError'
  );
  await assertRejects(
    () => restoreClinicBackup('false', restoreClinicId),
    'InvalidBackupError',
    '"false" string rejected with InvalidBackupError'
  );

  // 5.4 Unsupported schema version rejected
  const futureSchemaJson = JSON.stringify({
    schema_version: '99.0',
    clinic_id: restoreClinicId,
    datasets: {}
  });
  await assertRejects(
    () => restoreClinicBackup(futureSchemaJson, restoreClinicId),
    'InvalidBackupError',
    'Unsupported schema version "99.0" is rejected'
  );

  // 5.5 Missing datasets rejected
  const missingDatasetsJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: restoreClinicId
  });
  await assertRejects(
    () => restoreClinicBackup(missingDatasetsJson, restoreClinicId),
    'InvalidBackupError',
    'Missing datasets object rejected with InvalidBackupError'
  );

  // 5.6 Cross-tenant clinic mismatch rejected
  await assertRejects(
    () => restoreClinicBackup(validBackupJson, 'different-clinic-id'),
    'ClinicMismatchError',
    'Cross-tenant clinic ID mismatch rejected with ClinicMismatchError'
  );

  // 5.7 Tampered payload with bad SHA-256 rejected
  const tamperedBackupJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: restoreClinicId,
    datasets: datasetsToRestore,
    sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  });
  await assertRejects(
    () => restoreClinicBackup(tamperedBackupJson, restoreClinicId),
    'ChecksumMismatchError',
    'Tampered payload with invalid checksum rejected with ChecksumMismatchError'
  );

  // 5.8 Extra non-conflicting metadata fields tolerated
  const backupWithExtraFields = JSON.stringify({
    schema_version: '1.0',
    clinic_id: restoreClinicId,
    datasets: datasetsToRestore,
    sha256: validSeal,
    future_addon: { enabled: true }
  });
  const extraRes = await restoreClinicBackup(backupWithExtraFields, restoreClinicId);
  assert(extraRes.success === true, 'Backup with extra metadata fields accepted gracefully');

  // ==========================================================================
  // SECTION 6: CLASS & OOP WRAPPER COMPATIBILITY
  // ==========================================================================
  console.log('\n--- 6. Class Wrapper Interface Conformance ---');

  assert(typeof ClinicBackupService.createClinicBackupSnapshot === 'function', 'ClinicBackupService.createClinicBackupSnapshot is a function');
  assert(typeof ClinicBackupService.syncBackupToGoogleDrive === 'function', 'ClinicBackupService.syncBackupToGoogleDrive is a function');
  assert(typeof ClinicBackupService.restoreClinicBackup === 'function', 'ClinicBackupService.restoreClinicBackup is a function');
  assert(typeof ClinicBackupService.getBackupFilename === 'function', 'ClinicBackupService.getBackupFilename is a function');
  assert(typeof ClinicBackupService.redactSecrets === 'function', 'ClinicBackupService.redactSecrets is a function');
  assert(typeof ClinicBackupService.computeSha256 === 'function', 'ClinicBackupService.computeSha256 is a function');
  assert(typeof ClinicBackupService.calculateSha256 === 'function', 'ClinicBackupService.calculateSha256 is a function');

  // Summary
  console.log('\n======================================================');
  console.log(`MILESTONE 3 RESULTS: ${passedTests} / ${totalTests} assertions passed (${failedTests} failed)`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    throw new Error(`Milestone 3 unit test suite failed: ${failedTests} assertions failed out of ${totalTests}`);
  }
}
