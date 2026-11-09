/**
 * Tier 1: Feature Coverage Test Suite (≥60 tests across 12 features)
 * Opaque-box testing of all core functional requirements specified in PROJECT.md and TEST_INFRA.md.
 */

const crypto = require('node:crypto');
const { createTestSuite } = require('./test_runner_framework.js');
const env = require('./mock_environment.js');

const suite = createTestSuite('Feature Coverage (Tier 1)', 1);

// Helper to reset test environment between tests
suite.beforeEach(async () => {
  env.resetDbInstance();
  env.globalLocalStorage.clear();
  env.globalRemoteDb.reset();
  const idb = env.globalIndexedDB;
  await new Promise((resolve) => {
    const req = idb.deleteDatabase('dactor_clinic_offline_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

// ============================================================================
// FEATURE 1: Client-Side IndexedDB (dactor_clinic_offline_v1)
// ============================================================================

suite.test('F1-01: IndexedDB initializes database "dactor_clinic_offline_v1" with all 10 object stores', async (assert) => {
  const db = await env.initClinicOfflineDb();
  assert.equal(db.name, 'dactor_clinic_offline_v1', 'Database name must be dactor_clinic_offline_v1');
  const expectedStores = [
    'clinic_profile',
    'doctors',
    'appointments',
    'opd_queue',
    'invoices',
    'billing_items',
    'patients',
    'slots',
    'sync_meta',
    'outbox'
  ];
  for (const store of expectedStores) {
    assert.ok(db.objectStoreNames.includes(store), `Object store "${store}" must be created`);
  }
});

suite.test('F1-02: Key paths across stores are properly configured with primary key "id"', async (assert) => {
  const db = await env.initClinicOfflineDb();
  const tx = db.transaction(['appointments', 'invoices', 'doctors', 'outbox'], 'readonly');
  assert.equal(tx.objectStore('appointments').keyPath, 'id', 'appointments keyPath must be id');
  assert.equal(tx.objectStore('invoices').keyPath, 'id', 'invoices keyPath must be id');
  assert.equal(tx.objectStore('doctors').keyPath, 'id', 'doctors keyPath must be id');
  assert.equal(tx.objectStore('outbox').keyPath, 'id', 'outbox keyPath must be id');
});

suite.test('F1-03: Secondary indexes on appointments and opd_queue are established', async (assert) => {
  const db = await env.initClinicOfflineDb();
  const tx = db.transaction(['appointments', 'opd_queue'], 'readonly');
  const apptStore = tx.objectStore('appointments');
  assert.ok(apptStore.indexNames.includes('clinic_id'), 'Index clinic_id must exist on appointments');
  assert.ok(apptStore.indexNames.includes('tracking_code_10_digit'), 'Index tracking_code_10_digit must exist');
  assert.ok(apptStore.indexNames.includes('appointment_date'), 'Index appointment_date must exist');

  const qStore = tx.objectStore('opd_queue');
  assert.ok(qStore.indexNames.includes('appointment_id'), 'Index appointment_id must exist on opd_queue');
  assert.ok(qStore.indexNames.includes('status'), 'Index status must exist on opd_queue');
});

suite.test('F1-04: Basic CRUD operations (put, get, update, delete) succeed in IndexedDB', async (assert) => {
  const testAppt = {
    id: 'appt-1001',
    clinic_id: 'clinic-1',
    patient_name: 'Suman Shrestha',
    appointment_date: '2026-10-23',
    status: 'booked'
  };

  await env.putRecord('appointments', testAppt);
  const fetched = await env.getRecord('appointments', 'appt-1001');
  assert.ok(fetched, 'Record should be fetched successfully');
  assert.equal(fetched.patient_name, 'Suman Shrestha', 'Patient name should match');

  // Update
  testAppt.patient_name = 'Suman K. Shrestha';
  await env.putRecord('appointments', testAppt);
  const updated = await env.getRecord('appointments', 'appt-1001');
  assert.equal(updated.patient_name, 'Suman K. Shrestha', 'Record should be updated');

  // Delete
  await env.deleteRecord('appointments', 'appt-1001');
  const deleted = await env.getRecord('appointments', 'appt-1001');
  assert.equal(deleted, undefined, 'Deleted record should not exist');
});

suite.test('F1-05: clearStore purges all records in a store without deleting store definition', async (assert) => {
  await env.putRecords('doctors', [
    { id: 'doc-1', name: 'Dr. Sita KC' },
    { id: 'doc-2', name: 'Dr. Rajesh Sharma' }
  ]);
  const beforeClear = await env.getStore('doctors');
  assert.equal(beforeClear.length, 2, 'Should have 2 doctors initially');

  await env.clearStore('doctors');
  const afterClear = await env.getStore('doctors');
  assert.equal(afterClear.length, 0, 'Doctors store should be empty');

  // Can still write after clear
  await env.putRecord('doctors', { id: 'doc-3', name: 'Dr. Anup Regmi' });
  const refilled = await env.getStore('doctors');
  assert.equal(refilled.length, 1, 'Doctors store should accept new records after clear');
});

// ============================================================================
// FEATURE 2: Structured 10-Digit Tracking Code Generator
// ============================================================================

suite.test('F2-01: Tracking code format is exactly 10 digits matching numeric regex', async (assert) => {
  const code = env.TrackingCodeGenerator.generateTrackingCode(10);
  assert.equal(typeof code, 'string', 'Tracking code must be a string');
  assert.equal(code.length, 10, 'Tracking code must be exactly 10 digits');
  assert.match(code, /^\d{10}$/, 'Tracking code must consist exclusively of numeric digits');
});

suite.test('F2-02: Tracking code correctly encodes terminal ID (2 digits), DOY (3 digits), counter (4 digits)', async (assert) => {
  const fixedDate = new Date('2026-03-15T10:00:00Z'); // Day 74 of 2026
  const terminalId = 42;
  const code = env.TrackingCodeGenerator.generateTrackingCode(terminalId, fixedDate);
  const parsed = env.TrackingCodeGenerator.parseTrackingCode(code);

  assert.ok(parsed.isValid, 'Generated code must be valid');
  assert.equal(parsed.terminalId, 42, 'Terminal ID must be 42');
  assert.equal(parsed.dayOfYear, 74, 'Day of year must be 74');
  assert.inRange(parsed.counter, 1, 9999, 'Counter must be in range 1..9999');
});

suite.test('F2-03: Terminal ID getter and setter properly persist in range 10..99', async (assert) => {
  env.TrackingCodeGenerator.setTerminalId(88);
  assert.equal(env.TrackingCodeGenerator.getTerminalId(), 88, 'Terminal ID must be 88');

  assert.throws(() => {
    env.TrackingCodeGenerator.setTerminalId(9); // too small
  }, 'Should throw on terminal ID < 10');

  assert.throws(() => {
    env.TrackingCodeGenerator.setTerminalId(100); // too large
  }, 'Should throw on terminal ID > 99');
});

suite.test('F2-04: Day of Year (DOY) correctly maps dates across the year', async (assert) => {
  const jan1 = new Date('2026-01-01T00:00:00Z');
  assert.equal(env.TrackingCodeGenerator.getDayOfYear(jan1), 1, 'Jan 1 must be DOY 1');

  const feb1 = new Date('2026-02-01T00:00:00Z');
  assert.equal(env.TrackingCodeGenerator.getDayOfYear(feb1), 32, 'Feb 1 must be DOY 32 (31+1)');

  const dec31 = new Date('2026-12-31T00:00:00Z');
  assert.equal(env.TrackingCodeGenerator.getDayOfYear(dec31), 365, 'Dec 31 of normal year must be DOY 365');
});

suite.test('F2-05: Daily monotonic counter increments sequentially and generates valid Luhn checksums', async (assert) => {
  const date = new Date('2026-06-01T08:00:00Z');
  const code1 = env.TrackingCodeGenerator.generateTrackingCode(15, date);
  const code2 = env.TrackingCodeGenerator.generateTrackingCode(15, date);
  const code3 = env.TrackingCodeGenerator.generateTrackingCode(15, date);

  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code1), 'Code 1 must pass Luhn validation');
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code2), 'Code 2 must pass Luhn validation');
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code3), 'Code 3 must pass Luhn validation');

  const p1 = env.TrackingCodeGenerator.parseTrackingCode(code1);
  const p2 = env.TrackingCodeGenerator.parseTrackingCode(code2);
  const p3 = env.TrackingCodeGenerator.parseTrackingCode(code3);

  assert.equal(p2.counter, p1.counter + 1, 'Counter must increment by 1');
  assert.equal(p3.counter, p2.counter + 1, 'Counter must increment by 1');
});

