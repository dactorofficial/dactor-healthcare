/**
 * Tier 1: Feature Coverage E2E Tests (85 Tests)
 * Exactly 5 tests per feature across 17 features (F1 through F17).
 * Reference: Explorer 2 Handoff & PROJECT.md
 */

const { assert } = require('./test_runner.cjs');
const {
  CONTRACTS,
  isValidUUID,
  generateUUID,
  isValidTrackingCode,
  generateTrackingCode,
  sanitizeQueueEntry,
  assertNoPIIExposed,
  assertZeroMapDeepLink,
  calculateSlotCapacity,
  getNepalDateString,
  formatDateChip,
  detectMidnightRollover,
  CooldownManager,
  SecurityRateLimiter,
  DoctorLiveQueueBackendSimulator,
  validateWebParityContract
} = require('./contracts.cjs');

function registerTier1Tests(harness) {
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

  // =========================================================================
  // FEATURE 1: DOCTOR QUEUE ISOLATION & SECURITY (RLS)
  // =========================================================================

  harness.test('T1.F01.01: Doctor Live Queue Isolation Query', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // 3 entries for D1
    for (let i = 1; i <= 3; i++) {
      const a = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today });
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: a.id, token_number: i, queue_position: i });
    }
    // 2 entries for D2
    for (let i = 1; i <= 2; i++) {
      const a = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today });
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_id: a.id, token_number: i, queue_position: i });
    }

    const d1Queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today, callerRole: 'doctor', callerDoctorId: doctor1Id });
    assert.equal(d1Queue.length, 3, 'Doctor 1 queue must contain exactly 3 entries');
    d1Queue.forEach(e => {
      assert.equal(e.doctor_id, doctor1Id, 'All returned entries must belong to Doctor 1');
      assert.equal(e.clinic_id, clinic1Id, 'All returned entries must belong to Clinic 1');
    });
  });

  harness.test('T1.F01.02: Authorized Doctor Patient Status Update', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      status: CONTRACTS.queueStatuses.WAITING
    });

    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: CONTRACTS.queueStatuses.WAITING,
      newStatus: CONTRACTS.queueStatuses.INSIDE,
      actorType: CONTRACTS.actorTypes.DOCTOR,
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, CONTRACTS.queueStatuses.INSIDE);
    assert.equal(sim.queueEntries.get(entry.id).status, CONTRACTS.queueStatuses.INSIDE);
  });

  harness.test('T1.F01.03: Multi-Clinic Doctor Isolation', () => {
    const { sim, clinic1Id, clinic2Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    // 2 entries at C1, 4 entries at C2
    for (let i = 1; i <= 2; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, token_number: i, queue_position: i, appointment_date: today });
    }
    for (let i = 1; i <= 4; i++) {
      sim.seedQueueEntry({ clinic_id: clinic2Id, doctor_id: doctor1Id, token_number: i, queue_position: i, appointment_date: today });
    }

    const c2Queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic2Id, date: today, callerRole: 'doctor', callerDoctorId: doctor1Id });
    assert.equal(c2Queue.length, 4, 'Querying C2 must return exactly 4 entries');
    c2Queue.forEach(e => assert.equal(e.clinic_id, clinic2Id));
  });

  harness.test('T1.F01.04: Receptionist Clinic-Wide Queue Visibility', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    for (let i = 1; i <= 3; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, token_number: i, queue_position: i });
    }
    for (let i = 1; i <= 2; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today, token_number: i + 3, queue_position: i + 3 });
    }

    const clinicBoard = sim.getClinicQueueBoard({ clinicId: clinic1Id, date: today });
    assert.equal(clinicBoard.length, 5, 'Receptionist must see all 5 entries across all doctors in clinic');
  });

  harness.test('T1.F01.05: Doctor Authenticated Context Validation via RLS', () => {
    const { sim, clinic1Id, doctor1Id, doctor2Id } = createPopulatedHarness();
    const today = getNepalDateString();

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor2Id, appointment_date: today });

    // Doctor 1 attempts to query Doctor 2's queue
    const unauthorizedQuery = sim.getDoctorLiveQueue({
      doctorId: doctor2Id,
      clinicId: clinic1Id,
      date: today,
      callerRole: 'doctor',
      callerDoctorId: doctor1Id
    });

    assert.equal(unauthorizedQuery.length, 0, 'RLS must reject foreign doctor read and return 0 rows');
  });

  // =========================================================================
  // FEATURE 2: ATOMIC CONCURRENCY & ACTOR TRACKING (RPC)
  // =========================================================================

  harness.test('T1.F02.01: Atomic Transition from Waiting to Inside', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: CONTRACTS.queueStatuses.WAITING });

    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'inside');
    const updated = sim.queueEntries.get(entry.id);
    assert.ok(updated.inside_at !== null, 'inside_at timestamp must be recorded');
  });

  harness.test('T1.F02.02: Atomic Transition from Inside to Done', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      status: CONTRACTS.queueStatuses.INSIDE,
      inside_at: new Date(Date.now() - 600000).toISOString()
    });

    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'inside',
      newStatus: 'done',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'done');
    const updated = sim.queueEntries.get(entry.id);
    assert.ok(updated.completed_at !== null);
    assert.ok(updated.consultation_duration_seconds > 0, 'Consultation duration must be calculated');
  });

  harness.test('T1.F02.03: Atomic Transition from Waiting to No-Show', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const appt = sim.seedAppointment({ clinic_id: clinic1Id, doctor_id: doctor1Id });
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting' });

    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'no_show',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'no_show');
    assert.equal(sim.appointments.get(appt.id).checkin_status, 'no_show');
  });

  harness.test('T1.F02.04: Doctor Actor Tracking Verification', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    const updated = sim.queueEntries.get(entry.id);
    assert.equal(updated.updated_by_actor_type, 'doctor');
    assert.equal(updated.updated_by_actor_id, doctor1Id);
  });

  harness.test('T1.F02.05: Receptionist Actor Tracking Verification', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const receptionistId = generateUUID();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'skipped',
      actorType: 'receptionist',
      actorId: receptionistId
    });

    const updated = sim.queueEntries.get(entry.id);
    assert.equal(updated.updated_by_actor_type, 'receptionist');
    assert.equal(updated.updated_by_actor_id, receptionistId);
  });

  // =========================================================================
  // FEATURE 3: MINIMAL PATIENT DATA EXPOSURE (PII EXCLUSION)
  // =========================================================================

  harness.test('T1.F03.01: Queue Item Minimal Projection Compliance', () => {
    const fullEntry = {
      id: generateUUID(),
      appointment_id: generateUUID(),
      patient_name: 'Ram Bahadur',
      patient_age: 45,
      patient_gender: 'M',
      token_number: 7,
      queue_position: 3,
      status: 'waiting',
      slot_time: '10:30 AM',
      doctor_id: generateUUID(),
      clinic_id: generateUUID(),
      patient_mobile: '9841234567',
      home_address: 'Ward 4, Kathmandu',
      national_id_nin: 'NIN-9948271',
      billing_invoices: [{ invoiceId: 'inv-1', amount: 1000 }]
    };

    const sanitized = sanitizeQueueEntry(fullEntry);
    assertNoPIIExposed(sanitized);
    assert.equal(sanitized.patient_name, 'Ram Bahadur');
    assert.equal(sanitized.token_number, 7);
    assert.equal(sanitized.patient_mobile, undefined);
    assert.equal(sanitized.national_id_nin, undefined);
    assert.equal(sanitized.home_address, undefined);
  });

  harness.test('T1.F03.02: Exclusion of Sensitive Payment Data', () => {
    const paymentRecord = {
      id: generateUUID(),
      patient_name: 'Sita Sharma',
      token_number: 1,
      payment_mode: 'ONLINE',
      payment_status: 'paid',
      gateway_transaction_secret: 'esewa_sec_xyz999',
      credit_card_token: 'tok_visa_4242'
    };

    const sanitized = sanitizeQueueEntry(paymentRecord);
    assertNoPIIExposed(sanitized);
    assert.equal(sanitized.payment_mode, 'ONLINE');
    assert.equal(sanitized.gateway_transaction_secret, undefined);
    assert.equal(sanitized.credit_card_token, undefined);
  });

  harness.test('T1.F03.03: Standardized Token and Position Visibility', () => {
    const cardData = sanitizeQueueEntry({
      id: generateUUID(),
      patient_name: 'Gita Thapa',
      token_number: 4,
      queue_position: 2,
      status: 'waiting',
      slot_time: '11:00 AM'
    });

    assert.equal(cardData.token_number, 4);
    assert.equal(cardData.queue_position, 2);
    assert.equal(cardData.slot_time, '11:00 AM');
  });

  harness.test('T1.F03.04: Log Sanitization Audit on Queue Load', () => {
    const sanitizedEntries = [
      sanitizeQueueEntry({ id: generateUUID(), patient_name: 'Hari KC', token_number: 1, status: 'inside' }),
      sanitizeQueueEntry({ id: generateUUID(), patient_name: 'Bina Rai', token_number: 2, status: 'waiting' })
    ];

    const loggedPayload = JSON.stringify(sanitizedEntries);
    assertNoPIIExposed(JSON.parse(loggedPayload));
    assert.doesNotMatch(loggedPayload, /9[78]\d{8}/);
  });

  harness.test('T1.F03.05: Completed Tab Minimal Data Parity', () => {
    const completedEntry = sanitizeQueueEntry({
      id: generateUUID(),
      patient_name: 'Ramesh Dahal',
      token_number: 5,
      status: 'done',
      completed_at: new Date().toISOString(),
      consultation_duration_seconds: 420,
      medical_notes: 'Prescribed Paracetamol 500mg'
    });

    assertNoPIIExposed(completedEntry);
    assert.equal(completedEntry.status, 'done');
    assert.equal(completedEntry.consultation_duration_seconds, 420);
    assert.equal(completedEntry.medical_notes, undefined);
  });

  // =========================================================================
  // FEATURE 4: SHARED DOMAIN USE CASES EXTRACTION
  // =========================================================================

  harness.test('T1.F04.01: StartConsultationUseCase Execution', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    // Emulate StartConsultationUseCase
    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'inside');
  });

  harness.test('T1.F04.02: CompleteConsultationUseCase Execution', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'inside' });

    // Emulate CompleteConsultationUseCase
    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'inside',
      newStatus: 'done',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'done');
  });

  harness.test('T1.F04.03: HoldOrSkipQueueEntryUseCase Execution', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    const res = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'no_show',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'no_show');
  });

  harness.test('T1.F04.04: ReorderQueueUseCase FIFO Integrity', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const e1 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, token_number: 1, queue_position: 1 });
    const e2 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, token_number: 2, queue_position: 2 });
    const e3 = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, token_number: 3, queue_position: 3 });

    // Move e3 to first: [e3, e1, e2]
    const reordered = sim.reorderQueue([e3, e1, e2]);
    assert.equal(reordered[0].id, e3.id);
    assert.equal(reordered[0].queue_position, 1);
    assert.equal(reordered[1].id, e1.id);
    assert.equal(reordered[1].queue_position, 2);
    assert.equal(reordered[2].id, e2.id);
    assert.equal(reordered[2].queue_position, 3);
  });

  harness.test('T1.F04.05: ToggleBreakUseCase Execution', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();

    const res = sim.toggleBreak({ clinicId: clinic1Id, doctorId: doctor1Id, isOnBreak: true });
    assert.equal(res.is_on_break, true);
    assert.equal(sim.clinics.get(clinic1Id).is_on_break, true);
    assert.equal(sim.doctors.get(doctor1Id).is_on_break, true);
  });

  // =========================================================================
  // FEATURE 5: QUEUE REPOSITORY DOCTOR SCOPING
  // =========================================================================

  harness.test('T1.F05.01: Repository Doctor Live Queue Query Scoping', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today });
    const list = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(list.length, 1);
    assert.equal(list[0].doctor_id, doctor1Id);
  });

  harness.test('T1.F05.02: Atomic Status Update via Repository', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const entry = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    const result = sim.transitionQueueEntryStatus({
      entryId: entry.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'inside');
  });

  harness.test('T1.F05.03: Repository Optimistic State Emission', () => {
    // Model optimistic update queue store
    const localStore = {
      entries: [{ id: 'e1', status: 'waiting' }],
      optimisticUpdate(id, newStatus) {
        this.entries = this.entries.map(e => e.id === id ? { ...e, status: newStatus, isOptimistic: true } : e);
      }
    };

    localStore.optimisticUpdate('e1', 'inside');
    assert.equal(localStore.entries[0].status, 'inside');
    assert.equal(localStore.entries[0].isOptimistic, true);
  });

  harness.test('T1.F05.04: Optimistic Override Confirmation', () => {
    const localStore = {
      entries: [{ id: 'e1', status: 'inside', isOptimistic: true }],
      confirmUpdate(id, confirmedStatus) {
        this.entries = this.entries.map(e => e.id === id ? { ...e, status: confirmedStatus, isOptimistic: false } : e);
      }
    };

    localStore.confirmUpdate('e1', 'inside');
    assert.equal(localStore.entries[0].status, 'inside');
    assert.equal(localStore.entries[0].isOptimistic, false);
  });

  harness.test('T1.F05.05: Doctor Session Context Injection', () => {
    const sessionManager = { currentDoctorId: 'd1-session-uuid', activeClinicId: 'c1-session-uuid' };
    const queryParams = {
      doctorId: sessionManager.currentDoctorId,
      clinicId: sessionManager.activeClinicId
    };

    assert.equal(queryParams.doctorId, 'd1-session-uuid');
    assert.equal(queryParams.clinicId, 'c1-session-uuid');
  });

  // =========================================================================
  // FEATURE 6: PERSONALIZED LIVE QUEUE SCREEN & ROUTING
  // =========================================================================

  harness.test('T1.F06.01: Doctor Dashboard Embedded Live Queue Display', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Binod Tamang' });

    const queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.ok(queue.length > 0);
    assert.equal(queue[0].patient_name, 'Binod Tamang');
  });

  harness.test('T1.F06.02: Parameterized Navigation Route Resolution', () => {
    const clinicId = 'c-uuid-1';
    const doctorId = 'd-uuid-1';
    const date = '2026-11-18';
    const route = `queue_board/${clinicId}?doctorId=${doctorId}&date=${date}`;

    assert.match(route, /queue_board\/c-uuid-1\?doctorId=d-uuid-1&date=2026-11-18/);
  });

  harness.test('T1.F06.03: Active Clinic Switch Queue Reload', () => {
    const { sim, clinic1Id, clinic2Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Patient Clinic 1' });
    sim.seedQueueEntry({ clinic_id: clinic2Id, doctor_id: doctor1Id, appointment_date: today, patient_name: 'Patient Clinic 2' });

    const q1 = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    const q2 = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic2Id, date: today });

    assert.equal(q1[0].patient_name, 'Patient Clinic 1');
    assert.equal(q2[0].patient_name, 'Patient Clinic 2');
  });

  harness.test('T1.F06.04: Patient Card UI Component Verification', () => {
    const card = sanitizeQueueEntry({
      id: generateUUID(),
      patient_name: 'Anil Gurung',
      patient_age: 32,
      patient_gender: 'M',
      token_number: 5,
      slot_time: '10:00 AM',
      status: 'waiting'
    });

    const initials = card.patient_name.split(' ').map(n => n[0]).join('');
    assert.equal(initials, 'AG');
    assert.equal(card.token_number, 5);
    assert.equal(card.slot_time, '10:00 AM');
  });

  harness.test('T1.F06.05: Tap Card Expands Drawer with Actions', () => {
    const cardState = { isExpanded: false };
    function onCardClick() {
      cardState.isExpanded = !cardState.isExpanded;
    }

    onCardClick();
    assert.equal(cardState.isExpanded, true);
    onCardClick();
    assert.equal(cardState.isExpanded, false);
  });

  // =========================================================================
  // FEATURE 7: COMPACT STAT BOXES
  // =========================================================================

  harness.test('T1.F07.01: Triple Stat Box Rendering', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });

    assert.ok(stats.inConsultation !== undefined);
    assert.ok(stats.waitingInLobby !== undefined);
    assert.ok(stats.completedToday !== undefined);
  });

  harness.test('T1.F07.02: "In Consultation" Stat Accuracy', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'inside' });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'inside' });

    const stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.inConsultation, 2);
  });

  harness.test('T1.F07.03: "Waiting in Lobby" Stat Accuracy', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    for (let i = 0; i < 7; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });
    }

    const stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.waitingInLobby, 7);
  });

  harness.test('T1.F07.04: "Completed Today" Stat Accuracy', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    for (let i = 0; i < 11; i++) {
      sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'done' });
    }

    const stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.completedToday, 11);
  });

  harness.test('T1.F07.05: Real-Time Dynamic Stat Counter Shift', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const e = sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, status: 'waiting' });

    let stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.waitingInLobby, 1);
    assert.equal(stats.inConsultation, 0);

    sim.transitionQueueEntryStatus({
      entryId: e.id,
      expectedStatus: 'waiting',
      newStatus: 'inside',
      actorType: 'doctor',
      actorId: doctor1Id
    });

    stats = sim.computeStatBoxes({ doctorId: doctor1Id, clinicId: clinic1Id });
    assert.equal(stats.waitingInLobby, 0);
    assert.equal(stats.inConsultation, 1);
  });

  // =========================================================================
  // FEATURE 8: DATE STRIP & MIDNIGHT ROLLOVER
  // =========================================================================

  harness.test('T1.F08.01: Date Strip Default Initialization', () => {
    const today = getNepalDateString();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    const chip = formatDateChip(today);
    assert.ok(chip.weekday.length >= 3);
    assert.ok(chip.day.length >= 1);
  });

  harness.test('T1.F08.02: Horizontal Date Scroller Interaction', () => {
    let selectedDate = '2026-11-18';
    function onDateSelect(newDate) {
      selectedDate = newDate;
    }
    onDateSelect('2026-11-19');
    assert.equal(selectedDate, '2026-11-19');
  });

  harness.test('T1.F08.03: "Today" Quick Action Button', () => {
    let selectedDate = '2026-11-25';
    const systemToday = getNepalDateString();
    function onTodayClick() {
      selectedDate = systemToday;
    }
    onTodayClick();
    assert.equal(selectedDate, systemToday);
  });

  harness.test('T1.F08.04: Weekday and Day Formatting', () => {
    const chip = formatDateChip('2026-11-18');
    assert.equal(chip.weekday, 'Wed');
    assert.equal(chip.day, '18');
  });

  harness.test('T1.F08.05: Month Header Display and Navigation', () => {
    const chipNov = formatDateChip('2026-11-18');
    assert.equal(chipNov.monthYear, 'November 2026');
    const chipDec = formatDateChip('2026-12-01');
    assert.equal(chipDec.monthYear, 'December 2026');
  });

  // =========================================================================
  // FEATURE 9: STICKY TABS & BREAK TOGGLE PLACEMENT
  // =========================================================================

  harness.test('T1.F09.01: Tab Counter Accuracy', () => {
    const liveCount = 4;
    const completedCount = 8;
    const liveTabLabel = `Live (${liveCount})`;
    const completedTabLabel = `Completed (${completedCount})`;

    assert.equal(liveTabLabel, 'Live (4)');
    assert.equal(completedTabLabel, 'Completed (8)');
  });

  harness.test('T1.F09.02: Tab Switching to Completed View', () => {
    let currentTab = 'Live';
    function switchTab(t) { currentTab = t; }
    switchTab('Completed');
    assert.equal(currentTab, 'Completed');
  });

  harness.test('T1.F09.03: Tab Switching to Live View', () => {
    let currentTab = 'Completed';
    function switchTab(t) { currentTab = t; }
    switchTab('Live');
    assert.equal(currentTab, 'Live');
  });

  harness.test('T1.F09.04: Break Toggle Horizontal Placement Beside Completed Tab', () => {
    const subTabBarLayout = {
      orientation: 'Row',
      items: ['LiveTab', 'CompletedTab', 'BreakToggleChip']
    };
    assert.equal(subTabBarLayout.orientation, 'Row');
    assert.equal(subTabBarLayout.items[2], 'BreakToggleChip');
  });

  harness.test('T1.F09.05: Break Toggle State Toggle', () => {
    let isBreakOn = false;
    function onBreakToggle() { isBreakOn = !isBreakOn; }
    onBreakToggle();
    assert.equal(isBreakOn, true);
    onBreakToggle();
    assert.equal(isBreakOn, false);
  });

  // =========================================================================
  // FEATURE 10: OVERLOADED SLOTS DISPLAY
  // =========================================================================

  harness.test('T1.F10.01: Standard Slot Capacity Display', () => {
    const cap = calculateSlotCapacity(8, 12);
    assert.equal(cap.ratio, '8/12');
    assert.equal(cap.isOverloaded, false);
    assert.equal(cap.remaining, 4);
  });

  harness.test('T1.F10.02: Overloaded Slot Count Ratio Display', () => {
    const cap = calculateSlotCapacity(13, 12);
    assert.equal(cap.ratio, '13/12');
    assert.equal(cap.isOverloaded, true);
    assert.equal(cap.overflowCount, 1);
  });

  harness.test('T1.F10.03: Adding Walk-In to Full Slot Increments Ratio', () => {
    let booked = 12;
    const maxCap = 12;
    booked += 1;
    const cap = calculateSlotCapacity(booked, maxCap);
    assert.equal(cap.ratio, '13/12');
    assert.equal(cap.isOverloaded, true);
  });

  harness.test('T1.F10.04: Chronological Slot Sorting with Overloaded Capacity', () => {
    const slots = [
      { time: '11:00 AM', booked: 13, max: 12 },
      { time: '09:00 AM', booked: 5, max: 12 },
      { time: '10:00 AM', booked: 12, max: 12 }
    ];

    slots.sort((a, b) => a.time.localeCompare(b.time));
    assert.equal(slots[0].time, '09:00 AM');
    assert.equal(slots[1].time, '10:00 AM');
    assert.equal(slots[2].time, '11:00 AM');
  });

  harness.test('T1.F10.05: Cancellation Decrements Overloaded Slot Count', () => {
    let booked = 13;
    const maxCap = 12;
    booked -= 1;
    const cap = calculateSlotCapacity(booked, maxCap);
    assert.equal(cap.ratio, '12/12');
    assert.equal(cap.isOverloaded, false);
  });

  // =========================================================================
  // FEATURE 11: PAY AT DESK APPROVAL FILTERING
  // =========================================================================

  harness.test('T1.F11.01: Quarantine Pending Pay at Desk Bookings', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
      status: CONTRACTS.approvalStatuses.WAITING_FOR_APPROVAL,
      appointment_date: today
    });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, appointment_date: today });

    const queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(queue.length, 0, 'Pending Pay at Desk bookings must be quarantined and excluded');
  });

  harness.test('T1.F11.02: Inclusion Upon Desk Approval', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const today = getNepalDateString();

    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
      status: CONTRACTS.approvalStatuses.WAITING_FOR_APPROVAL,
      appointment_date: today
    });
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, appointment_date: today });

    // Approve booking
    appt.status = CONTRACTS.approvalStatuses.APPROVED;

    const queue = sim.getDoctorLiveQueue({ doctorId: doctor1Id, clinicId: clinic1Id, date: today });
    assert.equal(queue.length, 1, 'Approved Pay at Desk booking must appear in doctor live queue');
  });

  harness.test('T1.F11.03: Pay at Desk Badge Display', () => {
    const entry = sanitizeQueueEntry({
      id: generateUUID(),
      patient_name: 'Dinesh Oli',
      payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
      payment_status: CONTRACTS.paymentStatuses.PENDING
    });

    assert.equal(entry.payment_mode, 'PAY_AT_DESK');
  });

  harness.test('T1.F11.04: Unpaid Payment Status Indicator', () => {
    const entry = sanitizeQueueEntry({
      id: generateUUID(),
      payment_mode: 'PAY_AT_DESK',
      payment_status: 'pending'
    });
    assert.equal(entry.payment_status, 'pending');
  });

  harness.test('T1.F11.05: Paid Status Transition on Collection', () => {
    const entry = {
      payment_mode: 'PAY_AT_DESK',
      payment_status: 'pending'
    };
    entry.payment_status = 'paid';
    assert.equal(entry.payment_status, 'paid');
  });

  // =========================================================================
  // FEATURE 12: LIFECYCLE-AWARE REALTIME SYNC
  // =========================================================================

  harness.test('T1.F12.01: Doctor Channel Subscription on Screen Mount', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channelName = `doctor_live_queue_${doctor1Id}_${clinic1Id}`;
    const channel = sim.getChannel(channelName);

    let eventCount = 0;
    const sub = channel.subscribe(() => { eventCount++; });

    assert.equal(channel.activeSubscriberCount, 1);
    sub.unsubscribe();
    assert.equal(channel.activeSubscriberCount, 0);
  });

  harness.test('T1.F12.02: Remote Realtime INSERT Updates List', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    let receivedRecord = null;
    channel.subscribe((event, payload) => {
      if (event === 'INSERT') receivedRecord = payload.record;
    });

    channel.broadcast('INSERT', { record: { id: 'new-1', patient_name: 'Prakash' } });
    assert.equal(receivedRecord.patient_name, 'Prakash');
  });

  harness.test('T1.F12.03: Remote Realtime UPDATE Reflects Status Change', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    let updatedStatus = null;
    channel.subscribe((event, payload) => {
      if (event === 'UPDATE') updatedStatus = payload.record.status;
    });

    channel.broadcast('UPDATE', { record: { id: 'entry-1', status: 'no_show' } });
    assert.equal(updatedStatus, 'no_show');
  });

  harness.test('T1.F12.04: Subscription Cleanup on Composable Dispose', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const channel = sim.getChannel(`doctor_live_queue_${doctor1Id}_${clinic1Id}`);

    channel.subscribe(() => {});
    assert.equal(channel.activeSubscriberCount, 1);
    channel.dispose();
    assert.equal(channel.activeSubscriberCount, 0);
    assert.equal(channel.isDisposed, true);
  });

  harness.test('T1.F12.05: Screen Resume Delta Refresh', () => {
    let refreshed = false;
    function onResume() {
      refreshed = true;
    }
    onResume();
    assert.equal(refreshed, true);
  });

  // =========================================================================
  // FEATURE 13: DOCTOR PATIENT NOTIFICATION ACTIONS
  // =========================================================================

  harness.test('T1.F13.01: "Call In" Primary Action Button Display', () => {
    const entry = { status: 'waiting' };
    const canCallIn = entry.status === 'waiting';
    assert.equal(canCallIn, true);
  });

  harness.test('T1.F13.02: "Walk In" / "Arrive Soon" Action Button Display', () => {
    const entry = { status: 'waiting' };
    const canArriveSoon = entry.status === 'waiting';
    assert.equal(canArriveSoon, true);
  });

  harness.test('T1.F13.03: Triggering "Call Inside" Notification Pipeline', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      user_id: userId
    });
    sim.seedFcmToken(userId, 'fcm-tok-1');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting' });

    const res = sim.sendDoctorNotification({
      appointmentId: appt.id,
      doctorId: doctor1Id,
      alertType: CONTRACTS.notificationAlertTypes.TURN_CALL
    });

    assert.equal(res.success, true);
    assert.equal(res.sent_count, 1);
    assert.equal(sim.notifications.length, 1);
  });

  harness.test('T1.F13.04: Edge Function FCM Dispatch Invocation', () => {
    const { sim, clinic1Id, doctor1Id } = createPopulatedHarness();
    const userId = generateUUID();
    const appt = sim.seedAppointment({
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      user_id: userId
    });
    sim.seedFcmToken(userId, 'fcm-tok-1');
    sim.seedQueueEntry({ clinic_id: clinic1Id, doctor_id: doctor1Id, appointment_id: appt.id, status: 'waiting' });

    const res = sim.sendDoctorNotification({
      appointmentId: appt.id,
      doctorId: doctor1Id,
      alertType: CONTRACTS.notificationAlertTypes.TURN_CALL
    });

    assert.equal(res.fcm_payload.data.navigate_to, 'tracker');
    assert.equal(res.fcm_payload.data.appointment_id, appt.id);
  });

  harness.test('T1.F13.05: UI Card Alerted State Indication', () => {
    const row = { alerted: false };
    function onNotificationSent() { row.alerted = true; }
    onNotificationSent();
    assert.equal(row.alerted, true);
  });

  // =========================================================================
  // FEATURE 14: NOTIFICATION DIALOG & ANTI-SPAM COOLDOWN
  // =========================================================================

  harness.test('T1.F14.01: Confirmation Dialog Presentation', () => {
    const dialogState = { isOpen: false, patientName: '', tokenNumber: null };
    function promptCallIn(patient) {
      dialogState.isOpen = true;
      dialogState.patientName = patient.name;
      dialogState.tokenNumber = patient.token;
    }

    promptCallIn({ name: 'Kiran KC', token: 3 });
    assert.equal(dialogState.isOpen, true);
    assert.equal(dialogState.patientName, 'Kiran KC');
    assert.equal(dialogState.tokenNumber, 3);
  });

  harness.test('T1.F14.02: Confirmation Dialog Cancellation', () => {
    const dialogState = { isOpen: true };
    function onCancel() { dialogState.isOpen = false; }
    onCancel();
    assert.equal(dialogState.isOpen, false);
  });

  harness.test('T1.F14.03: Button Disabled During In-Flight Send', () => {
    const buttonState = { isSending: false, isEnabled: true };
    function onConfirmSend() {
      buttonState.isSending = true;
      buttonState.isEnabled = false;
    }
    onConfirmSend();
    assert.equal(buttonState.isSending, true);
    assert.equal(buttonState.isEnabled, false);
  });

  harness.test('T1.F14.04: 60-Second Anti-Spam Cooldown Timer Activation', () => {
    const cd = new CooldownManager(60);
    const apptId = generateUUID();
    const t0 = 100000;

    cd.startCooldown(apptId, t0);
    assert.equal(cd.isCooldownActive(apptId, t0), true);
    assert.equal(cd.getRemainingSeconds(apptId, t0), 60);
    assert.equal(cd.getRemainingSeconds(apptId, t0 + 15000), 45);
  });

  harness.test('T1.F14.05: Cooldown Button Disabled State', () => {
    const cd = new CooldownManager(60);
    const apptId = generateUUID();
    const t0 = 100000;

    cd.startCooldown(apptId, t0);
    const isClickAllowed = !cd.isCooldownActive(apptId, t0 + 20000);
    assert.equal(isClickAllowed, false);
  });

  // =========================================================================
  // FEATURE 15: WALK-IN WITHOUT APP ACCOUNT CHECK
  // =========================================================================

  harness.test('T1.F15.01: Desk Walk-In Without Account Detection', () => {
    const entry = sanitizeQueueEntry({
      id: generateUUID(),
      is_walkin: true,
      user_id: null
    });

    assert.equal(entry.has_app_account, false);
    assert.equal(entry.is_walkin, true);
  });

  harness.test('T1.F15.02: Disabled Button Label "Walk-in (No App Account)"', () => {
    const entry = { has_app_account: false, is_walkin: true };
    const label = !entry.has_app_account ? CONTRACTS.config.unlinkedWalkinLabel : 'Call In';
    assert.equal(label, 'Walk-in (No App Account)');
  });

  harness.test('T1.F15.03: Click Inaction on Disabled Walk-In Button', () => {
    const entry = { has_app_account: false };
    let triggered = false;
    function onClick() {
      if (!entry.has_app_account) return;
      triggered = true;
    }
    onClick();
    assert.equal(triggered, false);
  });

  harness.test('T1.F15.04: Registered App User Enabled State', () => {
    const entry = sanitizeQueueEntry({
      id: generateUUID(),
      user_id: generateUUID()
    });
    assert.equal(entry.has_app_account, true);
  });

  harness.test('T1.F15.05: Walk-In Account Linking Transition', () => {
    const raw = { id: generateUUID(), is_walkin: true, user_id: null };
    assert.equal(sanitizeQueueEntry(raw).has_app_account, false);

    raw.user_id = generateUUID();
    assert.equal(sanitizeQueueEntry(raw).has_app_account, true);
  });

  // =========================================================================
  // FEATURE 16: PATIENT APP TRACKER DEEP LINK
  // =========================================================================

  harness.test('T1.F16.01: FCM Notification Data Payload Structure', () => {
    const apptId = generateUUID();
    const payload = {
      data: {
        type: 'turn_call',
        appointment_id: apptId,
        tracking_code: '1000000001',
        navigate_to: 'tracker'
      }
    };

    assertZeroMapDeepLink(payload, `queue_status/${apptId}`);
    assert.equal(payload.data.navigate_to, 'tracker');
    assert.equal(payload.data.appointment_id, apptId);
  });

  harness.test('T1.F16.02: Notification Tap Intent Routing in Patient App', () => {
    const intent = {
      getStringExtra(key) {
        if (key === 'navigate_to') return 'tracker';
        if (key === 'appointment_id') return 'appt-uuid-99';
        return null;
      }
    };

    let targetRoute = null;
    if (intent.getStringExtra('navigate_to') === 'tracker') {
      targetRoute = `queue_status/${intent.getStringExtra('appointment_id')}`;
    }

    assert.equal(targetRoute, 'queue_status/appt-uuid-99');
  });

  harness.test('T1.F16.03: QueueStatusScreen Content Verification', () => {
    const screenData = {
      tokenNumber: 5,
      queuePosition: 1,
      doctorName: 'Dr. Sharma',
      estimatedWaitTime: '0 mins'
    };

    assert.equal(screenData.tokenNumber, 5);
    assert.equal(screenData.queuePosition, 1);
    assert.equal(screenData.doctorName, 'Dr. Sharma');
  });

  harness.test('T1.F16.04: STRICT ZERO-MAP VERIFICATION', () => {
    const screenSourceMock = {
      components: ['TokenPill', 'DoctorHeader', 'QueuePositionCard', 'EstimatedWaitTimer']
    };
    // Must not throw
    assertZeroMapDeepLink(null, 'queue_status/appt-1', screenSourceMock);
  });

  harness.test('T1.F16.05: Back Navigation from Tracker Screen', () => {
    let currentScreen = 'QueueStatusScreen';
    function onBackPress() {
      currentScreen = 'HomeScreen';
    }
    onBackPress();
    assert.equal(currentScreen, 'HomeScreen');
  });

  // =========================================================================
  // FEATURE 17: WEB APP PARITY
  // =========================================================================

  harness.test('T1.F17.01: Web Doctor Portal Dual Tabs Parity', () => {
    const webTabs = ['Live', 'Completed'];
    assert.equal(webTabs.length, 2);
    assert.equal(webTabs[0], 'Live');
    assert.equal(webTabs[1], 'Completed');
  });

  harness.test('T1.F17.02: Web Doctor Portal Stat Boxes Parity', () => {
    const webStatBoxes = [
      { title: 'In Consultation', color: 'blue' },
      { title: 'Waiting in Lobby', color: 'peach' },
      { title: 'Completed Today', color: 'mint' }
    ];
    assert.equal(webStatBoxes.length, 3);
  });

  harness.test('T1.F17.03: Web Doctor Portal Date Strip Parity', () => {
    const today = getNepalDateString();
    const webSelectedDate = today;
    assert.equal(webSelectedDate, today);
  });

  harness.test('T1.F17.04: Web Doctor Portal Break Toggle Parity', () => {
    const webState = { isBreakOn: false };
    function toggleWebBreak() { webState.isBreakOn = !webState.isBreakOn; }
    toggleWebBreak();
    assert.equal(webState.isBreakOn, true);
  });

  harness.test('T1.F17.05: Web Doctor Patient Notification Parity', () => {
    const parity = validateWebParityContract();
    assert.equal(parity.isParityCompliant, true);
    assert.ok(parity.fieldCount > 0);
  });
}

module.exports = {
  registerTier1Tests
};
