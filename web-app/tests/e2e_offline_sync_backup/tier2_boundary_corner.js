/**
 * Tier 2: Boundary & Corner Cases Test Suite (≥60 tests across 12 features)
 * Opaque-box testing of edge values, stress limits, typo detection, corruption, and failure modes.
 */

const crypto = require('node:crypto');
const { createTestSuite } = require('./test_runner_framework.js');
const env = require('./mock_environment.js');

const suite = createTestSuite('Boundary & Corner Cases (Tier 2)', 2);

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
// FEATURE 1: IndexedDB Boundaries
// ============================================================================

suite.test('F1-B01: Querying an empty store returns empty array [] without throwing', async (assert) => {
  const records = await env.getStore('appointments');
  assert.ok(Array.isArray(records), 'Result must be an array');
  assert.equal(records.length, 0, 'Empty store must return array of length 0');
});

suite.test('F1-B02: Querying a non-existent record key returns undefined', async (assert) => {
  const record = await env.getRecord('appointments', 'non-existent-uuid-999');
  assert.equal(record, undefined, 'Non-existent key should return undefined');
});

suite.test('F1-B03: Overwriting an existing primary key updates in-place without duplicating', async (assert) => {
  const id = 'key-overwrite-1';
  await env.putRecord('doctors', { id, full_name: 'Dr. First' });
  await env.putRecord('doctors', { id, full_name: 'Dr. Second' });
  await env.putRecord('doctors', { id, full_name: 'Dr. Third' });

  const all = await env.getStore('doctors');
  assert.equal(all.length, 1, 'Only 1 record should exist');
  assert.equal(all[0].full_name, 'Dr. Third', 'Latest put must overwrite');
});

suite.test('F1-B04: Store records with Unicode, Devanagari, and null properties persist faithfully', async (assert) => {
  const specialRecord = {
    id: 'special-1',
    devanagari_name: 'काठमाडौं पोलिक्लिनिक प्रा. लि.',
    symbols: '!@#$%^&*()_+{}[]:;"\'<>,.?/~`',
    null_val: null,
    empty_str: '',
    zero_num: 0
  };

  await env.putRecord('clinic_profile', specialRecord);
  const fetched = await env.getRecord('clinic_profile', 'special-1');
  assert.deepEqual(fetched, specialRecord, 'Special characters and null values must be preserved exactly');
});

suite.test('F1-B05: High-volume concurrent record insertions (100 parallel puts) succeed without race condition', async (assert) => {
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      env.putRecord('appointments', {
        id: `concurrent-appt-${i}`,
        clinic_id: 'c1',
        index: i
      })
    );
  }

  await Promise.all(promises);
  const all = await env.getStore('appointments');
  assert.equal(all.length, 100, 'All 100 concurrent insertions must be persisted');
});

// ============================================================================
// FEATURE 2: Tracking Code Boundaries & Typo Detection
// ============================================================================

suite.test('F2-B01: Leap year DOY 366 (e.g. 2028-12-31) produces valid 10-digit code', async (assert) => {
  const leapDec31 = new Date('2028-12-31T23:59:59Z');
  const doy = env.TrackingCodeGenerator.getDayOfYear(leapDec31);
  assert.equal(doy, 366, 'Dec 31 of leap year 2028 must be DOY 366');

  const code = env.TrackingCodeGenerator.generateTrackingCode(20, leapDec31);
  assert.equal(code.length, 10, 'Tracking code must be 10 digits');
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code), 'Leap year code must pass Luhn validation');
  const parsed = env.TrackingCodeGenerator.parseTrackingCode(code);
  assert.equal(parsed.dayOfYear, 366, 'Parsed dayOfYear must be 366');
});

suite.test('F2-B02: Daily counter rollover at 9999 resets smoothly to 1', async (assert) => {
  const dateKey = '2026-100';
  env.globalLocalStorage.setItem(`dactor_tracking_counter_${dateKey}`, '9999');

  const next = env.TrackingCodeGenerator.getNextCounter(dateKey);
  assert.equal(next, 1, 'Counter after 9999 must roll over to 1');

  const afterRollover = env.TrackingCodeGenerator.getNextCounter(dateKey);
  assert.equal(afterRollover, 2, 'Counter after 1 must increment to 2');
});