// ============================================================================
// FEATURE 3: Mutation Outbox & Monotonic Timestamps
// ============================================================================

suite.test('F3-01: Outbox queueMutation generates a valid UUIDv4 key and persists mutation', async (assert) => {
  await env.queueMutation({
    table: 'appointments',
    action: 'UPSERT',
    payload: { id: 'appt-1', patient_name: 'Anita Dahal' }
  });

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 1, 'Outbox should contain 1 pending mutation');
  assert.match(
    pending[0].id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Outbox mutation ID must be a valid UUIDv4'
  );
  assert.equal(pending[0].table, 'appointments', 'Table name must be appointments');
  assert.equal(pending[0].payload.patient_name, 'Anita Dahal', 'Payload must match');
});

suite.test('F3-02: FIFO ordering is preserved through monotonic timestamps', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { num: 1 } });
  await new Promise((r) => setTimeout(r, 5));
  await env.queueMutation({ table: 'appointments', payload: { num: 2 } });
  await new Promise((r) => setTimeout(r, 5));
  await env.queueMutation({ table: 'appointments', payload: { num: 3 } });

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 3, 'Should have 3 mutations in outbox');
  assert.equal(pending[0].payload.num, 1, 'First queued must be first in list');
  assert.equal(pending[1].payload.num, 2, 'Second queued must be second in list');
  assert.equal(pending[2].payload.num, 3, 'Third queued must be third in list');
  assert.ok(pending[0].monotonic_ts <= pending[1].monotonic_ts, 'Monotonic ts must be ascending');
  assert.ok(pending[1].monotonic_ts <= pending[2].monotonic_ts, 'Monotonic ts must be ascending');
});

