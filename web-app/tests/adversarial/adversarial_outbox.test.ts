import {
  initClinicOfflineDb,
  closeClinicOfflineDb,
  setIndexedDBFactory,
  queueMutation,
  getPendingMutations,
  removeMutation,
  updateMutationRetry,
  putRecord,
  getRecord,
  getStore,
  clearStore,
} from '../../src/services/clinicOfflineDb.ts';
import type { OutboxMutation } from '../../src/services/clinicOfflineDb.ts';
import { MockIDBFactory } from '../m1/idbMock.ts';

declare const process: any;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

console.log('======================================================================');
console.log('=== CHALLENGER 1: ADVERSARIAL STRESS TEST - OFFLINE DB & OUTBOX    ===');
console.log('======================================================================\n');

async function runOutboxTests() {
  const mockFactory = new MockIDBFactory();
  setIndexedDBFactory(mockFactory as any);

  // Initialize DB
  await initClinicOfflineDb();

  // ============================================================================
  // 1. RAPID MONOTONIC ENQUEUING (1,000 MUTATIONS IN RAPID SUCCESSION)
  // ============================================================================
  console.log('--- 1. Rapid Monotonic FIFO Enqueuing Stress Test (1,000 Mutations) ---');
  await clearStore('outbox');

  const count = 1000;
  const startQueueTime = Date.now();

  // Enqueue 1,000 mutations in rapid succession
  for (let i = 0; i < count; i++) {
    await queueMutation({
      id: `mut-${String(i).padStart(5, '0')}`,
      table: 'appointments',
      action: 'INSERT',
      payload: {
        sequenceNumber: i,
        patientName: `Patient_${i}`,
        clinicId: 'c1',
      },
      retryCount: 0,
      status: 'pending',
      timestamp: 0, // Should be normalized by queueMutation if 0 or left as is
    });
  }

  const queueDuration = Date.now() - startQueueTime;
  console.log(`  Enqueued ${count} mutations sequentially in ${queueDuration}ms (${Math.round(count / (queueDuration / 1000))} ops/sec)`);

  const pending = await getPendingMutations();
  assert(pending.length === count, `Retrieved exactly ${count} pending mutations (got ${pending.length})`);

  // Check monotonic non-decreasing timestamps
  let isMonotonic = true;
  let timestampCollisions = 0;
  let orderViolations = 0;

  for (let i = 0; i < pending.length - 1; i++) {
    if (pending[i].timestamp > pending[i + 1].timestamp) {
      isMonotonic = false;
      orderViolations++;
      console.error(`  ❌ Monotonic timestamp violation at index ${i}: ${pending[i].timestamp} > ${pending[i + 1].timestamp}`);
    }
    if (pending[i].timestamp === pending[i + 1].timestamp) {
      timestampCollisions++;
    }
  }

  console.log(`  Timestamp collisions observed: ${timestampCollisions} / ${count - 1} adjacent pairs`);
  assert(isMonotonic, 'Pending mutations sorted with strictly non-decreasing timestamps');
  assert(orderViolations === 0, 'Zero timestamp order violations across 1,000 mutations');

  // Verify FIFO sequence preservation
  let fifoSequencePreserved = true;
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].payload?.sequenceNumber !== i) {
      fifoSequencePreserved = false;
      console.error(`  ❌ FIFO sequence mismatch at index ${i}: expected seq ${i}, got ${pending[i].payload?.sequenceNumber}`);
      break;
    }
  }

  assert(fifoSequencePreserved, '1,000 sequential mutations preserved exact FIFO insertion order');

  // ============================================================================
  // 1.2 W3C SPEC COMPLIANCE & SUB-MILLISECOND FIFO ORDERING CHARACTERIZATION
  // ============================================================================
  console.log('\n--- 1.2 W3C Spec Key-Order & Sub-millisecond Monotonicity Test ---');
  // In real browser IndexedDB (Chrome, Safari, Firefox), IDBObjectStore.getAll() returns
  // records ordered by primary key (UUIDv4), NOT by insertion order.
  // We stress test whether Date.now() timestamp collision causes out-of-order execution.
  await clearStore('outbox');

  const rapidCount = 100;
  // Queue 100 mutations with random UUIDs and default timestamp Date.now()
  for (let i = 0; i < rapidCount; i++) {
    await queueMutation({
      id: '', // trigger generateUUID()
      table: 'appointments',
      action: 'UPDATE',
      payload: { step: i },
      retryCount: 0,
      status: 'pending',
      timestamp: Date.now(), // same millisecond for many
    });
  }

  const rapidPending = await getPendingMutations();
  let timestampCollisionsRapid = 0;
  for (let i = 0; i < rapidPending.length - 1; i++) {
    if (rapidPending[i].timestamp === rapidPending[i + 1].timestamp) {
      timestampCollisionsRapid++;
    }
  }

  console.log(`  Rapid 100 mutations: observed ${timestampCollisionsRapid} identical timestamp pairs.`);
  console.log(`  Timestamp range across 100 mutations: ${rapidPending[rapidPending.length - 1].timestamp - rapidPending[0].timestamp}ms`);

  assert(rapidPending.length === rapidCount, `All ${rapidCount} rapid mutations persisted and retrieved`);

  console.log('\n--- 2. High Payload Durability (>1MB Blobs & Strings) ---');

  // 2.1 Test 1.2 MB Payload in Outbox
  const payload1MB = 'X'.repeat(1200000); // 1.2 MB string
  const start1MB = Date.now();
  await queueMutation({
    id: 'large-payload-1mb',
    table: 'lab_reports',
    action: 'INSERT',
    payload: {
      reportId: 'rep-1mb',
      pdfBase64: payload1MB,
      fileSize: 1200000,
    },
    retryCount: 0,
    status: 'pending',
    timestamp: Date.now() + 50000,
  });
  const dur1MB = Date.now() - start1MB;
  console.log(`  Enqueued 1.2MB payload in ${dur1MB}ms`);

  const fetched1MB = await getRecord<OutboxMutation>('outbox', 'large-payload-1mb');
  assert(fetched1MB !== undefined, '1.2MB outbox mutation persisted and retrieved');
  assert(fetched1MB?.payload?.pdfBase64?.length === 1200000, '1.2MB payload string length preserved exactly');
  assert(fetched1MB?.payload?.pdfBase64 === payload1MB, '1.2MB payload content matches byte-for-byte');

  // 2.2 Test 2.5 MB Payload in Invoices Store
  const payload2_5MB = 'D'.repeat(2500000); // 2.5 MB string
  const start2_5MB = Date.now();
  await putRecord('invoices', {
    id: 'inv-large-2_5mb',
    clinic_id: 'clinic-1',
    appointment_id: 'appt-1',
    largeMetadata: payload2_5MB,
    amount: 1500,
    payment_status: 'paid',
  });
  const dur2_5MB = Date.now() - start2_5MB;
  console.log(`  Stored 2.5MB invoice in ${dur2_5MB}ms`);

  const fetchedInvoice = await getRecord<any>('invoices', 'inv-large-2_5mb');
  assert(fetchedInvoice !== undefined, '2.5MB invoice record persisted and retrieved');
  assert(fetchedInvoice?.largeMetadata?.length === 2500000, '2.5MB payload string length preserved exactly');
  assert(fetchedInvoice?.largeMetadata === payload2_5MB, '2.5MB payload byte-for-byte exact match');

  // 2.3 Test 5.0 MB Extreme Payload in Appointments Store
  const payload5MB = 'M'.repeat(5000000); // 5.0 MB string
  const start5MB = Date.now();
  await putRecord('appointments', {
    id: 'appt-extreme-5mb',
    clinic_id: 'clinic-1',
    date: '2025-10-23',
    patient_phone: '9841000000',
    hugeDiagnosticArchive: payload5MB,
  });
  const dur5MB = Date.now() - start5MB;
  console.log(`  Stored 5.0MB appointment record in ${dur5MB}ms`);

  const fetchedAppt = await getRecord<any>('appointments', 'appt-extreme-5mb');
  assert(fetchedAppt !== undefined, '5.0MB appointment record persisted and retrieved');
  assert(fetchedAppt?.hugeDiagnosticArchive?.length === 5000000, '5.0MB payload string length preserved exactly');
  assert(fetchedAppt?.hugeDiagnosticArchive === payload5MB, '5.0MB payload byte-for-byte exact match');


  // ============================================================================
  // 3. OUTBOX RESILIENCY & STATE MACHINE EDGE CASES
  // ============================================================================
  console.log('\n--- 3. Outbox Resiliency & State Machine Edge Cases ---');

  // 3.1 updateMutationRetry on non-existent mutation
  let threwRetryMissing = false;
  try {
    await updateMutationRetry('non-existent-uuid', 'Some network error');
  } catch (err) {
    threwRetryMissing = true;
  }
  assert(!threwRetryMissing, 'updateMutationRetry on non-existent ID handles gracefully without crashing');

  // 3.2 removeMutation on non-existent mutation
  let threwRemoveMissing = false;
  try {
    await removeMutation('non-existent-uuid-to-remove');
  } catch (err) {
    threwRemoveMissing = true;
  }
  assert(!threwRemoveMissing, 'removeMutation on non-existent ID handles gracefully without crashing');

  // 3.3 State filter accuracy (pending vs all vs processing)
  await clearStore('outbox');
  const testMutations: OutboxMutation[] = [
    { id: 'm-p1', table: 'appointments', action: 'INSERT', payload: {}, retryCount: 0, status: 'pending', timestamp: 100 },
    { id: 'm-p2', table: 'appointments', action: 'INSERT', payload: {}, retryCount: 0, status: 'pending', timestamp: 200 },
    { id: 'm-f1', table: 'appointments', action: 'INSERT', payload: {}, retryCount: 1, status: 'failed', timestamp: 300 },
    { id: 'm-proc', table: 'appointments', action: 'INSERT', payload: {}, retryCount: 0, status: 'processing', timestamp: 400 },
    { id: 'm-f2', table: 'appointments', action: 'INSERT', payload: {}, retryCount: 2, status: 'failed', timestamp: 500 },
  ];

  for (const m of testMutations) {
    await putRecord('outbox', m);
  }

  const pendingOnly = await getPendingMutations('pending');
  assert(pendingOnly.length === 2, `getPendingMutations('pending') returns exactly 2 pending items (got ${pendingOnly.length})`);
  assert(pendingOnly.every((m) => m.status === 'pending'), 'All items in pendingOnly have status === "pending"');

  const allItems = await getPendingMutations('all');
  assert(allItems.length === 4, `getPendingMutations('all') returns pending + failed items (4 items, got ${allItems.length})`);
  assert(!allItems.some((m) => m.status === 'processing'), 'getPendingMutations("all") excludes "processing" items');

  // 3.4 Mutation outbox drain
  for (const m of pendingOnly) {
    await removeMutation(m.id);
  }
  const pendingAfterDrain = await getPendingMutations('pending');
  assert(pendingAfterDrain.length === 0, 'Draining pending mutations leaves pending queue empty (0 items)');

  closeClinicOfflineDb();

  console.log('\n======================================================================');
  console.log(`CLINIC OFFLINE DB ADVERSARIAL SUITE: ${passedTests} / ${totalTests} assertions passed (${failedTests} failed)`);
  console.log('======================================================================\n');
}

runOutboxTests().catch((err) => {
  console.error('Unhandled test harness error:', err);
  process.exit(1);
});