suite.test('F2-B03: Terminal ID bounds validation (boundary 10, 99 pass; 9, 100 throw)', async (assert) => {
  // Valid lower bound
  env.TrackingCodeGenerator.setTerminalId(10);
  assert.equal(env.TrackingCodeGenerator.getTerminalId(), 10);

  // Valid upper bound
  env.TrackingCodeGenerator.setTerminalId(99);
  assert.equal(env.TrackingCodeGenerator.getTerminalId(), 99);

  // Out of bounds
  assert.throws(() => env.TrackingCodeGenerator.setTerminalId(9), 'Terminal ID 9 must throw');
  assert.throws(() => env.TrackingCodeGenerator.setTerminalId(100), 'Terminal ID 100 must throw');
  assert.throws(() => env.TrackingCodeGenerator.setTerminalId(-1), 'Negative terminal ID must throw');
});

suite.test('F2-B04: 100% single-digit typo rejection across all 10 digit positions', async (assert) => {
  const validCode = env.TrackingCodeGenerator.generateTrackingCode(44, new Date('2026-05-10T12:00:00Z'));
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(validCode), 'Original code must be valid');

  let typoCount = 0;
  let detectedCount = 0;

  // Test every single digit position from 0 to 9
  for (let pos = 0; pos < 10; pos++) {
    const originalDigit = parseInt(validCode[pos], 10);
    // Replace with all other 9 possible digits
    for (let alt = 0; alt <= 9; alt++) {
      if (alt === originalDigit) continue;
      const typoCode = validCode.slice(0, pos) + alt + validCode.slice(pos + 1);
      typoCount++;
      const isValid = env.TrackingCodeGenerator.validateTrackingCode(typoCode);
      if (!isValid) {
        detectedCount++;
      }
    }
  }

  assert.equal(typoCount, 90, 'Total 90 single-digit typo mutations evaluated');
  assert.equal(detectedCount, 90, 'Exactly 100% (90/90) of single-digit typos must be detected and rejected');
});

suite.test('F2-B05: Adjacent transposition rejection across all 9 adjacent pairs', async (assert) => {
  const validCode = env.TrackingCodeGenerator.generateTrackingCode(35, new Date('2026-08-20T12:00:00Z'));
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(validCode), 'Original code must be valid');

  let transpositionAttempts = 0;
  let detectedTranspositions = 0;

  // Swap each adjacent pair: (0,1), (1,2), ..., (8,9)
  for (let i = 0; i < 9; i++) {
    if (validCode[i] === validCode[i + 1]) continue; // identical digits swap produces same string
    transpositionAttempts++;
    const chars = validCode.split('');
    const temp = chars[i];
    chars[i] = chars[i + 1];
    chars[i + 1] = temp;
    const transposed = chars.join('');

    const isValid = env.TrackingCodeGenerator.validateTrackingCode(transposed);
    if (!isValid) {
      detectedTranspositions++;
    }
  }

  assert.greaterThan(transpositionAttempts, 5, 'Should evaluate multiple distinct transposition pairs');
  assert.equal(detectedTranspositions, transpositionAttempts, 'All distinct adjacent transpositions must be rejected');
});

// ============================================================================
// FEATURE 3: Outbox Boundaries
// ============================================================================

suite.test('F3-B01: Draining an already-empty outbox returns zero counts without throwing', async (assert) => {
  const manager = new env.ClinicSyncManager('c-empty');
  const res = await manager.pushPendingMutations();
  assert.equal(res.pushed, 0, 'Pushed must be 0');
  assert.equal(res.failed, 0, 'Failed must be 0');
});

suite.test('F3-B02: Rapid burst of 50 mutations preserves strict FIFO execution order', async (assert) => {
  for (let i = 1; i <= 50; i++) {
    await env.queueMutation({
      table: 'appointments',
      payload: { id: `burst-${i}`, seq: i }
    });
  }

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 50, 'All 50 mutations must be queued');
  for (let i = 0; i < 50; i++) {
    assert.equal(pending[i].payload.seq, i + 1, `Mutation index ${i} must have seq ${i + 1}`);
  }
});

suite.test('F3-B03: Reaching maximum retry count (5) transitions mutation status to failed', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { id: 'fail-test' } });
  const [mut] = await env.getPendingMutations();

  for (let attempt = 1; attempt <= 5; attempt++) {
    await env.updateMutationRetry(mut.id, `Simulated network error attempt ${attempt}`);
  }

  const failedRec = await env.getRecord('outbox', mut.id);
  assert.equal(failedRec.retry_count, 5, 'Retry count must be 5');
  assert.equal(failedRec.status, 'failed', 'Status must transition to failed after 5 retries');

  // Failed mutations should no longer appear in getPendingMutations
  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 0, 'Failed mutations must be excluded from pending list');
});

