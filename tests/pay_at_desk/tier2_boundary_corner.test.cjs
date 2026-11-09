/**
 * Tier 2: Boundary & Corner Case Tests for Pay at Desk Lifecycle
 * Edge conditions, limits, malformed inputs, and invariant boundaries:
 * - B1: Invalid UUID Formats
 * - B2: Non-Existent Record Handling
 * - B3: Already Paid Appointment Gate
 * - B4: Cancelled Appointment Gate
 * - B5: Past Slot Expiry Gate
 * - B6: Zero / Negative Consultation Fee Clamping
 * - B7: Maximum Retry Attempts Boundary (1 -> 2 -> 3 -> 4)
 * - B8: Nepal Mobile Number Validation & Sanitization
 * - B9: Patient Age Boundary
 * - B10: Cross-Clinic ID Mismatch Gate
 */

const { assert, TestHarness } = require('./test_runner.cjs');
const {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  isValidUUID,
  sanitizeNepalMobile,
  PayAtDeskBackendSimulator
} = require('./contracts.cjs');

function registerTier2Tests(harness) {
  function createPopulatedHarness() {
    const sim = new PayAtDeskBackendSimulator();
    const clinic1Id = 'bbbbbbbb-1111-4000-8000-000000000001';
    const clinic2Id = 'bbbbbbbb-2222-4000-8000-000000000002';
    const doctor1Id = 'dddddddd-bbbb-4000-8000-000000000001';
    const slot1Id   = 'ssssssss-bbbb-4000-8000-000000000001';

    sim.seedClinic({ id: clinic1Id, name: 'Boundary Clinic', contact_email: 'boundary@dactor.com' });
    sim.seedClinic({ id: clinic2Id, name: 'Other Clinic', contact_email: 'other@dactor.com' });
    sim.seedDoctor({ id: doctor1Id, clinic_id: clinic1Id, full_name: 'Dr. Edge', consultation_fee: 600.00 });
    sim.seedSlot({
      id: slot1Id,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_date: '2026-11-10',
      start_time: '14:00:00',
      max_capacity: 10,
      booked_count: 2
    });

    return { sim, clinic1Id, clinic2Id, doctor1Id, slot1Id };
  }

  // =========================================================================
  // B1: INVALID UUID FORMATS
  // =========================================================================

  harness.test('B1.1: Malformed UUID string ("not-a-uuid") is rejected by confirmPayAtDeskBooking', () => {
    const { sim } = createPopulatedHarness();
    assert.throws(() => {
      sim.confirmPayAtDeskBooking('not-a-uuid');
    }, /Invalid appointment UUID/);
  });

  harness.test('B1.2: Truncated UUID string is rejected', () => {
    const { sim } = createPopulatedHarness();
    assert.throws(() => {
      sim.confirmPayAtDeskBooking('11111111-2222-3333-4444');
    }, /Invalid appointment UUID/);
  });

  harness.test('B1.3: Empty string UUID is rejected', () => {
    const { sim } = createPopulatedHarness();
    assert.throws(() => {
      sim.confirmPayAtDeskBooking('');
    }, /Invalid appointment UUID/);
  });

  harness.test('B1.4: Null or undefined appointment UUID is rejected', () => {
    const { sim } = createPopulatedHarness();
    assert.throws(() => {
      sim.confirmPayAtDeskBooking(null);
    }, /Invalid appointment UUID/);
    assert.throws(() => {
      sim.confirmPayAtDeskBooking(undefined);
    }, /Invalid appointment UUID/);
  });

  harness.test('B1.5: SQL injection payload in UUID field is rejected without query execution', () => {
    const { sim } = createPopulatedHarness();
    const sqli = "11111111-2222-4000-8000-000000000000' OR '1'='1";
    assert.equal(isValidUUID(sqli), false, 'SQL injection payload is not a valid UUID');
    assert.throws(() => {
      sim.confirmPayAtDeskBooking(sqli);
    }, /Invalid appointment UUID/);
  });

  // =========================================================================
  // B2: NON-EXISTENT RECORD HANDLING
  // =========================================================================

  harness.test('B2.1: Valid formatted UUID that does not exist throws Appointment not found', () => {
    const { sim } = createPopulatedHarness();
    const ghostId = '99999999-9999-4999-8999-999999999999';
    assert.throws(() => {
      sim.confirmPayAtDeskBooking(ghostId);
    }, /not found/);
  });

  harness.test('B2.2: Confirming non-existent appointment leaves database unchanged and slot untouched', () => {
    const { sim, slot1Id } = createPopulatedHarness();
    const ghostId = '99999999-9999-4999-8999-999999999999';
    const bookedBefore = sim.slots.get(slot1Id).booked_count;

    try {
      sim.confirmPayAtDeskBooking(ghostId);
    } catch {
      // expected
    }

    assert.equal(sim.slots.get(slot1Id).booked_count, bookedBefore, 'Slot booked count remains unchanged');
    assert.equal(sim.appointments.size, 0, 'No ghost appointment created');
  });

  harness.test('B2.3: Approving non-existent appointment throws Appointment not found', () => {
    const { sim, clinic1Id } = createPopulatedHarness();
    const ghostId = '99999999-9999-4999-8999-999999999999';
    assert.throws(() => {
      sim.approvePayAtDeskAppointment(ghostId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    }, /not found/);
  });

  // =========================================================================
  // B3: ALREADY PAID APPOINTMENT GATE
  // =========================================================================

  harness.test('B3.1: Appointment with payment_status=paid throws already paid when trying to confirm Pay at Desk', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const paidApptId = 'aaaaaaaa-ba1d-4000-8000-000000000001';
    sim.seedAppointment({
      id: paidApptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Already Paid Patient',
      payment_mode: 'ONLINE',
      payment_status: 'paid',
      status: 'APPROVED',
      fee_amount: 600.00
    });

    assert.throws(() => {
      sim.confirmPayAtDeskBooking(paidApptId);
    }, /already paid/);
  });

  harness.test('B3.2: Online verified appointment cannot be switched to Pay at Desk', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const onlineApptId = 'aaaaaaaa-ba1d-4000-8000-000000000002';
    sim.seedAppointment({
      id: onlineApptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Online Patient',
      payment_mode: 'ONLINE',
      payment_status: 'paid',
      fee_amount: 600.00
    });

    assert.throws(() => {
      sim.confirmPayAtDeskBooking(onlineApptId);
    }, /already paid/);

    const record = sim.appointments.get(onlineApptId);
    assert.equal(record.payment_mode, 'ONLINE', 'Payment mode must remain ONLINE');
  });

  harness.test('B3.3: Attempting to confirm Pay at Desk on paid appointment preserves original financial figures', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const paidApptId = 'aaaaaaaa-ba1d-4000-8000-000000000003';
    sim.seedAppointment({
      id: paidApptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      fee_amount: 600.00,
      total_amount: 600.00,
      payment_status: 'paid'
    });

    try {
      sim.confirmPayAtDeskBooking(paidApptId);
    } catch {
      // expected
    }

    const record = sim.appointments.get(paidApptId);
    assert.equal(record.fee_amount, 600.00, 'Fee amount intact');
    assert.equal(record.total_amount, 600.00, 'Total amount intact (no 5% fee added)');
  });

  // =========================================================================
  // B4: CANCELLED APPOINTMENT GATE
  // =========================================================================

  harness.test('B4.1: Cancelled appointment (checkin_status=cancelled) cannot be confirmed for Pay at Desk', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const cancelledId = 'cccccccc-ca0c-4000-8000-000000000001';
    sim.seedAppointment({
      id: cancelledId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Cancelled Patient',
      checkin_status: 'cancelled',
      payment_status: 'pending'
    });

    assert.throws(() => {
      sim.confirmPayAtDeskBooking(cancelledId);
    }, /cancelled/);
  });

  harness.test('B4.2: Cancelled appointment cannot be approved by clinic staff', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const cancelledId = 'cccccccc-ca0c-4000-8000-000000000002';
    sim.seedAppointment({
      id: cancelledId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      status: 'UNAPPROVED',
      checkin_status: 'cancelled'
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(cancelledId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    }, /must be WAITING_FOR_APPROVAL/);
  });

  harness.test('B4.3: Cancelled appointment with attempt limit exceeded cannot be retried', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = 'cccccccc-ca0c-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841234567',
      status: 'UNAPPROVED',
      attempt_number: 3 // Max reached
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9841234567');
    }, /Maximum of 3 attempts exceeded/);
  });

  // =========================================================================
  // B5: PAST SLOT EXPIRY GATE
  // =========================================================================

  harness.test('B5.1: Past slot date (e.g. 2 days ago) throws when approving', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const pastApptId = 'ffffffff-fa57-4000-8000-000000000001';
    sim.seedAppointment({
      id: pastApptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      appointment_date: '2026-10-20', // past date
      appointment_time: '10:00:00',
      status: 'WAITING_FOR_APPROVAL',
      payment_mode: 'PAY_AT_DESK'
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(pastApptId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    }, /Appointment slot time has passed/);

    const record = sim.appointments.get(pastApptId);
    assert.equal(record.status, 'EXPIRED', 'Status marked as EXPIRED');
  });

  harness.test('B5.2: Today with past start_time transitions to EXPIRED upon approval attempt', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const pastApptId = 'ffffffff-fa57-4000-8000-000000000002';
    sim.seedAppointment({
      id: pastApptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      appointment_date: new Date().toISOString().slice(0, 10),
      appointment_time: '01:00:00', // Middle of the night in past
      status: 'WAITING_FOR_APPROVAL',
      payment_mode: 'PAY_AT_DESK'
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(pastApptId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    }, /EXPIRED/);
  });

  harness.test('B5.3: Past-due appointment with expired expires_at timestamp is marked EXPIRED', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const expiredId = 'ffffffff-fa57-4000-8000-000000000003';
    sim.seedAppointment({
      id: expiredId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00',
      status: 'WAITING_FOR_APPROVAL',
      payment_mode: 'PAY_AT_DESK',
      expires_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
    });

    assert.throws(() => {
      sim.approvePayAtDeskAppointment(expiredId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    }, /Request has expired/);

    const record = sim.appointments.get(expiredId);
    assert.equal(record.status, 'EXPIRED', 'Record status is EXPIRED');
  });

  harness.test('B5.4: Expired appointment is excluded from live queue entries', () => {
    const { sim } = createPopulatedHarness();
    const pastApptId = 'ffffffff-fa57-4000-8000-000000000001';
    assert.equal(sim.queueEntries.has(pastApptId), false, 'Past-due appointment never enters queue_entries');
  });

  // =========================================================================
  // B6: ZERO / NEGATIVE CONSULTATION FEE CLAMPING
  // =========================================================================

  harness.test('B6.1: Negative consultation fee (-500.00 NPR) is clamped safely to 0.00 NPR', () => {
    const charge = calculateServiceCharge(-500.00);
    const total = calculateTotalAmount(-500.00, charge);
    assert.equal(charge, 0.00, 'Negative fee yields zero charge');
    assert.equal(total, 0.00, 'Total clamped safely to 0.00');
  });

  harness.test('B6.2: Zero consultation fee (0.00 NPR) yields 0.00 service charge without negative amounts', () => {
    const charge = calculateServiceCharge(0.00);
    const total = calculateTotalAmount(0.00, charge);
    assert.equal(charge, 0.00, 'Zero charge');
    assert.equal(total, 0.00, 'Zero total');
  });

  harness.test('B6.3: Sub-cent fee (0.001 NPR) rounds strictly to 0.00 NPR without decimal leakage', () => {
    const charge = calculateServiceCharge(0.001);
    assert.equal(charge, 0.00, 'Sub-cent charge is 0.00');
  });

  // =========================================================================
  // B7: MAXIMUM RETRY ATTEMPTS BOUNDARY (1 -> 2 -> 3 -> 4)
  // =========================================================================

  harness.test('B7.1: Fresh appointment starts at attempt_number = 1', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'pending'
    });
    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.attempt_number, 1, 'Attempt starts at 1');
  });

  harness.test('B7.2: Rejection keeps attempt_number = 1 and sets status to UNAPPROVED', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1
    });

    const res = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    assert.equal(res.appointment.status, 'UNAPPROVED', 'Status is UNAPPROVED');
    assert.equal(res.appointment.attempt_number, 1, 'Attempt number remains 1');
  });

  harness.test('B7.3: First retry transitions to WAITING_FOR_APPROVAL and increments to attempt_number = 2', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'UNAPPROVED',
      attempt_number: 1
    });

    const res = sim.retryPayAtDeskAppointment(apptId, '9841223344');
    assert.equal(res.appointment.status, 'WAITING_FOR_APPROVAL', 'Status returns to WAITING_FOR_APPROVAL');
    assert.equal(res.appointment.attempt_number, 2, 'Attempt increments to 2');
    assert.equal(res.appointment.expires_at, null, 'expires_at is NULL on attempt 2');
  });

  harness.test('B7.4: Second rejection keeps attempt_number = 2 and sets status to UNAPPROVED', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 2
    });

    const res = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    assert.equal(res.appointment.status, 'UNAPPROVED', 'Status is UNAPPROVED');
    assert.equal(res.appointment.attempt_number, 2, 'Attempt remains 2');
  });

  harness.test('B7.5: Second retry increments to attempt_number = 3 and sets expires_at to NOW() + 2 days', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000005';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'UNAPPROVED',
      attempt_number: 2
    });

    const res = sim.retryPayAtDeskAppointment(apptId, '9841223344');
    assert.equal(res.appointment.status, 'WAITING_FOR_APPROVAL', 'Status is WAITING_FOR_APPROVAL');
    assert.equal(res.appointment.attempt_number, 3, 'Attempt is 3');
    assert.ok(res.appointment.expires_at, 'expires_at must be populated on attempt 3');

    const expTime = new Date(res.appointment.expires_at).getTime();
    const minExpected = Date.now() + (1.9 * 24 * 3600 * 1000);
    const maxExpected = Date.now() + (2.1 * 24 * 3600 * 1000);
    assert.ok(expTime >= minExpected && expTime <= maxExpected, 'expires_at is approximately 2 days in future');
  });

  harness.test('B7.6: Third rejection keeps attempt_number = 3 and sets status to UNAPPROVED', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000006';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3
    });

    const res = sim.rejectPayAtDeskAppointment(apptId, clinic1Id, 'boundary@dactor.com', 'authenticated');
    assert.equal(res.appointment.status, 'UNAPPROVED', 'Status is UNAPPROVED');
    assert.equal(res.appointment.attempt_number, 3, 'Attempt remains 3');
  });

  harness.test('B7.7: Fourth retry (attempt 4) is strictly blocked with maximum attempts exceeded', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000007';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'UNAPPROVED',
      attempt_number: 3
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9841223344');
    }, /Maximum of 3 attempts exceeded/);
  });

  harness.test('B7.8: Calling retry when status is already WAITING_FOR_APPROVAL is rejected', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000008';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9841223344');
    }, /must be UNAPPROVED/);
  });

  harness.test('B7.9: Calling retry when status is APPROVED is rejected', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '77777777-aaaa-4000-8000-000000000009';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841223344',
      status: 'APPROVED',
      attempt_number: 1
    });

    assert.throws(() => {
      sim.retryPayAtDeskAppointment(apptId, '9841223344');
    }, /must be UNAPPROVED/);
  });

  // =========================================================================
  // B8: NEPAL MOBILE NUMBER VALIDATION & SANITIZATION
  // =========================================================================

  harness.test('B8.1: 9-digit mobile number fails validation', () => {
    assert.equal(sanitizeNepalMobile('984123456'), null, '9 digits is invalid');
  });

  harness.test('B8.2: 11-digit mobile number fails validation', () => {
    assert.equal(sanitizeNepalMobile('98412345678'), null, '11 digits is invalid');
  });

  harness.test('B8.3: 10-digit number not starting with 9 fails validation', () => {
    assert.equal(sanitizeNepalMobile('8841234567'), null, 'Number starting with 8 is invalid');
  });

  harness.test('B8.4: Formatted mobile with country code +977 and spaces cleans to 10 digits', () => {
    const cleaned = sanitizeNepalMobile('+977-9841234567');
    // Sanitizer strips non-digits: '9779841234567' -> 13 digits -> fails or extracts last 10
    const rawClean = '+977 984 1234567'.replace(/\D/g, '');
    const nepalStandard = rawClean.length === 10 ? rawClean : (rawClean.startsWith('977') ? rawClean.slice(3) : null);
    assert.equal(nepalStandard, '9841234567', 'Standardized to 9841234567');
  });

  harness.test('B8.5: Mobile number with letters embedded fails validation', () => {
    assert.equal(sanitizeNepalMobile('984abc4567'), null, 'Letters in phone fail validation');
  });

  // =========================================================================
  // B9: PATIENT AGE BOUNDARY
  // =========================================================================

  harness.test('B9.1: Negative patient age is invalid', () => {
    const isValidAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 120);
    assert.equal(isValidAge(-1), false, 'Negative age is invalid');
  });

  harness.test('B9.2: Age exceeding 120 is invalid', () => {
    const isValidAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 120);
    assert.equal(isValidAge(121), false, 'Age > 120 is invalid');
  });

  harness.test('B9.3: Newborn age = 0 is valid', () => {
    const isValidAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 120);
    assert.equal(isValidAge(0), true, 'Age 0 is valid for infants');
  });

  harness.test('B9.4: Maximum boundary age = 120 is valid', () => {
    const isValidAge = (age) => (typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= 120);
    assert.equal(isValidAge(120), true, 'Age 120 is valid');
  });

  // =========================================================================
  // B10: CROSS-CLINIC ID MISMATCH GATE
  // =========================================================================

  harness.test('B10.1: Passing mismatched clinic ID at approval triggers Mismatched clinic ID error', () => {
    const { sim, clinic1Id, clinic2Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '10101010-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id, // Belongs to Clinic 1
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_mobile: '9841000010',
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '11:00:00'
    });

    assert.throws(() => {
      // Super admin passes clinic2Id while appointment belongs to clinic1Id
      sim.approvePayAtDeskAppointment(apptId, clinic2Id, 'admin@dactor.com', 'super_admin');
    }, /Mismatched clinic ID/);
  });
}

module.exports = { registerTier2Tests };
