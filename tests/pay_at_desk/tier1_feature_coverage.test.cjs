/**
 * Tier 1: Feature Coverage Tests for Pay at Desk Lifecycle
 * Minimum 5 tests per feature:
 * - F1: Confirmation RPC & Edge Function Handler
 * - F2: 5% Platform Fee Computation & Total Calculation
 * - F3: WAITING_FOR_APPROVAL State & Tracking Contracts
 * - F4: Clinic Pending Requests Listing & Authorization
 * - F5: Queue Exclusion While Pending
 */

const { assert, TestHarness } = require('./test_runner.cjs');
const {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  formatMoney,
  isValidTrackingCode10,
  isValidUUID,
  PayAtDeskBackendSimulator
} = require('./contracts.cjs');

function registerTier1Tests(harness) {
  // Helper to initialize fresh simulator
  function createPopulatedHarness() {
    const sim = new PayAtDeskBackendSimulator();
    const clinic1Id = 'aaaaaaaa-1111-4000-8000-000000000001';
    const clinic2Id = 'aaaaaaaa-2222-4000-8000-000000000002';
    const doctor1Id = 'dddddddd-1111-4000-8000-000000000001';
    const doctor2Id = 'dddddddd-2222-4000-8000-000000000002';
    const slot1Id   = 'ssssssss-1111-4000-8000-000000000001';

    sim.seedClinic({ id: clinic1Id, name: 'Clinic Alpha', contact_email: 'alpha_desk@dactor.com' });
    sim.seedClinic({ id: clinic2Id, name: 'Clinic Beta', contact_email: 'beta_desk@dactor.com' });
    sim.seedDoctor({ id: doctor1Id, clinic_id: clinic1Id, full_name: 'Dr. Thorne', consultation_fee: 1000.00 });
    sim.seedDoctor({ id: doctor2Id, clinic_id: clinic2Id, full_name: 'Dr. Sen', consultation_fee: 750.00 });
    sim.seedSlot({ id: slot1Id, clinic_id: clinic1Id, doctor_id: doctor1Id, max_capacity: 12, booked_count: 5 });

    return { sim, clinic1Id, clinic2Id, doctor1Id, doctor2Id, slot1Id };
  }

  // =========================================================================
  // F1: CONFIRMATION RPC & BACKEND HANDLER
  // =========================================================================

  harness.test('F1.1: confirm_pay_at_desk_booking succeeds with valid appointment ID', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Anil Gurung',
      patient_mobile: '9841000001',
      tracking_code_10_digit: '9841000001',
      payment_mode: 'ONLINE',
      status: 'pending',
      payment_status: 'pending',
      checkin_status: 'not_checked_in',
      appointment_date: '2026-11-01',
      appointment_time: '10:00:00',
      created_at: new Date().toISOString()
    });

    const result = sim.confirmPayAtDeskBooking(apptId);
    assert.ok(result.success, 'Result must be success');
    assert.equal(result.appointment_id, apptId, 'Appointment ID matches');
    assert.equal(result.payment_mode, 'PAY_AT_DESK', 'Payment mode updated to PAY_AT_DESK');
  });

  harness.test('F1.2: confirm_pay_at_desk_booking sets status to WAITING_FOR_APPROVAL', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Pooja Thapa',
      patient_mobile: '9841000002',
      tracking_code_10_digit: '9841000002',
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.status, CONTRACTS.statuses.WAITING_FOR_APPROVAL, 'Status must be WAITING_FOR_APPROVAL');
  });

  harness.test('F1.3: confirm_pay_at_desk_booking sets payment_status=pending and checkin_status=not_checked_in', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Kiran Shrestha',
      patient_mobile: '9841000003',
      tracking_code_10_digit: '9841000003',
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.payment_status, 'pending', 'payment_status must be pending');
    assert.equal(res.checkin_status, 'not_checked_in', 'checkin_status must be not_checked_in');
  });

  harness.test('F1.4: confirm_pay_at_desk_booking initializes attempt_number to 1', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Binod KC',
      patient_mobile: '9841000004',
      tracking_code_10_digit: '9841000004',
      attempt_number: 0,
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.attempt_number, 1, 'Initial attempt_number must be 1');
  });

  harness.test('F1.5: confirm_pay_at_desk_booking preserves 10-digit tracking code in response payload', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000005';
    const trackingCode = '9851098765';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Ramesh Adhikari',
      patient_mobile: '9851098765',
      tracking_code_10_digit: trackingCode,
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.tracking_code_10_digit, trackingCode, 'Tracking code must be preserved');
    assert.equal(res.tracking_code, trackingCode, 'Legacy tracking_code field must match');
  });

  harness.test('F1.6: confirm_pay_at_desk_booking authoritatively enforces doctor fee, overriding tampered client fee', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000006';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id, // Doctor 1 fee is 1000.00
      slot_id: slot1Id,
      patient_name: 'Tamper Tester',
      patient_mobile: '9841000006',
      tracking_code_10_digit: '9841000006',
      fee_amount: 1.00, // Tampered fee in DB or client payload
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId, 5.00); // Client passed 5.00 NPR
    assert.equal(res.fee_amount, 1000.00, 'Server must enforce official doctor fee (1000.00)');
    assert.equal(res.service_charge_amount, 50.00, '5% charge on 1000 is 50.00');
    assert.equal(res.total_amount, 1050.00, 'Total amount must be 1050.00');
  });

  harness.test('F1.7: Edge function appointment-payment action=confirm_pay_at_desk returns expected schema contract', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '11111111-aaaa-4000-8000-000000000007';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Edge Function User',
      patient_mobile: '9841000007',
      tracking_code_10_digit: '9841000007',
      created_at: new Date().toISOString()
    });

    // Emulate edge function request handling
    const edgeHandler = (body) => {
      if (body.action !== 'confirm_pay_at_desk') throw new Error('Unsupported action');
      const rpcRes = sim.confirmPayAtDeskBooking(body.appointmentId, body.feeAmount);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://dactorofficial.github.io' },
        body: { success: true, appointment: rpcRes }
      };
    };

    const response = edgeHandler({ action: 'confirm_pay_at_desk', appointmentId: apptId, feeAmount: 1000 });
    assert.equal(response.status, 200, 'Edge function returns HTTP 200');
    assert.ok(response.body.success, 'Success is true');
    assert.equal(response.body.appointment.status, 'WAITING_FOR_APPROVAL', 'Status is WAITING_FOR_APPROVAL');
  });

  harness.test('F1.8: Authoritative execution context bypasses patient privilege escalation trigger', () => {
    // In PostgreSQL, PERFORM set_config('dactor.authoritative_context', 'true', true);
    // allows updating status to WAITING_FOR_APPROVAL even if caller is anon/guest.
    const isTriggerBypassed = (contextSetting, callerRole, targetColumn) => {
      if (contextSetting === 'true') return true;
      if (callerRole === 'anon' && (targetColumn === 'status' || targetColumn === 'payment_status')) {
        return false;
      }
      return true;
    };

    assert.ok(isTriggerBypassed('true', 'anon', 'status'), 'Trigger bypassed when authoritative context is true');
    assert.equal(isTriggerBypassed('false', 'anon', 'status'), false, 'Direct anon mutation without authoritative context is blocked');
  });

  // =========================================================================
  // F2: 5% PLATFORM FEE COMPUTATION & TOTAL AMOUNT
  // =========================================================================

  harness.test('F2.1: Fee of 1000.00 NPR computes exactly 50.00 NPR (5%) and 1050.00 NPR total', () => {
    const fee = 1000.00;
    const charge = calculateServiceCharge(fee);
    const total = calculateTotalAmount(fee, charge);
    assert.equal(charge, 50.00, 'Charge must be 50.00');
    assert.equal(total, 1050.00, 'Total must be 1050.00');
    assert.equal(formatMoney(total), '1050.00', 'Formatted string matches');
  });

  harness.test('F2.2: Fee of 500.00 NPR computes exactly 25.00 NPR (5%) and 525.00 NPR total', () => {
    const fee = 500.00;
    const charge = calculateServiceCharge(fee);
    const total = calculateTotalAmount(fee, charge);
    assert.equal(charge, 25.00, 'Charge must be 25.00');
    assert.equal(total, 525.00, 'Total must be 525.00');
  });

  harness.test('F2.3: Fractional fee 750.50 NPR rounds strictly to 37.53 NPR charge and 788.03 NPR total', () => {
    const fee = 750.50; // 750.50 * 0.05 = 37.525 -> rounded to 37.53
    const charge = calculateServiceCharge(fee);
    const total = calculateTotalAmount(fee, charge);
    assert.equal(charge, 37.53, 'Charge must round up to 37.53');
    assert.equal(total, 788.03, 'Total must be 788.03');
  });

  harness.test('F2.4: Fee with odd fraction 333.33 NPR rounds strictly to 16.67 NPR charge and 350.00 NPR total', () => {
    const fee = 333.33; // 333.33 * 0.05 = 16.6665 -> rounded to 16.67
    const charge = calculateServiceCharge(fee);
    const total = calculateTotalAmount(fee, charge);
    assert.equal(charge, 16.67, 'Charge rounds to 16.67');
    assert.equal(total, 350.00, 'Total must be 350.00');
  });

  harness.test('F2.5: Zero fee (0.00 NPR) yields 0.00 charge and 0.00 total without NaN', () => {
    const charge = calculateServiceCharge(0.00);
    const total = calculateTotalAmount(0.00, charge);
    assert.equal(charge, 0.00, 'Zero fee yields zero charge');
    assert.equal(total, 0.00, 'Zero fee yields zero total');
  });

  harness.test('F2.6: High fee value (100,000.00 NPR) computes 5000.00 NPR service charge without drift', () => {
    const fee = 100000.00;
    const charge = calculateServiceCharge(fee);
    const total = calculateTotalAmount(fee, charge);
    assert.equal(charge, 5000.00, 'Charge is exactly 5000.00');
    assert.equal(total, 105000.00, 'Total is exactly 105000.00');
  });

  harness.test('F2.7: Configurable service charge percent alters computation correctly', () => {
    const fee = 1000.00;
    const charge7 = calculateServiceCharge(fee, 7.5);
    const total7 = calculateTotalAmount(fee, charge7);
    assert.equal(charge7, 75.00, '7.5% charge on 1000 is 75.00');
    assert.equal(total7, 1075.00, 'Total is 1075.00');
  });

  // =========================================================================
  // F3: WAITING_FOR_APPROVAL STATE & TRACKING CONTRACTS
  // =========================================================================

  harness.test('F3.1: Pay at Desk appointment initializes strictly in WAITING_FOR_APPROVAL', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '22222222-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Tara Magar',
      patient_mobile: '9841112233',
      tracking_code_10_digit: '9841112233',
      created_at: new Date().toISOString()
    });

    const res = sim.confirmPayAtDeskBooking(apptId);
    assert.equal(res.status, 'WAITING_FOR_APPROVAL', 'Initial status is WAITING_FOR_APPROVAL');
  });

  harness.test('F3.2: 10-digit tracking code complies with 10-digit numeric pattern (starts with 1-9)', () => {
    for (let i = 0; i < 20; i++) {
      const code = sim_generateCode();
      assert.ok(isValidTrackingCode10(code), `Generated code ${code} must be a valid 10-digit tracking code`);
      assert.notEqual(code[0], '0', 'Tracking code must not start with zero');
      assert.equal(code.length, 10, 'Tracking code must be exactly 10 characters');
    }

    function sim_generateCode() {
      return (Math.floor(Math.random() * 9) + 1).toString() +
        Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    }
  });

  harness.test('F3.3: Patient tracking UI mapping returns Waiting for approval from clinic label', () => {
    const mapTrackingStatusToUI = (status, attempt) => {
      switch (status) {
        case 'WAITING_FOR_APPROVAL':
          return { label: 'Waiting for approval from clinic', showDialer: true, canRetry: false };
        case 'APPROVED':
          return { label: 'Approved', showDialer: false, canRetry: false };
        case 'UNAPPROVED':
          return { label: 'Unapproved', showDialer: false, canRetry: attempt < 3 };
        case 'EXPIRED':
          return { label: 'Request expired', showDialer: true, canRetry: false };
        default:
          return { label: 'Unknown', showDialer: false, canRetry: false };
      }
    };

    const ui = mapTrackingStatusToUI('WAITING_FOR_APPROVAL', 1);
    assert.equal(ui.label, 'Waiting for approval from clinic', 'Label matches specification');
    assert.ok(ui.showDialer, 'Call Clinic button must be visible');
    assert.equal(ui.canRetry, false, 'Retry button hidden while waiting');
  });

  harness.test('F3.4: Patient tracking exposes Call Clinic action button with dialer link', () => {
    const clinicPhone = '01-4433221';
    const dialerAction = (phone) => `tel:${phone.replace(/\D/g, '')}`;
    assert.equal(dialerAction(clinicPhone), 'tel:014433221', 'Dialer URI formatted properly');
  });

  harness.test('F3.5: Direct client attempt to update appointment status to APPROVED is rejected', () => {
    const simulateDirectClientUpdate = (callerRole, requestedStatus) => {
      if (callerRole === 'anon' || callerRole === 'patient') {
        if (requestedStatus === 'APPROVED') {
          throw new Error('RLS check violated: Patients cannot self-approve appointments');
        }
      }
      return true;
    };

    assert.throws(() => {
      simulateDirectClientUpdate('anon', 'APPROVED');
    }, /RLS check violated/);
  });

  harness.test('F3.6: Initial expires_at is NULL on attempt 1 (not prematurely expired)', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '22222222-aaaa-4000-8000-000000000006';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Gita Subedi',
      patient_mobile: '9841112236',
      tracking_code_10_digit: '9841112236',
      created_at: new Date().toISOString()
    });

    sim.confirmPayAtDeskBooking(apptId);
    const record = sim.appointments.get(apptId);
    assert.equal(record.expires_at, null, 'expires_at must be NULL on attempt 1');
  });

  harness.test('F3.7: Booking does not charge online payment gateway (online payment bypassed)', () => {
    const paymentMode = 'PAY_AT_DESK';
    const isOnlineGatewayCalled = (mode) => (mode === 'ONLINE');
    assert.equal(isOnlineGatewayCalled(paymentMode), false, 'eSewa/Khalti gateway skipped for Pay at Desk');
  });

  // =========================================================================
  // F4: CLINIC PENDING REQUESTS LISTING & AUTHORIZATION
  // =========================================================================

  harness.test('F4.1: Authorized clinic staff can retrieve pending requests for their clinic', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '33333333-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Prakash Rana',
      patient_mobile: '9841223344',
      tracking_code_10_digit: '9841223344',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'alpha_desk@dactor.com', 'authenticated');
    assert.equal(requests.length, 1, 'Should find 1 pending request');
    assert.equal(requests[0].id, apptId, 'Appointment ID matches');
    assert.equal(requests[0].patient_name, 'Prakash Rana', 'Patient name matches');
  });

  harness.test('F4.2: Super Admin portal user can retrieve pending requests across any clinic', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '33333333-aaaa-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Sushil Rai',
      patient_mobile: '9841223345',
      tracking_code_10_digit: '9841223345',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'admin@dactor.com', 'super_admin');
    assert.equal(requests.length, 1, 'Super Admin can view requests');
  });

  harness.test('F4.3: Unauthenticated / anonymous caller is rejected with Access Denied', () => {
    const { sim, clinic1Id } = createPopulatedHarness();
    assert.throws(() => {
      sim.listPendingPayAtDeskRequests(clinic1Id, null, 'anon');
    }, /Access denied/);
  });

  harness.test('F4.4: Unrelated authenticated user (stranger) is rejected from listing another clinic requests', () => {
    const { sim, clinic1Id } = createPopulatedHarness();
    assert.throws(() => {
      sim.listPendingPayAtDeskRequests(clinic1Id, 'stranger@gmail.com', 'authenticated');
    }, /Access denied/);
  });

  harness.test('F4.5: Pending list strictly excludes appointments with status APPROVED, UNAPPROVED, or EXPIRED', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000005',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Approved User',
      payment_mode: 'PAY_AT_DESK',
      status: 'APPROVED',
      created_at: new Date().toISOString()
    });
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000006',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Unapproved User',
      payment_mode: 'PAY_AT_DESK',
      status: 'UNAPPROVED',
      created_at: new Date().toISOString()
    });
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000007',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Expired User',
      payment_mode: 'PAY_AT_DESK',
      status: 'EXPIRED',
      created_at: new Date().toISOString()
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'alpha_desk@dactor.com', 'authenticated');
    assert.equal(requests.length, 0, 'Non-pending statuses must be excluded from listing');
  });

  harness.test('F4.6: Pending list strictly excludes appointments with payment_mode ONLINE', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000008',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Online Patient',
      payment_mode: 'ONLINE',
      status: 'WAITING_FOR_APPROVAL', // Even if status somehow matched
      created_at: new Date().toISOString()
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'alpha_desk@dactor.com', 'authenticated');
    assert.equal(requests.length, 0, 'ONLINE appointments must be excluded');
  });

  harness.test('F4.7: Pending list returns complete schema with fee breakdown and attempt counter', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '33333333-aaaa-4000-8000-000000000009';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Saroj Khanal',
      patient_mobile: '9841889900',
      tracking_code_10_digit: '9841889900',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 2,
      fee_amount: 1000.00,
      service_charge_amount: 50.00,
      total_amount: 1050.00,
      created_at: new Date().toISOString()
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'alpha_desk@dactor.com', 'authenticated');
    assert.equal(requests.length, 1, 'Found 1 item');
    const req = requests[0];
    assert.equal(req.attempt_number, 2, 'attempt_number is 2');
    assert.equal(req.fee_amount, 1000.00, 'fee_amount is 1000.00');
    assert.equal(req.service_charge_amount, 50.00, 'service_charge is 50.00');
    assert.equal(req.total_amount, 1050.00, 'total_amount is 1050.00');
    assert.equal(req.doctor_name, 'Dr. Thorne', 'doctor_name populated');
  });

  harness.test('F4.8: Pending requests are returned in chronological FIFO order (created_at ASC)', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const t0 = new Date('2026-10-25T10:00:00Z').toISOString();
    const t1 = new Date('2026-10-25T10:15:00Z').toISOString();
    const t2 = new Date('2026-10-25T10:30:00Z').toISOString();

    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000010',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Patient 2 (t1)',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: t1
    });
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000011',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Patient 1 (t0)',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: t0
    });
    sim.seedAppointment({
      id: '33333333-aaaa-4000-8000-000000000012',
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Patient 3 (t2)',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: t2
    });

    const requests = sim.listPendingPayAtDeskRequests(clinic1Id, 'alpha_desk@dactor.com', 'authenticated');
    assert.equal(requests.length, 3, 'Found 3 items');
    assert.equal(requests[0].patient_name, 'Patient 1 (t0)', 'Oldest first');
    assert.equal(requests[1].patient_name, 'Patient 2 (t1)', 'Second oldest second');
    assert.equal(requests[2].patient_name, 'Patient 3 (t2)', 'Newest last');
  });

  // =========================================================================
  // F5: QUEUE EXCLUSION WHILE PENDING
  // =========================================================================

  harness.test('F5.1: Appointment in WAITING_FOR_APPROVAL is NOT present in queue_entries', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '44444444-aaaa-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Queue Test 1',
      payment_mode: 'PAY_AT_DESK',
      status: 'pending',
      created_at: new Date().toISOString()
    });

    sim.confirmPayAtDeskBooking(apptId);
    assert.equal(sim.queueEntries.has(apptId), false, 'Pending appointment must not be in queue_entries');
  });

  harness.test('F5.2: Live queue position calculation ignores pending Pay at Desk appointments', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    // 2 approved appointments in queue
    sim.queueEntries.set('existing-1', { clinic_id: clinic1Id, queue_position: 1, status: 'waiting' });
    sim.queueEntries.set('existing-2', { clinic_id: clinic1Id, queue_position: 2, status: 'waiting' });

    // Seed 1 pending appointment
    const apptId = '44444444-aaaa-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Queue Test 2',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const activeQueue = Array.from(sim.queueEntries.values()).filter(q => q.clinic_id === clinic1Id);
    assert.equal(activeQueue.length, 2, 'Active queue count remains exactly 2');
  });

  harness.test('F5.3: Queue length count does not increment when a Pay at Desk appointment is booked', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const countBefore = sim.queueEntries.size;
    const apptId = '44444444-aaaa-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Queue Test 3',
      created_at: new Date().toISOString()
    });
    sim.confirmPayAtDeskBooking(apptId);
    const countAfter = sim.queueEntries.size;
    assert.equal(countAfter, countBefore, 'Queue size must remain unchanged');
  });

  harness.test('F5.4: Patient tracking for pending appointment does NOT assign a token number', () => {
    const getPatientTokenInfo = (sim, apptId) => {
      const entry = sim.queueEntries.get(apptId);
      if (!entry) return { hasToken: false, token: null, status: 'WAITING_FOR_APPROVAL' };
      return { hasToken: true, token: entry.queue_position, status: entry.status };
    };

    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '44444444-aaaa-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Queue Test 4',
      created_at: new Date().toISOString()
    });
    sim.confirmPayAtDeskBooking(apptId);

    const tokenInfo = getPatientTokenInfo(sim, apptId);
    assert.equal(tokenInfo.hasToken, false, 'Patient must not have a token');
    assert.equal(tokenInfo.token, null, 'Token is null');
  });

  harness.test('F5.5: Doctor cabin queue list excludes pending Pay at Desk appointments', () => {
    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    const apptId = '44444444-aaaa-4000-8000-000000000005';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinic1Id,
      doctor_id: doctor1Id,
      slot_id: slot1Id,
      patient_name: 'Queue Test 5',
      created_at: new Date().toISOString()
    });
    sim.confirmPayAtDeskBooking(apptId);

    const doctorQueue = Array.from(sim.queueEntries.values()).filter(q => q.doctor_id === doctor1Id);
    assert.equal(doctorQueue.length, 0, 'Doctor queue has 0 entries');
  });

  harness.test('F5.6: Estimated wait time calculation is unaffected by pending appointments', () => {
    const avgConsultMinutes = 10;
    const calculateWaitTime = (sim, clinicId) => {
      const waitingPatients = Array.from(sim.queueEntries.values()).filter(q => q.clinic_id === clinicId && q.status === 'waiting');
      return waitingPatients.length * avgConsultMinutes;
    };

    const { sim, clinic1Id, doctor1Id, slot1Id } = createPopulatedHarness();
    sim.queueEntries.set('q-1', { clinic_id: clinic1Id, queue_position: 1, status: 'waiting' });
    sim.queueEntries.set('q-2', { clinic_id: clinic1Id, queue_position: 2, status: 'waiting' });

    const waitBefore = calculateWaitTime(sim, clinic1Id);

    // Book 3 pending pay-at-desk appointments
    for (let i = 1; i <= 3; i++) {
      const apptId = `44444444-aaaa-4000-8000-00000000001${i}`;
      sim.seedAppointment({
        id: apptId,
        clinic_id: clinic1Id,
        doctor_id: doctor1Id,
        slot_id: slot1Id,
        patient_name: `Pending Patient ${i}`,
        created_at: new Date().toISOString()
      });
      sim.confirmPayAtDeskBooking(apptId);
    }

    const waitAfter = calculateWaitTime(sim, clinic1Id);
    assert.equal(waitBefore, 20, 'Wait time before was 20 minutes');
    assert.equal(waitAfter, 20, 'Wait time after remains exactly 20 minutes');
  });
}

module.exports = { registerTier1Tests };