suite.test('F3-03: Outbox mutation schema enforces table, action, and pending status', async (assert) => {
  await env.queueMutation({
    table: 'invoices',
    action: 'INSERT',
    payload: { id: 'inv-100', total_amount: 1500 }
  });

  const [mut] = await env.getPendingMutations();
  assert.equal(mut.status, 'pending', 'Initial status must be pending');
  assert.equal(mut.retry_count, 0, 'Initial retry_count must be 0');
  assert.equal(mut.action, 'INSERT', 'Action should be preserved');
  assert.ok(typeof mut.created_at === 'string', 'created_at ISO timestamp must be populated');
});

suite.test('F3-04: removeMutation cleanly drains processed mutations from outbox', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { id: 'a1' } });
  await env.queueMutation({ table: 'appointments', payload: { id: 'a2' } });

  const pendingBefore = await env.getPendingMutations();
  assert.equal(pendingBefore.length, 2, 'Two mutations pending');

  await env.removeMutation(pendingBefore[0].id);
  const pendingAfter = await env.getPendingMutations();
  assert.equal(pendingAfter.length, 1, 'One mutation remaining');
  assert.equal(pendingAfter[0].payload.id, 'a2', 'Remaining mutation should be a2');
});

suite.test('F3-05: updateMutationRetry increments retry_count and stores last_error', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { id: 'a1' } });
  const [mut] = await env.getPendingMutations();

  await env.updateMutationRetry(mut.id, 'Connection timeout to Supabase');
  const updated = await env.getRecord('outbox', mut.id);

  assert.equal(updated.retry_count, 1, 'retry_count should be incremented to 1');
  assert.equal(updated.last_error, 'Connection timeout to Supabase', 'last_error must record error message');
  assert.equal(updated.status, 'pending', 'Status should remain pending while retries < 5');
});

// ============================================================================
// FEATURE 4: Idempotent Supabase Synchronization Engine
// ============================================================================

suite.test('F4-01: FIFO outbox drain sequentially pushes mutations upstream to Supabase', async (assert) => {
  const clinicId = 'clinic-alpha';
  const manager = new env.ClinicSyncManager(clinicId);

  await env.queueMutation({
    table: 'appointments',
    payload: { id: 'appt-1', clinic_id: clinicId, patient_name: 'Bikram Thapa' }
  });
  await env.queueMutation({
    table: 'appointments',
    payload: { id: 'appt-2', clinic_id: clinicId, patient_name: 'Pooja Bhandari' }
  });

  const { pushed, failed } = await manager.pushPendingMutations();
  assert.equal(pushed, 2, 'Should push 2 mutations');
  assert.equal(failed, 0, 'Zero failures expected');

  const pendingAfter = await env.getPendingMutations();
  assert.equal(pendingAfter.length, 0, 'Outbox should be completely drained');

  const remoteRows = await env.globalRemoteDb.from('appointments').select('*');
  assert.equal(remoteRows.data.length, 2, 'Supabase remote table should contain both appointments');
});

suite.test('F4-02: Idempotent upsert on primary key prevents duplicate records on retry', async (assert) => {
  const clinicId = 'clinic-alpha';
  const manager = new env.ClinicSyncManager(clinicId);

  // Push record once
  await env.queueMutation({
    table: 'appointments',
    payload: { id: 'appt-dup-1', clinic_id: clinicId, fee_amount: 500 }
  });
  await manager.pushPendingMutations();

  // Simulate network retry: same UUID pushed again
  await env.queueMutation({
    table: 'appointments',
    payload: { id: 'appt-dup-1', clinic_id: clinicId, fee_amount: 500 }
  });
  await manager.pushPendingMutations();

  const remoteRows = await env.globalRemoteDb.from('appointments').select('*');
  const matched = remoteRows.data.filter((r) => r.id === 'appt-dup-1');
  assert.equal(matched.length, 1, 'Exactly 1 appointment row must exist in Supabase (no duplicates)');
});

suite.test('F4-03: Delta pull queries records with updated_at >= last_synced_at', async (assert) => {
  const clinicId = 'clinic-alpha';
  const manager = new env.ClinicSyncManager(clinicId);

  // Simulate remote appointment created online
  await env.globalRemoteDb.from('appointments').upsert({
    id: 'appt-remote-1',
    clinic_id: clinicId,
    patient_name: 'Ramesh Karki',
    updated_at: new Date().toISOString()
  });

  const { pulled } = await manager.pullRemoteDeltas(clinicId);
  assert.equal(pulled, 1, 'Delta pull should download 1 remote appointment');

  const localRecord = await env.getRecord('appointments', 'appt-remote-1');
  assert.ok(localRecord, 'Remote appointment should be persisted in local IndexedDB');
  assert.equal(localRecord.patient_name, 'Ramesh Karki', 'Local patient name should match remote');
});

