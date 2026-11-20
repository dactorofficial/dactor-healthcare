/**
 * Tier 4: Real-World Clinical Application Scenarios (12 Tests)
 * Multi-role end-to-end clinical workflow simulations.
 * Reference: Explorer 3 Handoff & PROJECT.md
 */

const { assert } = require('./test_runner.cjs');
const {
  CONTRACTS,
  isValidUUID,
  generateUUID,
  sanitizeQueueEntry,
  assertNoPIIExposed,
  assertZeroMapDeepLink,
  calculateSlotCapacity,
  getNepalDateString,
  detectMidnightRollover,
  CooldownManager,
  SecurityRateLimiter,
  DoctorLiveQueueBackendSimulator,
  validateWebParityContract
} = require('./contracts.cjs');

function registerTier4Tests(harness) {
  function createPopulatedHarness() {
    const sim = new DoctorLiveQueueBackendSimulator();
    const clinic1Id = '11111111-c111-4000-8000-000000000001';
    const clinic2Id = '11111111-c222-4000-8000-000000000002';
    const doctor1Id = '22222222-d111-4000-8000-000000000001';
    const doctor2Id = '22222222-d222-4000-8000-000000000002';

    sim.seedClinic({ id: clinic1Id, name: 'Kathmandu Central Clinic' });
    sim.seedClinic({ id: clinic2Id, name: 'Patan Branch Clinic' });
    sim.seedDoctor({ id: doctor1Id, clinic_id: clinic1Id, full_name: 'Dr. Aarav Sharma' });
    sim.seedDoctor({ id: doctor2Id, clinic_id: clinic1Id, full_name: 'Dr. Sunita KC' });

    return { sim, clinic1Id, clinic2Id, doctor1Id, doctor2Id };
  }

  // S1: Morning Clinic Opening & First Consultation Lifecycle
  harness.test('E2E-T4-SCEN-01: Morning Clinic Boot & First Consultation Lifecycle', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // 1. Receptionist opens clinic
    sim.seedClinic({ id: clinic1Id, is_open: true });

    // 2. Doctor logs in with 3 pre-booked appointments
    const p1UserId = generateUUID();
    const appt1 = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Suman KC', user_id: p1UserId });
    const appt2 = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Maya Thapa' });
    const appt3 = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Prakash Rana' });

    const e1 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt1.id, token_number: 1, queue_position: 1, status: 'waiting', appointment_date: today });
    const e2 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt2.id, token_number: 2, queue_position: 2, status: 'waiting', appointment_date: today });
    const e3 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt3.id, token_number: 3, queue_position: 3, status: 'waiting', appointment_date: today });

    sim.seedFcmToken(p1UserId, 'fcm-p1-token');

    // 3. Initial stats check
    let stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(stats.inConsultation, 0);
    assert.equal(stats.waitingInLobby, 3);
    assert.equal(stats.completedToday, 0);

    // 4. Call Inside on Patient 1
    const notif = sim.sendDoctorNotification({ appointmentId: appt1.id, doctorId: doctor1Id, alertType: 'turn_call' });
    assert.equal(notif.success, true);
    assertZeroMapDeepLink(notif.fcm_payload, `queue_status/${appt1.id}`);

    const transitionRes = sim.transitionQueueEntryStatus({
      entryId: e1.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });
    assert.equal(transitionRes.success, true);

    // 5. Verify stats mid-consultation
    stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(stats.inConsultation, 1);
    assert.equal(stats.waitingInLobby, 2);
    assert.equal(stats.completedToday, 0);

    // 6. Complete consultation
    const doneRes = sim.transitionQueueEntryStatus({
      entryId: e1.id,
      expectedStatus: 'inside',
      newStatus: 'done',
      actorType: 'doctor',
      actorId: doctor1Id
    });
    assert.equal(doneRes.success, true);

    // 7. Final stats
    stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(stats.inConsultation, 0);
    assert.equal(stats.waitingInLobby, 2);
    assert.equal(stats.completedToday, 1);
  });

  // S2: Walk-In Patient Reception & Instant Doctor Board Synchronisation
  harness.test('E2E-T4-SCEN-02: Walk-In Patient Reception & Instant Doctor Board Synchronisation', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // D1 has 2 patients, D2 has 1 patient
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, token_number: 1, queue_position: 1 });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, token_number: 2, queue_position: 2 });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today, token_number: 1, queue_position: 1 });

    // Receptionist registers walk-in under Doctor 1
    const walkinAppt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      patient_name: 'Ram Bahadur',
      user_id: null,
      is_walkin: true,
      appointment_date: today
    });
    const walkinEntry = sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_id: walkinAppt.id,
      patient_name: 'Ram Bahadur',
      token_number: 3,
      queue_position: 3,
      user_id: null,
      is_walkin: true,
      appointment_date: today
    });

    // Inspect Doctor 1 board
    const d1Queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(d1Queue.length, 3);
    const lastRow = d1Queue[2];
    assert.equal(lastRow.patient_name, 'Ram Bahadur');
    assert.equal(lastRow.has_app_account, false);
    assert.equal(lastRow.is_walkin, true);

    // Inspect Doctor 2 board
    const d2Queue = sim.getDoctorLiveQueue({ doctorId: doctor2Id, clinicId: clinic1Id, date: today });
    assert.equal(d2Queue.length, 1, 'Doctor 2 must remain completely unaffected');
  });

  // S3: Scheduled Doctor Break Multi-Platform Broadcast & Resumption
  harness.test('E2E-T4-SCEN-03: Scheduled Doctor Break Multi-Platform Broadcast & Resumption', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    const syncStates = [];
    channel.subscribe((evt, payload) => {
      if (evt === 'clinic_break_updated') syncStates.push(payload.is_on_break);
    });

    // Toggle Break ON
    sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: true });
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, true);

    // Toggle Break OFF
    sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: false });
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, false);

    assert.deepEqual(syncStates, [true, false]);
  });

  // S4: Concurrent Doctor vs. Receptionist Conflict Resolution & Optimistic Rollback
  harness.test('E2E-T4-SCEN-04: Concurrent Doctor vs. Receptionist Conflict Resolution & Optimistic Rollback', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    // T0: Receptionist marks skipped
    sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'skipped',
      actorType: 'receptionist',
      actorId: generateUUID()
    });

    // T0 + 40ms: Doctor clicks Call Inside
    const doctorCallRes = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(doctorCallRes.success, false);
    assert.equal(doctorCallRes.error, 'CONFLICT');
    assert.equal(doctorCallRes.message, 'This entry was just updated');
    assert.equal(doctorCallRes.current_status, 'skipped');
  });

  // S5: Pay-at-Desk Verification Quarantine & Instant Admission
  harness.test('E2E-T4-SCEN-05: Pay-at-Desk Verification Quarantine & Instant Admission', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // Patient books Pay at Desk
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_date: today,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      payment_status: 'pending'
    });
    sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_id: appt.id,
      appointment_date: today,
      payment_mode: 'PAY_AT_DESK',
      payment_status: 'pending'
    });

    // 1. Quarantined
    let q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(q.length, 0);

    // 2. Cash collected at desk -> Approved
    appt.status = 'APPROVED';
    appt.payment_status = 'paid';

    // 3. Admitted
    q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(q.length, 1);
    assert.equal(q[0].payment_mode, 'PAY_AT_DESK');
  });

  // S6: Patient Calling via Push Alert & Zero-Map Live Queue Status Tracking
  harness.test('E2E-T4-SCEN-06: Patient Calling via Push Alert & Zero-Map Live Queue Status Tracking', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      user_id: userId,
      patient_name: 'Anupa Bista'
    });
    sim.seedFcmToken(userId, 'fcm-device-anupa');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting', token_number: 5 });

    const notif = sim.sendDoctorNotification({
      appointmentId: appt.id,
      doctorId: doctor1Id,
      alertType: 'turn_call'
    });

    assert.equal(notif.success, true);
    assertZeroMapDeepLink(notif.fcm_payload, `queue_status/${appt.id}`, {
      title: 'QueueStatusScreen',
      token: 5,
      cabin: 'Cabin 2'
    });
  });

  // S7: Unlinked Walk-In Patient Guard & Safe UI Fallback
  harness.test('E2E-T4-SCEN-07: Unlinked Walk-In Patient Guard & Safe UI Fallback', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      user_id: null,
      is_walkin: true
    });
    const entry = sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_id: appt.id,
      is_walkin: true,
      user_id: null
    });

    const card = sanitizeQueueEntry(entry);
    assert.equal(card.has_app_account, false);

    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: appt.id, doctorId: doctor1Id, alertType: 'turn_call' });
    }, /UNREGISTERED_PATIENT/);

    // Other actions (e.g. start consultation) still work 100%
    const transition = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });
    assert.equal(transition.success, true);
  });

  // S8: Anti-Spam Notification Cooldown & Rate Limiting Enforcement
  harness.test('E2E-T4-SCEN-08: Anti-Spam Notification Cooldown & Rate Limiting Enforcement', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: userId });
    sim.seedFcmToken(userId, 'tok-dev');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting' });

    const t0 = 100000;
    // 1st alert: succeeds
    const res1 = sim.sendDoctorNotification({ appointmentId: appt.id, doctorId: doctor1Id, alertType: 'turn_call', currentTimeMs: t0 });
    assert.equal(res1.success, true);

    // Rapid second click at t0 + 2000ms: blocked by cooldown
    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: appt.id, doctorId: doctor1Id, alertType: 'turn_call', currentTimeMs: t0 + 2000 });
    }, /Cooldown active/);

    // Rate limiter across multiple appointments
    for (let i = 2; i <= 15; i++) {
      const u = generateUUID();
      const a = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: u });
      sim.seedFcmToken(u, `tok-${i}`);
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: a.id, status: 'waiting' });
      sim.sendDoctorNotification({ appointmentId: a.id, doctorId: doctor1Id, alertType: 'turn_call', currentTimeMs: t0 + i * 1000 });
    }

    // 16th alert hit within 5 minutes: rate limit exceeded
    const u16 = generateUUID();
    const a16 = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: u16 });
    sim.seedFcmToken(u16, 'tok-16');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: a16.id, status: 'waiting' });

    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: a16.id, doctorId: doctor1Id, alertType: 'turn_call', currentTimeMs: t0 + 20000 });
    }, /Rate limit reached/);
  });

  // S9: Overbooked Session Capacity Handling (13/12 Slots) Without Degradation
  harness.test('E2E-T4-SCEN-09: Overloaded Slot Session Handling (13/12 Ratio)', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    for (let i = 1; i <= 13; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, token_number: i, queue_position: i });
    }

    const queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(queue.length, 13);

    const cap = calculateSlotCapacity(queue.length, 12);
    assert.equal(cap.ratio, '13/12');
    assert.equal(cap.isOverloaded, true);
    assert.equal(cap.overflowCount, 1);
  });

  // S10: Midnight Rollover & Daily Statistics Reset
  harness.test('E2E-T4-SCEN-10: Midnight Rollover & Daily Statistics Reset', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const day1 = '2026-11-18';
    const day2 = '2026-11-19';

    // Day 1: 1 inside, 2 completed
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: day1, status: 'inside' });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: day1, status: 'done' });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: day1, status: 'done' });

    // Clock crosses midnight
    assert.equal(detectMidnightRollover(day1, day2), true);

    // Day 2 stats: clean slate
    const day2Stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: day2 });
    assert.equal(day2Stats.completedToday, 0);
    assert.equal(day2Stats.inConsultation, 0);
  });

  // S11: Multi-Doctor Independent Parallel Consultations
  harness.test('E2E-T4-SCEN-11: Multi-Doctor Independent Parallel Consultations', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    const eA = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, token_number: 1, status: 'waiting' });
    const eB = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today, token_number: 1, status: 'waiting' });

    // Dr. A calls inside
    sim.transitionQueueEntryStatus({
      entryId: eA.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    // Dr. B calls inside
    sim.transitionQueueEntryStatus({
      entryId: eB.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor2Id
    });

    const statsA = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    const statsB = sim.computeStatBoxes({ doctorId: doctor2Id, clinicId: clinic1Id, date: today });

    assert.equal(statsA.inConsultation, 1);
    assert.equal(statsB.inConsultation, 1);
    assert.equal(sim.queueEntries.get(eA.id).updated_by_actor_id, doctor1Id);
    assert.equal(sim.queueEntries.get(eB.id).updated_by_actor_id, doctor2Id);
  });

  // S12: Cross-Platform Live Realtime Parity Sync
  harness.test('E2E-T4-SCEN-12: Cross-Platform Live Realtime Parity Sync', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    let webAppReceivedStatus = null;
    channel.subscribe((evt, payload) => {
      if (evt === 'UPDATE') {
        webAppReceivedStatus = payload.record.status;
      }
    });

    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    // Tablet starts consultation
    sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(webAppReceivedStatus, 'inside');
    const parity = validateWebParityContract();
    assert.equal(parity.isParityCompliant, true);
  });
}

module.exports = {
  registerTier4Tests
};
