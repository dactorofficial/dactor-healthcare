'use strict';

const fs = require('fs');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

const sql = fs.readFileSync('supabase/migration_joined_followup_noshow_combined_billing_fix.sql', 'utf8');
const clinicApptRepo = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt', 'utf8');
const clinicBillingScreen = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/billing/BillingScreen.kt', 'utf8');
const clinicWalkin = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/walkin/WalkinBookingScreen.kt', 'utf8');
const patientQss = fs.readFileSync('patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt', 'utf8');
const patientApptModel = fs.readFileSync('patient-app/app/src/main/java/com/dactor/patient/data/model/Appointment.kt', 'utf8');
const clinicPortal = fs.readFileSync('web-app/src/pages/ClinicPortal.tsx', 'utf8');
const dbTs = fs.readFileSync('web-app/src/services/db.ts', 'utf8');

test('SQL ensures unique index on queue_entries(appointment_id)', () => {
  assert.ok(sql.includes('idx_queue_entries_appointment_id_unique'), 'missing unique index on queue_entries(appointment_id)');
});

test('SQL prevent_appointment_tampering honors authoritative_context & free follow-up', () => {
  assert.ok(sql.includes("current_setting('dactor.authoritative_context', true) = 'true'"));
  assert.ok(sql.includes("UPPER(COALESCE(NEW.payment_mode, '')) = 'FREE'"));
});

test('SQL reschedule_patient_appointment allows no_show and p_allow_overbook', () => {
  assert.ok(sql.includes('p_allow_overbook BOOLEAN DEFAULT FALSE'));
  assert.ok(sql.includes("v_checkin_lower IN ('completed', 'done', 'finished')"));
  assert.ok(!sql.includes("v_appt.consultation_completed_at IS NOT NULL"));
});

test('SQL book_follow_up_visit sets payment_mode=FREE and payment_status=pending', () => {
  assert.ok(sql.includes('p_is_walkin BOOLEAN DEFAULT FALSE'));
  assert.ok(sql.includes("'pending'"));
  assert.ok(sql.includes("p_payment_mode TEXT DEFAULT 'FREE'"));
});

test('Clinic App AppointmentRepository does not use decodeSingleOrNull on tracking code lookup', () => {
  const fnMatch = clinicApptRepo.match(/suspend fun getAppointmentByTrackingCode[\s\S]*?Local cache/);
  assert.ok(fnMatch, 'getAppointmentByTrackingCode not found');
  assert.ok(!fnMatch[0].includes('decodeSingleOrNull'), 'must use decodeList for multi-visit tracking codes');
});

test('Clinic App AppointmentRepository preserves no_show in attachQueueStatus and exposes bookFollowUpAppointment', () => {
  assert.ok(!clinicApptRepo.includes('q?.status == "no_show" && !isApptAlreadyProgressed -> appt.copy(checkinStatus = "cancelled")'));
  assert.ok(clinicApptRepo.includes('suspend fun bookFollowUpAppointment('));
  assert.ok(clinicApptRepo.includes('p_allow_overbook'));
});

test('Clinic App WalkinBookingScreen joins follow-up via bookFollowUpAppointment', () => {
  assert.ok(clinicWalkin.includes('appointmentRepository?.bookFollowUpAppointment('));
});

test('Clinic App BillingScreen combines priorVisitsSummary and has no General OPD 500 chip', () => {
  assert.ok(clinicBillingScreen.includes('priorVisitsSummary'));
  assert.ok(clinicBillingScreen.includes('combinedTotalAmount'));
  assert.ok(!clinicBillingScreen.includes('Pair("General OPD Consultation", 500.0)'));
});

test('Patient App Appointment model & QueueStatusScreen have no 500.0 bill fallback or phantom paid', () => {
  assert.ok(patientApptModel.includes('val isFreeFollowUp: Boolean'));
  assert.ok(!patientQss.includes('effectiveTotalForInvoice(billingInvoice, 500.0)'));
});

test('Web ClinicPortal removes Math.max(..., 500) clamp and calls bookFollowUpVisit', () => {
  assert.ok(!clinicPortal.includes('Math.max(getEffectiveInvoiceTotal(appt, existing), 500)'));
  assert.ok(clinicPortal.includes('bookFollowUpVisit('));
  assert.ok(dbTs.includes('export async function bookFollowUpVisit('));
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