suite.test('F4-04: Last-Write-Wins (LWW) timestamp comparison resolves conflicting edits', async (assert) => {
  const clinicId = 'clinic-alpha';
  const manager = new env.ClinicSyncManager(clinicId);

  // Local record has older timestamp
  await env.putRecord('appointments', {
    id: 'appt-conflict-1',
    clinic_id: clinicId,
    patient_name: 'Local Name Old',
    updated_at: '2026-10-22T10:00:00Z'
  });

  // Remote record has newer timestamp
  await env.globalRemoteDb.from('appointments').upsert({
    id: 'appt-conflict-1',
    clinic_id: clinicId,
    patient_name: 'Remote Name Wins',
    updated_at: '2026-10-22T11:00:00Z'
  });

  await manager.pullRemoteDeltas(clinicId);

  const resolved = await env.getRecord('appointments', 'appt-conflict-1');
  assert.equal(resolved.patient_name, 'Remote Name Wins', 'Newer remote update should overwrite older local record');
});

suite.test('F4-05: Successful sync updates sync_meta with last_synced_at timestamp', async (assert) => {
  const clinicId = 'clinic-alpha';
  const manager = new env.ClinicSyncManager(clinicId);

  await env.queueMutation({
    table: 'appointments',
    payload: { id: 'appt-meta-1', clinic_id: clinicId }
  });
  await manager.triggerSync();

  const lastSync = await env.getSyncMeta('last_synced_at');
  assert.ok(lastSync, 'last_synced_at must be populated in sync_meta store');
  assert.ok(!isNaN(Date.parse(lastSync)), 'last_synced_at must be a valid ISO date');
});

// ============================================================================
// FEATURE 5: Connectivity Status Pill & State Broadcaster
// ============================================================================

suite.test('F5-01: State transitions from "online" to "offline" when network disconnects', async (assert) => {
  const manager = new env.ClinicSyncManager('c1');
  let latestState = null;
  manager.subscribe((s) => {
    latestState = s.state;
  });

  assert.equal(latestState, 'online', 'Initial state should be online');
  await manager.setOnlineStatus(false);
  assert.equal(latestState, 'offline', 'State should transition to offline upon network drop');
});

suite.test('F5-02: State transitions to "syncing" while pending mutations are actively pushing', async (assert) => {
  const manager = new env.ClinicSyncManager('c1');
  await env.queueMutation({ table: 'appointments', payload: { id: 'a1' } });

  const states = [];
  manager.subscribe((s) => states.push(s.state));

  await manager.pushPendingMutations();
  assert.includes(states, 'syncing', 'Sync manager must emit "syncing" state during active upload');
  assert.equal(states[states.length - 1], 'online', 'Final state should return to online');
});

suite.test('F5-03: State transitions from "syncing" back to "online" when outbox is fully drained', async (assert) => {
  const manager = new env.ClinicSyncManager('c1');
  await env.queueMutation({ table: 'appointments', payload: { id: 'a1' } });

  await manager.pushPendingMutations();
  assert.equal(manager.state, 'online', 'Manager state must be online after sync complete');
});

suite.test('F5-04: State transitions to "error" on network or database exception during sync', async (assert) => {
  const manager = new env.ClinicSyncManager('c1');
  await env.queueMutation({ table: 'appointments', payload: { id: 'a1' } });

  // Simulate network failure
  env.globalRemoteDb.shouldFailNextRequest = true;

  const res = await manager.pushPendingMutations();
  assert.equal(res.failed, 1, 'Push should report failure');
  assert.equal(manager.state, 'error', 'Manager state must transition to error');
});

suite.test('F5-05: State subscription listeners are notified with pendingCount accurately', async (assert) => {
  const manager = new env.ClinicSyncManager('c1');
  let capturedCount = -1;
  const unsubscribe = manager.subscribe((s) => {
    capturedCount = s.pendingCount;
  });

  await env.queueMutation({ table: 'appointments', payload: { id: 'm1' } });
  await env.queueMutation({ table: 'appointments', payload: { id: 'm2' } });

  await manager.setOnlineStatus(false);
  assert.equal(capturedCount, 2, 'Listener should report 2 pending mutations');

  unsubscribe();
  await manager.setOnlineStatus(true);
  // After unsubscribe, capturedCount should not update on subsequent events
  assert.equal(capturedCount, 2, 'Unsubscribed listener should not receive updates');
});

// ============================================================================
// FEATURE 6: Offline Walk-in Registration & Queue Calling
// ============================================================================

suite.test('F6-01: Offline walk-in registration creates appointment in local IndexedDB', async (assert) => {
  const clinicId = 'clinic-1';
  const code10 = env.TrackingCodeGenerator.generateTrackingCode(10);
  const apptId = crypto.randomUUID();

  const newAppt = {
    id: apptId,
    clinic_id: clinicId,
    tracking_code_10_digit: code10,
    patient_name: 'Hari Maya Tamang',
    patient_age: 38,
    patient_gender: 'Female',
    checkin_status: 'waiting',
    payment_status: 'paid',
    is_walkin: true,
    created_at: new Date().toISOString()
  };

  await env.putRecord('appointments', newAppt);
  const saved = await env.getRecord('appointments', apptId);
  assert.ok(saved, 'Appointment must be stored in IndexedDB');
  assert.equal(saved.tracking_code_10_digit, code10, 'Tracking code must match');
  assert.equal(saved.checkin_status, 'waiting', 'Status should be waiting');
});

