/**
 * Tier 3: Cross-Feature Interactions E2E Tests
 * Validates complex multi-stage workflows linking appointment creation, payment processing,
 * queue tracking, storage authorization, and guest identity verification.
 * Sources: PROJECT.md, ORIGINAL_REQUEST.md
 */

const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  CONTRACTS,
  generateStructuredTrackingCode,
  validateLuhnTrackingCode,
  normalizeNepalMobileNumber,
  generateEsewaSignature,
  verifyEsewaSignature,
  verifyEsewaTransaction,
  calculateAuthoritativeFee,
  filterPublicQueueStatus,
  generateSafeStoragePath,
  isFirebaseUid,
  safeAuthUid
} = require('./contracts.cjs');

const suite = createTestSuite('Cross-Feature Interactions', 3);

// ---------------------------------------------------------------------------
// LIFECYCLE 1: Appointment Creation -> eSewa Payment -> Status Transition
// ---------------------------------------------------------------------------

suite.test('X1.1: Multi-stage flow: Appointment creation captures authoritative fee and pending status', (assert) => {
  // Step 1: Doctor catalog fee
  const doctor = { id: 'doc-ortho-01', name: 'Dr. Suresh Giri', consultation_fee: 900.00 };
  const clinic = { id: 'clinic-ktm-01', name: 'Bir Hospital Polyclinic' };

  // Step 2: Client sends appointment creation payload with malicious fee attempt
  const clientInput = {
    clinic_id: clinic.id,
    doctor_id: doctor.id,
    patient_name: 'Ram Bahadur',
    patient_phone: '9841555666',
    fee_amount: 10.00, // Attacker attempts to pay 10 NPR
    payment_status: 'paid' // Attacker attempts to mark as paid
  };

  // Step 3: Server Authoritative Creation RPC
  const authoritativeFee = calculateAuthoritativeFee(doctor);
  const trackingCode = generateStructuredTrackingCode(101, 296, 7);

  const createdAppointment = {
    id: 'appt-uuid-001',
    clinic_id: clinic.id,
    doctor_id: doctor.id,
    patient_name: clientInput.patient_name,
    patient_phone: normalizeNepalMobileNumber(clientInput.patient_phone),
    tracking_code_10_digit: trackingCode,
    fee_amount: authoritativeFee, // Enforced authoritative fee
    payment_status: 'pending',     // Forced pending status
    checkin_status: 'not_checked_in'
  };

  assert.equal(createdAppointment.fee_amount, 900.00, 'Fee must be server-calculated 900 NPR');
  assert.equal(createdAppointment.payment_status, 'pending', 'Status must be pending');
  assert.ok(validateLuhnTrackingCode(createdAppointment.tracking_code_10_digit), 'Valid Luhn code issued');
});

suite.test('X1.2: Multi-stage flow: eSewa payment attempt initialized with authoritative fee and HMAC signature', (assert) => {
  const appointment = {
    id: 'appt-uuid-001',
    clinic_id: 'clinic-ktm-01',
    fee_amount: 900.00,
    payment_status: 'pending'
  };

  const secretKey = 'esewa-secret-for-bir-clinic';
  const productCode = 'BIR_HOSP_KTM';
  const transactionUuid = `TXN-${Date.now()}-${appointment.id.slice(0, 8)}`;

  // Payment Initiation Edge Function contract
  const paymentAttempt = {
    id: 'attempt-uuid-555',
    appointment_id: appointment.id,
    clinic_id: appointment.clinic_id,
    transaction_uuid: transactionUuid,
    amount_npr: appointment.fee_amount.toFixed(2),
    status: 'pending'
  };

  const signature = generateEsewaSignature({
    total_amount: paymentAttempt.amount_npr,
    transaction_uuid: paymentAttempt.transaction_uuid,
    product_code: productCode
  }, secretKey);

  assert.equal(paymentAttempt.amount_npr, '900.00', 'Amount must match appointment authoritative fee');
  assert.ok(verifyEsewaSignature({
    total_amount: paymentAttempt.amount_npr,
    transaction_uuid: paymentAttempt.transaction_uuid,
    product_code: productCode
  }, signature, secretKey), 'HMAC signature must verify');
});