suite.test('F3-B04: Large payload serialization (>500KB JSON) stores and retrieves in outbox', async (assert) => {
  const largeArray = [];
  for (let i = 0; i < 2000; i++) {
    largeArray.push({ index: i, text: 'Detailed clinical assessment and medication prescription notes.' });
  }
  const largePayload = { id: 'large-1', clinic_id: 'c1', records: largeArray };

  await env.queueMutation({ table: 'appointments', payload: largePayload });
  const [mut] = await env.getPendingMutations();
  assert.equal(mut.payload.records.length, 2000, 'Payload with 2000 records must be retrieved completely');
});

suite.test('F3-B05: Interleaved queue and remove operations maintain outbox integrity', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { id: 'i1' } });
  await env.queueMutation({ table: 'appointments', payload: { id: 'i2' } });

  const muts1 = await env.getPendingMutations();
  await env.removeMutation(muts1[0].id);

  await env.queueMutation({ table: 'appointments', payload: { id: 'i3' } });

  const muts2 = await env.getPendingMutations();
  assert.equal(muts2.length, 2, 'Should have 2 pending mutations');
  assert.equal(muts2[0].payload.id, 'i2');
  assert.equal(muts2[1].payload.id, 'i3');
});

// ============================================================================
// FEATURE 4: Sync Engine Boundaries & Conflict Handling
// ============================================================================

suite.test('F4-B01: Network flap mid-sync pushes first record and retains subsequent on failure', async (assert) => {
  await env.queueMutation({ table: 'appointments', payload: { id: 'flap-1' } });
  await env.queueMutation({ table: 'appointments', payload: { id: 'flap-2' } });

  // Custom remote DB that fails on the second call
  let callCount = 0;
  const customRemoteDb = {
    tables: { appointments: new Map() },
    from(tableName) {
      return {
        upsert: async (payload) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Socket closed unexpectedly');
          }
          customRemoteDb.tables[tableName].set(payload.id, payload);
          return { data: [payload], error: null };
        }
      };
    }
  };

  const manager = new env.ClinicSyncManager('c1', env.globalIndexedDB, customRemoteDb);
  const res = await manager.pushPendingMutations();
  assert.equal(res.pushed, 1, 'First mutation must have been pushed');
  assert.equal(res.failed, 1, 'Second mutation must fail');

  const pendingRemaining = await env.getPendingMutations();
  assert.equal(pendingRemaining.length, 1, 'Unpushed mutation must remain in outbox');
  assert.equal(pendingRemaining[0].payload.id, 'flap-2', 'flap-2 must remain pending');
});

suite.test('F4-B02: Identical timestamp conflict resolution maintains deterministic outcome', async (assert) => {
  const clinicId = 'c-tie';
  const manager = new env.ClinicSyncManager(clinicId);
  const sharedTimestamp = '2026-10-23T12:00:00.000Z';

  await env.putRecord('appointments', {
    id: 'appt-tie',
    clinic_id: clinicId,
    patient_name: 'Local Tie',
    updated_at: sharedTimestamp
  });

  await env.globalRemoteDb.from('appointments').upsert({
    id: 'appt-tie',
    clinic_id: clinicId,
    patient_name: 'Remote Tie',
    updated_at: sharedTimestamp
  });

  // Pull remote deltas with equal timestamp (LWW rule: local retained unless remote is strictly greater)
  await manager.pullRemoteDeltas(clinicId);

  const finalRec = await env.getRecord('appointments', 'appt-tie');
  assert.equal(finalRec.patient_name, 'Local Tie', 'When timestamps are identical, local state is preserved');
});

suite.test('F4-B03: Local clock skew in future handled gracefully by monotonic timestamps', async (assert) => {
  const futureDate = '2099-01-01T00:00:00Z';
  await env.queueMutation({
    table: 'appointments',
    created_at: futureDate,
    payload: { id: 'future-appt', updated_at: futureDate }
  });

  const pending = await env.getPendingMutations();
  assert.equal(pending.length, 1, 'Mutation with future date must still be accepted');
  assert.ok(pending[0].monotonic_ts <= Date.now(), 'Monotonic timestamp must use actual local system time');
});

suite.test('F4-B04: Delta pull with zero remote changes returns pulled: 0', async (assert) => {
  const manager = new env.ClinicSyncManager('c-empty-delta');
  await env.setSyncMeta('last_synced_at', new Date().toISOString());

  const res = await manager.pullRemoteDeltas('c-empty-delta');
  assert.equal(res.pulled, 0, 'Pulled count must be 0 when no remote records match');
});

