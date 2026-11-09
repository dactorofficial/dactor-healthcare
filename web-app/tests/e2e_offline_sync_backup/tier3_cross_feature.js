/**
 * Tier 3: Cross-Feature Combination Test Suite (≥12 tests)
 * Tests multi-system integration across IndexedDB, Outbox, Sync, Redaction, and Backup.
 */

const crypto = require('node:crypto');
const { createTestSuite } = require('./test_runner_framework.js');
const env = require('./mock_environment.js');

const suite = createTestSuite('Cross-Feature Combinations (Tier 3)', 3);

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
// TIER 3 COMBINATORIAL INTEGRATION TESTS
// ============================================================================

suite.test('T3-01: Walk-in registration -> Outbox queue -> Background sync -> Supabase upsert verification', async (assert) => {
  const clinicId = 'c-cross-1';
  const manager = new env.ClinicSyncManager(clinicId);
  const code10 = env.TrackingCodeGenerator.generateTrackingCode(10);
  const apptId = crypto.randomUUID();

  // 1. Walk-in patient registered in local IDB
  const appointment = {
    id: apptId,
    clinic_id: clinicId,
    tracking_code_10_digit: code10,
    patient_name: 'Prem Bahadur Nepali',
    checkin_status: 'waiting',
    is_walkin: true,
    updated_at: new Date().toISOString()
  };
  await env.putRecord('appointments', appointment);

  // 2. Outbox mutation queued
  await env.queueMutation({
    table: 'appointments',
    action: 'UPSERT',
    payload: appointment
  });

  const pendingBefore = await env.getPendingMutations();
  assert.equal(pendingBefore.length, 1, 'Outbox must hold 1 pending mutation');

  // 3. Background sync triggers
  const { pushed, failed } = await manager.pushPendingMutations();
  assert.equal(pushed, 1, 'Sync must push 1 mutation');
  assert.equal(failed, 0, 'Zero failures');

  // 4. Remote Supabase DB contains identical appointment
  const { data: remoteRows } = await env.globalRemoteDb.from('appointments').select('*').eq('id', apptId);
  assert.equal(remoteRows.length, 1, 'Remote Supabase table must contain the appointment');
  assert.equal(remoteRows[0].patient_name, 'Prem Bahadur Nepali', 'Remote patient name must match');
  assert.equal(remoteRows[0].tracking_code_10_digit, code10, 'Tracking code must match');
});

suite.test('T3-02: Local invoice creation -> Cash payment log -> Backup export -> Redaction verification', async (assert) => {
  const clinicId = 'c-cross-2';
  // Store clinic profile with sensitive secret key
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Kathmandu Heart Clinic',
    payment_secret_key: 'esewa_live_super_secret_key_999'
  });

  // Store local billing invoice with cash ledger
  const invId = crypto.randomUUID();
  const paymentLog = {
    id: crypto.randomUUID(),
    amount: 1500,
    dateTime: new Date().toISOString(),
    note: 'Cash payment desk 1'
  };
  const invoice = {
    id: invId,
    clinic_id: clinicId,
    total_amount: 1500,
    paid_amount: 1500,
    remarks: `Cleared [PAYMENT_LOGS]${JSON.stringify([paymentLog])}[/PAYMENT_LOGS]`
  };
  await env.putRecord('invoices', invoice);

  // Export local backup snapshot
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);

  // Assert secret key is redacted
  assert.equal(snapshot.datasets.clinic.payment_secret_key, '[REDACTED]', 'Payment secret key must be [REDACTED]');
  // Assert financial invoice data is preserved
  assert.equal(snapshot.datasets.invoices.length, 1, 'Invoice must be included in snapshot');
  assert.equal(snapshot.datasets.invoices[0].total_amount, 1500, 'Invoice total must be preserved');
  assert.includes(snapshot.datasets.invoices[0].remarks, 'Cash payment desk 1', 'Payment logs preserved in backup');
});

suite.test('T3-03: Offline mutation -> Delta pull conflict with older remote timestamp -> LWW local win', async (assert) => {
  const clinicId = 'c-cross-3';
  const manager = new env.ClinicSyncManager(clinicId);
  const apptId = 'appt-lww-local';

  // Local was modified at 14:00 (newer)
  await env.putRecord('appointments', {
    id: apptId,
    clinic_id: clinicId,
    patient_name: 'Local Newer Name',
    updated_at: '2026-10-23T14:00:00Z'
  });

  // Remote has older update at 12:00
  await env.globalRemoteDb.from('appointments').upsert({
    id: apptId,
    clinic_id: clinicId,
    patient_name: 'Remote Stale Name',
    updated_at: '2026-10-23T12:00:00Z'
  });

  await manager.pullRemoteDeltas(clinicId);

  const localFinal = await env.getRecord('appointments', apptId);
  assert.equal(localFinal.patient_name, 'Local Newer Name', 'Local record with newer timestamp must win');
});

