/**
 * Tier 4: Real-World Application Workloads & Realistic Scenarios (≥6 Scenarios)
 * Exercises realistic multi-step end-to-end clinic operations matching Nepal clinic conditions.
 */

const crypto = require('node:crypto');
const { createTestSuite } = require('./test_runner_framework.js');
const env = require('./mock_environment.js');

const suite = createTestSuite('Real-World Workloads (Tier 4)', 4);

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
// SCENARIO 1: Full Offline Reception Day
// ============================================================================

suite.test('T4-01: Scenario 1 - Full Offline Reception Day (10 walk-ins, tokens, cabin calls, cash billing)', async (assert) => {
  const clinicId = 'clinic-kathmandu-opd';
  const manager = new env.ClinicSyncManager(clinicId);
  await manager.setOnlineStatus(false); // Clinic starts morning in offline mode (power cut/internet outage)

  // 1. Setup clinic profile and active doctors
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Kathmandu Central Polyclinic & Diagnostic Lab',
    address_text: 'Tripureshwor, Kathmandu, Nepal'
  });
  const doctor = {
    id: 'doc-dr-karki',
    clinic_id: clinicId,
    full_name: 'Dr. Ramesh Karki (MBBS, MD Cardiology)',
    consultation_fee: 800,
    is_in_clinic: true
  };
  await env.putRecord('doctors', doctor);

  const patientNames = [
    'Hari Bahadur Shrestha',
    'Sita Devi Adhikari',
    'Gopal Prasad Rijal',
    'Manju Tamang',
    'Bishnu Maya Thapa',
    'Kiran Kumar Chaudhary',
    'Sunita Rai',
    'Deepak Poudel',
    'Radha Krishna Joshi',
    'Nabin Bhattachan'
  ];

  const registeredAppointments = [];
  const queueTokens = [];
  const billingInvoices = [];

  // 2. Receptionist registers 10 walk-in patients throughout the morning
  for (let i = 0; i < patientNames.length; i++) {
    const name = patientNames[i];
    const code10 = env.TrackingCodeGenerator.generateTrackingCode(10);
    const apptId = crypto.randomUUID();
    const qId = crypto.randomUUID();
    const invId = crypto.randomUUID();

    // Create appointment
    const appt = {
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctor.id,
      tracking_code_10_digit: code10,
      patient_name: name,
      patient_age: 25 + (i * 3) % 40,
      patient_gender: i % 2 === 0 ? 'Male' : 'Female',
      patient_mobile: `984100000${i}`,
      checkin_status: 'waiting',
      payment_status: 'paid',
      fee_amount: 800,
      is_walkin: true,
      created_at: new Date().toISOString()
    };
    await env.putRecord('appointments', appt);
    await env.queueMutation({ table: 'appointments', payload: appt });
    registeredAppointments.push(appt);

    // Issue queue token
    const qEntry = {
      id: qId,
      appointment_id: apptId,
      clinic_id: clinicId,
      doctor_id: doctor.id,
      queue_position: i + 1,
      status: 'waiting',
      token_number: `T-10-${String(i + 1).padStart(3, '0')}`,
      created_at: appt.created_at
    };
    await env.putRecord('opd_queue', qEntry);
    await env.queueMutation({ table: 'queue_entries', payload: qEntry });
    queueTokens.push(qEntry);

    // Generate billing invoice and log cash payment
    const payment = {
      id: crypto.randomUUID(),
      amount: 800,
      dateTime: appt.created_at,
      note: 'Cash payment collected at reception counter'
    };
    const inv = {
      id: invId,
      clinic_id: clinicId,
      appointment_id: apptId,
      total_amount: 800,
      paid_amount: 800,
      balance_due: 0,
      payment_status: 'paid',
      remarks: `[PAYMENT_LOGS]${JSON.stringify([payment])}[/PAYMENT_LOGS]`,
      items: [{ id: 'item-consult', name: 'Cardiology Consultation Fee', price: 800, quantity: 1 }]
    };
    await env.putRecord('invoices', inv);
    await env.queueMutation({ table: 'billing_invoices', payload: inv });
    billingInvoices.push(inv);
  }

  // 3. Verify all 10 appointments, queue tokens, and bills stored offline
  const allAppts = await env.getStore('appointments');
  const allQueue = await env.getStore('opd_queue');
  const allInvoices = await env.getStore('invoices');
  assert.equal(allAppts.length, 10, 'All 10 appointments must be persisted in IndexedDB');
  assert.equal(allQueue.length, 10, 'All 10 queue tokens must be persisted in IndexedDB');
  assert.equal(allInvoices.length, 10, 'All 10 billing invoices must be persisted in IndexedDB');

  // 4. Doctor calls each patient inside and completes consultations with simulated chime
  let audioChimesPlayed = 0;
  const playSimulatedChime = () => audioChimesPlayed++;

  for (let i = 0; i < registeredAppointments.length; i++) {
    const appt = registeredAppointments[i];
    const q = queueTokens[i];

    // Call Inside
    playSimulatedChime();
    appt.checkin_status = 'in_consultation';
    q.status = 'inside';
    await env.putRecord('appointments', appt);
    await env.putRecord('opd_queue', q);
    await env.queueMutation({ table: 'appointments', payload: appt });
    await env.queueMutation({ table: 'queue_entries', payload: q });

    // Mark Done
    appt.checkin_status = 'completed';
    q.status = 'done';
    await env.putRecord('appointments', appt);
    await env.putRecord('opd_queue', q);
    await env.queueMutation({ table: 'appointments', payload: appt });
    await env.queueMutation({ table: 'queue_entries', payload: q });
  }

  assert.equal(audioChimesPlayed, 10, '10 audio cabin calling chimes played');
  const completedAppts = await env.getStore('appointments');
  for (const a of completedAppts) {
    assert.equal(a.checkin_status, 'completed', `Appointment ${a.id} must be marked completed`);
  }

  // 5. Verify pending mutations in outbox (10 appts + 10 queue + 10 bills + 10 inside appt + 10 inside queue + 10 done appt + 10 done queue = 70 mutations)
  const pendingMuts = await env.getPendingMutations();
  assert.equal(pendingMuts.length, 70, '70 total offline lifecycle mutations queued in outbox');
  assert.equal(manager.state, 'offline', 'Sync state remains offline with zero network exceptions');
});