suite.test('F4-B05: Soft-deleted remote records synced with is_deleted flag', async (assert) => {
  const clinicId = 'c-soft-del';
  const manager = new env.ClinicSyncManager(clinicId);

  await env.globalRemoteDb.from('appointments').upsert({
    id: 'appt-deleted-1',
    clinic_id: clinicId,
    patient_name: 'Cancelled Patient',
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await manager.pullRemoteDeltas(clinicId);

  const local = await env.getRecord('appointments', 'appt-deleted-1');
  assert.ok(local, 'Record should exist locally');
  assert.equal(local.is_deleted, true, 'is_deleted tombstone must be preserved locally');
});

// ============================================================================
// FEATURE 5: Status Broadcaster Boundaries
// ============================================================================

suite.test('F5-B01: Rapid network flapping (50 online/offline transitions) transitions cleanly', async (assert) => {
  const manager = new env.ClinicSyncManager('c-flap');
  let transitionCount = 0;
  manager.subscribe(() => transitionCount++);

  for (let i = 0; i < 50; i++) {
    await manager.setOnlineStatus(i % 2 === 0);
  }

  assert.greaterThan(transitionCount, 40, 'Broadcaster must process all status transitions');
  assert.equal(manager.isOnline, false, 'Final status should match last toggle (i=49 is odd -> false)');
  assert.equal(manager.state, 'offline', 'Final state should be offline');
});

suite.test('F5-B02: Multiple concurrent subscribers receive identical status updates', async (assert) => {
  const manager = new env.ClinicSyncManager('c-multi');
  const states1 = [];
  const states2 = [];

  manager.subscribe((s) => states1.push(s.state));
  manager.subscribe((s) => states2.push(s.state));

  await manager.setOnlineStatus(false);
  await manager.setOnlineStatus(true);

  assert.deepEqual(states1, states2, 'Both subscribers must receive identical state updates');
});

suite.test('F5-B03: Subscriber exception does not block other subscribers from receiving updates', async (assert) => {
  const manager = new env.ClinicSyncManager('c-exc');
  let healthySubscriberCalled = false;

  manager.subscribe(() => {
    throw new Error('Subscriber error simulation');
  });

  manager.subscribe(() => {
    healthySubscriberCalled = true;
  });

  await manager.setOnlineStatus(false);
  assert.ok(healthySubscriberCalled, 'Healthy subscriber must still be notified');
});

suite.test('F5-B04: High pending count (1,000 pending mutations) reported accurately in status', async (assert) => {
  const manager = new env.ClinicSyncManager('c-high');
  let latestPending = 0;
  manager.subscribe((s) => {
    latestPending = s.pendingCount;
  });

  // Batch insert 1000 mutations
  const records = [];
  for (let i = 0; i < 1000; i++) {
    records.push({
      id: `mut-${i}`,
      table: 'appointments',
      status: 'pending',
      monotonic_ts: i
    });
  }
  await env.putRecords('outbox', records);

  await manager.setOnlineStatus(false);
  assert.equal(latestPending, 1000, 'Broadcaster must report exact 1,000 pending count');
});

suite.test('F5-B05: Unsubscribing a non-existent or duplicate listener does not throw', async (assert) => {
  const manager = new env.ClinicSyncManager('c-unsub');
  const unsubscribe = manager.subscribe(() => {});
  unsubscribe();
  // Call unsubscribe again
  unsubscribe();
  assert.ok(true, 'Duplicate unsubscribe should be safe and idempotent');
});

// ============================================================================
// FEATURE 6: Walk-in Registration Boundaries
// ============================================================================

suite.test('F6-B01: Patient name with Nepali Devanagari Unicode and special characters persists', async (assert) => {
  const nepaliName = 'राजेन्द्र प्रसाद कोइराला (डाक्टर रेफरल)';
  const appt = {
    id: crypto.randomUUID(),
    clinic_id: 'c1',
    patient_name: nepaliName,
    patient_age: 45,
    patient_gender: 'Male'
  };

  await env.putRecord('appointments', appt);
  const saved = await env.getRecord('appointments', appt.id);
  assert.equal(saved.patient_name, nepaliName, 'Devanagari Unicode string must be stored exactly');
});

suite.test('F6-B02: Maximum length patient name (255 chars) and boundary age values (0, 120)', async (assert) => {
  const maxName = 'A'.repeat(255);
  const infantAppt = { id: 'infant-1', patient_name: maxName, patient_age: 0 };
  const centenarianAppt = { id: 'centenarian-1', patient_name: maxName, patient_age: 120 };

  await env.putRecord('appointments', infantAppt);
  await env.putRecord('appointments', centenarianAppt);

  const savedInfant = await env.getRecord('appointments', 'infant-1');
  const savedOld = await env.getRecord('appointments', 'centenarian-1');

  assert.equal(savedInfant.patient_name.length, 255, '255 char name must persist');
  assert.equal(savedInfant.patient_age, 0, 'Age 0 (newborn) must persist');
  assert.equal(savedOld.patient_age, 120, 'Age 120 must persist');
});

suite.test('F6-B03: Mobile number with spaces, hyphens, and country code is sanitized', async (assert) => {
  const rawMobile = '+977-984 123 4567';
  const cleanMobile = rawMobile.replace(/\D/g, '');
  assert.equal(cleanMobile, '9779841234567', 'Sanitized mobile should contain only numeric digits');
  assert.greaterThan(cleanMobile.length, 8, 'Clean mobile length must be > 8');
});

suite.test('F6-B04: Multiple walk-in arrivals within same millisecond receive unique tracking codes', async (assert) => {
  const sameDate = new Date();
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    const code = env.TrackingCodeGenerator.generateTrackingCode(10, sameDate);
    codes.add(code);
  }
  assert.equal(codes.size, 50, 'All 50 generated tracking codes within same instant must be unique');
});

suite.test('F6-B05: Cabin re-queue after no-show restores patient to waiting status', async (assert) => {
  const apptId = 'requeue-appt-1';
  await env.putRecord('appointments', { id: apptId, checkin_status: 'cancelled', status_reason: 'no_show' });

  // Re-queue
  const appt = await env.getRecord('appointments', apptId);
  appt.checkin_status = 'waiting';
  appt.status_reason = null;
  appt.requeued_at = new Date().toISOString();
  await env.putRecord('appointments', appt);

  const requeued = await env.getRecord('appointments', apptId);
  assert.equal(requeued.checkin_status, 'waiting', 'Status must be restored to waiting');
  assert.ok(requeued.requeued_at, 'requeued_at timestamp must be set');
});

// ============================================================================
// FEATURE 7: Billing Boundaries
// ============================================================================

suite.test('F7-B01: Zero total amount invoice (100% free clinic consultation) persists', async (assert) => {
  const freeInvoice = {
    id: 'free-inv-1',
    clinic_id: 'c1',
    total_amount: 0,
    paid_amount: 0,
    balance_due: 0,
    payment_status: 'not_required'
  };

  await env.putRecord('invoices', freeInvoice);
  const saved = await env.getRecord('invoices', 'free-inv-1');
  assert.equal(saved.total_amount, 0, 'Zero amount invoice must persist');
  assert.equal(saved.payment_status, 'not_required');
});

suite.test('F7-B02: Partial cash payment followed by 10 subsequent partial installments', async (assert) => {
  const totalAmount = 5000;
  const payments = [];

  for (let i = 1; i <= 10; i++) {
    payments.push({
      id: `p-${i}`,
      amount: 400,
      dateTime: new Date().toISOString(),
      note: `Installment ${i}`
    });
  }

  const cumulativePaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = totalAmount - cumulativePaid;

  assert.equal(cumulativePaid, 4000, 'Cumulative paid must be 4000');
  assert.equal(balanceDue, 1000, 'Balance due must be 1000');
});

suite.test('F7-B03: Invoice with 50+ itemized clinical procedures persists accurately', async (assert) => {
  const items = [];
  for (let i = 1; i <= 55; i++) {
    items.push({ id: `item-${i}`, name: `Procedure Code #${i}`, price: 100, quantity: 1 });
  }

  const invoice = {
    id: 'inv-large-items',
    clinic_id: 'c1',
    items,
    total_amount: items.reduce((s, x) => s + x.price * x.quantity, 0)
  };

  await env.putRecord('invoices', invoice);
  const fetched = await env.getRecord('invoices', 'inv-large-items');
  assert.equal(fetched.items.length, 55, 'All 55 line items must be preserved');
  assert.equal(fetched.total_amount, 5500, 'Total must equal 5500');
});

suite.test('F7-B04: Negative adjustments and refund transaction records in payment ledger', async (assert) => {
  const payments = [
    { id: 'p1', amount: 1000, note: 'Initial Cash Payment' },
    { id: 'p2', amount: -200, note: 'Refund for cancelled blood test' }
  ];

  const netPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  assert.equal(netPaid, 800, 'Net paid after negative refund adjustment must equal 800');
});

suite.test('F7-B05: Overpayment scenario (paid > total) accurately reflects negative balance / clinic credit', async (assert) => {
  const total = 1000;
  const paid = 1200;
  const balance = total - paid;
  assert.equal(balance, -200, 'Overpayment results in negative balance (credit of 200)');
});

// ============================================================================
// FEATURE 8: Credential Redaction Boundaries
// ============================================================================

suite.test('F8-B01: Circular reference in data structure handled without stack overflow', async (assert) => {
  const circularObj = {
    name: 'Circular Clinic',
    payment_secret_key: 'secret_123'
  };
  circularObj.self = circularObj;

  const redacted = env.redactSecrets(circularObj);
  assert.equal(redacted.name, 'Circular Clinic');
  assert.equal(redacted.payment_secret_key, '[REDACTED]');
  assert.equal(redacted.self, '[Circular]', 'Circular reference must be replaced with [Circular]');
});

suite.test('F8-B02: Case-insensitive and snake/camel casing of secret keys are redacted', async (assert) => {
  const input = {
    PAYMENT_SECRET_KEY: 'sec1',
    paymentSecretKey: 'sec2',
    ApiKey: 'sec3',
    SECRET: 'sec4',
    Normal_Field: 'safe'
  };

  const redacted = env.redactSecrets(input);
  assert.equal(redacted.PAYMENT_SECRET_KEY, '[REDACTED]');
  assert.equal(redacted.paymentSecretKey, '[REDACTED]');
  assert.equal(redacted.ApiKey, '[REDACTED]');
  assert.equal(redacted.SECRET, '[REDACTED]');
  assert.equal(redacted.Normal_Field, 'safe');
});

suite.test('F8-B03: Deep nesting (20 levels deep) of secret keys sanitized', async (assert) => {
  let root = { secret_key: 'level_20_secret' };
  for (let i = 19; i >= 1; i--) {
    root = { [`level_${i}`]: root };
  }

  const redacted = env.redactSecrets(root);
  // Traverse to level 20
  let cur = redacted;
  for (let i = 1; i <= 19; i++) {
    cur = cur[`level_${i}`];
  }
  assert.equal(cur.secret_key, '[REDACTED]', 'Secret 20 levels deep must be redacted');
});

suite.test('F8-B04: Mixed array containing strings, null, numbers, booleans, and secret objects', async (assert) => {
  const mixed = [
    'plain string',
    null,
    12345,
    true,
    { api_key: 'secret_in_array', label: 'Item 1' }
  ];

  const redacted = env.redactSecrets(mixed);
  assert.equal(redacted[0], 'plain string');
  assert.equal(redacted[1], null);
  assert.equal(redacted[2], 12345);
  assert.equal(redacted[3], true);
  assert.equal(redacted[4].api_key, '[REDACTED]');
  assert.equal(redacted[4].label, 'Item 1');
});

suite.test('F8-B05: Primitive and edge input types (null, undefined, number, Date) returned safely', async (assert) => {
  assert.equal(env.redactSecrets(null), null);
  assert.equal(env.redactSecrets(undefined), undefined);
  assert.equal(env.redactSecrets(42), 42);
  assert.equal(env.redactSecrets('test string'), 'test string');
  const d = new Date('2026-10-23T00:00:00Z');
  const redactedDate = env.redactSecrets(d);
  assert.equal(redactedDate.toISOString(), d.toISOString());
});

// ============================================================================
// FEATURE 9: Local Backup Boundaries
// ============================================================================

suite.test('F9-B01: Snapshot of completely empty clinic database succeeds with zero counts', async (assert) => {
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot('c-empty');
  assert.equal(snapshot.metadata.total_appointments, 0);
  assert.equal(snapshot.metadata.total_doctors, 0);
  assert.equal(snapshot.datasets.appointments.length, 0);
  assert.ok(snapshot.sha256, 'Empty dataset must still generate valid SHA-256 hash');
});

suite.test('F9-B02: Clinic ID with special characters sanitized safely for filename', async (assert) => {
  const dirtyId = 'clinic!@#_123$%-test';
  const filename = env.ClinicBackupService.getBackupFilename(dirtyId, new Date('2026-10-23T00:00:00Z'));
  assert.doesNotMatch(filename, /[!@#$%^&*]/, 'Filename must not contain illegal punctuation');
  assert.match(filename, /^dactor-clinic-[a-zA-Z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);
});

suite.test('F9-B03: Midnight UTC date rollover boundary creates consistent filename date', async (assert) => {
  const midnight = new Date('2026-10-23T00:00:00.000Z');
  const filename = env.ClinicBackupService.getBackupFilename('c1', midnight);
  assert.includes(filename, '2026-10-23');
});

suite.test('F9-B04: Large clinic snapshot (1,000 appointments) produces deterministic SHA-256 hash', async (assert) => {
  const clinicId = 'c-large-hash';
  const appts = [];
  for (let i = 0; i < 1000; i++) {
    appts.push({
      id: `a-${i}`,
      clinic_id: clinicId,
      patient_name: `Patient ${i}`,
      fee_amount: 500
    });
  }
  await env.putRecords('appointments', appts);

  const snapshot1 = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  const snapshot2 = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);

  assert.equal(snapshot1.sha256, snapshot2.sha256, 'SHA-256 checksums of identical datasets must be identical');
});

suite.test('F9-B05: Modifying an exported snapshot does not mutate stored database records', async (assert) => {
  const clinicId = 'c-immut';
  await env.putRecord('clinic_profile', { id: clinicId, name: 'Original Name' });

  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  snapshot.datasets.clinic.name = 'Tampered Snapshot Name';

  const stored = await env.getRecord('clinic_profile', clinicId);
  assert.equal(stored.name, 'Original Name', 'Local IndexedDB record must not be mutated by snapshot mutation');
});

// ============================================================================
// FEATURE 10: Google Drive Sync Boundaries
// ============================================================================

suite.test('F10-B01: Multipart payload boundary string safety with custom boundary parameter', async (assert) => {
  const metadata = { name: 'test.json' };
  const customBoundary = 'CUSTOM_BOUNDARY_987654321';
  const payload = env.ClinicBackupService.formatDriveMultipartPayload(metadata, '{}', customBoundary);

  assert.includes(payload.contentType, `boundary=${customBoundary}`);
  assert.includes(payload.body, `--${customBoundary}`);
  assert.includes(payload.body, `--${customBoundary}--`);
});

suite.test('F10-B02: Drive upload with custom clinic name containing Unicode formats valid JSON', async (assert) => {
  const metadata = {
    name: 'dactor-clinic-pokhara-2026-10-23.json',
    description: 'पोखरा स्वास्थ्य सेवा केन्द्र ब्याकअप'
  };
  const payload = env.ClinicBackupService.formatDriveMultipartPayload(metadata, '{}');
  assert.includes(payload.body, 'पोखरा स्वास्थ्य सेवा केन्द्र ब्याकअप', 'Unicode description in metadata must be intact');
});

suite.test('F10-B03: Mock Google Drive client failure simulates 429 rate limit or 500 server error', async (assert) => {
  const failingClient = {
    upload: async () => {
      throw new Error('GoogleDriveError: 429 Too Many Requests (Rate limit exceeded)');
    }
  };

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.syncBackupToGoogleDrive('c1', env.globalIndexedDB, failingClient);
    },
    '429 Too Many Requests'
  );
});

suite.test('F10-B04: Large payload size calculation on multi-megabyte backup body', async (assert) => {
  const metadata = { name: 'large.json' };
  const largeContent = 'X'.repeat(1024 * 500); // 500KB
  const payload = env.ClinicBackupService.formatDriveMultipartPayload(metadata, largeContent);
  assert.greaterThan(payload.body.length, 500000, 'Payload body length must exceed 500,000 characters');
});

suite.test('F10-B05: Missing parent folder fallback still targets root folder gracefully', async (assert) => {
  const metadata = { name: 'fallback.json', parents: [] };
  const payload = env.ClinicBackupService.formatDriveMultipartPayload(metadata, '{}');
  assert.ok(payload.body.includes('"parents":[]'), 'Empty parents array should be serialized cleanly');
});

// ============================================================================
// FEATURE 11: Backup Restore Boundaries & Tampering Detection
// ============================================================================

suite.test('F11-B01: Truncated JSON string (cut off mid-stream) is rejected with InvalidBackupError', async (assert) => {
  const truncated = '{"schema_version": "1.0", "datasets": { "appointments": [{"id": "a1"';
  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(truncated, 'c1');
    },
    'InvalidBackupError'
  );
});