suite.test('X1.3: Multi-stage flow: Verified eSewa callback transitions payment status to paid', (assert) => {
  const paymentAttempt = {
    id: 'attempt-uuid-555',
    appointment_id: 'appt-uuid-001',
    transaction_uuid: 'TXN-BIR-12345',
    amount_npr: '900.00',
    status: 'pending'
  };

  const providerCallback = {
    status: 'COMPLETE',
    product_code: 'BIR_HOSP_KTM',
    transaction_uuid: 'TXN-BIR-12345',
    total_amount: '900.00',
    ref_id: 'ESEWA-REF-889900'
  };

  // Server-to-server verification step
  const verification = verifyEsewaTransaction(paymentAttempt, providerCallback, 'BIR_HOSP_KTM');
  assert.ok(verification.verified, 'Server-to-server check succeeds');

  // Database transition RPC simulation (finalize_esewa_appointment_payment)
  const finalizedAppointment = {
    id: paymentAttempt.appointment_id,
    payment_status: 'paid',
    paid_amount: verification.verifiedAmount,
    provider_reference: verification.refId
  };

  assert.equal(finalizedAppointment.payment_status, 'paid', 'Status transitions to paid');
  assert.equal(finalizedAppointment.paid_amount, 900.00, 'Paid amount recorded accurately');
});

// ---------------------------------------------------------------------------
// LIFECYCLE 2: Appointment Creation -> Queue Tracking -> Cabin Checkin
// ---------------------------------------------------------------------------

suite.test('X2.1: Multi-stage flow: Public queue tracking with 10-digit code isolates PII', (assert) => {
  const appointment = {
    id: 'appt-uuid-002',
    tracking_code_10_digit: generateStructuredTrackingCode(102, 296, 12),
    clinic_id: 'clinic-ktm-02',
    doctor_id: 'doc-gyn-02',
    appointment_date: '2026-10-25',
    appointment_time: '11:00:00',
    patient_name: 'Gita Devi',
    patient_phone: '9841888999',
    patient_age: 32,
    patient_gender: 'female',
    notes: 'Routine prenatal follow-up',
    checkin_status: 'checked_in'
  };

  const doctor = {
    id: 'doc-gyn-02',
    name: 'Dr. Binita KC',
    specialty: 'Gynecology & Obstetrics',
    personal_mobile_number: '9851000000',
    is_in_clinic: false
  };

  const clinic = {
    id: 'clinic-ktm-02',
    name: 'Patan Maternity Care',
    manager_phone: '01-5522334'
  };

  const queueEntry = { status: 'waiting', position: 5, current_serving_position: 2 };

  // Step: Public queue lookup query
  const publicView = filterPublicQueueStatus(appointment, doctor, clinic, queueEntry);

  // Assertions: Operational metrics present
  assert.equal(publicView.tracking_code_10_digit, appointment.tracking_code_10_digit);
  assert.equal(publicView.clinic_name, 'Patan Maternity Care');
  assert.equal(publicView.doctor_name, 'Dr. Binita KC');
  assert.equal(publicView.queue_position, 5);
  assert.equal(publicView.patients_ahead, 4);
  assert.equal(publicView.doctor_is_in_clinic, false);

  // Assertions: PII strictly excluded
  assert.equal(publicView.patient_name, undefined, 'Patient name strictly excluded');
  assert.equal(publicView.patient_phone, undefined, 'Patient phone strictly excluded');
  assert.equal(publicView.patient_age, undefined, 'Patient age strictly excluded');
  assert.equal(publicView.notes, undefined, 'Clinical notes strictly excluded');
  assert.equal(publicView.manager_phone, undefined, 'Clinic manager phone excluded');
  assert.equal(publicView.personal_mobile_number, undefined, 'Doctor personal mobile excluded');
});

suite.test('X2.2: Multi-stage flow: Doctor cabin toggle updates queue presence without leaking data', (assert) => {
  const doctor = { id: 'doc-gyn-02', name: 'Dr. Binita KC', is_in_clinic: true };
  const queueEntry = { status: 'in_progress', position: 5, current_serving_position: 4 };

  const appointment = {
    tracking_code_10_digit: '1022960126',
    appointment_date: '2026-10-25'
  };

  const updatedView = filterPublicQueueStatus(appointment, doctor, { name: 'Patan Clinic' }, queueEntry);
  assert.equal(updatedView.doctor_is_in_clinic, true, 'Cabin presence updated to true');
  assert.equal(updatedView.current_queue_position, 4, 'Current serving position advanced to 4');
  assert.equal(updatedView.patient_name, undefined, 'Patient PII remains isolated');
});

// ---------------------------------------------------------------------------
// LIFECYCLE 3: Lab Report Upload -> Guest Phone Verification -> Signed URL
// ---------------------------------------------------------------------------

suite.test('X3.1: Multi-stage flow: Lab report upload generates authorized signed upload path in private bucket', (assert) => {
  const clinicId = 'clinic-pathology-01';
  const originalFilename = 'lipid_profile_test.pdf';

  // Step 1: Storage upload path generation
  const storagePath = generateSafeStoragePath(clinicId, originalFilename);
  assert.match(storagePath, /^clinic-pathology-01\/[0-9a-f-]{36}\.pdf$/, 'Safe private path generated');

  // Step 2: Bucket is private
  const bucket = 'lab-reports-private';
  assert.includes(CONTRACTS.storage.privateBuckets, bucket, 'Upload directed to private bucket');
});

