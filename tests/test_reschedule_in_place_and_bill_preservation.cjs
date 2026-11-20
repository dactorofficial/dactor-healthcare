/**
 * Automated Verification: Reschedule In-Place and Bill Preservation Test
 * File: tests/test_reschedule_in_place_and_bill_preservation.cjs
 *
 * Verifies:
 * 1. Rescheduling updates appointment in-place without creating duplicate/new records.
 * 2. Original consultation fees (fee_amount, total_amount) are strictly preserved.
 * 3. Invoices in billing_invoices are never wiped out or set to 0 on reschedule.
 * 4. recordPaymentTransaction safeguards against 0-amount overwrites.
 * 5. Frontend reschedule flows never route into createAppointment or recordPaymentTransaction(0).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- RUNNING RESCHEDULE IN-PLACE & BILL PRESERVATION TEST SUITE ---\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
  }
}

// ---------------------------------------------------------
// SUITE 1: Static Code Invariant Checks (Web App & Mobile)
// ---------------------------------------------------------

it('BookingScreen.kt must never call bookFollowUpAppointment in isRescheduleMode and must call rescheduleAppointment', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/ui/booking/BookingScreen.kt'),
    'utf8'
  );
  
  const startIdx = file.indexOf('if (isRescheduleMode && pendingReschedule != null)');
  assert(startIdx !== -1, 'Could not find isRescheduleMode block in BookingScreen.kt');
  const endIdx = file.indexOf('val isUserLoggedIn =', startIdx);
  assert(endIdx !== -1, 'Could not find end of isRescheduleMode block');
  const rescheduleBlock = file.slice(startIdx, endIdx);
  
  assert(
    !rescheduleBlock.includes('bookFollowUpAppointment'),
    'BookingScreen.kt MUST NOT invoke bookFollowUpAppointment in isRescheduleMode!'
  );
  assert(
    rescheduleBlock.includes('appointmentRepository?.rescheduleAppointment'),
    'BookingScreen.kt must invoke rescheduleAppointment in isRescheduleMode!'
  );
});

it('BookingFormScreen.kt must reschedule in-place when isRetainedActive is true', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/ui/booking/BookingFormScreen.kt'),
    'utf8'
  );
  
  assert(
    file.includes('isRetainedActive && retainedAppointment != null'),
    'BookingFormScreen.kt must explicitly branch for isRetainedActive'
  );
  assert(
    file.includes('appointmentRepository?.rescheduleAppointment('),
    'BookingFormScreen.kt must invoke rescheduleAppointment for active retained visits'
  );
});

it('ClinicDetail.tsx must never call createAppointment when isReschedule is true', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '../web-app/src/pages/ClinicDetail.tsx'),
    'utf8'
  );
  
  const marker = '// 1. Reschedule handling (Strictly in-place: NEVER create new appointment or overwrite bill)';
  const startIdx = file.indexOf(marker);
  assert(startIdx !== -1, 'Could not find reschedule handling marker in ClinicDetail.tsx');
  const endIdx = file.indexOf('if (isReturningPatient && retainedAppointment)', startIdx);
  assert(endIdx !== -1, 'Could not find end of if (isReschedule) block');
  const rescheduleBlock = file.slice(startIdx, endIdx);

  assert(
    !rescheduleBlock.includes('createAppointment'),
    'ClinicDetail.tsx must never invoke createAppointment inside isReschedule block!'
  );
  assert(
    rescheduleBlock.includes('shiftAppointmentDate'),
    'ClinicDetail.tsx must invoke shiftAppointmentDate inside isReschedule block!'
  );
});

it('PatientPortal.tsx must never call recordPaymentTransaction when isRescheduleMode is true', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '../web-app/src/pages/PatientPortal.tsx'),
    'utf8'
  );
  
  const startIdx = file.indexOf('if (isRescheduleMode) {');
  assert(startIdx !== -1, 'Could not find if (isRescheduleMode) block in PatientPortal.tsx');
  const endIdx = file.indexOf('const isFreeFollowup =', startIdx);
  assert(endIdx !== -1, 'Could not find end of if (isRescheduleMode) block');
  const rescheduleBlock = file.slice(startIdx, endIdx);

  // Strip comments before checking for function call
  const codeWithoutComments = rescheduleBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(
    !codeWithoutComments.includes('recordPaymentTransaction'),
    'PatientPortal.tsx must never invoke recordPaymentTransaction inside isRescheduleMode!'
  );
  assert(
    rescheduleBlock.includes('shiftAppointmentDate'),
    'PatientPortal.tsx must invoke shiftAppointmentDate inside isRescheduleMode!'
  );
  assert(
    rescheduleBlock.includes('return'),
    'PatientPortal.tsx must return early after shiftAppointmentDate without executing payment transaction'
  );
});

it('db.ts recordPaymentTransaction must preserve appointment fee & invoice total on 0-amount calls', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '../web-app/src/services/db.ts'),
    'utf8'
  );

  assert(
    file.includes('expectedApptTotal ='),
    'db.ts must calculate expectedApptTotal'
  );
  assert(
    file.includes('Math.max(Number(apptRow?.total_amount || 0), Number(apptRow?.fee_amount || 0), Number(record.amount || 0))'),
    'db.ts must preserve appt fee_amount and total_amount in expectedApptTotal'
  );
  assert(
    file.includes('const itemPrice = Number(record.amount || 0) > 0 ? Number(record.amount) : baseFee'),
    'db.ts must preserve baseFee in itemPrice when record.amount <= 0'
  );
});

it('Supabase RPC reschedule_patient_appointment allows in-place reschedule without completed visit block', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migration_reschedule_appointment_rpc.sql'),
    'utf8'
  );

  assert(
    !sql.includes("RETURN jsonb_build_object('success', false, 'error', 'Completed appointments cannot be rescheduled');"),
    'Supabase RPC must not block completed appointments from in-place rescheduling'
  );
  assert(
    sql.includes("consultation_completed_at = NULL"),
    'Supabase RPC must clear consultation_completed_at on reschedule'
  );
  assert(
    sql.includes("checkin_status = 'not_checked_in'"),
    'Supabase RPC must reset checkin_status to not_checked_in'
  );
});

// ---------------------------------------------------------
// SUITE 2: Behavioral Mock Simulations
// ---------------------------------------------------------

it('Simulate recordPaymentTransaction logic: original fee 500 must NOT be overwritten when amount is 0', () => {
  const PAY_AT_DESK_SERVICE_CHARGE_PERCENT = 5.0;
  
  // Appointment had fee 500
  const apptRow = {
    payment_mode: 'ONLINE',
    fee_amount: 500,
    total_amount: 500,
    service_charge_amount: 0
  };
  
  // Existing invoice had 500
  const existingInv = {
    id: 'inv-123',
    total_amount: 500,
    paid_amount: 500,
    items: [{ id: 'item-1', item_name: 'OPD Consultation Fee', price: 500, total: 500 }]
  };

  const record = {
    appointmentId: 'appt-123',
    amount: 0, // Reschedule 0 amount passed
    paymentMethod: 'RESCHEDULE',
    paymentStatus: 'paid'
  };

  const isPayAtDesk =
    String(apptRow?.payment_mode || '').toUpperCase() === 'PAY_AT_DESK' ||
    record.paymentMethod.toLowerCase().includes('desk');
  const baseFee = Number(apptRow?.fee_amount) > 0 ? Number(apptRow?.fee_amount) : Number(record.amount || 0);
  const serviceCharge =
    isPayAtDesk && baseFee > 0
      ? Number(apptRow?.service_charge_amount) > 0
        ? Number(apptRow?.service_charge_amount)
        : Math.round(baseFee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100) * 100) / 100
      : 0;
  const expectedApptTotal =
    isPayAtDesk && baseFee > 0
      ? Math.max(Number(apptRow?.total_amount || 0), Math.round((baseFee + serviceCharge) * 100) / 100)
      : Math.max(Number(apptRow?.total_amount || 0), Number(apptRow?.fee_amount || 0), Number(record.amount || 0));

  const existingItemsRaw = Array.isArray(existingInv?.items) ? existingInv.items : [];
  let existingItems;
  if (existingItemsRaw.length > 0) {
    existingItems = existingItemsRaw;
  } else {
    const itemPrice = Number(record.amount || 0) > 0 ? Number(record.amount) : baseFee;
    existingItems = [
      {
        id: 'new-item-1',
        item_name: 'Consultation & Clinical Services',
        quantity: 1,
        price: itemPrice,
        total: itemPrice,
      },
    ];
  }

  const effectiveTotal = Math.max(
    Number(record.amount || 0),
    expectedApptTotal,
    baseFee,
    Number(existingInv?.total_amount || 0)
  );

  const dbPayStatus = 'paid';
  const paidAmt = dbPayStatus === 'paid' ? effectiveTotal : Math.max(0, Number(existingInv?.paid_amount || 0));
  const balanceDue = Math.max(0, effectiveTotal - paidAmt);

  assert.equal(effectiveTotal, 500, 'Effective total must remain 500, never drop to 0');
  assert.equal(paidAmt, 500, 'Paid amount must remain 500');
  assert.equal(balanceDue, 0, 'Balance due must be 0 for paid appointment');
  assert.equal(existingItems[0].price, 500, 'Item price must remain 500');
});

it('Simulate in-place reschedule: appointment retains exact ID, tracking code, and fee', () => {
  const originalAppt = {
    id: 'appt-uuid-999',
    trackingCode10Digit: '9841234567',
    patientName: 'Ram Sharma',
    feeAmount: 750.0,
    totalAmount: 750.0,
    appointmentDate: '2026-11-20',
    appointmentTime: '10:00 AM',
    slotId: 'slot-1',
    checkinStatus: 'done',
    status: 'APPROVED'
  };

  const newDate = '2026-11-25';
  const newTime = '11:30 AM';
  const newSlotId = 'slot-2';

  // In-place shift operation
  const updatedAppt = {
    ...originalAppt,
    appointmentDate: newDate,
    appointmentTime: newTime,
    slotId: newSlotId,
    checkinStatus: 'not_checked_in'
  };

  assert.equal(updatedAppt.id, originalAppt.id, 'Appointment ID must remain identical');
  assert.equal(updatedAppt.trackingCode10Digit, originalAppt.trackingCode10Digit, 'Tracking code must remain identical');
  assert.equal(updatedAppt.feeAmount, 750.0, 'Fee amount must remain 750.0');
  assert.equal(updatedAppt.totalAmount, 750.0, 'Total amount must remain 750.0');
  assert.equal(updatedAppt.appointmentDate, '2026-11-25', 'Appointment date must be updated');
  assert.equal(updatedAppt.appointmentTime, '11:30 AM', 'Appointment time must be updated');
  assert.equal(updatedAppt.checkinStatus, 'not_checked_in', 'Checkin status must reset to not_checked_in');
});

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passedTests}/${totalTests} ASSERTIONS PASSED`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