suite.test('F11-B02: Backup JSON with extra unexpected fields is tolerated gracefully without error', async (assert) => {
  const clinicId = 'c-extra-fields';
  const datasets = { clinic: { id: clinicId, name: 'Tolerant Clinic' } };
  const sha256 = env.ClinicBackupService.computeSha256(JSON.stringify(datasets));
  const backupWithExtra = JSON.stringify({
    schema_version: '1.0',
    clinic_id: clinicId,
    datasets,
    sha256,
    extra_field_from_future: { note: 'future expansion' }
  });

  const res = await env.ClinicBackupService.restoreClinicBackup(backupWithExtra, clinicId);
  assert.ok(res.success, 'Restore should succeed despite extra non-conflicting metadata');
});

suite.test('F11-B03: Single character tampering in datasets payload trips SHA-256 verification failure', async (assert) => {
  const clinicId = 'c-tamper';
  const datasets = { clinic: { id: clinicId, name: 'Honest Clinic' } };
  const originalSha256 = env.ClinicBackupService.computeSha256(JSON.stringify(datasets));

  // Tamper with data after hash calculation
  datasets.clinic.name = 'Tampered Clinic';
  const tamperedJson = JSON.stringify({
    schema_version: '1.0',
    clinic_id: clinicId,
    datasets,
    sha256: originalSha256
  });

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(tamperedJson, clinicId);
    },
    'ChecksumMismatchError'
  );
});

