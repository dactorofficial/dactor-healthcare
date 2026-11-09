/**
 * Unit Test Suite for Milestone 2: Bidirectional Cloud Sync Manager
 *
 * Tests:
 * 1. Construction, Singleton & Lifecycle Controls
 * 2. Network State Transitions, Window Events & Flapping Resilience
 * 3. Reactive Subscription, Status Broadcasts & Error Isolation
 * 4. Idempotent Outbox Drain, FIFO Ordering, DELETE Handling & Retry Halting
 * 5. Delta Pulling, Last-Write-Wins (LWW) Conflict Resolution & Soft Deletes
 * 6. Concurrency Protection & TriggerSync Coordination
 */

import { MockIDBFactory } from '../m1/idbMock.ts';
import {
  setIndexedDBFactory,
  initClinicOfflineDb,
  putRecord,
  getRecord,
  queueMutation,
  getPendingMutations,
  setSyncMeta,
  getSyncMeta,
  clearStore,
} from '../../src/services/clinicOfflineDb.ts';
import {
  ClinicSyncManager,
  initSyncManager,
  stopSyncManager,
  triggerSync,
  subscribeSyncState,
  pushPendingMutations,
  pullRemoteDeltas,
  getSyncState,
  setOnlineStatus,
} from '../../src/services/clinicSyncManager.ts';
import type { SyncStatus } from '../../src/services/clinicSyncManager.ts';
import { MockSupabaseClient } from './mockSupabase.ts';

// Test assertion helpers
let passedCount = 0;
let failedCount = 0;

function assert(condition: any, message: string) {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  }
}

async function resetTestEnvironment() {
  stopSyncManager();
  const mockFactory = new MockIDBFactory();
  setIndexedDBFactory(mockFactory);
  await initClinicOfflineDb();
  await clearStore('outbox');
  await clearStore('appointments');
  await clearStore('sync_meta');
}

