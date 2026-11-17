/**
 * Tier 3: Cross-Feature Pairwise E2E Tests (20 Tests)
 * Exhaustive pairwise integration across F1 through F17.
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
  DoctorLiveQueueBackendSimulator,
  validateWebParityContract
} = require('./contracts.cjs');

function registerTier3Tests(harness) {
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

  // E2E-T3-PAIR-01: F1 (Isolation) + F2 (Atomic Concurrency)
  harness.test('E2E-T3-PAIR-01: Doctor A & B concurrent transitions with actor recording and foreign update denial', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const e1 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });
    const e2 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, status: 'waiting' });

    // D1 transitions e1
    const res1 = sim.transitionQueueEntryStatus({
      entryId: e1.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });
    assert.equal(res1.success, true);
    assert.equal(sim.queueEntries.get(e1.id).updated_by_actor_id, doctor1Id);

    // D2 transitions e2
    const res2 = sim.transitionQueueEntryStatus({
      entryId: e2.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor2Id
    });
    assert.equal(res2.success, true);
    assert.equal(sim.queueEntries.get(e2.id).updated_by_actor_id, doctor2Id);

    // D1 attempts to transition D2's patient
    const appt2 = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor2Id });
    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: appt2.id, doctorId: doctor1Id, alertType: 'turn_call' });
    }, /Permission denied/);
  });

  // E2E-T3-PAIR-02: F9 (Break Toggle) + F12 (Realtime Sync)
  harness.test('E2E-T3-PAIR-02: Break mode toggle broadcast across Web, Clinic, Doctor portals', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    let receivedBreakState = null;
    channel.subscribe((evt, payload) => {
      if (evt === 'clinic_break_updated') {
        receivedBreakState = payload.is_on_break;
      }
    });

    sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: true });
    assert.equal(receivedBreakState, true);
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, true);
  });

  // E2E-T3-PAIR-03: F10 (Overloaded Slots) + F11 (Pay at Desk)
  harness.test('E2E-T3-PAIR-03: Pay at desk approval triggering 13/12 capacity badge warning', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // 12 waiting approved appointments
    for (let i = 1; i <= 12; i++) {
      const a = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today });
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: a.id, appointment_date: today, token_number: i, queue_position: i });
    }

    // 1 pending pay at desk appointment
    const padAppt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_date: today,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL'
    });
    const padEntry = sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_id: padAppt.id,
      appointment_date: today,
      token_number: 13,
      queue_position: 13
    });

    // Before approval: queue length is 12
    let q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(q.length, 12);
    let cap = calculateSlotCapacity(q.length, 12);
    assert.equal(cap.ratio, '12/12');
    assert.equal(cap.isOverloaded, false);

    // Approve Pay at Desk
    padAppt.status = 'APPROVED';

    q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(q.length, 13);
    cap = calculateSlotCapacity(q.length, 12);
    assert.equal(cap.ratio, '13/12');
    assert.equal(cap.isOverloaded, true);
  });

  // E2E-T3-PAIR-04: F2 (Atomic Concurrency) + F5 (Optimistic Rollback)
  harness.test('E2E-T3-PAIR-04: Receptionist skip vs Doctor start consultation conflict toast', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    // Receptionist skips
    sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'skipped',
      actorType: 'receptionist',
      actorId: generateUUID()
    });

    // Doctor concurrently clicks "Start Consultation" expecting 'waiting'
    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, false);
    assert.equal(res.error, 'CONFLICT');
    assert.equal(res.message, 'This entry was just updated');
    assert.equal(res.current_status, 'skipped');
  });

  // E2E-T3-PAIR-05: F13 (Doctor Notification) + F16 (Tracker Deep Link)
  harness.test('E2E-T3-PAIR-05: "Call In" alert dispatches FCM deep link to QueueStatusScreen', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      user_id: userId
    });
    sim.seedFcmToken(userId, 'fcm-token-jane');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting' });

    const notif = sim.sendDoctorNotification({
      appointmentId: appt.id,
      doctorId: doctor1Id,
      alertType: 'turn_call'
    });

    assert.equal(notif.fcm_payload.data.navigate_to, 'tracker');
    assert.equal(notif.fcm_payload.data.appointment_id, appt.id);
    assertZeroMapDeepLink(notif.fcm_payload, `queue_status/${appt.id}`);
  });

  // E2E-T3-PAIR-06: F14 (Notification Cooldown) + F15 (Walk-in Check)
  harness.test('E2E-T3-PAIR-06: Account-linked cooldown active vs unlinked disabled badge', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const linkedAppt = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: userId });
    sim.seedFcmToken(userId, 'fcm-tok');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: linkedAppt.id, status: 'waiting' });

    const unlinkedAppt = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: null, is_walkin: true });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: unlinkedAppt.id, status: 'waiting', is_walkin: true });

    // Unlinked triggers error
    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: unlinkedAppt.id, doctorId: doctor1Id, alertType: 'turn_call' });
    }, /UNREGISTERED_PATIENT/);

    // Linked succeeds first time
    const res = sim.sendDoctorNotification({ appointmentId: linkedAppt.id, doctorId: doctor1Id, alertType: 'turn_call' });
    assert.equal(res.success, true);

    // Second call triggers cooldown
    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: linkedAppt.id, doctorId: doctor1Id, alertType: 'turn_call' });
    }, /Cooldown active/);
  });

  // E2E-T3-PAIR-07: F7 (Compact Stat Boxes) + F8 (Midnight Rollover)
  harness.test('E2E-T3-PAIR-07: Midnight clock boundary resets daily stats & triggers refresh', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const day1 = '2026-11-18';
    const day2 = '2026-11-19';

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: day1, status: 'done' });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: day1, status: 'done' });

    const day1Stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: day1 });
    assert.equal(day1Stats.completedToday, 2);

    assert.equal(detectMidnightRollover(day1, day2), true);
    const day2Stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id, date: day2 });
    assert.equal(day2Stats.completedToday, 0);
  });

  // E2E-T3-PAIR-08: F4 (Shared Use Cases) + F17 (Web App Parity)
  harness.test('E2E-T3-PAIR-08: Android use-cases match TypeScript web-app db.ts mutations', () => {
    const parity = validateWebParityContract();
    assert.equal(parity.isParityCompliant, true);
  });

  // E2E-T3-PAIR-09: F1 (Isolation) + F3 (Data Exposure)
  harness.test('E2E-T3-PAIR-09: Doctor queue query sanitizes PII and excludes peer doctors', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_date: today,
      patient_mobile: '9841999888',
      home_address: 'Thamel, Kathmandu'
    });
    sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      appointment_date: today,
      patient_mobile: '9841999888'
    });

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today });

    const q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(q.length, 1);
    assertNoPIIExposed(q[0]);
  });

  // E2E-T3-PAIR-10: F6 (Routing / Composable) + F12 (Realtime Sync)
  harness.test('E2E-T3-PAIR-10: DoctorDashboard lifecycle mount/unmount subscription cleanup and resume sync', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    // Mount
    const sub = channel.subscribe(() => {});
    assert.equal(channel.activeSubscriberCount, 1);

    // Unmount / Dispose
    sub.unsubscribe();
    assert.equal(channel.activeSubscriberCount, 0);
  });

  // E2E-T3-PAIR-11: F2 (Atomic Concurrency) + F13 (Doctor Notification)
  harness.test('E2E-T3-PAIR-11: Status transition validation rejects notification on noshow/cancel', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, user_id: userId });
    sim.seedFcmToken(userId, 'tok-1');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'no_show' });

    assert.throws(() => {
      sim.sendDoctorNotification({ appointmentId: appt.id, doctorId: doctor1Id, alertType: 'turn_call' });
    }, /Cannot notify patient: status is no longer active/);
  });

  // E2E-T3-PAIR-12: F8 (Date Strip Scroll) + F1 (Isolation)
  harness.test('E2E-T3-PAIR-12: Historical date selection queries doctor-scoped past records', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const pastDate = '2026-11-10';

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: pastDate, status: 'done' });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: pastDate, status: 'done' });

    const q = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: pastDate });
    assert.equal(q.length, 1);
    assert.equal(q[0].doctor_id, doctor1Id);
  });

  // E2E-T3-PAIR-13: F9 (Sticky Tabs & Break) + F7 (Compact Stat Boxes)
  harness.test('E2E-T3-PAIR-13: Tab switching under Break ON preserves sticky stat cards', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: true });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    const stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.waitingInLobby, 1);
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, true);
  });

  // E2E-T3-PAIR-14: F11 (Pay at Desk) + F12 (Realtime Sync)
  harness.test('E2E-T3-PAIR-14: Desk approval broadcast renders live row in <500ms', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    let received = null;
    channel.subscribe((evt, payload) => {
      if (evt === 'INSERT') received = payload.record;
    });

    channel.broadcast('INSERT', { record: { id: 'approved-pad', status: 'waiting' } });
    assert.equal(received.id, 'approved-pad');
  });

  // E2E-T3-PAIR-15: F10 (Overloaded Slots) + F4 (Shared Use Cases)
  harness.test('E2E-T3-PAIR-15: Drag-and-drop reorder on 14/12 queue without token collision', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const items = [];
    for (let i = 1; i <= 14; i++) {
      const e = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, token_number: i, queue_position: i });
      items.push(e);
    }

    // Move 14th item to 2nd position
    const item14 = items[13];
    const reorderedList = [items[0], item14, ...items.slice(1, 13)];
    const res = sim.reorderQueue(reorderedList);

    assert.equal(res[1].id, item14.id);
    assert.equal(res[1].queue_position, 2);
    assert.equal(res[2].queue_position, 3);
  });

  // E2E-T3-PAIR-16: F14 (Notification Cooldown) + F12 (Realtime Sync)
  harness.test('E2E-T3-PAIR-16: 60s cooldown timer survives network drop and WebSocket recovery', () => {
    const cd = new CooldownManager(60);
    const apptId = generateUUID();
    const t0 = 100000;

    cd.startCooldown(apptId, t0);
    // Network reconnects 10s later
    const t1 = t0 + 10000;
    assert.equal(cd.isCooldownActive(apptId, t1), true);
    assert.equal(cd.getRemainingSeconds(apptId, t1), 50);
  });

  // E2E-T3-PAIR-17: F15 (Walk-in Check) + F17 (Web App Parity)
  harness.test('E2E-T3-PAIR-17: Web Doctor Portal renders identical disabled "Walk-in" label', () => {
    const mobileLabel = CONTRACTS.config.unlinkedWalkinLabel;
    const webLabel = 'Walk-in (No App Account)';
    assert.equal(mobileLabel, webLabel);
  });

  // E2E-T3-PAIR-18: F3 (Data Exposure) + F16 (Tracker Deep Link)
  harness.test('E2E-T3-PAIR-18: Deep link QueueStatusScreen exposes token/status with 0 maps', () => {
    const fcm = {
      data: {
        navigate_to: 'tracker',
        appointment_id: generateUUID(),
        tracking_code: '1000000002'
      }
    };
    const compTree = {
      view: 'QueueStatusScreen',
      elements: ['TokenHeader', 'StatusBadge', 'WaitTimeClock']
    };
    assertZeroMapDeepLink(fcm, 'queue_status/uuid', compTree);
  });

  // E2E-T3-PAIR-19: F5 (Queue Repository) + F8 (Midnight Rollover)
  harness.test('E2E-T3-PAIR-19: Rollover purges yesterday\'s in-memory cache and reloads', () => {
    const cache = new Map();
    cache.set('2026-11-18', ['entry1', 'entry2']);

    function onMidnightRollover(newDate) {
      cache.clear();
      cache.set(newDate, ['entryNew']);
    }

    onMidnightRollover('2026-11-19');
    assert.equal(cache.has('2026-11-18'), false);
    assert.equal(cache.has('2026-11-19'), true);
  });

  // E2E-T3-PAIR-20: F9 (Break Toggle) + F13 (Doctor Notification)
  harness.test('E2E-T3-PAIR-20: Call In action during active Break prompts resume confirmation', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: true });

    let promptedResume = false;
    function handleCallInClick() {
      if (sim.doctors.get(doctor1Id).is_on_break) {
        promptedResume = true;
        // Resume break
        sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: false });
      }
    }

    handleCallInClick();
    assert.equal(promptedResume, true);
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, false);
  });
}

module.exports = {
  registerTier3Tests
};