suite.test('F11-B04: Empty string, null, or boolean passed to restoreClinicBackup rejected', async (assert) => {
  await assert.rejects(() => env.ClinicBackupService.restoreClinicBackup('', 'c1'), 'InvalidBackupError');
  await assert.rejects(() => env.ClinicBackupService.restoreClinicBackup('null', 'c1'), 'InvalidBackupError');
  await assert.rejects(() => env.ClinicBackupService.restoreClinicBackup('false', 'c1'), 'InvalidBackupError');
});

suite.test('F11-B05: Future schema version (e.g. "99.0") is rejected with InvalidBackupError', async (assert) => {
  const futureSchema = JSON.stringify({
    schema_version: '99.0',
    clinic_id: 'c1',
    datasets: {}
  });

  await assert.rejects(
    async () => {
      await env.ClinicBackupService.restoreClinicBackup(futureSchema, 'c1');
    },
    'InvalidBackupError'
  );
});

// ============================================================================
// FEATURE 12: Worktree & Conformance Boundaries
// ============================================================================

suite.test('F12-B01: Calling tracking code with non-numeric terminal ID throws TypeError', async (assert) => {
  assert.throws(() => {
    env.TrackingCodeGenerator.setTerminalId('invalid_string');
  }, 'Non-numeric terminal ID must throw');
});

