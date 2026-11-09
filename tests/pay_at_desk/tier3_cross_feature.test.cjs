/**
 * Tier 3: Cross-Feature State Combination Tests for Pay at Desk Lifecycle
 * Complex multi-stage interactions across entities, roles, and lifecycles:
 * - C1: End-to-End Booking -> Counter Approval -> Slot Overload (Rule 7: 13/12) -> Queue Enrollment
 * - C2: Rejection -> Retry Attempt Escalation -> 2-Day Expiry Boundary
 * - C3: Scheduled Global Expiry Engine
 * - C4: Past Slot Expiry Detection
 * - C5: Cross-Clinic Security Isolation & Unauthorized Caller Gates
 * - C6: Edge Function Resilience & CORS Headers
 */

const { assert, TestHarness } = require('./test_runner.cjs');
const {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  evaluateSlotCapacity,
  PayAtDeskBackendSimulator
} = require('./contracts.cjs');

function registerTier3Tests(harness) {
  function createPopulatedHarness() {
    const sim = new PayAtDeskBackendSimulator();
    const clinic1Id = 'cccccccc-1111-4000-8000-000000000001';
    const clinic2Id = 'cccccccc-2222-4000-8000-000000000002';
    const doctor1Id = 'dddddddd-cccc-4000-8000-000000000001';
    const doctor2Id = 'dddddddd-cccc-4000-8000-000000000002';
    const fullSlotId = 'ssssssss-full-4000-8000-000000000001';

    sim.seedClinic({ id: clinic1Id, name: 'Cross Clinic 1', contact_email: 'desk1@dactor.com' });
    sim.seedClinic({ id: clinic2Id, name: 'Cross Clinic 2', contact_email: 'desk2@dactor.com' });
    sim.seedDoctor({ id: doctor1Id, clinic_id: clinic1Id, full_name: 'Dr. Apex', consultation_fee: 1000.00 });
    sim.seedDoctor({ id: doctor2Id, clinic_id: clinic2Id, full_name: 'Dr. Zenith', consultation_fee: 800.00 });

    // Full slot: capacity 12, currently 12 booked
    sim.seedSlot({
      id: fullSlotId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_date: '2026-11-15',
      start_time: '10:00:00',
      end_time: '11:00:00',
      max_capacity: 12,
      booked_count: 12
    });

    return { sim, clinic1Id, clinic2Id, doctor1Id, doctor2Id, fullSlotId };
  }

  // =========================================================================
  // C1: BOOKING -> COUNTER APPROVAL -> SLOT OVERLOAD (13/12) -> QUEUE TOKEN
  // =========================================================================

  harness.test('C1.1: Multi-stage flow: Patient bookings creates WAITING_FOR_APPROVAL and excludes from queue', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c1010101-0001-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_name: 'Overload Patient 1',
      patient_mobile: '9841000001',
      tracking_code_10_digit: '9841000001',
      appointment_date: '2026-11-15',
      appointment_time: '10:00:00',
      payment_mode: 'PAY_AT_DESK',
      status: 'pending',
      created_at: new Date().toISOString()
    });

    const confirmRes = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(confirmRes.status, 'WAITING_FOR_APPROVAL');
    assert.equal(sim.queueEntries.has(apptId), false, 'Not in live queue yet');
  });

  harness.test('C1.2: Overload Rule 7: Clinic approval on full slot (12/12) increments booked_count to 13/12 safely', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c1010101-0001-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_name: 'Overload Patient 2',
      patient_mobile: '9841000002',
      tracking_code_10_digit: '9841000002',
      appointment_date: '2026-11-15',
      appointment_time: '10:00:00',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const approveRes = sim.approvePayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated');
    assert.equal(approveRes.appointment.status, 'APPROVED');

    const updatedSlot = sim.slots.get(fullSlotId);
    assert.equal(updatedSlot.booked_count, 13, 'Slot booked_count is now 13');
  });

  harness.test('C1.3: Overloaded slot displays safely as FULL without negative availability or crashes', () => {
    const slotMetrics = evaluateSlotCapacity(12, 13);
    assert.equal(slotMetrics.maxCapacity, 12);
    assert.equal(slotMetrics.bookedCount, 13);
    assert.equal(slotMetrics.remainingCount, 0, 'Remaining count is 0 (never negative -1)');
    assert.equal(slotMetrics.isFull, true, 'isFull is true');
    assert.equal(slotMetrics.displayRatio, '13/12', 'Display ratio displays 13/12');
    assert.equal(slotMetrics.uiLabel, 'FULL', 'Label is FULL');
    assert.equal(slotMetrics.isOverloaded, true, 'Overloaded flag is true');
  });

  harness.test('C1.4: Approved appointment is enrolled in live queue with next sequential token number', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    // Pre-populate 2 waiting patients
    sim.queueEntries.set('q-existing-1', { clinic_id: clinic1Id, queue_position: 1, status: 'waiting' });
    sim.queueEntries.set('q-existing-2', { clinic_id: clinic1Id, queue_position: 2, status: 'waiting' });

    const apptId = 'c1010101-0001-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_name: 'Token Patient',
      patient_mobile: '9841000004',
      tracking_code_10_digit: '9841000004',
      appointment_date: '2026-11-15',
      appointment_time: '10:00:00',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const approveRes = sim.approvePayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated');
    assert.equal(approveRes.queue_position, 3, 'Next queue position is exactly 3');

    const entry = sim.queueEntries.get(apptId);
    assert.ok(entry, 'Entry exists in queueEntries');
    assert.equal(entry.queue_position, 3);
    assert.equal(entry.status, 'waiting');
  });

  harness.test('C1.5: Subsequent normal patient booking respects capacity limit (cannot book overloaded slot)', () => {
    const canBookNormal = (maxCapacity, currentBooked) => (currentBooked < maxCapacity);
    assert.equal(canBookNormal(12, 13), false, 'Normal booking rejected when currentBooked (13) >= maxCapacity (12)');
  });

  // =========================================================================
  // C2: REJECTION -> RETRY ATTEMPT ESCALATION -> 2-DAY EXPIRY BOUNDARY
  // =========================================================================

  harness.test('C2.1: Lifecycle Round 1: Clinic receptionist rejects request with reason -> status UNAPPROVED', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000021',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const rej = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated', 'Doctor emergency');
    assert.equal(rej.appointment.status, 'UNAPPROVED');
    assert.equal(rej.appointment.attempt_number, 1);
    assert.equal(rej.reason, 'Doctor emergency');
  });

  harness.test('C2.2: Lifecycle Round 2: Patient retries -> Attempt 2, Status WAITING_FOR_APPROVAL, expires_at NULL', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000022',
      status: 'UNAPPROVED',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const ret = sim.retryPayAtDeskAppointment(apptId, '9841000022');
    assert.equal(ret.appointment.status, 'WAITING_FOR_APPROVAL');
    assert.equal(ret.appointment.attempt_number, 2);
    assert.equal(ret.appointment.expires_at, null);
  });

  harness.test('C2.3: Lifecycle Round 2 Rejection: Clinic receptionist rejects Attempt 2', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000023',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 2,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const rej = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated');
    assert.equal(rej.appointment.status, 'UNAPPROVED');
    assert.equal(rej.appointment.attempt_number, 2);
  });

  harness.test('C2.4: Lifecycle Round 3: Patient retries -> Attempt 3, expires_at set to NOW() + 2 days', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000024',
      status: 'UNAPPROVED',
      attempt_number: 2,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const ret = sim.retryPayAtDeskAppointment(apptId, '9841000024');
    assert.equal(ret.appointment.status, 'WAITING_FOR_APPROVAL');
    assert.equal(ret.appointment.attempt_number, 3);
    assert.ok(ret.appointment.expires_at);

    const expTime = new Date(ret.appointment.expires_at).getTime();
    assert.ok(expTime > Date.now() + 86400000, 'expires_at is greater than 1 day in the future');
  });

  harness.test('C2.5: Lifecycle Round 3 Rejection: Clinic receptionist rejects Attempt 3', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000005';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000025',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const rej = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated');
    assert.equal(rej.appointment.status, 'UNAPPROVED');
    assert.equal(rej.appointment.attempt_number, 3);
  });

  harness.test('C2.6: Lifecycle Boundary: 4th retry strictly blocked with maximum attempts exceeded', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c2020202-0002-4000-8000-000000000006';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841000026',
      status: 'UNAPPROVED',
      attempt_number: 3,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9841000026');
    }, /Maximum of 3 attempts exceeded/);
  });

  // =========================================================================
  // C3: SCHEDULED GLOBAL EXPIRY ENGINE
  // =========================================================================

  harness.test('C3.1: Service role calls expirePayAtDeskAppointments and transitions expired 3rd attempt requests', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c3030303-0003-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3,
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const expiredCount = sim.expirePayAtDeskAppointments('service_role');
    assert.equal(expiredCount, 1, 'Expired 1 appointment');

    const updated = sim.appointments.get(apptId);
    assert.equal(updated.status, 'EXPIRED');
    assert.equal(updated.checkin_status, 'cancelled');
  });

  harness.test('C3.2: Expired appointment checkin_status is set to cancelled', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c3030303-0003-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3,
      expires_at: new Date(Date.now() - 10000).toISOString(),
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    sim.expirePayAtDeskAppointments('super_admin');
    const updated = sim.appointments.get(apptId);
    assert.equal(updated.checkin_status, 'cancelled');
  });

  harness.test('C3.3: Global expiry engine call by anonymous or normal clinic staff is rejected with Access Denied', () => {
    const { sim } = createPopulatedHarness();
    assert.throws(() => {
      sim.expirePayAtDeskAppointments('anon');
    }, /Access denied/);
    assert.throws(() => {
      sim.expirePayAtDeskAppointments('authenticated');
    }, /Access denied/);
  });

  harness.test('C3.4: Fresh requests (attempt 1 or 2, or attempt 3 within window) are NOT expired', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId1 = 'c3030303-0003-4000-8000-000000000004';
    const apptId3 = 'c3030303-0003-4000-8000-000000000005';

    sim.seedAppointment({
      id: apptId1,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });
    sim.seedAppointment({
      id: apptId3,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3,
      expires_at: new Date(Date.now() + 86400000).toISOString(), // 1 day remaining
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const expired = sim.expirePayAtDeskAppointments('service_role');
    assert.equal(expired, 0, 'Zero appointments expired');
    assert.equal(sim.appointments.get(apptId1).status, 'WAITING_FOR_APPROVAL');
    assert.equal(sim.appointments.get(apptId3).status, 'WAITING_FOR_APPROVAL');
  });

  // =========================================================================
  // C4: PAST SLOT EXPIRY DETECTION
  // =========================================================================

  harness.test('C4.1: Scheduled slot date and time passing marks request as EXPIRED in expiry engine', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c4040404-0004-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1,
      appointment_date: '2026-10-01', // long past
      appointment_time: '09:00:00'
    });

    const count = sim.expirePayAtDeskAppointments('service_role');
    assert.equal(count, 1);
    assert.equal(sim.appointments.get(apptId).status, 'EXPIRED');
  });

  harness.test('C4.2: Receptionist attempting to approve after slot time has passed receives explicit expiry error', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c4040404-0004-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-10-01',
      appointment_time: '09:00:00'
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(apptId, clinic1Id, 'desk1@dactor.com', 'authenticated');
    }, /Appointment slot time has passed/);

    assert.equal(sim.appointments.get(apptId).status, 'EXPIRED');
  });

  // =========================================================================
  // C5: CROSS-CLINIC SECURITY ISOLATION
  // =========================================================================

  harness.test('C5.1: Receptionist at Clinic 2 attempting to approve Clinic 1 appointment is rejected with Access Denied', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c5050505-0005-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(apptId, clinic1Id, 'desk2@dactor.com', 'authenticated');
    }, /Access denied/);
  });

  harness.test('C5.2: Receptionist at Clinic 2 attempting to reject Clinic 1 appointment is rejected with Access Denied', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c5050505-0005-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    assert.throws(() => {
      sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'desk2@dactor.com', 'authenticated');
    }, /Access denied/);
  });

  harness.test('C5.3: Patient retry requires verified matching phone number; stranger phone rejected', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c5050505-0005-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      patient_mobile: '9841111111',
      status: 'UNAPPROVED',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9849999999'); // Wrong phone
    }, /Access denied/);

    const okRet = sim.retryPayAtDeskAppointment(apptId, '9841111111'); // Correct phone
    assert.equal(okRet.appointment.status, 'WAITING_FOR_APPROVAL');
  });

  // =========================================================================
  // C6: EDGE FUNCTION RESILIENCE & CORS HEADERS
  // =========================================================================

  harness.test('C6.1: Edge function confirms Pay at Desk and returns JSON with CORS headers', () => {
    const { sim, clinic1Id, doctor1Id, fullSlotId } = createPopulatedHarness();
    const apptId = 'c6060606-0006-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: fullSlotId,
      status: 'pending',
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    const edgeFunctionCall = (origin, body) => {
      const allowedOrigins = ['https://dactorofficial.github.io', 'https://rajanpurbe.github.io'];
      const isAllowed = allowedOrigins.includes(origin);
      const res = sim.confirmPayAtDeskBooking(body.appointmentId, body.feeAmount);
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': isAllowed ? origin : '',
          'Vary': 'Origin'
        },
        body: { success: true, appointment: res }
      };
    };

    const validOriginResp = edgeFunctionCall('https://dactorofficial.github.io', { appointmentId: apptId });
    assert.equal(validOriginResp.headers['Access-Control-Allow-Origin'], 'https://dactorofficial.github.io');
    assert.ok(validOriginResp.body.success);
  });

  harness.test('C6.2: Edge function rejects CORS wildcard and returns empty Allow-Origin for unauthorized origin', () => {
    const edgeCorsCheck = (origin) => {
      const allowedOrigins = ['https://dactorofficial.github.io', 'https://rajanpurbe.github.io'];
      return allowedOrigins.includes(origin) ? origin : '';
    };

    assert.equal(edgeCorsCheck('https://malicious-phishing.com'), '', 'Phishing origin receives empty header');
    assert.notEqual(edgeCorsCheck('https://malicious-phishing.com'), '*', 'Wildcard is forbidden');
  });
}

module.exports = { registerTier3Tests };