export async function runClinicSyncManagerTests() {
  console.log('\n======================================================');
  console.log('=== CLINIC SYNC MANAGER (MILESTONE 2) UNIT TESTS   ===');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Construction, Configuration & Singleton Lifecycle
  // --------------------------------------------------------------------------
  console.log('--- 1. Construction, Configuration & Singleton Lifecycle ---');
  await resetTestEnvironment();

  const mockSupabase = new MockSupabaseClient();
  const manager = new ClinicSyncManager('clinic-101', null, mockSupabase, {
    syncIntervalMs: 15000,
  });

  assertEqual(manager.clinicId, 'clinic-101', 'Clinic ID initialized correctly');
  assertEqual(manager.isOnline, true, 'Default online state is true');
  assertEqual(manager.state, 'online', 'Default sync state is "online"');
  assertEqual(manager.cachedPendingCount, 0, 'Initial cached pending count is 0');

  const status = manager.getStatus();
  assertEqual(status.state, 'online', 'Status snapshot state is "online"');
  assertEqual(status.pendingCount, 0, 'Status snapshot pending count is 0');

  // Singleton lifecycle
  const singleton = initSyncManager('clinic-singleton', {
    supabaseClient: mockSupabase,
    syncIntervalMs: 5000,
  });
  assert(singleton !== null, 'initSyncManager returns active ClinicSyncManager instance');
  assertEqual(getSyncState().state, 'online', 'getSyncState reflects initialized singleton');

  stopSyncManager();
  assertEqual(getSyncState().state, 'online', 'getSyncState safe fallback after stopSyncManager');

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Network State Transitions & Flapping Resilience
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Network State Transitions & Flapping Resilience ---');
  await resetTestEnvironment();

  const flapManager = new ClinicSyncManager('clinic-flap', null, mockSupabase);
  const recordedStates: string[] = [];

  const unsubFlap = flapManager.subscribe((s: SyncStatus) => {
    recordedStates.push(s.state);
  });

  // Offline transition
  await flapManager.setOnlineStatus(false);
  assertEqual(flapManager.isOnline, false, 'isOnline is false after setOnlineStatus(false)');
  assertEqual(flapManager.state, 'offline', 'state is "offline" after setOnlineStatus(false)');

  // Online transition
  await flapManager.setOnlineStatus(true);
  assertEqual(flapManager.isOnline, true, 'isOnline is true after setOnlineStatus(true)');
  assertEqual(flapManager.state, 'online', 'state returns to "online"');

  // Rapid network flapping stress test (40 rapid toggles)
  for (let i = 0; i < 40; i++) {
    await flapManager.setOnlineStatus(i % 2 === 0);
  }
  // Last toggle was i=39 (odd), so online=false
  assertEqual(flapManager.isOnline, false, 'Final flapping state matches last toggle (offline)');
  assertEqual(flapManager.state, 'offline', 'Manager state is "offline"');
  assert(recordedStates.length > 40, 'Broadcaster recorded all status transitions during flapping');

  unsubFlap();

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Reactive Subscription & Error Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Reactive Subscription & Error Isolation ---');
  await resetTestEnvironment();

  const subManager = new ClinicSyncManager('clinic-sub', null, mockSupabase);

  let sub1Calls = 0;
  let sub2Calls = 0;
  let sub1LatestPending = -1;

  const unsub1 = subManager.subscribe((s) => {
    sub1Calls++;
    sub1LatestPending = s.pendingCount;
  });

  const unsub2 = subManager.subscribe((_s) => {
    sub2Calls++;
  });

  assert(sub1Calls >= 1, 'Subscriber 1 called immediately upon subscribing');
  assert(sub2Calls >= 1, 'Subscriber 2 called immediately upon subscribing');

  // Queue a mutation and notify
  await queueMutation({
    id: 'mut-test-1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'a1', clinic_id: 'clinic-sub' },
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending',
  });

  await subManager._notify();
  assertEqual(sub1LatestPending, 1, 'Subscriber 1 updated with pendingCount = 1');

  // Subscriber error isolation test (a failing subscriber must not block others)
  let healthyCalled = false;
  const unsubFaulty = subManager.subscribe(() => {
    throw new Error('Simulated subscriber exception');
  });

  const unsubHealthy = subManager.subscribe(() => {
    healthyCalled = true;
  });

  await subManager.setOnlineStatus(false);
  assert(healthyCalled, 'Healthy subscriber was notified despite faulty subscriber throwing');

  // Idempotent unsubscribe test
  unsubFaulty();
  unsubFaulty(); // Call second time, must not throw
  unsubHealthy();
  unsub1();
  unsub2();
  assert(true, 'Idempotent unsubscribing succeeds without throwing');

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Idempotent Outbox Drain, FIFO Ordering & Retry Halting
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Idempotent Outbox Drain, FIFO Ordering & Retry Halting ---');
  await resetTestEnvironment();
  mockSupabase.reset();

  const pushManager = new ClinicSyncManager('clinic-push', null, mockSupabase);

  // 4.1 Empty outbox returns { pushed: 0, failed: 0 }
  const emptyRes = await pushManager.pushPendingMutations();
  assertEqual(emptyRes.pushed, 0, 'Empty outbox push returns pushed = 0');
  assertEqual(emptyRes.failed, 0, 'Empty outbox push returns failed = 0');

  // 4.2 Push when offline returns { pushed: 0, failed: 0 }
  await pushManager.setOnlineStatus(false);
  await queueMutation({
    id: 'mut-offline-1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-off-1', clinic_id: 'clinic-push', fee: 500 },
    timestamp: 1000,
    retryCount: 0,
    status: 'pending',
  });
  const offRes = await pushManager.pushPendingMutations();
  assertEqual(offRes.pushed, 0, 'Push when offline returns pushed = 0');
  assertEqual(pushManager.state, 'offline', 'State remains offline');

  // 4.3 Reconnect and verify FIFO chronological outbox drain
  await pushManager.setOnlineStatus(true);

  await queueMutation({
    id: 'mut-fifo-2',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-fifo-2', clinic_id: 'clinic-push', patient_name: 'Second Patient' },
    timestamp: 2000,
    retryCount: 0,
    status: 'pending',
  });

  await queueMutation({
    id: 'mut-fifo-3',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-fifo-3', clinic_id: 'clinic-push', patient_name: 'Third Patient' },
    timestamp: 3000,
    retryCount: 0,
    status: 'pending',
  });

  const pushRes = await pushManager.pushPendingMutations();
  assertEqual(pushRes.pushed, 3, 'Pushed all 3 pending mutations in outbox');
  assertEqual(pushRes.failed, 0, 'Zero failed mutations');

  const pendingAfterPush = await getPendingMutations();
  assertEqual(pendingAfterPush.length, 0, 'Outbox queue is fully drained');

  // Verify records exist in remote Supabase table
  const remoteAppts = await mockSupabase.from('appointments').select('*');
  assertEqual(remoteAppts.data.length, 3, 'Supabase remote table received all 3 appointments');

  // 4.4 Idempotent Upsert verification: Repeated sync of same record produces NO duplicate
  await queueMutation({
    id: 'mut-dup-1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-fifo-2', clinic_id: 'clinic-push', patient_name: 'Second Patient (Updated)' },
    timestamp: 4000,
    retryCount: 0,
    status: 'pending',
  });
  await pushManager.pushPendingMutations();

  const remoteApptsAfterDup = await mockSupabase.from('appointments').select('*');
  assertEqual(remoteApptsAfterDup.data.length, 3, 'Total appointments remains 3 (no duplicate records)');
  const updatedRow = remoteApptsAfterDup.data.find((r: any) => r.id === 'appt-fifo-2');
  assertEqual(updatedRow.patient_name, 'Second Patient (Updated)', 'Remote record updated idempotently');

  // 4.5 Action DELETE handling
  await queueMutation({
    id: 'mut-del-1',
    table: 'appointments',
    action: 'DELETE',
    payload: { id: 'appt-fifo-3' },
    timestamp: 5000,
    retryCount: 0,
    status: 'pending',
  });
  await pushManager.pushPendingMutations();

  const remoteAfterDel = await mockSupabase.from('appointments').select('*');
  assertEqual(remoteAfterDel.data.length, 2, 'Deleted appointment was pruned from remote Supabase table');

  // 4.6 Failure Simulation & Strict FIFO Halting
  // Enqueue two mutations: first should succeed, second will fail
  await queueMutation({
    id: 'mut-fail-1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-fail-1', clinic_id: 'clinic-push' },
    timestamp: 6000,
    retryCount: 0,
    status: 'pending',
  });

  await queueMutation({
    id: 'mut-fail-2',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'appt-fail-2', clinic_id: 'clinic-push' },
    timestamp: 7000,
    retryCount: 0,
    status: 'pending',
  });

  // Make remote call fail
  mockSupabase.shouldFailNext = true;
  mockSupabase.failureError = new Error('Database connection timed out');

  const failRes = await pushManager.pushPendingMutations();
  assertEqual(failRes.failed, 1, 'Push reports 1 failed mutation');
  assertEqual(pushManager.state, 'error', 'Sync manager transitioned to "error" state');
  assertEqual(pushManager.lastError, 'Database connection timed out', 'lastError recorded accurately');

  // Check outbox: the failed mutation must remain in outbox with incremented retryCount
  const remaining = await getPendingMutations('all');
  assert(remaining.length >= 2, 'Unprocessed mutations remain in outbox to preserve FIFO causal ordering');
  const failedMut = remaining.find((m) => m.id === 'mut-fail-1');
  assert(failedMut !== undefined, 'Failed mutation found in outbox');
  assert((failedMut?.retryCount || 0) >= 1, 'retryCount was incremented on failed mutation');

  // Now clear failure and re-push: should recover to online!
  mockSupabase.shouldFailNext = false;
  const recoverRes = await pushManager.pushPendingMutations();
  assertEqual(recoverRes.failed, 0, 'Recovery push succeeds with 0 failures');
  assertEqual(pushManager.state, 'online', 'State transitions back to "online" after recovery');
  assert(pushManager.lastSyncTime !== null, 'lastSyncTime updated upon successful sync');

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Delta Pulling & Last-Write-Wins (LWW) Conflict Resolution
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Delta Pulling & Last-Write-Wins (LWW) Conflict Resolution ---');
  await resetTestEnvironment();
  mockSupabase.reset();

  const pullManager = new ClinicSyncManager('clinic-lww', null, mockSupabase);

  // 5.1 Remote insert pulls into local IndexedDB
  await mockSupabase.from('appointments').upsert({
    id: 'remote-appt-1',
    clinic_id: 'clinic-lww',
    patient_name: 'Anita Rai',
    updated_at: '2026-10-23T10:00:00Z',
  });

  const pull1 = await pullManager.pullRemoteDeltas('clinic-lww');
  assertEqual(pull1.pulled, 1, 'Pulls 1 remote appointment into local IDB');

  const localAppt1 = await getRecord<any>('appointments', 'remote-appt-1');
  assert(localAppt1 !== undefined, 'Remote appointment was saved to local IndexedDB');
  assertEqual(localAppt1.patient_name, 'Anita Rai', 'Local record matches remote content');

  // Verify sync metadata updated
  const lastSyncMeta = await getSyncMeta<string>('last_synced_at');
  assert(lastSyncMeta !== undefined && !isNaN(Date.parse(lastSyncMeta)), 'last_synced_at was updated');

  // 5.2 Conflict Scenario: Remote is newer than local record -> Remote wins
  await putRecord('appointments', {
    id: 'conflict-appt-1',
    clinic_id: 'clinic-lww',
    patient_name: 'Local Older Name',
    updated_at: '2026-10-23T11:00:00Z',
  });

  await mockSupabase.from('appointments').upsert({
    id: 'conflict-appt-1',
    clinic_id: 'clinic-lww',
    patient_name: 'Remote Newer Name (Wins)',
    updated_at: '2026-10-23T12:00:00Z',
  });

  await pullManager.pullRemoteDeltas('clinic-lww');

  const localWinner = await getRecord<any>('appointments', 'conflict-appt-1');
  assertEqual(localWinner.patient_name, 'Remote Newer Name (Wins)', 'Newer remote update overwrote older local record');

  // 5.3 Conflict Scenario: Local record is newer than remote record -> Local wins
  await putRecord('appointments', {
    id: 'conflict-appt-2',
    clinic_id: 'clinic-lww',
    patient_name: 'Local Newer Name (Wins)',
    updated_at: '2026-10-23T15:00:00Z',
  });

  await mockSupabase.from('appointments').upsert({
    id: 'conflict-appt-2',
    clinic_id: 'clinic-lww',
    patient_name: 'Remote Older Name',
    updated_at: '2026-10-23T13:00:00Z',
  });

  await pullManager.pullRemoteDeltas('clinic-lww');

  const localWinner2 = await getRecord<any>('appointments', 'conflict-appt-2');
  assertEqual(localWinner2.patient_name, 'Local Newer Name (Wins)', 'Newer local record was preserved against stale remote');

  // 5.4 Conflict Scenario: Identical timestamps (Tie) -> Local is preserved
  const tieTimestamp = '2026-10-23T16:00:00Z';
  await putRecord('appointments', {
    id: 'conflict-appt-tie',
    clinic_id: 'clinic-lww',
    patient_name: 'Local Tie Retained',
    updated_at: tieTimestamp,
  });

  await mockSupabase.from('appointments').upsert({
    id: 'conflict-appt-tie',
    clinic_id: 'clinic-lww',
    patient_name: 'Remote Tie Name',
    updated_at: tieTimestamp,
  });

  await pullManager.pullRemoteDeltas('clinic-lww');

  const tieWinner = await getRecord<any>('appointments', 'conflict-appt-tie');
  assertEqual(tieWinner.patient_name, 'Local Tie Retained', 'When timestamps are tied, local state is preserved');

  // 5.5 Conflict Scenario: Local modification pending in outbox with newer timestamp
  const outboxApptId = 'conflict-outbox-1';
  await putRecord('appointments', {
    id: outboxApptId,
    clinic_id: 'clinic-lww',
    patient_name: 'Draft Local Edit',
    updated_at: '2026-10-23T18:00:00Z',
  });

  await queueMutation({
    id: 'mut-outbox-draft',
    table: 'appointments',
    action: 'UPDATE',
    payload: { id: outboxApptId, patient_name: 'Draft Local Edit', updated_at: '2026-10-23T18:00:00Z' },
    timestamp: Date.parse('2026-10-23T18:00:00Z'),
    retryCount: 0,
    status: 'pending',
  });

  // Stale remote arrives with older timestamp (17:00)
  await mockSupabase.from('appointments').upsert({
    id: outboxApptId,
    clinic_id: 'clinic-lww',
    patient_name: 'Stale Remote Edit',
    updated_at: '2026-10-23T17:00:00Z',
  });

  await pullManager.pullRemoteDeltas('clinic-lww');

  const outboxProtected = await getRecord<any>('appointments', outboxApptId);
  assertEqual(outboxProtected.patient_name, 'Draft Local Edit', 'Unpushed outbox mutation protected local record from stale remote pull');

  // 5.6 Soft-delete remote sync preserves tombstone flag locally
  await mockSupabase.from('appointments').upsert({
    id: 'soft-del-appt',
    clinic_id: 'clinic-lww',
    patient_name: 'Cancelled Visit',
    is_deleted: true,
    deleted_at: '2026-10-23T19:00:00Z',
    updated_at: '2026-10-23T19:00:00Z',
  });

  await pullManager.pullRemoteDeltas('clinic-lww');

  const localDeleted = await getRecord<any>('appointments', 'soft-del-appt');
  assert(localDeleted !== undefined, 'Soft deleted record exists locally');
  assertEqual(localDeleted.is_deleted, true, 'is_deleted tombstone was synced to local IndexedDB');

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Coordination, triggerSync & Concurrency Protection
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Coordination, triggerSync & Concurrency Protection ---');
  await resetTestEnvironment();
  mockSupabase.reset();

  const coordManager = new ClinicSyncManager('clinic-coord', null, mockSupabase);

  // Queue a local mutation
  await queueMutation({
    id: 'mut-coord-1',
    table: 'appointments',
    action: 'INSERT',
    payload: { id: 'coord-appt-1', clinic_id: 'clinic-coord', patient_name: 'Coord Patient 1' },
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending',
  });

  // Put a remote record
  await mockSupabase.from('appointments').upsert({
    id: 'coord-remote-1',
    clinic_id: 'clinic-coord',
    patient_name: 'Coord Remote 1',
    updated_at: new Date().toISOString(),
  });

  // triggerSync executes push and pull together
  await coordManager.triggerSync();

  // Verify push succeeded
  const remoteApptsCoord = await mockSupabase.from('appointments').select('*');
  const foundPushed = remoteApptsCoord.data.find((r: any) => r.id === 'coord-appt-1');
  assert(foundPushed !== undefined, 'Local mutation was pushed upstream');

  // Verify pull succeeded
  const localApptCoord = await getRecord<any>('appointments', 'coord-remote-1');
  assert(localApptCoord !== undefined, 'Remote delta was pulled into local IndexedDB');

  // Concurrency stress test: 10 simultaneous triggerSync calls do not crash or deadlock
  const syncPromises = [];
  for (let i = 0; i < 10; i++) {
    syncPromises.push(coordManager.triggerSync());
  }
  await Promise.all(syncPromises);
  assert(true, 'Concurrent triggerSync calls executed safely without deadlock');

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Module Functional API Parity
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Module Functional API Parity ---');
  await resetTestEnvironment();
  mockSupabase.reset();

  initSyncManager('clinic-mod-api', { supabaseClient: mockSupabase });

  let functionalStateReceived: string = '';
  const unsubModule = subscribeSyncState((s) => {
    functionalStateReceived = s.state;
  });

  assertEqual(functionalStateReceived, 'online', 'subscribeSyncState received "online" state');

  await setOnlineStatus(false);
  assertEqual(functionalStateReceived, 'offline', 'subscribeSyncState received "offline" state');

  await setOnlineStatus(true);
  assertEqual(functionalStateReceived, 'online', 'subscribeSyncState received "online" state');

  const pushedResult = await pushPendingMutations();
  assertEqual(pushedResult.pushed, 0, 'pushPendingMutations functional export returned result');

  const pulledResult = await pullRemoteDeltas('clinic-mod-api');
  assertEqual(pulledResult.pulled, 0, 'pullRemoteDeltas functional export returned result');

  await triggerSync();
  assert(true, 'triggerSync functional export succeeded');

  unsubModule();
  stopSyncManager();

  // Print results
  console.log('\n======================================================');
  console.log(`CLINIC SYNC MANAGER RESULTS: ${passedCount} assertions passed (${failedCount} failed)`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    throw new Error(`${failedCount} assertions failed in ClinicSyncManager test suite.`);
  }
}