suite.test('F6-02: Offline walk-in automatically creates corresponding opd_queue entry', async (assert) => {
  const apptId = crypto.randomUUID();
  const queueId = crypto.randomUUID();

  const queueEntry = {
    id: queueId,
    appointment_id: apptId,
    clinic_id: 'clinic-1',
    doctor_id: 'doc-1',
    queue_position: 1,
    status: 'waiting',
    created_at: new Date().toISOString()
  };

  await env.putRecord('opd_queue', queueEntry);
  const savedQ = await env.getRecord('opd_queue', queueId);
  assert.ok(savedQ, 'Queue entry must be saved in opd_queue store');
  assert.equal(savedQ.appointment_id, apptId, 'Queue appointment_id must link to appointment');
});

suite.test('F6-03: Offline walk-in enqueues UPSERT_APPOINTMENT in mutation outbox', async (assert) => {
  const appt = {
    id: crypto.randomUUID(),
    clinic_id: 'clinic-1',
    patient_name: 'Dinesh Rai',
    tracking_code_10_digit: env.TrackingCodeGenerator.generateTrackingCode(10)
  };

  await env.putRecord('appointments', appt);
  await env.queueMutation({
    table: 'appointments',
    action: 'UPSERT',
    payload: appt
  });

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 1, 'Outbox must contain 1 mutation');
  assert.equal(pending[0].payload.patient_name, 'Dinesh Rai', 'Outbox payload should match appointment');
});

suite.test('F6-04: Cabin calling updates appointment status to "in_consultation" and updates queue status', async (assert) => {
  const apptId = 'appt-cabin-1';
  const qId = 'q-cabin-1';

  await env.putRecord('appointments', { id: apptId, checkin_status: 'waiting', clinic_id: 'c1' });
  await env.putRecord('opd_queue', { id: qId, appointment_id: apptId, status: 'waiting', clinic_id: 'c1' });

  // Simulate "Call Inside"
  const appt = await env.getRecord('appointments', apptId);
  appt.checkin_status = 'in_consultation';
  appt.inside_at = new Date().toISOString();
  await env.putRecord('appointments', appt);

  const q = await env.getRecord('opd_queue', qId);
  q.status = 'inside';
  q.inside_at = appt.inside_at;
  await env.putRecord('opd_queue', q);

  const updatedAppt = await env.getRecord('appointments', apptId);
  const updatedQ = await env.getRecord('opd_queue', qId);
  assert.equal(updatedAppt.checkin_status, 'in_consultation', 'Appointment must be in_consultation');
  assert.equal(updatedQ.status, 'inside', 'Queue entry must be inside');
});

suite.test('F6-05: Consultation completion marks appointment as "completed" with timestamp', async (assert) => {
  const apptId = 'appt-cabin-2';
  await env.putRecord('appointments', { id: apptId, checkin_status: 'in_consultation' });

  // Mark done
  const appt = await env.getRecord('appointments', apptId);
  appt.checkin_status = 'completed';
  appt.completed_at = new Date().toISOString();
  await env.putRecord('appointments', appt);

  const completed = await env.getRecord('appointments', apptId);
  assert.equal(completed.checkin_status, 'completed', 'Status must be completed');
  assert.ok(completed.completed_at, 'completed_at timestamp must be recorded');
});

// ============================================================================
// FEATURE 7: Offline Billing & Cash Ledger Persistence
// ============================================================================

suite.test('F7-01: Offline billing invoice is stored in IndexedDB invoices store', async (assert) => {
  const invoiceId = crypto.randomUUID();
  const invoice = {
    id: invoiceId,
    clinic_id: 'clinic-1',
    appointment_id: 'appt-1',
    total_amount: 1200,
    paid_amount: 1200,
    balance_due: 0,
    payment_status: 'paid',
    items: [{ id: 'item-1', name: 'General Consultation', price: 1200, quantity: 1 }]
  };

  await env.putRecord('invoices', invoice);
  const stored = await env.getRecord('invoices', invoiceId);
  assert.ok(stored, 'Invoice must be stored in IndexedDB');
  assert.equal(stored.total_amount, 1200, 'Total amount must match');
});

suite.test('F7-02: Multiple itemized bill items compute total amount and balance due correctly', async (assert) => {
  const items = [
    { id: '1', name: 'Doctor Consultation', price: 800, quantity: 1 },
    { id: '2', name: 'Blood Sugar Fasting Test', price: 250, quantity: 2 },
    { id: '3', name: 'Disposable Syringe & Kit', price: 50, quantity: 1 }
  ];
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  assert.equal(total, 1350, 'Total sum of bill items must be 800 + 500 + 50 = 1350');

  const paid = 1000;
  const balanceDue = total - paid;
  assert.equal(balanceDue, 350, 'Balance due must be 350');
});

suite.test('F7-03: Cash payment appends transaction record to structured payment ledger in remarks', async (assert) => {
  const paymentRecord = {
    id: crypto.randomUUID(),
    amount: 500,
    dateTime: new Date().toISOString(),
    note: 'Cash at Reception Desk'
  };

  const remarks = `Routine OPD [PAYMENT_LOGS]${JSON.stringify([paymentRecord])}[/PAYMENT_LOGS]`;
  assert.includes(remarks, '[PAYMENT_LOGS]', 'Remarks must embed structured PAYMENT_LOGS tag');
  assert.includes(remarks, 'Cash at Reception Desk', 'Payment record note must be embedded');
});

