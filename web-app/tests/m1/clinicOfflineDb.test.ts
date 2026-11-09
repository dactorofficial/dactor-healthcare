/**
 * Unit Test Suite: Browser-Native Offline Database (clinicOfflineDb.ts)
 *
 * Verifies:
 * 1. Database initialization (dactor_clinic_offline_v1)
 * 2. 10 Object stores existence
 * 3. Required secondary indexes existence across all stores
 * 4. CRUD operations (putRecord, getRecord, putRecords, getStore, deleteRecord, clearStore)
 * 5. Outbox mutation queue management (queueMutation, FIFO getPendingMutations, updateMutationRetry, removeMutation)
 * 6. Sync metadata helpers (setSyncMeta, getSyncMeta)
 * 7. Secondary index queries (getRecordsByIndex)
 */

import {
  initClinicOfflineDb,
  getRecord,
  getStore,
  putRecord,
  putRecords,
  deleteRecord,
  clearStore,
  getRecordsByIndex,
  queueMutation,
  getPendingMutations,
  removeMutation,
  updateMutationRetry,
  getSyncMeta,
  setSyncMeta,
  closeClinicOfflineDb,
  deleteClinicOfflineDb,
  setIndexedDBFactory,
  DB_NAME,
  DB_VERSION,
  CLINIC_OFFLINE_STORES,
  type OutboxMutation,
} from '../../src/services/clinicOfflineDb.ts';
import { MockIDBFactory } from './idbMock.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details:`, details);
  }
}