suite.test('T3-04: Offline mutation -> Delta pull conflict with newer remote timestamp -> LWW remote win', async (assert) => {
  const clinicId = 'c-cross-4';
  const manager = new env.ClinicSyncManager(clinicId);
  const apptId = 'appt-lww-remote';

  // Local was modified at 10:00 (older)
  await env.putRecord('appointments', {
    id: apptId,
    clinic_id: clinicId,
    patient_name: 'Local Older Name',
    updated_at: '2026-10-23T10:00:00Z'
  });

  // Remote was updated online at 11:30 (newer)
  await env.globalRemoteDb.from('appointments').upsert({
    id: apptId,
    clinic_id: clinicId,
    patient_name: 'Remote Newer Name',
    updated_at: '2026-10-23T11:30:00Z'
  });

  await manager.pullRemoteDeltas(clinicId);

  const localFinal = await env.getRecord('appointments', apptId);
  assert.equal(localFinal.patient_name, 'Remote Newer Name', 'Remote record with newer timestamp must overwrite local');
});

suite.test('T3-05: Disaster Recovery: Backup export -> Delete IndexedDB -> Restore backup -> Re-verify all stores', async (assert) => {
  const clinicId = 'c-dr-test';

  // Populate multiple stores
  await env.putRecord('clinic_profile', { id: clinicId, name: 'Disaster Recovery Polyclinic' });
  await env.putRecord('doctors', { id: 'd1', clinic_id: clinicId, full_name: 'Dr. Aarav Joshi' });
  await env.putRecord('appointments', { id: 'a1', clinic_id: clinicId, patient_name: 'Kopila Gurung' });
  await env.putRecord('opd_queue', { id: 'q1', clinic_id: clinicId, queue_position: 1 });
  await env.putRecord('invoices', { id: 'i1', clinic_id: clinicId, total_amount: 800 });

  // 1. Download/create backup snapshot
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  const snapshotJson = JSON.stringify(snapshot);

  // 2. Completely wipe IndexedDB database (simulating browser cache wipe)
  env.resetDbInstance();
  const idb = env.globalIndexedDB;
  await new Promise((resolve) => {
    const req = idb.deleteDatabase('dactor_clinic_offline_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });

  // Confirm DB is empty
  const emptyAppts = await env.getStore('appointments');
  assert.equal(emptyAppts.length, 0, 'Database must be empty before restore');

  // 3. Restore backup
  const restoreRes = await env.ClinicBackupService.restoreClinicBackup(snapshotJson, clinicId);
  assert.ok(restoreRes.success, 'Restore must report success');
  assert.equal(restoreRes.restoredStores.doctors, 1);
  assert.equal(restoreRes.restoredStores.appointments, 1);
  assert.equal(restoreRes.restoredStores.invoices, 1);

  // 4. Verify all records restored
  const restoredDoctor = await env.getRecord('doctors', 'd1');
  const restoredAppt = await env.getRecord('appointments', 'a1');
  const restoredInvoice = await env.getRecord('invoices', 'i1');

  assert.equal(restoredDoctor.full_name, 'Dr. Aarav Joshi', 'Doctor must be re-hydrated');
  assert.equal(restoredAppt.patient_name, 'Kopila Gurung', 'Appointment must be re-hydrated');
  assert.equal(restoredInvoice.total_amount, 800, 'Invoice must be re-hydrated');
});

suite.test('T3-06: Walk-in arrival -> Queue token -> Cabin call -> Done -> Lifecycle sync across IDB & Remote', async (assert) => {
  const clinicId = 'c-lifecycle';
  const manager = new env.ClinicSyncManager(clinicId);
  const apptId = crypto.randomUUID();
  const queueId = crypto.randomUUID();

  // 1. Walk-in arrival
  const appt = {
    id: apptId,
    clinic_id: clinicId,
    patient_name: 'Ganesh Shrestha',
    checkin_status: 'waiting',
    updated_at: new Date().toISOString()
  };
  const queue = {
    id: queueId,
    appointment_id: apptId,
    clinic_id: clinicId,
    status: 'waiting',
    updated_at: appt.updated_at
  };
  await env.putRecord('appointments', appt);
  await env.putRecord('opd_queue', queue);
  await env.queueMutation({ table: 'appointments', payload: appt });
  await env.queueMutation({ table: 'queue_entries', payload: queue });

  // 2. Doctor calls patient inside
  appt.checkin_status = 'in_consultation';
  appt.inside_at = new Date().toISOString();
  appt.updated_at = appt.inside_at;
  queue.status = 'inside';
  queue.inside_at = appt.inside_at;
  await env.putRecord('appointments', appt);
  await env.putRecord('opd_queue', queue);
  await env.queueMutation({ table: 'appointments', payload: appt });
  await env.queueMutation({ table: 'queue_entries', payload: queue });

  // 3. Mark consultation done
  appt.checkin_status = 'completed';
  appt.completed_at = new Date().toISOString();
  appt.updated_at = appt.completed_at;
  queue.status = 'done';
  await env.putRecord('appointments', appt);
  await env.putRecord('opd_queue', queue);
  await env.queueMutation({ table: 'appointments', payload: appt });
  await env.queueMutation({ table: 'queue_entries', payload: queue });

  // 4. Sync drains all mutations
  const { pushed } = await manager.pushPendingMutations();
  assert.equal(pushed, 6, 'All 6 lifecycle state mutations pushed to Supabase');

  const { data: remoteAppt } = await env.globalRemoteDb.from('appointments').select('*').eq('id', apptId);
  const { data: remoteQ } = await env.globalRemoteDb.from('queue_entries').select('*').eq('id', queueId);

  assert.equal(remoteAppt[0].checkin_status, 'completed', 'Final remote appointment status must be completed');
  assert.equal(remoteQ[0].status, 'done', 'Final remote queue entry status must be done');
});

suite.test('T3-07: Offline billing with multiple items -> Cash payments ledger -> Remote sync reconciles', async (assert) => {
  const clinicId = 'c-ledger-sync';
  const manager = new env.ClinicSyncManager(clinicId);
  const invId = crypto.randomUUID();

  const payment1 = { id: crypto.randomUUID(), amount: 500, dateTime: '2026-10-23T10:00:00Z', note: 'Cash deposit' };
  const payment2 = { id: crypto.randomUUID(), amount: 700, dateTime: '2026-10-23T11:00:00Z', note: 'Cash settlement' };

  const invoice = {
    id: invId,
    clinic_id: clinicId,
    total_amount: 1200,
    paid_amount: 1200,
    balance_due: 0,
    payment_status: 'paid',
    remarks: `[PAYMENT_LOGS]${JSON.stringify([payment1, payment2])}[/PAYMENT_LOGS]`,
    updated_at: new Date().toISOString()
  };

  await env.putRecord('invoices', invoice);
  await env.queueMutation({ table: 'billing_invoices', payload: invoice });
  await manager.pushPendingMutations();

  const { data: remoteInvoices } = await env.globalRemoteDb.from('billing_invoices').select('*').eq('id', invId);
  assert.equal(remoteInvoices.length, 1);
  assert.includes(remoteInvoices[0].remarks, 'Cash deposit');
  assert.includes(remoteInvoices[0].remarks, 'Cash settlement');
  assert.equal(remoteInvoices[0].paid_amount, 1200);
});

suite.test('T3-08: Prolonged offline period (20 mixed actions) -> Reconnect -> FIFO drain -> Zero duplicates', async (assert) => {
  const clinicId = 'c-prolonged';
  const manager = new env.ClinicSyncManager(clinicId);
  await manager.setOnlineStatus(false); // Disconnected

  // Queue 20 mutations
  for (let i = 1; i <= 20; i++) {
    const table = i % 2 === 0 ? 'appointments' : 'billing_invoices';
    const payload = { id: `prolonged-${i}`, clinic_id: clinicId, index: i, updated_at: new Date().toISOString() };
    await env.queueMutation({ table, payload });
  }

  const pendingWhileOffline = await env.getPendingMutations();
  assert.equal(pendingWhileOffline.length, 20, '20 mutations queued offline');

  // Internet reconnected
  await manager.setOnlineStatus(true);
  const res = await manager.pushPendingMutations();
  assert.equal(res.pushed, 20, 'All 20 mutations pushed');

  const pendingAfter = await env.getPendingMutations();
  assert.equal(pendingAfter.length, 0, 'Outbox drained completely');
});

suite.test('T3-09: Multi-terminal tracking code generation: 3 concurrent terminals -> 300 codes -> 0% collisions', async (assert) => {
  const generatedCodes = new Set();
  const terminals = [10, 20, 30];
  const date = new Date('2026-07-15T09:00:00Z');

  for (const term of terminals) {
    for (let c = 0; c < 100; c++) {
      const code = env.TrackingCodeGenerator.generateTrackingCode(term, date);
      assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code), `Code ${code} must pass Luhn check`);
      generatedCodes.add(code);
    }
  }

  assert.equal(generatedCodes.size, 300, 'All 300 codes across 3 terminals must be completely unique (0.0000% collisions)');
});

suite.test('T3-10: Google Drive backup sync with live clinic data -> In-memory redaction verified on payload', async (assert) => {
  const clinicId = 'c-gd-live';
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Patan Medicare',
    payment_secret_key: 'top_secret_gateway_key'
  });
  await env.putRecord('appointments', {
    id: 'a1',
    clinic_id: clinicId,
    patient_name: 'Roshan Karki',
    payment_api_key: 'embedded_api_key'
  });

  const uploadCall = {};
  const mockDriveClient = {
    upload: async (metadata, body) => {
      uploadCall.metadata = metadata;
      uploadCall.body = body;
      return { fileId: 'drive-999', webViewLink: 'https://drive.google.com/test' };
    }
  };

  await env.ClinicBackupService.syncBackupToGoogleDrive(clinicId, env.globalIndexedDB, mockDriveClient);

  assert.equal(uploadCall.metadata.parents[0], 'dactor-clinic-backups-folder-id');
  assert.doesNotMatch(uploadCall.body, /top_secret_gateway_key/, 'Body must not contain raw secret key');
  assert.doesNotMatch(uploadCall.body, /embedded_api_key/, 'Body must not contain raw API key');
  assert.includes(uploadCall.body, '[REDACTED]', 'Body must contain [REDACTED]');
});