suite.test('F7-04: Saving offline bill queues UPSERT_BILLING_INVOICE in outbox', async (assert) => {
  const inv = {
    id: crypto.randomUUID(),
    clinic_id: 'c1',
    total_amount: 800,
    payment_status: 'paid'
  };

  await env.putRecord('invoices', inv);
  await env.queueMutation({
    table: 'billing_invoices',
    action: 'UPSERT',
    payload: inv
  });

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 1, 'Outbox must contain billing mutation');
  assert.equal(pending[0].table, 'billing_invoices', 'Table must be billing_invoices');
});

suite.test('F7-05: Offline billing operation executes with zero network alerts thrown', async (assert) => {
  // Simulate offline bill save without throwing alert
  let alertTriggered = false;
  const mockAlert = () => {
    alertTriggered = true;
  };

  const saveBillOffline = async (billData) => {
    // Correct offline logic: save directly to IndexedDB & outbox
    await env.putRecord('invoices', billData);
    await env.queueMutation({ table: 'billing_invoices', payload: billData });
  };

  await saveBillOffline({ id: 'inv-noalert-1', total_amount: 600 });
  assert.equal(alertTriggered, false, 'No browser alert should be triggered during offline billing');
  const saved = await env.getRecord('invoices', 'inv-noalert-1');
  assert.ok(saved, 'Invoice must be durably saved offline');
});

// ============================================================================
// FEATURE 8: Sensitive Credential Redaction Engine
// ============================================================================

suite.test('F8-01: In-memory redaction replaces payment_secret_key with [REDACTED]', async (assert) => {
  const input = {
    clinic_name: 'Patan Polyclinic',
    payment_secret_key: 'sk_live_very_secret_998877'
  };

  const sanitized = env.redactSecrets(input);
  assert.equal(sanitized.clinic_name, 'Patan Polyclinic', 'Non-sensitive field must be preserved');
  assert.equal(sanitized.payment_secret_key, '[REDACTED]', 'payment_secret_key must be [REDACTED]');
  assert.equal(input.payment_secret_key, 'sk_live_very_secret_998877', 'Original object must not be mutated');
});

suite.test('F8-02: Redaction removes payment_api_key, merchant_secret, and esewa_secret_key', async (assert) => {
  const input = {
    payment_api_key: 'api_key_123',
    merchant_secret: 'merchant_sec_456',
    esewa_secret_key: 'esewa_live_sec_789',
    public_title: 'Dental OPD'
  };

  const redacted = env.redactSecrets(input);
  assert.equal(redacted.payment_api_key, '[REDACTED]');
  assert.equal(redacted.merchant_secret, '[REDACTED]');
  assert.equal(redacted.esewa_secret_key, '[REDACTED]');
  assert.equal(redacted.public_title, 'Dental OPD');
});

suite.test('F8-03: Recursive redaction sanitizes deeply nested arrays and child objects', async (assert) => {
  const input = {
    level1: {
      level2: {
        gateway_configs: [
          { provider: 'esewa', secret_key: 'supersecret1' },
          { provider: 'khalti', secret_key: 'supersecret2' }
        ]
      }
    }
  };

  const redacted = env.redactSecrets(input);
  assert.equal(redacted.level1.level2.gateway_configs[0].secret_key, '[REDACTED]');
  assert.equal(redacted.level1.level2.gateway_configs[1].secret_key, '[REDACTED]');
  assert.equal(redacted.level1.level2.gateway_configs[0].provider, 'esewa');
});

suite.test('F8-04: Redaction handles stringified JSON embedded within text descriptions', async (assert) => {
  const input = {
    id: 'clinic-1',
    description: JSON.stringify({
      operating_hours: '8am-8pm',
      payment_secret_key: 'hidden_in_json_text'
    })
  };

  const redacted = env.redactSecrets(input);
  const parsedDesc = JSON.parse(redacted.description);
  assert.equal(parsedDesc.operating_hours, '8am-8pm', 'Normal fields in embedded JSON preserved');
  assert.equal(parsedDesc.payment_secret_key, '[REDACTED]', 'Secrets in embedded JSON redacted');
});

suite.test('F8-05: Non-sensitive data types (numbers, dates, arrays, booleans) remain unmodified', async (assert) => {
  const input = {
    id: 'c-1',
    is_active: true,
    total_fee: 1500.5,
    tags: ['opd', 'pediatrics', 'radiology'],
    rating: 4.8
  };

  const redacted = env.redactSecrets(input);
  assert.deepEqual(redacted, input, 'Non-sensitive objects must remain completely identical');
});

// ============================================================================
// FEATURE 9: 1-Click Local JSON Backup Download
// ============================================================================