export async function runClinicOfflineDbTests() {
  console.log('\n======================================================');
  console.log('=== CLINIC OFFLINE INDEXEDDB & OUTBOX UNIT TESTS  ===');
  console.log('======================================================\n');

  // Setup mock factory
  const mockFactory = new MockIDBFactory();
  setIndexedDBFactory(mockFactory);

  // 1. Database Initialization & Stores Verification
  console.log('--- 1. Database Initialization & Stores ---');
  const db = await initClinicOfflineDb();
  assert(db.name === DB_NAME, `Database name matches "${DB_NAME}"`);
  assert(db.version === DB_VERSION, `Database version is ${DB_VERSION}`);

  for (const storeName of CLINIC_OFFLINE_STORES) {
    assert(db.objectStoreNames.contains(storeName), `Object store "${storeName}" exists`);
  }
  assert(CLINIC_OFFLINE_STORES.length === 10, 'Exactly 10 stores defined in CLINIC_OFFLINE_STORES');

  // 2. Secondary Indexes Verification
  console.log('\n--- 2. Store Indexes Verification ---');
  const tx = db.transaction(Array.from(CLINIC_OFFLINE_STORES), 'readonly');

  const checkIndex = (storeName: string, idxName: string) => {
    const store = tx.objectStore(storeName);
    assert(store.indexNames.contains(idxName), `Store "${storeName}" contains index "${idxName}"`);
  };

  // 1. clinic_profile: id
  checkIndex('clinic_profile', 'id');

  // 2. doctors: id, clinic_id, is_in_clinic
  checkIndex('doctors', 'id');
  checkIndex('doctors', 'clinic_id');
  checkIndex('doctors', 'is_in_clinic');

  // 3. appointments: id, clinic_id, date, checkin_status, tracking_code, patient_phone
  checkIndex('appointments', 'id');
  checkIndex('appointments', 'clinic_id');
  checkIndex('appointments', 'date');
  checkIndex('appointments', 'checkin_status');
  checkIndex('appointments', 'tracking_code');
  checkIndex('appointments', 'patient_phone');

  // 4. opd_queue: id, clinic_id, appointment_id, status, token_number
  checkIndex('opd_queue', 'id');
  checkIndex('opd_queue', 'clinic_id');
  checkIndex('opd_queue', 'appointment_id');
  checkIndex('opd_queue', 'status');
  checkIndex('opd_queue', 'token_number');

  // 5. invoices: id, clinic_id, appointment_id, patient_phone, created_at
  checkIndex('invoices', 'id');
  checkIndex('invoices', 'clinic_id');
  checkIndex('invoices', 'appointment_id');
  checkIndex('invoices', 'patient_phone');
  checkIndex('invoices', 'created_at');

  // 6. billing_items: id, invoice_id, clinic_id
  checkIndex('billing_items', 'id');
  checkIndex('billing_items', 'invoice_id');
  checkIndex('billing_items', 'clinic_id');

  // 7. patients: id, phone, full_name
  checkIndex('patients', 'id');
  checkIndex('patients', 'phone');
  checkIndex('patients', 'full_name');

  // 8. slots: id, doctor_id, clinic_id, date
  checkIndex('slots', 'id');
  checkIndex('slots', 'doctor_id');
  checkIndex('slots', 'clinic_id');
  checkIndex('slots', 'date');

  // 9. outbox: id, timestamp, table, status
  checkIndex('outbox', 'id');
  checkIndex('outbox', 'timestamp');
  checkIndex('outbox', 'table');
  checkIndex('outbox', 'status');

  // 3. Basic CRUD Operations
  console.log('\n--- 3. Basic CRUD Operations ---');
  // putRecord & getRecord
  const clinicData = { id: 'c1', name: 'Kathmandu Health Clinic', contact_email: 'test@clinic.com' };
  await putRecord('clinic_profile', clinicData);

  const fetchedClinic = await getRecord<typeof clinicData>('clinic_profile', 'c1');
  assert(fetchedClinic?.id === 'c1', 'getRecord retrieves stored record by ID');
  assert(fetchedClinic?.name === 'Kathmandu Health Clinic', 'getRecord preserves record fields');

  // Non-existent record
  const missing = await getRecord('clinic_profile', 'c999');
  assert(missing === undefined, 'getRecord returns undefined for missing ID');

  // putRecords (batch) & getStore
  const doctors = [
    { id: 'd1', clinic_id: 'c1', full_name: 'Dr. Ram Sharma', is_in_clinic: true },
    { id: 'd2', clinic_id: 'c1', full_name: 'Dr. Sita KC', is_in_clinic: false },
    { id: 'd3', clinic_id: 'c1', full_name: 'Dr. Gita Adhikari', is_in_clinic: true },
  ];
  await putRecords('doctors', doctors);

  const allDoctors = await getStore<any>('doctors');
  assert(allDoctors.length === 3, 'getStore returns all 3 batch inserted doctors');
  assert(allDoctors.some((d) => d.id === 'd1'), 'Doctor d1 exists');
  assert(allDoctors.some((d) => d.id === 'd2'), 'Doctor d2 exists');

  // deleteRecord
  await deleteRecord('doctors', 'd2');
  const remainingDoctors = await getStore<any>('doctors');
  assert(remainingDoctors.length === 2, 'deleteRecord removes specified record');
  assert(!remainingDoctors.some((d) => d.id === 'd2'), 'Doctor d2 no longer exists');

  // clearStore
  await clearStore('doctors');
  const clearedDoctors = await getStore<any>('doctors');
  assert(clearedDoctors.length === 0, 'clearStore empties store');

  // 4. Secondary Index Queries
  console.log('\n--- 4. Secondary Index Queries ---');
  const appointments = [
    { id: 'a1', clinic_id: 'c1', date: '2026-10-23', checkin_status: 'waiting', tracking_code: '1000100014' },
    { id: 'a2', clinic_id: 'c1', date: '2026-10-23', checkin_status: 'in_consultation', tracking_code: '1000100022' },
    { id: 'a3', clinic_id: 'c1', date: '2026-10-24', checkin_status: 'waiting', tracking_code: '1000200013' },
  ];
  await putRecords('appointments', appointments);

  const todayAppts = await getRecordsByIndex<any>('appointments', 'date', '2026-10-23');
  assert(todayAppts.length === 2, `getRecordsByIndex retrieves 2 appointments for 2026-10-23 (got ${todayAppts.length})`);

  const waitingAppts = await getRecordsByIndex<any>('appointments', 'checkin_status', 'waiting');
  assert(waitingAppts.length === 2, `getRecordsByIndex retrieves 2 waiting appointments (got ${waitingAppts.length})`);

  const singleAppt = await getRecordsByIndex<any>('appointments', 'tracking_code', '1000100014');
  assert(singleAppt.length === 1 && singleAppt[0].id === 'a1', 'getRecordsByIndex retrieves by tracking_code');

  // 5. Outbox Mutation Queue & FIFO Sorting
  console.log('\n--- 5. Outbox Mutation Queue & FIFO Sorting ---');
  await clearStore('outbox');

  const now = Date.now();
  const mut1: OutboxMutation = {
    id: 'm1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'a1' },
    timestamp: now + 100, // 2nd
    retryCount: 0,
    status: 'pending',
  };
  const mut2: OutboxMutation = {
    id: 'm2',
    table: 'opd_queue',
    action: 'INSERT',
    payload: { id: 'q1' },
    timestamp: now + 50, // 1st (earliest)
    retryCount: 0,
    status: 'pending',
  };
  const mut3: OutboxMutation = {
    id: 'm3',
    table: 'invoices',
    action: 'INSERT',
    payload: { id: 'i1' },
    timestamp: now + 300, // 3rd (latest)
    retryCount: 0,
    status: 'pending',
  };

  // Queue out-of-order
  await queueMutation(mut1);
  await queueMutation(mut3);
  await queueMutation(mut2);

  const pending = await getPendingMutations();
  assert(pending.length === 3, 'getPendingMutations returns all 3 queued mutations');
  assert(pending[0].id === 'm2', 'FIFO 1st item is m2 (timestamp now + 50)');
  assert(pending[1].id === 'm1', 'FIFO 2nd item is m1 (timestamp now + 100)');
  assert(pending[2].id === 'm3', 'FIFO 3rd item is m3 (timestamp now + 300)');

  // updateMutationRetry
  await updateMutationRetry('m1', 'Failed to reach Supabase: 504 Gateway Timeout');
  const updatedM1 = await getRecord<OutboxMutation>('outbox', 'm1');
  assert(updatedM1?.retryCount === 1, 'updateMutationRetry increments retryCount to 1');
  assert(updatedM1?.lastError?.includes('504'), 'updateMutationRetry sets lastError');
  assert(updatedM1?.status === 'failed', 'updateMutationRetry sets status to "failed"');

  // getPendingMutations ignores non-pending unless requested
  const pendingAfterFail = await getPendingMutations();
  assert(pendingAfterFail.length === 2, 'getPendingMutations returns only 2 pending mutations');
  assert(!pendingAfterFail.some((m) => m.id === 'm1'), 'm1 is excluded from pending queue');

  const allOutbox = await getPendingMutations('all');
  assert(allOutbox.length === 3, 'getPendingMutations("all") includes failed mutations for retry');

  // removeMutation
  await removeMutation('m2');
  const pendingAfterRemove = await getPendingMutations();
  assert(pendingAfterRemove.length === 1 && pendingAfterRemove[0].id === 'm3', 'removeMutation removes item m2');

  // 6. Sync Metadata Store Helpers
  console.log('\n--- 6. Sync Metadata Store ---');
  await setSyncMeta('last_sync_timestamp', 1729600000000);
  const fetchedSyncTime = await getSyncMeta<number>('last_sync_timestamp');
  assert(fetchedSyncTime === 1729600000000, 'setSyncMeta & getSyncMeta preserves timestamp');

  const metaObj = { terminalId: 42, clinicId: 'c1', activeDesk: 'reception_1' };
  await setSyncMeta('desk_config', metaObj);
  const fetchedObj = await getSyncMeta<typeof metaObj>('desk_config');
  assert(fetchedObj?.terminalId === 42, 'getSyncMeta preserves object fields');
  assert(fetchedObj?.clinicId === 'c1', 'getSyncMeta preserves clinic ID');

  const missingMeta = await getSyncMeta('non_existent_key');
  assert(missingMeta === undefined, 'getSyncMeta returns undefined for missing key');

  // 7. Cleanup & Close
  console.log('\n--- 7. Cleanup & Close ---');
  closeClinicOfflineDb();
  await deleteClinicOfflineDb();
  assert(true, 'closeClinicOfflineDb and deleteClinicOfflineDb execute without error');

  console.log('\n======================================================');
  console.log(`CLINIC OFFLINE DB RESULTS: ${passedTests} / ${totalTests} assertions passed (${failedTests} failed)`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    throw new Error(`${failedTests} clinic offline database test assertion(s) failed`);
  }
}
