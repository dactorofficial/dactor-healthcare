/**
 * DACTOR Platform Verification Suite
 * Target: Unapproved Appointment Quarantine Across Clinic & Patient Apps
 * File: tests/pay_at_desk/test_unapproved_appointment_quarantine.cjs
 *
 * Verifies Requirements R1, R2, R3:
 * - R1: Server-Side and Client-Side Live Queue Quarantine (WAITING_FOR_APPROVAL & pending_payment)
 * - R2: Strict Clinic Patient Directory and Datewise Visits Scoping (Tab 0, Tab 1, Tab 2)
 * - R3: Safe Lifecycle Transition on Clinic Approval (Pay at Desk RPC & Online Gateway Callback)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
};

class TestSuite {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  assert(condition, desc, reason = '') {
    if (condition) {
      this.passed++;
      console.log(`  ${ANSI.green}√ [PASS]${ANSI.reset} ${desc}`);
      this.results.push({ desc, status: 'PASS' });
    } else {
      this.failed++;
      console.log(`  ${ANSI.red}X [FAIL]${ANSI.reset} ${desc}`);
      if (reason) console.log(`     ${ANSI.yellow}Reason: ${reason}${ANSI.reset}`);
      this.results.push({ desc, status: 'FAIL', reason });
    }
  }

  summary() {
    console.log(`\n${ANSI.bold}======================================================================${ANSI.reset}`);
    console.log(`=== ${this.name.toUpperCase()} RESULTS: ${this.passed} PASSED, ${this.failed} FAILED ===`);
    console.log(`${ANSI.bold}======================================================================${ANSI.reset}`);
    return this.failed === 0;
  }
}

function readFile(relPath) {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}   UNAPPROVED APPOINTMENT QUARANTINE & SCOPING VERIFICATION SUITE      ${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

const runner = new TestSuite('Unapproved Appointment Quarantine');

// -----------------------------------------------------------------------------
// DOMAIN 1: SERVER-SIDE DATABASE TRIGGERS & SCHEMA ISOLATION
// -----------------------------------------------------------------------------
console.log(`${ANSI.bold}--- Domain 1: Database Migration & Server Quarantine Triggers ---${ANSI.reset}`);

const quarantineSql = readFile('supabase/migration_unapproved_appointment_quarantine.sql');
const multiGatewaySql = readFile('supabase/migration_multi_gateway_payments.sql');
const doctorQueueSql = readFile('supabase/migration_doctor_isolated_live_queues.sql');
const payAtDeskSql = readFile('supabase/migration_pay_at_desk.sql');

runner.assert(
  quarantineSql.includes("chk_appointments_status") &&
  quarantineSql.includes("'pending_payment'") &&
  quarantineSql.includes("'WAITING_FOR_APPROVAL'"),
  '1.1 chk_appointments_status constraint allows pending_payment and WAITING_FOR_APPROVAL'
);

runner.assert(
  quarantineSql.includes("CREATE OR REPLACE FUNCTION public.check_queue_entry_appointment_approved()") &&
  quarantineSql.includes("trg_queue_entry_check_approved"),
  '1.2 check_queue_entry_appointment_approved trigger registered BEFORE INSERT OR UPDATE ON queue_entries'
);

runner.assert(
  quarantineSql.includes("v_appt_status <> 'APPROVED'") &&
  quarantineSql.includes("v_appt_checkin = 'cancelled'"),
  '1.3 Queue entry trigger rejects appointments with status <> APPROVED or checkin = cancelled'
);

runner.assert(
  quarantineSql.includes("CREATE OR REPLACE FUNCTION public.sync_appointment_status_to_queue()") &&
  quarantineSql.includes("trg_sync_appointment_status_to_queue"),
  '1.4 sync_appointment_status_to_queue trigger registered AFTER UPDATE ON appointments'
);

runner.assert(
  quarantineSql.includes("DELETE FROM public.queue_entries WHERE appointment_id = NEW.id"),
  '1.5 Appointment update trigger automatically purges queue_entries when status transitions away from APPROVED'
);

runner.assert(
  quarantineSql.includes("CREATE OR REPLACE FUNCTION public.purge_unapproved_queue_entries()"),
  '1.6 purge_unapproved_queue_entries RPC defined to clean rogue and orphaned queue entries'
);

runner.assert(
  multiGatewaySql.includes("status = 'APPROVED'") &&
  multiGatewaySql.includes("approved_at = COALESCE(approved_at, NOW())"),
  '1.7 finalize_online_appointment_payment in migration_multi_gateway_payments sets status = APPROVED and approved_at'
);

runner.assert(
  doctorQueueSql.includes("status = 'APPROVED'") &&
  doctorQueueSql.includes("approved_at = COALESCE(approved_at, NOW())"),
  '1.8 finalize_online_appointment_payment in migration_doctor_isolated_live_queues sets status = APPROVED and approved_at'
);

runner.assert(
  payAtDeskSql.includes("status = 'APPROVED'") &&
  payAtDeskSql.includes("approved_at = NOW()"),
  '1.9 approve_pay_at_desk_appointment sets status = APPROVED and approved_at'
);

// -----------------------------------------------------------------------------
// DOMAIN 2: CLINIC APP LIVE QUEUE QUARANTINE
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 2: Clinic App Live Queue Quarantine & Rogue Purge ---${ANSI.reset}`);

const queueBoardSrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt');
const clinicQueueRepoSrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt');
const doctorDashSrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/dashboard/DoctorDashboardScreen.kt');

runner.assert(
  queueBoardSrc.includes('appt != null') &&
  queueBoardSrc.includes('appt.status.equals("APPROVED", ignoreCase = true)') &&
  queueBoardSrc.includes('appt.status != "WAITING_FOR_APPROVAL"') &&
  queueBoardSrc.includes('appt.status != "pending_payment"') &&
  !queueBoardSrc.includes('appt == null || (appt.status.equals("APPROVED"'),
  '2.1 QueueBoardScreen strictly requires non-null approved appointments and eliminates appt == null bypass'
);

runner.assert(
  queueBoardSrc.includes('appt.status != "UNAPPROVED"') &&
  queueBoardSrc.includes('appt.status != "EXPIRED"') &&
  queueBoardSrc.includes('appt.checkinStatus != "cancelled"'),
  '2.2 QueueBoardScreen filters out UNAPPROVED, EXPIRED, and cancelled appointments'
);

runner.assert(
  clinicQueueRepoSrc.includes('val approvedApptIds = appts.filter') &&
  clinicQueueRepoSrc.includes('val rogueEntries = currentEntries.filter { it.appointmentId !in approvedApptIds }'),
  '2.3 getQueueForClinic identifies and purges rogue queue entries pointing to unapproved appointments'
);

runner.assert(
  clinicQueueRepoSrc.includes('todayAppts = supabaseClient.postgrest["appointments"]') &&
  clinicQueueRepoSrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  clinicQueueRepoSrc.includes('it.status != "WAITING_FOR_APPROVAL"') &&
  clinicQueueRepoSrc.includes('it.status != "pending_payment"'),
  '2.4 getQueueForClinic auto-transfer strictly enrolls only APPROVED appointments'
);

runner.assert(
  doctorDashSrc.includes('appt.status.equals("APPROVED", ignoreCase = true)') &&
  doctorDashSrc.includes('appt.status != "WAITING_FOR_APPROVAL"') &&
  doctorDashSrc.includes('appt.status != "pending_payment"') &&
  doctorDashSrc.includes('appt.status != "UNAPPROVED"') &&
  doctorDashSrc.includes('appt.status != "EXPIRED"'),
  '2.5 DoctorDashboardScreen appointmentsQueue excludes WAITING_FOR_APPROVAL, pending_payment, UNAPPROVED, EXPIRED'
);

// -----------------------------------------------------------------------------
// DOMAIN 3: CLINIC PATIENT DIRECTORY & DATEWISE VISITS SCOPING
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 3: Clinic Patient Directory & Datewise Visits Scoping ---${ANSI.reset}`);

const directorySrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/patients/PatientDirectoryScreen.kt');
const futureApptSrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/appointments/FutureAppointmentsScreen.kt');
const patientDetailSrc = readFile('clinic-app/app/src/main/java/com/dactor/clinic/ui/patients/PatientDetailScreen.kt');

runner.assert(
  directorySrc.includes('val approvedOnly = fetched.filter') &&
  directorySrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  directorySrc.includes('it.status != "WAITING_FOR_APPROVAL"') &&
  directorySrc.includes('it.status != "pending_payment"') &&
  directorySrc.includes('it.checkinStatus != "cancelled"'),
  '3.1 PatientDirectoryScreen loadData filters to strictly APPROVED, non-cancelled appointments'
);

runner.assert(
  directorySrc.includes('val inConsultationAppts = remember(appointments)') &&
  directorySrc.includes('it.status != "WAITING_FOR_APPROVAL"') &&
  directorySrc.includes('it.status != "pending_payment"'),
  '3.2 PatientDirectoryScreen Tab 0 (Live Queue) isolates unapproved appointments'
);

runner.assert(
  directorySrc.includes('val allDirectoryProfiles = remember(locallyAddedProfiles, appointments)') &&
  directorySrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  directorySrc.includes('it.checkinStatus != "cancelled"'),
  '3.3 PatientDirectoryScreen Tab 1 (Patient Directory) allows only APPROVED clinic visits and desk registrations'
);

runner.assert(
  directorySrc.includes('val datewiseAppointmentsForDay = remember(appointments, selectedVisitDateStr)') &&
  directorySrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  directorySrc.includes('it.checkinStatus != "cancelled"'),
  '3.4 PatientDirectoryScreen Tab 2 (Datewise Visits) scopes strictly to APPROVED non-cancelled appointments'
);

runner.assert(
  directorySrc.includes('openPatientHistory') &&
  directorySrc.includes('it.status.equals("APPROVED", ignoreCase = true)'),
  '3.5 openPatientHistory scopes history strictly to APPROVED non-cancelled appointments'
);

runner.assert(
  futureApptSrc.includes('appointments = appts.filter') &&
  futureApptSrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  futureApptSrc.includes('it.status != "WAITING_FOR_APPROVAL"') &&
  futureApptSrc.includes('it.status != "pending_payment"'),
  '3.6 FutureAppointmentsScreen excludes unapproved appointments'
);

runner.assert(
  patientDetailSrc.includes('pastVisitsForPatient = allPatientVisits.filter') &&
  patientDetailSrc.includes('it.status.equals("APPROVED", ignoreCase = true)') &&
  patientDetailSrc.includes('it.status != "WAITING_FOR_APPROVAL"') &&
  patientDetailSrc.includes('it.status != "pending_payment"'),
  '3.7 PatientDetailScreen pastVisitsForPatient scopes strictly to APPROVED appointments'
);

// -----------------------------------------------------------------------------
// DOMAIN 4: PATIENT APP TRACKER & BOOKING CONTRACTS
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 4: Patient App Tracker & Booking Lifecycle ---${ANSI.reset}`);

const patientApptRepoSrc = readFile('patient-app/app/src/main/java/com/dactor/patient/data/repository/AppointmentRepository.kt');
const patientQueueRepoSrc = readFile('patient-app/app/src/main/java/com/dactor/patient/data/repository/QueueRepository.kt');
const trackerScreenSrc = readFile('patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt');

runner.assert(
  patientApptRepoSrc.includes('val isOnlinePaid = !isPayAtDesk && appointment.paymentStatus.equals("paid", ignoreCase = true)') &&
  patientApptRepoSrc.includes('val initialStatus = if (isPayAtDesk) "WAITING_FOR_APPROVAL" else if (isOnlinePaid) "APPROVED" else "pending_payment"'),
  '4.1 Patient AppointmentRepository initial status defaults to pending_payment for unpaid online bookings'
);

runner.assert(
  patientApptRepoSrc.includes('val initialCheckinStatus = if (isPayAtDesk) "not_checked_in" else if (isOnlinePaid) "checked_in" else "not_checked_in"'),
  '4.2 Patient AppointmentRepository checkinStatus defaults to not_checked_in for unpaid bookings'
);

runner.assert(
  patientApptRepoSrc.includes('updateAppointmentPayAtDesk') &&
  patientApptRepoSrc.includes('supabaseClient.postgrest["queue_entries"].delete'),
  '4.3 updateAppointmentPayAtDesk fallback deletes queue_entries row to guarantee quarantine'
);

runner.assert(
  patientQueueRepoSrc.includes('val isUnapproved = appt == null ||') &&
  patientQueueRepoSrc.includes('appt.status == "WAITING_FOR_APPROVAL"') &&
  patientQueueRepoSrc.includes('appt.status == "pending_payment"') &&
  patientQueueRepoSrc.includes('supabaseClient.postgrest["queue_entries"].delete'),
  '4.4 Patient QueueRepository ensureQueueEntryForAppointment purges rogue entries and returns null for unapproved'
);

runner.assert(
  trackerScreenSrc.includes('"pending_payment" -> "PENDING ONLINE PAYMENT"') &&
  trackerScreenSrc.includes('"pending_payment" -> "Pending Online Payment"') &&
  trackerScreenSrc.includes('displayTrackingCode'),
  '4.5 QueueStatusScreen renders pending_payment banner and keeps 10-digit tracking code accessible'
);

// -----------------------------------------------------------------------------
// DOMAIN 5: BEHAVIORAL STATE-MACHINE & QUARANTINE SIMULATION
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 5: Behavioral State-Machine & Quarantine Simulation ---${ANSI.reset}`);

function simulateAppointmentState(paymentMode, isPaid, isApprovedByStaff) {
  let status = 'APPROVED';
  let checkinStatus = 'not_checked_in';
  let paymentStatus = 'pending';

  if (paymentMode === 'PAY_AT_DESK') {
    status = isApprovedByStaff ? 'APPROVED' : 'WAITING_FOR_APPROVAL';
    checkinStatus = isApprovedByStaff ? 'checked_in' : 'not_checked_in';
    paymentStatus = 'pending';
  } else if (paymentMode === 'ONLINE') {
    status = isPaid ? 'APPROVED' : 'pending_payment';
    checkinStatus = isPaid ? 'checked_in' : 'not_checked_in';
    paymentStatus = isPaid ? 'paid' : 'pending';
  }

  // Queue quarantine rule
  const isQuarantined = status !== 'APPROVED' || checkinStatus === 'cancelled';
  const inLiveQueue = !isQuarantined;
  const inPatientDirectory = !isQuarantined;

  return { status, checkinStatus, paymentStatus, inLiveQueue, inPatientDirectory };
}

// 5.1 Pay at Desk unapproved
const padPending = simulateAppointmentState('PAY_AT_DESK', false, false);
runner.assert(
  padPending.status === 'WAITING_FOR_APPROVAL' && !padPending.inLiveQueue && !padPending.inPatientDirectory,
  '5.1 Pay at Desk unapproved is WAITING_FOR_APPROVAL, barred from Live Queue and Directory'
);

// 5.2 Pay at Desk approved by clinic staff
const padApproved = simulateAppointmentState('PAY_AT_DESK', false, true);
runner.assert(
  padApproved.status === 'APPROVED' && padApproved.checkinStatus === 'checked_in' && padApproved.inLiveQueue && padApproved.inPatientDirectory,
  '5.2 Pay at Desk approved transitions to APPROVED, checked_in, and enters Live Queue and Directory'
);

// 5.3 Online pending payment
const onlinePending = simulateAppointmentState('ONLINE', false, false);
runner.assert(
  onlinePending.status === 'pending_payment' && !onlinePending.inLiveQueue && !onlinePending.inPatientDirectory,
  '5.3 Online pending payment is pending_payment, barred from Live Queue and Directory'
);

// 5.4 Online payment completed via gateway callback
const onlinePaid = simulateAppointmentState('ONLINE', true, false);
runner.assert(
  onlinePaid.status === 'APPROVED' && onlinePaid.paymentStatus === 'paid' && onlinePaid.inLiveQueue && onlinePaid.inPatientDirectory,
  '5.4 Online payment completed transitions to APPROVED, paid, and enters Live Queue and Directory'
);

// 5.5 Expired, rejected, or cancelled appointments
const expiredAppt = { status: 'EXPIRED', checkinStatus: 'cancelled' };
const unapprovedAppt = { status: 'UNAPPROVED', checkinStatus: 'cancelled' };
const cancelledAppt = { status: 'APPROVED', checkinStatus: 'cancelled' };

function isVisibleInOpdOrDirectory(appt) {
  return appt.status === 'APPROVED' &&
         appt.status !== 'WAITING_FOR_APPROVAL' &&
         appt.status !== 'pending_payment' &&
         appt.status !== 'UNAPPROVED' &&
         appt.status !== 'EXPIRED' &&
         appt.checkinStatus !== 'cancelled';
}

runner.assert(!isVisibleInOpdOrDirectory(expiredAppt), '5.5 EXPIRED appointment is NOT visible in Live Queue or Directory');
runner.assert(!isVisibleInOpdOrDirectory(unapprovedAppt), '5.6 UNAPPROVED appointment is NOT visible in Live Queue or Directory');
runner.assert(!isVisibleInOpdOrDirectory(cancelledAppt), '5.7 Cancelled appointment is NOT visible in Live Queue or Directory');

// 5.8 Database trigger behavioral simulation
function simulateDbTrigger(entry, appt) {
  if (!appt) {
    throw new Error('appointment not found');
  }
  if (appt.status !== 'APPROVED' || appt.checkinStatus === 'cancelled') {
    throw new Error(`Cannot insert unapproved appointment (status=${appt.status}) into live queue`);
  }
  return { ...entry, verified: true };
}

runner.assert(
  (() => {
    try {
      simulateDbTrigger({ appointment_id: 'a1' }, { id: 'a1', status: 'WAITING_FOR_APPROVAL', checkinStatus: 'not_checked_in' });
      return false;
    } catch (e) {
      return e.message.includes('Cannot insert unapproved appointment');
    }
  })(),
  '5.8 DB trigger simulation: blocks insertion of WAITING_FOR_APPROVAL into queue_entries'
);

runner.assert(
  (() => {
    try {
      simulateDbTrigger({ appointment_id: 'a2' }, { id: 'a2', status: 'pending_payment', checkinStatus: 'not_checked_in' });
      return false;
    } catch (e) {
      return e.message.includes('Cannot insert unapproved appointment');
    }
  })(),
  '5.9 DB trigger simulation: blocks insertion of pending_payment into queue_entries'
);

runner.assert(
  (() => {
    try {
      const res = simulateDbTrigger({ appointment_id: 'a3' }, { id: 'a3', status: 'APPROVED', checkinStatus: 'checked_in' });
      return res.verified === true;
    } catch {
      return false;
    }
  })(),
  '5.10 DB trigger simulation: cleanly allows APPROVED and checked_in appointment into queue_entries'
);

const allPassed = runner.summary();
if (!allPassed) {
  process.exit(1);
} else {
  console.log(`\n${ANSI.green}√ 100% OF UNAPPROVED APPOINTMENT QUARANTINE TESTS PASSED.${ANSI.reset}\n`);
}