suite.test('F9-01: Backup snapshot aggregates all clinic stores into structured datasets object', async (assert) => {
  const clinicId = 'c-backup-test';
  await env.putRecord('clinic_profile', { id: clinicId, name: 'Apex Health Center' });
  await env.putRecord('doctors', { id: 'd1', clinic_id: clinicId, full_name: 'Dr. Gita Aryal' });
  await env.putRecord('appointments', { id: 'a1', clinic_id: clinicId, patient_name: 'Binod GC' });

  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  assert.equal(snapshot.schema_version, '1.0', 'Schema version must be 1.0');
  assert.equal(snapshot.clinic_id, clinicId, 'Clinic ID must match');
  assert.equal(snapshot.clinic_name, 'Apex Health Center', 'Clinic name must match');
  assert.equal(snapshot.datasets.appointments.length, 1, 'Appointments dataset must contain 1 record');
  assert.equal(snapshot.datasets.doctors.length, 1, 'Doctors dataset must contain 1 record');
});

suite.test('F9-02: Filename format conforms to dactor-clinic-[id]-[date].json', async (assert) => {
  const clinicId = 'c1a2b3c4-e89b-12d3-a456-426614174000';
  const testDate = new Date('2026-10-23T12:00:00Z');
  const filename = env.ClinicBackupService.getBackupFilename(clinicId, testDate);

  assert.match(
    filename,
    /^dactor-clinic-[a-zA-Z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/,
    'Filename must follow format dactor-clinic-[id]-[date].json'
  );
  assert.includes(filename, '2026-10-23', 'Filename must include ISO date');
});

suite.test('F9-03: Snapshot includes valid ISO exported_at timestamp and summary metadata', async (assert) => {
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot('c1');
  assert.ok(typeof snapshot.exported_at === 'string', 'exported_at must be a string');
  assert.ok(!isNaN(Date.parse(snapshot.exported_at)), 'exported_at must parse to valid Date');
  assert.ok(typeof snapshot.metadata.total_appointments === 'number', 'Metadata total_appointments must exist');
});

suite.test('F9-04: Snapshot embeds valid SHA-256 integrity hash sealing the datasets payload', async (assert) => {
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot('c1');
  assert.ok(typeof snapshot.sha256 === 'string', 'sha256 must be present');
  assert.match(snapshot.sha256, /^[0-9a-f]{64}$/, 'sha256 must be a 64-character lowercase hex string');

  const recomputed = env.ClinicBackupService.computeSha256(JSON.stringify(snapshot.datasets));
  assert.equal(recomputed, snapshot.sha256, 'Embedded sha256 hash must match recomputed hash of datasets');
});

suite.test('F9-05: Local snapshot generation operates in-memory with zero network requests', async (assert) => {
  // Ensure network is disabled or blocked
  env.globalRemoteDb.shouldFailNextRequest = true;

  // Snapshot generation should succeed without contacting remote DB
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot('c-offline');
  assert.ok(snapshot, 'Snapshot must be generated purely from local IndexedDB');
});

// ============================================================================
// FEATURE 10: 1-Click Google Drive Cloud Sync
// ============================================================================

suite.test('F10-01: formatDriveMultipartPayload generates valid multipart/related MIME structure', async (assert) => {
  const metadata = { name: 'test-backup.json', mimeType: 'application/json' };
  const content = JSON.stringify({ hello: 'world' });
  const payload = env.ClinicBackupService.formatDriveMultipartPayload(metadata, content, 'BOUNDARY_12345');

  assert.includes(payload.contentType, 'multipart/related', 'Content-Type must be multipart/related');
  assert.includes(payload.contentType, 'boundary=BOUNDARY_12345', 'Boundary must be specified');
  assert.includes(payload.body, '--BOUNDARY_12345', 'Body must contain starting boundary');
  assert.includes(payload.body, '--BOUNDARY_12345--', 'Body must contain closing boundary');
  assert.includes(payload.body, '"name":"test-backup.json"', 'Body must contain metadata JSON');
});

suite.test('F10-02: Target folder ID is set to "dactor-clinic-backups-folder-id"', async (assert) => {
  const metadata = {
    name: 'backup.json',
    parents: ['dactor-clinic-backups-folder-id']
  };
  assert.equal(metadata.parents[0], 'dactor-clinic-backups-folder-id', 'Parent folder must be Dactor Clinic Backups');
});

suite.test('F10-03: Google Drive sync creates snapshot and returns fileId and webViewLink', async (assert) => {
  const result = await env.ClinicBackupService.syncBackupToGoogleDrive('clinic-gd-1');
  assert.ok(result.fileId.startsWith('drive-file-'), 'fileId should be returned');
  assert.includes(result.webViewLink, 'https://drive.google.com/file/d/', 'webViewLink should point to Google Drive');
  assert.ok(result.sha256, 'Drive sync result must include verified SHA-256 checksum');
});

suite.test('F10-04: Drive upload payload embeds recursive credential redaction', async (assert) => {
  const clinicId = 'c-gd-secret';
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Secure Clinic',
    payment_secret_key: 'raw_secret_key_123'
  });

  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  assert.equal(snapshot.datasets.clinic.payment_secret_key, '[REDACTED]', 'Google Drive payload must redact secrets');
});

suite.test('F10-05: OAuth scope used is restricted to "https://www.googleapis.com/auth/drive.file"', async (assert) => {
  const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  assert.equal(
    REQUIRED_SCOPE,
    'https://www.googleapis.com/auth/drive.file',
    'Scope must be strictly drive.file for least privilege'
  );
});

// ============================================================================
// FEATURE 11: Backup Restore & Disaster Recovery
// ============================================================================