// ============================================================================
// SCENARIO 2: Connection Restoration & Idempotent Sync
// ============================================================================

suite.test('T4-02: Scenario 2 - Connection Restoration & Idempotent Sync (FIFO drain without duplicates)', async (assert) => {
  const clinicId = 'c-restore-sync';
  const manager = new env.ClinicSyncManager(clinicId);

  // Status transitions observer
  const stateHistory = [];
  manager.subscribe((s) => stateHistory.push(s.state));

  // Populate outbox with 15 mixed mutations from offline state
  await manager.setOnlineStatus(false);
  for (let i = 1; i <= 15; i++) {
    await env.queueMutation({
      table: 'appointments',
      payload: {
        id: `offline-appt-${i}`,
        clinic_id: clinicId,
        patient_name: `Patient #${i}`,
        fee_amount: 500,
        updated_at: new Date().toISOString()
      }
    });
  }

  const initialPending = await env.getPendingMutations();
  assert.equal(initialPending.length, 15, '15 pending mutations queued offline');

  // Internet connectivity restored!
  await manager.setOnlineStatus(true);
  const syncResult = await manager.pushPendingMutations();

  assert.equal(syncResult.pushed, 15, 'All 15 mutations must be pushed');
  assert.equal(syncResult.failed, 0, 'Zero failures');

  // Outbox is now clean
  const pendingAfter = await env.getPendingMutations();
  assert.equal(pendingAfter.length, 0, 'Outbox must be empty');

  // Remote Supabase has exactly 15 records
  const { data: remoteAppts } = await env.globalRemoteDb.from('appointments').select('*');
  assert.equal(remoteAppts.length, 15, 'Supabase remote table has 15 appointments');

  // Simulate accidental immediate resync (duplicate push of same batch)
  const duplicatePushResult = await manager.pushPendingMutations();
  assert.equal(duplicatePushResult.pushed, 0, 'Resync on drained outbox pushes 0');

  // Remote records still exactly 15 (idempotent, 0 duplicates)
  const { data: remoteApptsAfter } = await env.globalRemoteDb.from('appointments').select('*');
  assert.equal(remoteApptsAfter.length, 15, 'Zero duplicate records created in Supabase');

  // Verify status transitions: offline -> online -> syncing -> online
  assert.includes(stateHistory, 'offline', 'State included offline');
  assert.includes(stateHistory, 'syncing', 'State included syncing');
  assert.equal(stateHistory[stateHistory.length - 1], 'online', 'Final state must be online');
});

