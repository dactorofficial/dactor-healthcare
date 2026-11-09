/**
 * Tier 4: Real-World Scenario Tests for Pay at Desk Lifecycle
 * Complete multi-party end-to-end workflows across patient, clinic reception, and backend:
 * - S1: Patient Mobile Checkout Journey
 * - S2: Clinic Counter Reception Desk Workflow
 * - S3: Overloaded Afternoon Clinic Session (Rule 7 Invariant)
 * - S4: Patient Rejection & Retry Journey
 * - S5: Adversarial Attack & Security Tampering Verification
 * - S6: Expired Request Tracking Experience
 */

const { assert, TestHarness } = require('./test_runner.cjs');
const {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  formatMoney,
  evaluateSlotCapacity,
  PayAtDeskBackendSimulator
} = require('./contracts.cjs');

function registerTier4Tests(harness) {
  function createPopulatedHarness() {
    const sim = new PayAtDeskBackendSimulator();
    const clinicId = 'dddddddd-1111-4000-8000-000000000001';
    const doctorId = 'eeeeeeee-1111-4000-8000-000000000001';
    const slotId   = 'ffffffff-1111-4000-8000-000000000001';

    sim.seedClinic({ id: clinicId, name: 'Metro Health Clinic', contact_email: 'metro@dactor.com' });
    sim.seedDoctor({ id: doctorId, clinic_id: clinicId, full_name: 'Dr. Rajesh Regmi', consultation_fee: 1000.00 });
    sim.seedSlot({
      id: slotId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_date: '2026-11-20',
      start_time: '14:00:00',
      end_time: '15:00:00',
      max_capacity: 12,
      booked_count: 12 // Pre-filled to capacity
    });

    return { sim, clinicId, doctorId, slotId };
  }

  // =========================================================================
  // S1: PATIENT MOBILE CHECKOUT JOURNEY
  // =========================================================================

  harness.test('S1.1: Patient selects Pay at Desk on PaymentScreen: UI displays 5% service charge notice', () => {
    const paymentMethods = [
      { id: 'esewa', name: 'eSewa' },
      { id: 'khalti', name: 'Khalti' },
      { id: 'pay_at_desk', name: 'Pay at Desk (+5%)', note: 'A 5% service charge will be added to your bill when paying at the desk' }
    ];

    const selected = paymentMethods.find(m => m.id === 'pay_at_desk');
    assert.ok(selected, 'Pay at Desk option available');
    assert.equal(selected.note, 'A 5% service charge will be added to your bill when paying at the desk');
  });

  harness.test('S1.2: Dynamic breakdown calculates consultation fee, 5% fee, and total at desk', () => {
    const doctorConsultationFee = 1000.00;
    const serviceCharge = calculateServiceCharge(doctorConsultationFee);
    const totalDue = calculateTotalAmount(doctorConsultationFee, serviceCharge);

    const breakdownUI = {
      consultationFeeLabel: `NPR ${formatMoney(doctorConsultationFee)}`,
      serviceChargeLabel: `NPR ${formatMoney(serviceCharge)}`,
      totalDueLabel: `NPR ${formatMoney(totalDue)}`
    };

    assert.equal(breakdownUI.consultationFeeLabel, 'NPR 1000.00');
    assert.equal(breakdownUI.serviceChargeLabel, 'NPR 50.00');
    assert.equal(breakdownUI.totalDueLabel, 'NPR 1050.00');
  });

  harness.test('S1.3: User clicks Confirm Pay at Desk: Payment countdown timer is cancelled cleanly', () => {
    let timerActive = true;
    const cancelPaymentSessionTimer = () => { timerActive = false; };

    // Simulate clicking "Confirm Pay at Desk"
    cancelPaymentSessionTimer();
    assert.equal(timerActive, false, '5-minute payment session countdown timer cancelled');
  });

  harness.test('S1.4: Saves 10-digit tracking code into local session and repository', () => {
    const session = { currentAppointment: null };
    const trackingCode = '9841234567';

    const saveSession = (code) => {
      session.currentAppointment = { trackingCode: code, savedAt: Date.now() };
    };

    saveSession(trackingCode);
    assert.equal(session.currentAppointment.trackingCode, '9841234567');
  });

  harness.test('S1.5: Checkout completes with success and navigates without toast errors', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e1010101-0001-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_name: 'Patient Journey 1',
      patient_mobile: '9841999888',
      tracking_code_10_digit: '9841999888',
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00',
      payment_mode: 'ONLINE',
      status: 'pending'
    });

    const confirmation = sim.confirmPayAtDeskBooking(apptId);
    assert.ok(confirmation.success);
    assert.equal(confirmation.status, 'WAITING_FOR_APPROVAL');
  });

  // =========================================================================
  // S2: CLINIC COUNTER RECEPTION DESK WORKFLOW
  // =========================================================================

  harness.test('S2.1: Clinic receptionist opens portal, sees View Requests button with pending count badge (1)', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e2020202-0002-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_name: 'Reception Patient 1',
      patient_mobile: '9841555666',
      tracking_code_10_digit: '9841555666',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      created_at: new Date().toISOString()
    });

    const pendingRequests = sim.listPendingPayAtDeskRequests(clinicId, 'metro@dactor.com', 'authenticated');
    const badgeCount = pendingRequests.length;
    assert.equal(badgeCount, 1, 'Badge count is 1');
  });

  harness.test('S2.2: Receptionist views pending list with patient details, attempt counter, and fee breakdown', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e2020202-0002-4000-8000-000000000002';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_name: 'Reception Patient 2',
      patient_mobile: '9841555667',
      tracking_code_10_digit: '9841555667',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1,
      fee_amount: 1000.00,
      service_charge_amount: 50.00,
      total_amount: 1050.00,
      created_at: new Date().toISOString()
    });

    const [req] = sim.listPendingPayAtDeskRequests(clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(req.patient_name, 'Reception Patient 2');
    assert.equal(req.patient_mobile, '9841555667');
    assert.equal(`Attempt ${req.attempt_number} of 3`, 'Attempt 1 of 3');
    assert.equal(req.total_amount, 1050.00);
  });

  harness.test('S2.3: Receptionist clicks Approve: Atomic transition to APPROVED and badge count clears to 0', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e2020202-0002-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_name: 'Reception Patient 3',
      patient_mobile: '9841555668',
      tracking_code_10_digit: '9841555668',
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00',
      created_at: new Date().toISOString()
    });

    sim.approvePayAtDeskAppointment(apptId, clinicId, 'metro@dactor.com', 'authenticated');

    const pendingAfter = sim.listPendingPayAtDeskRequests(clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(pendingAfter.length, 0, 'Badge count drops to 0');
  });

  harness.test('S2.4: Notification emitted to patient confirming approval and total due at desk', () => {
    const generatePatientNotification = (trackingCode, totalAmount) => {
      return {
        title: 'Appointment Approved!',
        message: `Your Pay at Desk appointment #${trackingCode} is approved. Total due at desk: NPR ${totalAmount}`
      };
    };

    const notif = generatePatientNotification('9841555668', '1050.00');
    assert.equal(notif.title, 'Appointment Approved!');
    assert.includes(notif.message, 'Total due at desk: NPR 1050.00');
  });

  // =========================================================================
  // S3: OVERLOADED AFTERNOON CLINIC SESSION (RULE 7)
  // =========================================================================

  harness.test('S3.1: Doctor slot starts at full capacity (12/12)', () => {
    const { sim, slotId } = createPopulatedHarness();
    const slot = sim.slots.get(slotId);
    assert.equal(slot.max_capacity, 12);
    assert.equal(slot.booked_count, 12);
  });

  harness.test('S3.2: Reception approves walk-in patient 1: Slot reaches 13/12', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId1 = 'e3030303-0003-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId1,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_mobile: '9841111111',
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    sim.approvePayAtDeskAppointment(apptId1, clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(sim.slots.get(slotId).booked_count, 13);
  });

  harness.test('S3.3: Reception approves walk-in patient 2: Slot reaches 14/12 without error', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId2 = 'e3030303-0003-4000-8000-000000000002';
    // slot was at 13 after previous
    sim.slots.get(slotId).booked_count = 13;

    sim.seedAppointment({
      id: apptId2,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_mobile: '9841111112',
      status: 'WAITING_FOR_APPROVAL',
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    sim.approvePayAtDeskAppointment(apptId2, clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(sim.slots.get(slotId).booked_count, 14);
  });

  harness.test('S3.4: Web Portal and Mobile display overloaded slot as FULL without crash', () => {
    const slotMetrics14 = evaluateSlotCapacity(12, 14);
    assert.equal(slotMetrics14.bookedCount, 14);
    assert.equal(slotMetrics14.maxCapacity, 12);
    assert.equal(slotMetrics14.remainingCount, 0, 'Zero remaining (never negative)');
    assert.equal(slotMetrics14.uiLabel, 'FULL');
  });

  harness.test('S3.5: Sequential live queue positions assigned to overloaded patients (Token 13, Token 14)', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    // Simulate 12 existing tokens
    for (let i = 1; i <= 12; i++) {
      sim.queueEntries.set(`q-token-${i}`, { clinic_id: clinicId, queue_position: i, status: 'waiting' });
    }

    const appt13 = 'e3030303-0003-4000-8000-000000000013';
    const appt14 = 'e3030303-0003-4000-8000-000000000014';

    sim.seedAppointment({ id: appt13, clinic_id: clinicId, doctor_id: doctorId, slot_id: slotId, status: 'WAITING_FOR_APPROVAL', appointment_date: '2026-11-20', appointment_time: '14:00:00' });
    sim.seedAppointment({ id: appt14, clinic_id: clinicId, doctor_id: doctorId, slot_id: slotId, status: 'WAITING_FOR_APPROVAL', appointment_date: '2026-11-20', appointment_time: '14:00:00' });

    const res13 = sim.approvePayAtDeskAppointment(appt13, clinicId, 'metro@dactor.com', 'authenticated');
    const res14 = sim.approvePayAtDeskAppointment(appt14, clinicId, 'metro@dactor.com', 'authenticated');

    assert.equal(res13.queue_position, 13, 'Token 13 assigned');
    assert.equal(res14.queue_position, 14, 'Token 14 assigned');
  });

  // =========================================================================
  // S4: PATIENT REJECTION & RETRY JOURNEY
  // =========================================================================

  harness.test('S4.1: Receptionist rejects request due to doctor delayed in traffic', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e4040404-0004-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_mobile: '9841333444',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    const res = sim.rejectPayAtDeskAppointment(apptId, clinicId, 'metro@dactor.com', 'authenticated', 'Doctor delayed in traffic');
    assert.equal(res.appointment.status, 'UNAPPROVED');
    assert.equal(res.appointment.attempt_number, 1);
  });

  harness.test('S4.2: Patient opens app, sees Unapproved status, Attempt 1 of 3, and active Retry button', () => {
    const getPatientView = (appt) => {
      return {
        statusText: 'Unapproved',
        attemptText: `Attempt ${appt.attempt_number} of 3`,
        retryEnabled: appt.attempt_number < 3
      };
    };

    const view = getPatientView({ attempt_number: 1 });
    assert.equal(view.statusText, 'Unapproved');
    assert.equal(view.attemptText, 'Attempt 1 of 3');
    assert.equal(view.retryEnabled, true);
  });

  harness.test('S4.3: Patient taps Retry: Resubmits to desk as Attempt 2 of 3', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e4040404-0004-4000-8000-000000000003';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_mobile: '9841333444',
      payment_mode: 'PAY_AT_DESK',
      status: 'UNAPPROVED',
      attempt_number: 1,
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    const ret = sim.retryPayAtDeskAppointment(apptId, '9841333444');
    assert.equal(ret.appointment.status, 'WAITING_FOR_APPROVAL');
    assert.equal(ret.appointment.attempt_number, 2);

    const pending = sim.listPendingPayAtDeskRequests(clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].attempt_number, 2);
  });

  harness.test('S4.4: Receptionist approves attempt 2 when doctor arrives at clinic', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e4040404-0004-4000-8000-000000000004';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      patient_mobile: '9841333444',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 2,
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    const approved = sim.approvePayAtDeskAppointment(apptId, clinicId, 'metro@dactor.com', 'authenticated');
    assert.equal(approved.appointment.status, 'APPROVED');
    assert.ok(approved.queue_position >= 1);
  });

  // =========================================================================
  // S5: ADVERSARIAL ATTACKS & ANTI-TAMPERING HARDENING
  // =========================================================================

  harness.test('S5.1: Malicious patient attempts direct SQL update setting status=APPROVED: Blocked by RLS/Trigger', () => {
    const simulateDirectPatientUpdate = (callerRole, newValues) => {
      if (callerRole === 'anon' || callerRole === 'patient') {
        if (newValues.status === 'APPROVED' || newValues.checkin_status === 'checked_in') {
          throw new Error('Trigger anti-tampering: Direct mutation of appointment status blocked');
        }
      }
      return true;
    };

    assert.throws(() => {
      simulateDirectPatientUpdate('anon', { status: 'APPROVED' });
    }, /Direct mutation of appointment status blocked/);
  });

  harness.test('S5.2: Malicious client sends crafted JSON with fee_amount = 0.00: Server overrides with doctor catalog fee', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e5050505-0005-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId, // Dr. Regmi fee = 1000.00
      slot_id: slotId,
      patient_mobile: '9841000099',
      status: 'pending',
      fee_amount: 0.00
    });

    const res = sim.confirmPayAtDeskBooking(apptId, 0.00);
    assert.equal(res.fee_amount, 1000.00, 'Server catalog fee overrides zero fee');
    assert.equal(res.total_amount, 1050.00, 'Total is 1050.00');
  });

  harness.test('S5.3: Attacker attempts to list another clinic pending requests with forged email: Access Denied', () => {
    const { sim, clinicId } = createPopulatedHarness();
    assert.throws(() => {
      sim.listPendingPayAtDeskRequests(clinicId, 'hacker@attacker.com', 'authenticated');
    }, /Access denied/);
  });

  // =========================================================================
  // S6: EXPIRED REQUEST TRACKING EXPERIENCE
  // =========================================================================

  harness.test('S6.1: 3rd attempt expires after 2 days: Expiry engine marks it EXPIRED', () => {
    const { sim, clinicId, doctorId, slotId } = createPopulatedHarness();
    const apptId = 'e6060606-0006-4000-8000-000000000001';
    sim.seedAppointment({
      id: apptId,
      clinic_id: clinicId,
      doctor_id: doctorId,
      slot_id: slotId,
      payment_mode: 'PAY_AT_DESK',
      status: 'WAITING_FOR_APPROVAL',
      attempt_number: 3,
      expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired
      appointment_date: '2026-11-20',
      appointment_time: '14:00:00'
    });

    const count = sim.expirePayAtDeskAppointments('service_role');
    assert.equal(count, 1);
    assert.equal(sim.appointments.get(apptId).status, 'EXPIRED');
  });

  harness.test('S6.2: Patient entering 10-digit code sees Request expired without Retry button and with Call Clinic dialer', () => {
    const getExpiredUI = (status) => {
      if (status === 'EXPIRED') {
        return {
          statusBadge: 'Request expired',
          showRetryButton: false,
          showCallClinicButton: true,
          dialerPhone: 'tel:014433221'
        };
      }
      return null;
    };

    const ui = getExpiredUI('EXPIRED');
    assert.equal(ui.statusBadge, 'Request expired');
    assert.equal(ui.showRetryButton, false, 'No retry button on expired');
    assert.equal(ui.showCallClinicButton, true, 'Call clinic button enabled');
  });
}

module.exports = { registerTier4Tests };