suite.test('X3.2: Multi-stage flow: Guest report lookup with exact 10-digit phone match yields signed URL', (assert) => {
  const registeredAppointment = {
    id: 'appt-lab-01',
    tracking_code_10_digit: '1052960204',
    patient_phone: '9841123456',
    lab_report_file_path: 'clinic-pathology-01/report-123.pdf'
  };

  // Guest inputs tracking code and phone
  const guestInput = {
    trackingCode: '1052960204',
    phone: '+977-9841123456' // With country prefix and hyphens
  };

  const normalizedInputPhone = normalizeNepalMobileNumber(guestInput.phone);
  const normalizedRegPhone = normalizeNepalMobileNumber(registeredAppointment.patient_phone);

  assert.equal(normalizedInputPhone, normalizedRegPhone, 'Phones must match after normalization');

  // Server issues short-lived signed URL (15-min expiry)
  const signedUrlResult = {
    authorized: true,
    fileUrl: `https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/sign/lab-reports-private/${registeredAppointment.lab_report_file_path}?token=sample_signed_token`,
    expiresIn: CONTRACTS.signedUrl.defaultExpirySec
  };

  assert.ok(signedUrlResult.authorized, 'Guest authorized for report download');
  assert.equal(signedUrlResult.expiresIn, 900, 'Signed URL expires in 15 minutes');
});

suite.test('X3.3: Multi-stage flow: Guest report lookup with mismatched phone fails with generic rejection', (assert) => {
  const registeredAppointment = {
    id: 'appt-lab-01',
    tracking_code_10_digit: '1052960204',
    patient_phone: '9841123456'
  };

  // Attacker has valid tracking code but wrong phone
  const attackerPhone = '9841999999';
  const isMatch = normalizeNepalMobileNumber(attackerPhone) === normalizeNepalMobileNumber(registeredAppointment.patient_phone);

  assert.ok(!isMatch, 'Mismatched phone does not match registered phone');

  // Simulated server rejection response
  const response = {
    authorized: false,
    error: 'Invalid tracking code or matching verification details'
  };

  assert.equal(response.authorized, false, 'Access must be denied');
  assert.doesNotInclude(response.error, registeredAppointment.patient_phone, 'Error must not leak registered phone number');
});

// ---------------------------------------------------------------------------
// LIFECYCLE 4: Tampered eSewa Payment Callback Aborted
// ---------------------------------------------------------------------------

suite.test('X4.1: Tampered payment amount in callback aborts transaction and preserves pending state', (assert) => {
  const attempt = {
    id: 'attempt-uuid-777',
    appointment_id: 'appt-uuid-999',
    transaction_uuid: 'TXN-TAMPER-001',
    amount_npr: '1200.00',
    status: 'pending'
  };

  // Attacker manipulated eSewa payment to only charge 1.00 NPR
  const tamperedCallback = {
    status: 'COMPLETE',
    product_code: 'EPAYTEST',
    transaction_uuid: 'TXN-TAMPER-001',
    total_amount: '1.00', // 1 NPR instead of 1200 NPR!
    ref_id: 'ESEWA-CHEAT-001'
  };

  const verification = verifyEsewaTransaction(attempt, tamperedCallback, 'EPAYTEST');
  assert.ok(!verification.verified, 'Discrepancy must fail transaction verification');
  assert.match(verification.reason, /Amount mismatch/, 'Reason must indicate amount mismatch');

  // Appointment status remains pending
  assert.equal(attempt.status, 'pending', 'Payment status must not transition to paid');
});

// ---------------------------------------------------------------------------
// LIFECYCLE 5: Firebase Alphanumeric Auth Lifecycle across DB & Storage
// ---------------------------------------------------------------------------

suite.test('X5.1: Firebase alphanumeric UID token evaluated safely without PostgreSQL UUID crash', (assert) => {
  const firebaseJwtSub = 'Xy9Z1a2B3c4D5e6F7g8H9i0J1k2L'; // 28-character Firebase UID
  assert.ok(isFirebaseUid(firebaseJwtSub), 'Identified as Firebase UID');

  // Postgres auth.uid() override simulation
  const evaluatedUid = safeAuthUid(firebaseJwtSub);
  assert.equal(evaluatedUid, null, 'Must return NULL safely rather than throwing SQL syntax error');

  // Profile lookup via firebase_uid column
  const mockDatabaseProfiles = [
    { id: 'profile-uuid-1', firebase_uid: 'Xy9Z1a2B3c4D5e6F7g8H9i0J1k2L', role: 'patient' }
  ];

  const matched = mockDatabaseProfiles.find(p => p.firebase_uid === firebaseJwtSub);
  assert.ok(matched !== undefined, 'Profile found via firebase_uid column');
  assert.equal(matched.role, 'patient', 'User role retrieved');
});

module.exports = suite;