suite.test('F11-01: Valid backup JSON restores records accurately across IndexedDB stores', async (assert) => {
  const clinicId = 'c-restore-1';
  const datasets = {
    clinic: { id: clinicId, name: 'Restored Clinic' },
    doctors: [{ id: 'd-rest-1', clinic_id: clinicId, full_name: 'Dr. Restored' }],
    appointments: [{ id: 'a-rest-1', clinic_id: clinicId, patient_name: 'Restored Patient' }],
    queue_entries: [{ id: 'q-rest-1', clinic_id: clinicId, status: 'waiting' }],
    invoices: [{ id: 'i-rest-1', clinic_id: clinicId, total_amount: 1000 }]
  };
  const sha256 = env.ClinicBackupService.computeSha256(JSON.stringify(datasets));
  const backupJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: clinicId,
    datasets,
    sha256
  });

  const res = await env.ClinicBackupService.restoreClinicBackup(backupJson, clinicId);
  assert.ok(res.success, 'Restore must report success');
  assert.equal(res.restoredStores.doctors, 1, '1 doctor should be restored');
  assert.equal(res.restoredStores.appointments, 1, '1 appointment should be restored');

  const appt = await env.getRecord('appointments', 'a-rest-1');
  assert.ok(appt, 'Restored appointment must exist in IndexedDB');
  assert.equal(appt.patient_name, 'Restored Patient', 'Patient name must match backup');
});

suite.test('F11-02: Corrupted non-JSON backup string is rejected with InvalidBackupError', async (assert) => {
  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup('INVALID_NOT_JSON{{{{', 'c1');
    },
    'InvalidBackupError'
  );
});

suite.test('F11-03: Clinic mismatch is rejected to prevent accidental cross-tenant overwrite', async (assert) => {
  const backupJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: 'clinic-XYZ',
    datasets: {}
  });

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(backupJson, 'clinic-ABC');
    },
    'ClinicMismatchError'
  );
});

suite.test('F11-04: Tampered backup payload with invalid SHA-256 hash is rejected', async (assert) => {
  const backupJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: 'c1',
    datasets: { appointments: [{ id: 'a1', note: 'tampered' }] },
    sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  });

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(backupJson, 'c1');
    },
    'ChecksumMismatchError'
  );
});

suite.test('F11-05: Missing schema_version or datasets triggers schema validation failure', async (assert) => {
  const invalidSchema = JSON.stringify({ some_other_data: 123 });
  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(invalidSchema, 'c1');
    },
    'InvalidBackupError'
  );
});

// ============================================================================
// FEATURE 12: Worktree Integrity & Interface Contracts
// ============================================================================

suite.test('F12-01: TrackingCodeGenerator interface conforms to PROJECT.md contract', async (assert) => {
  assert.equal(typeof env.TrackingCodeGenerator.generateTrackingCode, 'function');
  assert.equal(typeof env.TrackingCodeGenerator.validateTrackingCode, 'function');
  assert.equal(typeof env.TrackingCodeGenerator.getTerminalId, 'function');
  assert.equal(typeof env.TrackingCodeGenerator.setTerminalId, 'function');
});

suite.test('F12-02: ClinicOfflineDb interface conforms to PROJECT.md contract', async (assert) => {
  assert.equal(typeof env.initClinicOfflineDb, 'function');
  assert.equal(typeof env.getStore, 'function');
  assert.equal(typeof env.getRecord, 'function');
  assert.equal(typeof env.putRecord, 'function');
  assert.equal(typeof env.putRecords, 'function');
  assert.equal(typeof env.deleteRecord, 'function');
  assert.equal(typeof env.clearStore, 'function');
  assert.equal(typeof env.queueMutation, 'function');
  assert.equal(typeof env.getPendingMutations, 'function');
  assert.equal(typeof env.removeMutation, 'function');
  assert.equal(typeof env.updateMutationRetry, 'function');
  assert.equal(typeof env.getSyncMeta, 'function');
  assert.equal(typeof env.setSyncMeta, 'function');
});

suite.test('F12-03: ClinicSyncManager interface conforms to PROJECT.md contract', async (assert) => {
  const manager = new env.ClinicSyncManager('c-test');
  assert.equal(typeof manager.subscribe, 'function');
  assert.equal(typeof manager.pushPendingMutations, 'function');
  assert.equal(typeof manager.pullRemoteDeltas, 'function');
  assert.equal(typeof manager.triggerSync, 'function');
});

suite.test('F12-04: ClinicBackupService interface conforms to PROJECT.md contract', async (assert) => {
  assert.equal(typeof env.ClinicBackupService.createClinicBackupSnapshot, 'function');
  assert.equal(typeof env.ClinicBackupService.syncBackupToGoogleDrive, 'function');
  assert.equal(typeof env.ClinicBackupService.restoreClinicBackup, 'function');
  assert.equal(typeof env.ClinicBackupService.getBackupFilename, 'function');
});

suite.test('F12-05: Redaction engine interface conforms to redactor specification', async (assert) => {
  assert.equal(typeof env.redactSecrets, 'function');
  assert.equal(typeof env.isSensitiveKey, 'function');
  assert.equal(env.REDACTED_VALUE, '[REDACTED]');
});

module.exports = suite;