// ============================================================================
// SCENARIO 3: Concurrent Online & Offline Bookings with LWW Resolution
// ============================================================================

suite.test('T4-03: Scenario 3 - Concurrent Online/Offline Bookings with Last-Write-Wins (LWW) Resolution', async (assert) => {
  const clinicId = 'c-concurrent-lww';
  const manager = new env.ClinicSyncManager(clinicId);

  // Initial appointment booked before disconnect
  const baseAppt = {
    id: 'appt-shared-1',
    clinic_id: clinicId,
    patient_name: 'Narayan Shrestha',
    notes: 'Initial consultation',
    checkin_status: 'waiting',
    updated_at: '2026-10-23T08:00:00.000Z'
  };
  await env.putRecord('appointments', baseAppt);
  await env.globalRemoteDb.from('appointments').upsert(baseAppt);

  // Clinic goes offline
  await manager.setOnlineStatus(false);

  // 1. Receptionist locally updates notes offline at 09:30 AM
  const localUpdate = {
    ...baseAppt,
    notes: 'Patient requested doctor review for blood pressure (updated locally)',
    updated_at: '2026-10-23T09:30:00.000Z'
  };
  await env.putRecord('appointments', localUpdate);
  await env.queueMutation({ table: 'appointments', payload: localUpdate });

  // 2. Simultaneously, patient reschedules appointment online at 10:15 AM (Newer timestamp)
  const remoteOnlineUpdate = {
    ...baseAppt,
    notes: 'Patient rescheduled online via mobile app to 11:00 AM',
    appointment_time: '11:00 AM',
    updated_at: '2026-10-23T10:15:00.000Z'
  };
  await env.globalRemoteDb.from('appointments').upsert(remoteOnlineUpdate);

  // 3. Internet restored at 10:30 AM
  await manager.setOnlineStatus(true);

  // Outbox pushes local update (at 09:30), then delta pull fetches remote update (at 10:15)
  await manager.pushPendingMutations();
  await manager.pullRemoteDeltas(clinicId);

  // 4. LWW Evaluation: Remote update at 10:15 wins over local at 09:30
  const finalLocalAppt = await env.getRecord('appointments', 'appt-shared-1');
  assert.equal(
    finalLocalAppt.notes,
    'Patient rescheduled online via mobile app to 11:00 AM',
    'Remote record with newer timestamp (10:15 > 09:30) must win via LWW'
  );
  assert.equal(finalLocalAppt.appointment_time, '11:00 AM', 'Appointment time must reflect newer update');
});

// ============================================================================
// SCENARIO 4: Disaster Recovery via Local JSON Backup Restore
// ============================================================================