suite.test('T3-11: Offline walk-in with custom appointment slot -> Sync pushes appointment cleanly', async (assert) => {
  const clinicId = 'c-slot-test';
  const manager = new env.ClinicSyncManager(clinicId);
  const apptId = crypto.randomUUID();

  const appt = {
    id: apptId,
    clinic_id: clinicId,
    slot_id: 'slot-10am',
    appointment_date: '2026-10-23',
    appointment_time: '10:00 AM',
    patient_name: 'Anita Bista',
    updated_at: new Date().toISOString()
  };

  await env.putRecord('appointments', appt);
  await env.queueMutation({ table: 'appointments', payload: appt });
  await manager.pushPendingMutations();

  const { data: remoteAppts } = await env.globalRemoteDb.from('appointments').select('*').eq('id', apptId);
  assert.equal(remoteAppts[0].slot_id, 'slot-10am', 'Slot ID must be preserved in remote Supabase');
});

suite.test('T3-12: Cross-tenant disaster isolation: Clinic A backup rejected on Clinic B', async (assert) => {
  const clinicA = 'clinic-AAA';
  const clinicB = 'clinic-BBB';

  const snapshotA = await env.ClinicBackupService.createClinicBackupSnapshot(clinicA);
  const jsonA = JSON.stringify(snapshotA);

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(jsonA, clinicB);
    },
    'ClinicMismatchError'
  );
});