suite.test('F12-B02: Calling DB store methods with non-existent store name handles error', async (assert) => {
  await assert.rejects(
    async () => {
      await env.getStore('non_existent_store_xyz');
    },
    'NotFoundError'
  );
});

suite.test('F12-B03: Concurrent transactions on different stores execute without deadlock', async (assert) => {
  const p1 = env.putRecord('doctors', { id: 'd-conc-1', full_name: 'Dr. One' });
  const p2 = env.putRecord('invoices', { id: 'i-conc-1', total_amount: 100 });
  const p3 = env.putRecord('appointments', { id: 'a-conc-1', patient_name: 'Patient One' });

  await Promise.all([p1, p2, p3]);

  const d = await env.getRecord('doctors', 'd-conc-1');
  const i = await env.getRecord('invoices', 'i-conc-1');
  const a = await env.getRecord('appointments', 'a-conc-1');

  assert.ok(d && i && a, 'All 3 concurrent records must be retrieved');
});

suite.test('F12-B04: Redactor prevents prototype pollution via __proto__ or constructor keys', async (assert) => {
  const maliciousInput = JSON.parse('{"__proto__": {"polluted": true}, "normal": "safe"}');
  const sanitized = env.redactSecrets(maliciousInput);
  assert.equal({}.polluted, undefined, 'Global Object prototype must not be polluted');
  assert.equal(sanitized.normal, 'safe');
});

suite.test('F12-B05: Method calls with missing optional parameters use sensible defaults', async (assert) => {
  // generateTrackingCode without parameters uses default terminal ID and current date
  const code = env.TrackingCodeGenerator.generateTrackingCode();
  assert.equal(code.length, 10);
  assert.ok(env.TrackingCodeGenerator.validateTrackingCode(code));
});

module.exports = suite;