suite.test('T4-04: Scenario 4 - Disaster Recovery via Local JSON Backup Restore after Browser Cache Wipe', async (assert) => {
  const clinicId = 'c-disaster-recovery';

  // 1. Fully operational clinic state before disaster
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Everest Apex Health Clinic',
    contact_phone: '01-4422331'
  });
  await env.putRecords('doctors', [
    { id: 'd-1', clinic_id: clinicId, full_name: 'Dr. Praveen Yadav', specialty: 'Orthopedics' },
    { id: 'd-2', clinic_id: clinicId, full_name: 'Dr. Maya Subedi', specialty: 'Gynecology' }
  ]);
  await env.putRecords('appointments', [
    { id: 'a-1', clinic_id: clinicId, patient_name: 'Patient Alpha', tracking_code_10_digit: '1012300015' },
    { id: 'a-2', clinic_id: clinicId, patient_name: 'Patient Beta', tracking_code_10_digit: '1012300023' }
  ]);
  await env.putRecords('invoices', [
    { id: 'i-1', clinic_id: clinicId, total_amount: 1500, payment_status: 'paid' }
  ]);

  // 2. Receptionist downloads local JSON backup snapshot
  const snapshot = await env.ClinicBackupService.createClinicBackupSnapshot(clinicId);
  const snapshotString = JSON.stringify(snapshot, null, 2);
  assert.ok(snapshot.sha256, 'Snapshot must have valid SHA-256 seal');

  // 3. Browser Disaster: IndexedDB wiped completely
  env.resetDbInstance();
  const idb = env.globalIndexedDB;
  await new Promise((resolve) => {
    const req = idb.deleteDatabase('dactor_clinic_offline_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });

  // Verify completely wiped
  const wipedDocs = await env.getStore('doctors');
  const wipedAppts = await env.getStore('appointments');
  assert.equal(wipedDocs.length, 0, 'Doctors store must be 0 after wipe');
  assert.equal(wipedAppts.length, 0, 'Appointments store must be 0 after wipe');

  // 4. Receptionist uploads and restores downloaded backup file
  const restoreSummary = await env.ClinicBackupService.restoreClinicBackup(snapshotString, clinicId);
  assert.ok(restoreSummary.success, 'Restore must report success');
  assert.equal(restoreSummary.restoredStores.doctors, 2, '2 doctors restored');
  assert.equal(restoreSummary.restoredStores.appointments, 2, '2 appointments restored');
  assert.equal(restoreSummary.restoredStores.invoices, 1, '1 invoice restored');

  // 5. Verification of recovered data integrity
  const recoveredClinic = await env.getRecord('clinic_profile', clinicId);
  const recoveredDoctor = await env.getRecord('doctors', 'd-1');
  const recoveredAppt = await env.getRecord('appointments', 'a-1');
  const recoveredInv = await env.getRecord('invoices', 'i-1');

  assert.equal(recoveredClinic.name, 'Everest Apex Health Clinic', 'Clinic name restored');
  assert.equal(recoveredDoctor.specialty, 'Orthopedics', 'Doctor specialty restored');
  assert.equal(recoveredAppt.patient_name, 'Patient Alpha', 'Patient record restored');
  assert.equal(recoveredInv.total_amount, 1500, 'Invoice restored');
});

// ============================================================================
// SCENARIO 5: Google Drive Cloud Sync with Recursive Redaction
// ============================================================================

suite.test('T4-05: Scenario 5 - Google Drive Cloud Sync with Recursive Credential Redaction & Audit Log', async (assert) => {
  const clinicId = 'c-gd-audit';

  // Seed clinic data including third-party payment secret credentials
  await env.putRecord('clinic_profile', {
    id: clinicId,
    name: 'Bhaktapur Care Polyclinic',
    payment_secret_key: 'live_esewa_secret_should_never_leak',
    payment_api_key: 'live_esewa_api_key_confidential',
    contact_email: 'admin@bhaktapurcare.com'
  });
  await env.putRecord('doctors', {
    id: 'd-1',
    clinic_id: clinicId,
    full_name: 'Dr. Niranjan Shrestha'
  });
  await env.putRecord('invoices', {
    id: 'i-1',
    clinic_id: clinicId,
    total_amount: 1200,
    payment_credentials: {
      gateway_token: 'tok_private_super_secret',
      provider: 'esewa'
    }
  });

  // Mock Google Drive API v3 REST Client
  let capturedPayload = null;
  const mockDriveClient = {
    upload: async (metadata, body) => {
      capturedPayload = { metadata, body };
      return {
        fileId: 'gd-file-backup-001',
        webViewLink: 'https://drive.google.com/file/d/gd-file-backup-001/view?usp=drivesdk',
        sha256: 'mock-hash'
      };
    }
  };

  // 1-Click Sync to Google Drive
  const result = await env.ClinicBackupService.syncBackupToGoogleDrive(clinicId, env.globalIndexedDB, mockDriveClient);

  assert.equal(result.fileId, 'gd-file-backup-001', 'Drive fileId returned');
  assert.includes(result.webViewLink, 'https://drive.google.com/file/d/gd-file-backup-001', 'Valid webViewLink returned');

  // Verify that NO private secrets were transmitted in the HTTP request body
  assert.ok(capturedPayload, 'Google Drive upload must be invoked');
  assert.doesNotMatch(capturedPayload.body, /live_esewa_secret_should_never_leak/, 'Raw payment secret must NOT be in body');
  assert.doesNotMatch(capturedPayload.body, /live_esewa_api_key_confidential/, 'Raw payment api key must NOT be in body');
  assert.doesNotMatch(capturedPayload.body, /tok_private_super_secret/, 'Nested gateway token must NOT be in body');
  assert.includes(capturedPayload.body, '[REDACTED]', '[REDACTED] placeholder must be present');
  assert.includes(capturedPayload.body, 'Bhaktapur Care Polyclinic', 'Non-sensitive clinic name preserved');
});

// ============================================================================
// SCENARIO 6: Tracking Code Typo Detection & Search Resilience
// ============================================================================

suite.test('T4-06: Scenario 6 - Tracking Code Typo Detection & Patient Search Resilience', async (assert) => {
  const clinicId = 'c-search-resilience';
  const testDate = new Date('2026-10-23T11:00:00Z');

  // Generate 20 distinct patient records with 10-digit tracking codes
  const patientDirectory = [];
  for (let i = 1; i <= 20; i++) {
    const code = env.TrackingCodeGenerator.generateTrackingCode(10, testDate);
    const patientRecord = {
      id: `pt-${i}`,
      clinic_id: clinicId,
      tracking_code_10_digit: code,
      patient_name: `Patient Record #${i}`,
      mobile: `98412345${String(i).padStart(2, '0')}`
    };
    await env.putRecord('appointments', patientRecord);
    patientDirectory.push(patientRecord);
  }

  // Receptionist searches for patient using tracking code
  const searchByTrackingCode = async (searchQuery) => {
    // 1. Immediate client-side validation
    if (!env.TrackingCodeGenerator.validateTrackingCode(searchQuery)) {
      return { found: null, error: 'Invalid tracking code checksum or format. Please check digits.' };
    }
    // 2. Query IndexedDB index
    const appts = await env.getStore('appointments');
    const matched = appts.find((a) => a.tracking_code_10_digit === searchQuery);
    return { found: matched || null, error: null };
  };

  // Test 1: Search with valid tracking code resolves patient
  const targetPatient = patientDirectory[5];
  const validSearchResult = await searchByTrackingCode(targetPatient.tracking_code_10_digit);
  assert.equal(validSearchResult.error, null, 'Valid code produces no validation error');
  assert.ok(validSearchResult.found, 'Patient must be found');
  assert.equal(validSearchResult.found.patient_name, targetPatient.patient_name, 'Patient name matches');

  // Test 2: Receptionist makes single-digit typo (e.g. typing 7 instead of 3)
  const validCode = targetPatient.tracking_code_10_digit;
  const originalLastDigit = validCode[9];
  const typoDigit = (parseInt(originalLastDigit, 10) + 1) % 10;
  const singleDigitTypoCode = validCode.slice(0, 9) + typoDigit;

  const typoSearchResult = await searchByTrackingCode(singleDigitTypoCode);
  assert.equal(typoSearchResult.found, null, 'Typo code must not resolve patient');
  assert.includes(typoSearchResult.error, 'Invalid tracking code', 'Client-side error warning returned immediately');

  // Test 3: Receptionist transposes two adjacent digits (e.g. 52 -> 25)
  let transposedCode = null;
  for (let i = 0; i < 9; i++) {
    if (validCode[i] !== validCode[i + 1]) {
      const arr = validCode.split('');
      const tmp = arr[i];
      arr[i] = arr[i + 1];
      arr[i + 1] = tmp;
      transposedCode = arr.join('');
      break;
    }
  }

  if (transposedCode) {
    const transpositionResult = await searchByTrackingCode(transposedCode);
    assert.equal(transpositionResult.found, null, 'Transposed code must not resolve patient');
    assert.includes(transpositionResult.error, 'Invalid tracking code', 'Transposition caught by Luhn validator');
  }
});

module.exports = suite;