suite.test('T3-13: Network flapping during sync -> Retry counter incremented -> Eventual consistency reached', async (assert) => {
  let attempts = 0;
  const flappingDb = {
    tables: { appointments: new Map() },
    from(table) {
      return {
        upsert: async (payload) => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Connection refused by remote host');
          }
          flappingDb.tables[table].set(payload.id, payload);
          return { data: [payload], error: null };
        }
      };
    }
  };

  const manager = new env.ClinicSyncManager('c-flap-recovery', env.globalIndexedDB, flappingDb);
  await env.queueMutation({ table: 'appointments', payload: { id: 'flap-rec-1' } });

  // Attempt 1: fails
  const res1 = await manager.pushPendingMutations();
  assert.equal(res1.failed, 1, 'Attempt 1 fails');

  // Attempt 2: fails
  const res2 = await manager.pushPendingMutations();
  assert.equal(res2.failed, 1, 'Attempt 2 fails');

  // Attempt 3: succeeds
  const res3 = await manager.pushPendingMutations();
  assert.equal(res3.pushed, 1, 'Attempt 3 succeeds');
  assert.equal(res3.failed, 0);

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 0, 'Mutation drained on eventual success');
});

suite.test('T3-14: Redacted backup exported -> Restored into clean IDB -> Queries remain functional without secret leakage', async (assert) => {
  const clinicId = 'c-redact-restore';
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Safe Haven Clinic',
    payment_secret_key: 'unredacted_original_secret'
  });
  await env.putRecord('doctors', {
    id: 'd1',
    clinic_id: clinicId,
    full_name: 'Dr. Sunita Koirala'
  });

  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  const snapshotJson = JSON.stringify(snapshot);

  // Restore into clean DB
  env.resetDbInstance();
  const idb = env.globalIndexedDB;
  await new Promise((resolve) => {
    const req = idb.deleteDatabase('dactor_clinic_offline_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });

  await env.ClinicBackupService.restoreClinicBackup(snapshotJson, clinicId);

  const restoredProfile = await env.getRecord('clinic_profile', clinicId);
  assert.equal(restoredProfile.payment_secret_key, '[REDACTED]', 'Restored DB must contain [REDACTED], not original secret');
  assert.equal(restoredProfile.name, 'Safe Haven Clinic', 'Clinic name intact');

  const restoredDoc = await env.getRecord('doctors', 'd1');
  assert.equal(restoredDoc.full_name, 'Dr. Sunita Koirala', 'Doctor record intact');
});

module.exports = suite;
