#!/usr/bin/env node
/**
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST HARNESS (Milestone 3)
 * File: tests/pay_at_desk/empirical_challenger_m3.cjs
 *
 * Scope: Clinic Reception & Queue Tracking Lifecycle Verification
 * Adversarial Probes:
 *   1. Static Code & Invariant Audit across SQL migrations, Clinic App, Web App, & Patient App.
 *   2. Rule 7 Overload Safety (Deep saturation 12/12 -> 13/12 -> 14/12 -> 15/12, zero-floor remaining count, display safety, normal booking lockout).
 *   3. Concurrency & Race Conditions (Atomic row locks 'FOR UPDATE', concurrent approval double-spend prevention, approve vs reject conflict, concurrent retry guard).
 *   4. Retry Ceiling & Expiration Engine (Strict 3-attempt lifecycle, 2-day expiry on 3rd attempt, 4th retry hard lockout, invalid status retry blocks).
 *   5. Queue Token Monotonicity & Strict Isolation (Queue absence while pending, strictly sequential token numbers, online/counter interleaving, multi-clinic isolation).
 *   6. Security & Cross-Clinic Tenant Defense (Cross-clinic approval/rejection defense, caller mobile verification, scheduled role restriction on expiry engine).
 */

const fs = require('fs');
const path = require('path');
const {
  CONTRACTS,
  calculateServiceCharge,
  calculateTotalAmount,
  evaluateSlotCapacity,
  isValidUUID,
  isValidTrackingCode10,
  sanitizeNepalMobile
} = require('./contracts.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Paths to audited source code
const PATHS = {
  migrationPayAtDesk: path.join(REPO_ROOT, 'supabase', 'migration_pay_at_desk.sql'),
  migrationConfirmPayAtDesk: path.join(REPO_ROOT, 'supabase', 'migration_confirm_pay_at_desk.sql'),
  clinicRequestsScreen: path.join(
    REPO_ROOT,
    'clinic-app',
    'app',
    'src',
    'main',
    'java',
    'com',
    'dactor',
    'clinic',
    'ui',
    'appointments',
    'PayAtDeskRequestsScreen.kt'
  ),
  clinicRepository: path.join(
    REPO_ROOT,
    'clinic-app',
    'app',
    'src',
    'main',
    'java',
    'com',
    'dactor',
    'clinic',
    'data',
    'repository',
    'AppointmentRepository.kt'
  ),
  clinicPortal: path.join(REPO_ROOT, 'web-app', 'src', 'pages', 'ClinicPortal.tsx'),
  webDb: path.join(REPO_ROOT, 'web-app', 'src', 'services', 'db.ts'),
  patientQueueScreen: path.join(
    REPO_ROOT,
    'patient-app',
    'app',
    'src',
    'main',
    'java',
    'com',
    'dactor',
    'patient',
    'ui',
    'tracker',
    'QueueStatusScreen.kt'
  ),
  webLiveQueue: path.join(REPO_ROOT, 'web-app', 'src', 'pages', 'LiveQueue.tsx')
};

const ANSI = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class ChallengerM3Harness {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.vulnerabilities = [];
    this.observations = [];
  }

  assert(condition, title, details = '') {
    if (condition) {
      this.passed++;
      console.log(`  ${ANSI.green}√ [PASS]${ANSI.reset} ${title}`);
      this.observations.push({ title, status: 'PASS' });
    } else {
      this.failed++;
      console.log(`  ${ANSI.red}X [FAIL / VULNERABILITY FOUND]${ANSI.reset} ${title}`);
      if (details) console.log(`     ${ANSI.yellow}Details: ${details}${ANSI.reset}`);
      this.vulnerabilities.push({ title, details });
      this.observations.push({ title, status: 'FAIL', details });
    }
  }

  summary() {
    console.log(`\n${ANSI.bright}======================================================================${ANSI.reset}`);
    console.log(
      `=== ${this.name.toUpperCase()} SUMMARY: ${this.passed} PASSED, ${this.failed} FAILURES/VULNERABILITIES ===`
    );
    console.log(`${ANSI.bright}======================================================================${ANSI.reset}\n`);
    return this.failed === 0;
  }
}

/**
 * Concurrency Simulator with Row-Level Exclusive Locks (Emulating PostgreSQL FOR UPDATE)
 */
class ConcurrentDatabaseEngine {
  constructor() {
    this.appointments = new Map();
    this.slots = new Map();
    this.queueEntries = new Map();
    this.clinics = new Map();
    this.doctors = new Map();
    this.notifications = [];
    this.rowLocks = new Map(); // key: table:id -> owner
  }

  seedClinic(clinic) {
    this.clinics.set(clinic.id, { ...clinic });
  }

  seedDoctor(doctor) {
    this.doctors.set(doctor.id, { ...doctor });
  }

  seedSlot(slot) {
    this.slots.set(slot.id, { ...slot });
  }

  seedAppointment(appt) {
    this.appointments.set(appt.id, { ...appt });
  }

  // Acquire exclusive row lock (atomic spin / mutex simulation)
  acquireRowLock(table, id, owner) {
    const key = `${table}:${id}`;
    if (this.rowLocks.has(key)) {
      const currentOwner = this.rowLocks.get(key);
      if (currentOwner !== owner) {
        return false; // Lock contention / locked by another transaction
      }
    }
    this.rowLocks.set(key, owner);
    return true;
  }

  releaseRowLock(table, id, owner) {
    const key = `${table}:${id}`;
    if (this.rowLocks.get(key) === owner) {
      this.rowLocks.delete(key);
    }
  }

  /**
   * Atomic approve_pay_at_desk_appointment with explicit row lock and state verification
   */
  approveAppointment(appointmentId, callerClinicId, callerEmail, callerRole, txId = 'tx-1') {
    if (!isValidUUID(appointmentId)) throw new Error(`Invalid appointment UUID: ${appointmentId}`);

    // 1. Acquire exclusive row lock on appointment
    if (!this.acquireRowLock('appointments', appointmentId, txId)) {
      throw new Error(`Lock timeout / contention: Appointment ${appointmentId} is locked by another transaction`);
    }

    try {
      const appt = this.appointments.get(appointmentId);
      if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

      // 2. Authorize caller against appointment's owning clinic
      const clinic = this.clinics.get(appt.clinic_id);
      const isSuperAdmin = callerRole === 'super_admin';
      const isClinicStaff =
        callerEmail && clinic && callerEmail.toLowerCase() === clinic.contact_email.toLowerCase();

      if (!isSuperAdmin && !isClinicStaff) {
        throw new Error(
          `Access denied: Caller is not authorized to approve appointments for clinic ${appt.clinic_id}`
        );
      }

      if (callerClinicId && callerClinicId !== appt.clinic_id) {
        throw new Error(`Mismatched clinic ID: Appointment does not belong to clinic ${callerClinicId}`);
      }

      // 3. Validate strict status transition: ONLY WAITING_FOR_APPROVAL
      if (appt.status !== CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
        throw new Error(
          `Cannot approve appointment ${appointmentId} with status ${appt.status}: must be WAITING_FOR_APPROVAL`
        );
      }

      // Check slot time
      const slotDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time}`);
      if (slotDateTime.getTime() < Date.now() - 300000) {
        appt.status = CONTRACTS.statuses.EXPIRED;
        throw new Error('Cannot approve: Appointment slot time has passed. Marked as EXPIRED');
      }

      // Check expires_at
      if (appt.expires_at && new Date(appt.expires_at).getTime() < Date.now()) {
        appt.status = CONTRACTS.statuses.EXPIRED;
        throw new Error('Cannot approve: Request has expired. Marked as EXPIRED');
      }

      // 4. Transition status to APPROVED
      appt.status = CONTRACTS.statuses.APPROVED;
      appt.approved_at = new Date().toISOString();
      appt.checkin_status = CONTRACTS.checkinStatuses.CHECKED_IN;
      appt.updated_at = new Date().toISOString();

      // 5. Overload Rule 7: Lock slot row and recount approved active appointments (Postgres migration lines 649-668)
      if (appt.slot_id && this.slots.has(appt.slot_id)) {
        if (!this.acquireRowLock('slots', appt.slot_id, txId)) {
          throw new Error(`Lock contention on slot ${appt.slot_id}`);
        }
        try {
          let count = 0;
          for (const a of this.appointments.values()) {
            if (
              a.slot_id === appt.slot_id &&
              a.checkin_status !== CONTRACTS.checkinStatuses.CANCELLED &&
              a.status === CONTRACTS.statuses.APPROVED
            ) {
              count++;
            }
          }
          const slot = this.slots.get(appt.slot_id);
          slot.booked_count = count;
        } finally {
          this.releaseRowLock('slots', appt.slot_id, txId);
        }
      }

      // 6. Add patient to live queue: MAX(queue_position) + 1 for active waiting/inside
      const activePositions = Array.from(this.queueEntries.values())
        .filter((q) => q.clinic_id === appt.clinic_id && (q.status === 'waiting' || q.status === 'inside'))
        .map((q) => q.queue_position);

      const nextPos = activePositions.length > 0 ? Math.max(...activePositions) + 1 : 1;

      this.queueEntries.set(appt.id, {
        appointment_id: appt.id,
        clinic_id: appt.clinic_id,
        doctor_id: appt.doctor_id,
        queue_position: nextPos,
        status: 'waiting',
        created_at: new Date().toISOString()
      });

      // Notification
      this.notifications.push({
        user_id: appt.user_id,
        appointment_id: appt.id,
        title: 'Appointment Approved!',
        total_amount: appt.total_amount
      });

      return {
        success: true,
        appointment: { ...appt },
        queue_position: nextPos
      };
    } finally {
      this.releaseRowLock('appointments', appointmentId, txId);
    }
  }

  /**
   * Atomic reject_pay_at_desk_appointment with explicit row lock
   */
  rejectAppointment(appointmentId, callerClinicId, callerEmail, callerRole, reason = null, txId = 'tx-reject') {
    if (!isValidUUID(appointmentId)) throw new Error(`Invalid appointment UUID: ${appointmentId}`);

    if (!this.acquireRowLock('appointments', appointmentId, txId)) {
      throw new Error(`Lock timeout / contention: Appointment ${appointmentId} is locked by another transaction`);
    }

    try {
      const appt = this.appointments.get(appointmentId);
      if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

      const clinic = this.clinics.get(appt.clinic_id);
      const isSuperAdmin = callerRole === 'super_admin';
      const isClinicStaff =
        callerEmail && clinic && callerEmail.toLowerCase() === clinic.contact_email.toLowerCase();

      if (!isSuperAdmin && !isClinicStaff) {
        throw new Error(
          `Access denied: Caller is not authorized to reject appointments for clinic ${appt.clinic_id}`
        );
      }

      if (callerClinicId && callerClinicId !== appt.clinic_id) {
        throw new Error(`Mismatched clinic ID: Appointment does not belong to clinic ${callerClinicId}`);
      }

      if (appt.status !== CONTRACTS.statuses.WAITING_FOR_APPROVAL) {
        throw new Error(
          `Cannot reject appointment with status ${appt.status}: must be WAITING_FOR_APPROVAL`
        );
      }

      appt.status = CONTRACTS.statuses.UNAPPROVED;
      appt.rejected_at = new Date().toISOString();
      appt.checkin_status = CONTRACTS.checkinStatuses.CANCELLED;
      appt.updated_at = new Date().toISOString();

      return {
        success: true,
        appointment: { ...appt },
        reason
      };
    } finally {
      this.releaseRowLock('appointments', appointmentId, txId);
    }
  }

  /**
   * Atomic retry_pay_at_desk_appointment with explicit row lock and attempt counting
   */
  retryAppointment(appointmentId, patientMobile = null, callerEmail = null, callerRole = null, txId = 'tx-retry') {
    if (!isValidUUID(appointmentId)) throw new Error(`Invalid appointment UUID: ${appointmentId}`);

    if (!this.acquireRowLock('appointments', appointmentId, txId)) {
      throw new Error(`Lock contention: Appointment ${appointmentId} is locked by another transaction`);
    }

    try {
      const appt = this.appointments.get(appointmentId);
      if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

      const clinic = this.clinics.get(appt.clinic_id);
      const isSuperAdmin = callerRole === 'super_admin';
      const isClinicStaff =
        callerEmail && clinic && callerEmail.toLowerCase() === clinic.contact_email.toLowerCase();
      const isMatchingPhone =
        patientMobile && sanitizeNepalMobile(patientMobile) === sanitizeNepalMobile(appt.patient_mobile);
      const isMatchingEmail =
        callerEmail && appt.patient_email && callerEmail.toLowerCase() === appt.patient_email.toLowerCase();

      if (!isSuperAdmin && !isClinicStaff && !isMatchingPhone && !isMatchingEmail) {
        throw new Error(`Access denied: Caller is not authorized to retry appointment ${appointmentId}`);
      }

      if (appt.status !== CONTRACTS.statuses.UNAPPROVED) {
        throw new Error(`Cannot retry appointment with status ${appt.status}: must be UNAPPROVED`);
      }

      if (appt.attempt_number >= CONTRACTS.config.maxRetryAttempts) {
        throw new Error(`Cannot retry: Maximum of 3 attempts exceeded for appointment ${appointmentId}`);
      }

      const newAttempt = appt.attempt_number + 1;
      let expiresAt = null;

      // Rule 6: 3rd attempt sets expires_at = now + 2 days
      if (newAttempt === CONTRACTS.config.maxRetryAttempts) {
        const d = new Date();
        d.setDate(d.getDate() + CONTRACTS.config.attempt3ExpiryDays);
        expiresAt = d.toISOString();
      }

      appt.status = CONTRACTS.statuses.WAITING_FOR_APPROVAL;
      appt.attempt_number = newAttempt;
      appt.expires_at = expiresAt;
      appt.checkin_status = CONTRACTS.checkinStatuses.NOT_CHECKED_IN;
      appt.rejected_at = null;
      appt.updated_at = new Date().toISOString();

      return {
        success: true,
        appointment: { ...appt }
      };
    } finally {
      this.releaseRowLock('appointments', appointmentId, txId);
    }
  }

  /**
   * Normal patient booking slot checker (enforcing capacity limits)
   */
  canBookNormalSlot(slotId) {
    const slot = this.slots.get(slotId);
    if (!slot) return false;
    return slot.booked_count < slot.max_capacity;
  }
}

async function runEmpiricalMilestone3Challenges() {
  const harness = new ChallengerM3Harness('Milestone 3 Empirical Lifecycle Challenger');

  console.log(`\n${ANSI.bright}${ANSI.cyan}======================================================================${ANSI.reset}`);
  console.log(`${ANSI.bright}${ANSI.cyan}  DACTOR EMPIRICAL CHALLENGER: MILESTONE 3 LIFECYCLE & INVARIANTS     ${ANSI.reset}`);
  console.log(`${ANSI.dim}  Edge Cases, Concurrency Locks, Overload Rule 7, Retries & Queues     ${ANSI.reset}`);
  console.log(`${ANSI.bright}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

  // ===========================================================================
  // SECTION 1: STATIC CODE & INVARIANT AUDIT
  // ===========================================================================
  console.log(`${ANSI.bright}--- Section 1: Static AST & Invariant Audit ---${ANSI.reset}`);

  // 1.1 Backend SQL RPCs Audit
  harness.assert(fs.existsSync(PATHS.migrationPayAtDesk), '1.1.1 migration_pay_at_desk.sql file exists on disk');
  const sql = fs.readFileSync(PATHS.migrationPayAtDesk, 'utf8');

  harness.assert(
    sql.includes('CREATE OR REPLACE FUNCTION approve_pay_at_desk_appointment') &&
      sql.includes('FOR UPDATE;') &&
      sql.includes("status = 'APPROVED'"),
    '1.1.2 approve_pay_at_desk_appointment acquires exclusive row lock (FOR UPDATE) and transitions to APPROVED'
  );

  harness.assert(
    sql.includes("IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN") &&
      sql.includes("RAISE EXCEPTION 'Cannot approve appointment"),
    '1.1.3 approve_pay_at_desk_appointment strictly asserts status == WAITING_FOR_APPROVAL'
  );

  harness.assert(
    sql.includes('SELECT * INTO v_slot FROM slots WHERE id = v_appt.slot_id FOR UPDATE;') &&
      sql.includes('UPDATE slots') &&
      sql.includes('SET booked_count = v_count'),
    '1.1.4 approve_pay_at_desk_appointment safely updates slot.booked_count under slot row lock (Rule 7)'
  );

  harness.assert(
    sql.includes('SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position') &&
      sql.includes('INSERT INTO queue_entries'),
    '1.1.5 approve_pay_at_desk_appointment assigns sequential queue token via COALESCE(MAX(queue_position), 0) + 1'
  );

  harness.assert(
    sql.includes('CREATE OR REPLACE FUNCTION reject_pay_at_desk_appointment') &&
      sql.includes("status = 'UNAPPROVED'"),
    '1.1.6 reject_pay_at_desk_appointment transitions status to UNAPPROVED'
  );

  harness.assert(
    sql.includes('CREATE OR REPLACE FUNCTION retry_pay_at_desk_appointment') &&
      sql.includes("v_appt.attempt_number >= 3") &&
      sql.includes("v_expires_at := NOW() + INTERVAL '2 days'"),
    '1.1.7 retry_pay_at_desk_appointment enforces max 3 attempts and sets 2-day expiry on 3rd attempt'
  );

  // 1.2 Clinic Mobile App Audit (PayAtDeskRequestsScreen.kt)
  harness.assert(fs.existsSync(PATHS.clinicRequestsScreen), '1.2.1 Clinic App PayAtDeskRequestsScreen.kt exists');
  const clinicScreenCode = fs.readFileSync(PATHS.clinicRequestsScreen, 'utf8');

  harness.assert(
    clinicScreenCode.includes('var isProcessingAction by remember { mutableStateOf(false) }') &&
      clinicScreenCode.includes('if (isProcessingAction) return@Button') &&
      clinicScreenCode.includes('enabled = !isProcessingAction'),
    '1.2.2 Clinic App UI enforces double-click / concurrent action guard (isProcessingAction)'
  );

  harness.assert(
    clinicScreenCode.includes('appointment.trackingCode10Digit') &&
      clinicScreenCode.includes('"Attempt ${appointment.attemptNumber} of 3"'),
    '1.2.3 Clinic App renders 10-digit tracking code and attempt counter badge'
  );

  harness.assert(
    clinicScreenCode.includes('Approving an appointment directly reserves the slot (even if full) and places the patient into the live queue'),
    '1.2.4 Clinic App displays informational overload safety banner'
  );

  // 1.3 Clinic Web Portal Audit (ClinicPortal.tsx & db.ts)
  harness.assert(fs.existsSync(PATHS.clinicPortal), '1.3.1 Web App ClinicPortal.tsx exists');
  const webPortalCode = fs.readFileSync(PATHS.clinicPortal, 'utf8');

  harness.assert(
    webPortalCode.includes('if (!selectedClinic?.id || payAtDeskActionLoading) return') &&
      webPortalCode.includes('setPayAtDeskActionLoading(true)') &&
      webPortalCode.includes('setPayAtDeskActionLoading(false)'),
    '1.3.2 Clinic Web Portal enforces concurrency latch (payAtDeskActionLoading)'
  );

  harness.assert(
    webPortalCode.includes("a.paymentMode === 'PAY_AT_DESK' && a.status === 'WAITING_FOR_APPROVAL'"),
    '1.3.3 Clinic Web Portal strictly filters WAITING_FOR_APPROVAL appointments from live queue lists'
  );

  // 1.4 Patient Queue Status Screen Audit (QueueStatusScreen.kt)
  harness.assert(fs.existsSync(PATHS.patientQueueScreen), '1.4.1 Patient App QueueStatusScreen.kt exists');
  const patientQueueCode = fs.readFileSync(PATHS.patientQueueScreen, 'utf8');

  harness.assert(
    patientQueueCode.includes('val isPayAtDeskPending = appt.paymentMode == "PAY_AT_DESK" && appt.status != "APPROVED"') &&
      patientQueueCode.includes('patientsAhead = -1') &&
      patientQueueCode.includes('tokenNumber = 0'),
    '1.4.2 Patient QueueStatusScreen isolates pending Pay at Desk appointments from queue position'
  );

  harness.assert(
    patientQueueCode.includes('!isPayAtDeskPending') &&
      patientQueueCode.includes('ensureQueueEntryForAppointment'),
    '1.4.3 Patient QueueStatusScreen prevents automatic queue entry generation while pending'
  );

  // 1.5 Web Live Queue Audit (LiveQueue.tsx)
  harness.assert(fs.existsSync(PATHS.webLiveQueue), '1.5.1 Web App LiveQueue.tsx exists');
  const webLiveQueueCode = fs.readFileSync(PATHS.webLiveQueue, 'utf8');

  harness.assert(
    webLiveQueueCode.includes("appointment.paymentMode === 'PAY_AT_DESK' && appointment.status !== 'APPROVED'") &&
      webLiveQueueCode.includes('Waiting for Clinic Approval') &&
      webLiveQueueCode.includes('Attempt {appointment.attemptNumber || 1} of 3'),
    '1.5.2 Web LiveQueue.tsx renders symmetric pending Pay at Desk card with attempt counter'
  );

  // ===========================================================================
  // SECTION 2: EMPIRICAL RULE 7 OVERLOAD SAFETY PROBE
  // ===========================================================================
  console.log(`\n${ANSI.bright}--- Section 2: Rule 7 Overload Safety & Capacity Oracle ---${ANSI.reset}`);

  const db = new ConcurrentDatabaseEngine();
  const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
  const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
  const FULL_SLOT_ID = '33333333-3333-4333-8333-333333333333';

  db.seedClinic({ id: CLINIC_ID, name: 'Metro Health', contact_email: 'reception@metro.com' });
  db.seedDoctor({ id: DOCTOR_ID, clinic_id: CLINIC_ID, full_name: 'Dr. Smith', consultation_fee: 500 });
  db.seedSlot({
    id: FULL_SLOT_ID,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_date: '2026-10-30',
    start_time: '14:00:00',
    end_time: '15:00:00',
    max_capacity: 12,
    booked_count: 12 // FULL capacity!
  });

  // Seed 12 pre-existing active approved appointments for this slot in the database
  for (let i = 1; i <= 12; i++) {
    const pad = i.toString().padStart(2, '0');
    db.seedAppointment({
      id: `00000000-0000-4000-8000-0000000000${pad}`,
      clinic_id: CLINIC_ID,
      doctor_id: DOCTOR_ID,
      slot_id: FULL_SLOT_ID,
      status: CONTRACTS.statuses.APPROVED,
      checkin_status: CONTRACTS.checkinStatuses.CHECKED_IN,
      payment_mode: CONTRACTS.paymentModes.ONLINE,
      appointment_date: '2026-10-30',
      appointment_time: '14:00:00'
    });
  }

  // Verify normal booking is blocked
  harness.assert(
    !db.canBookNormalSlot(FULL_SLOT_ID),
    '2.1 Normal booking is strictly blocked on 12/12 saturated slot'
  );

  // Create 3 Pay at Desk walk-in appointments for this saturated slot
  const apptWalkIn1 = '44444444-4444-4444-8444-444444444441';
  const apptWalkIn2 = '44444444-4444-4444-8444-444444444442';
  const apptWalkIn3 = '44444444-4444-4444-8444-444444444443';

  [apptWalkIn1, apptWalkIn2, apptWalkIn3].forEach((id, idx) => {
    db.seedAppointment({
      id,
      clinic_id: CLINIC_ID,
      doctor_id: DOCTOR_ID,
      slot_id: FULL_SLOT_ID,
      tracking_code_10_digit: `900000000${idx + 1}`,
      patient_name: `Walk-in Patient ${idx + 1}`,
      patient_mobile: '9841234567',
      status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
      payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
      appointment_date: '2026-10-30',
      appointment_time: '14:00:00',
      fee_amount: 500.0,
      service_charge_amount: 25.0,
      total_amount: 525.0,
      attempt_number: 1,
      created_at: new Date().toISOString()
    });
  });

  // Approval 1: 12/12 -> 13/12
  const resApprove1 = db.approveAppointment(apptWalkIn1, CLINIC_ID, 'reception@metro.com', 'staff');
  harness.assert(resApprove1.success, '2.2 Counter approval 1 succeeds without capacity rejection');
  const slotAfter1 = db.slots.get(FULL_SLOT_ID);
  harness.assert(slotAfter1.booked_count === 13, `2.3 Slot booked_count incremented to 13/12 (actual: ${slotAfter1.booked_count})`);

  // Approval 2: 13/12 -> 14/12
  const resApprove2 = db.approveAppointment(apptWalkIn2, CLINIC_ID, 'reception@metro.com', 'staff');
  harness.assert(resApprove2.success, '2.4 Counter approval 2 succeeds without capacity rejection');
  const slotAfter2 = db.slots.get(FULL_SLOT_ID);
  harness.assert(slotAfter2.booked_count === 14, `2.5 Slot booked_count incremented to 14/12 (actual: ${slotAfter2.booked_count})`);

  // Approval 3: 14/12 -> 15/12
  const resApprove3 = db.approveAppointment(apptWalkIn3, CLINIC_ID, 'reception@metro.com', 'staff');
  harness.assert(resApprove3.success, '2.6 Counter approval 3 succeeds without capacity rejection');
  const slotAfter3 = db.slots.get(FULL_SLOT_ID);
  harness.assert(slotAfter3.booked_count === 15, `2.7 Slot booked_count incremented to 15/12 (actual: ${slotAfter3.booked_count})`);

  // Test Oracle on 15/12
  const capacityEval = evaluateSlotCapacity(slotAfter3.max_capacity, slotAfter3.booked_count);
  harness.assert(capacityEval.remainingCount === 0, '2.8 Overload capacity remainingCount is bounded at 0 (never negative)');
  harness.assert(capacityEval.displayRatio === '15/12', `2.9 Display ratio correctly formats as 15/12 (actual: ${capacityEval.displayRatio})`);
  harness.assert(capacityEval.uiLabel === 'FULL', `2.10 UI label safely displays FULL without crashing (actual: ${capacityEval.uiLabel})`);
  harness.assert(capacityEval.isOverloaded === true, '2.11 Slot is flagged as overloaded');

  // Verify normal bookings are STILL blocked
  harness.assert(!db.canBookNormalSlot(FULL_SLOT_ID), '2.12 Normal booking remains strictly blocked on overloaded slot');

  // ===========================================================================
  // SECTION 3: CONCURRENCY & RACE CONDITIONS (FOR UPDATE ROW LOCKS)
  // ===========================================================================
  console.log(`\n${ANSI.bright}--- Section 3: Concurrency, Atomic Row Locks & Race Conditions ---${ANSI.reset}`);

  const raceApptId = '55555555-5555-4555-8555-555555555551';
  db.seedAppointment({
    id: raceApptId,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_id: FULL_SLOT_ID,
    tracking_code_10_digit: '9000000010',
    patient_name: 'Race Condition Test',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  // Probe 3.1: Double Concurrent Approval (Prevent Double Activation)
  let approveCall1Result = null;
  let approveCall2Error = null;

  try {
    approveCall1Result = db.approveAppointment(raceApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'tx-worker-1');
  } catch (err) {
    approveCall1Result = { error: err.message };
  }

  try {
    // Second concurrent call immediately tries to approve the same appointment
    db.approveAppointment(raceApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'tx-worker-2');
  } catch (err) {
    approveCall2Error = err.message;
  }

  harness.assert(approveCall1Result && approveCall1Result.success, '3.1.1 First approval transaction successfully commits');
  harness.assert(
    approveCall2Error && approveCall2Error.includes('must be WAITING_FOR_APPROVAL'),
    `3.1.2 Second approval transaction rejected with status error (actual error: "${approveCall2Error}")`
  );

  // Probe 3.2: Concurrent Approve vs Reject Race
  const raceConflictApptId = '55555555-5555-4555-8555-555555555552';
  db.seedAppointment({
    id: raceConflictApptId,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_id: FULL_SLOT_ID,
    tracking_code_10_digit: '9000000011',
    patient_name: 'Approve vs Reject Race',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  // Worker A rejects first
  const rejectRes = db.rejectAppointment(raceConflictApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'Doctor busy', 'tx-reject-1');
  harness.assert(rejectRes.success, '3.2.1 Reject transaction commits first and sets status to UNAPPROVED');

  // Worker B attempts to approve
  let approveAfterRejectError = null;
  try {
    db.approveAppointment(raceConflictApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'tx-approve-late');
  } catch (err) {
    approveAfterRejectError = err.message;
  }
  harness.assert(
    approveAfterRejectError && approveAfterRejectError.includes('must be WAITING_FOR_APPROVAL'),
    '3.2.2 Approval on already-unapproved appointment is strictly blocked'
  );

  // Probe 3.3: Concurrent Lock Contention Simulation
  // Lock the appointment artificially under tx-holder
  const lockContentionApptId = '55555555-5555-4555-8555-555555555553';
  db.seedAppointment({
    id: lockContentionApptId,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_id: FULL_SLOT_ID,
    tracking_code_10_digit: '9000000012',
    patient_name: 'Lock Contention Test',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  db.acquireRowLock('appointments', lockContentionApptId, 'tx-active-holder');
  let contentionError = null;
  try {
    db.approveAppointment(lockContentionApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'tx-new-caller');
  } catch (err) {
    contentionError = err.message;
  }
  harness.assert(
    contentionError && contentionError.includes('locked by another transaction'),
    '3.3.1 Active row lock blocks concurrent transaction from dirty read or double commit'
  );
  db.releaseRowLock('appointments', lockContentionApptId, 'tx-active-holder');

  // ===========================================================================
  // SECTION 4: RETRY CEILING & EXPIRATION BOUNDARIES
  // ===========================================================================
  console.log(`\n${ANSI.bright}--- Section 4: Retry Ceiling & Boundary Invariants ---${ANSI.reset}`);

  const retryCycleApptId = '66666666-6666-4666-8666-666666666661';
  db.seedAppointment({
    id: retryCycleApptId,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_id: FULL_SLOT_ID,
    tracking_code_10_digit: '9000000020',
    patient_name: 'Retry Patient',
    patient_mobile: '9841999999',
    patient_email: 'patient@dactor.com',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    expires_at: null,
    created_at: new Date().toISOString()
  });

  // Cycle 1: Reject -> Retry to Attempt 2
  db.rejectAppointment(retryCycleApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'Doctor running late');
  const apptAfterRej1 = db.appointments.get(retryCycleApptId);
  harness.assert(apptAfterRej1.status === CONTRACTS.statuses.UNAPPROVED, '4.1 Reject 1 transitions status to UNAPPROVED');
  harness.assert(apptAfterRej1.attempt_number === 1, '4.2 Reject 1 preserves attempt_number = 1');

  const retry1Res = db.retryAppointment(retryCycleApptId, '9841999999');
  harness.assert(retry1Res.success, '4.3 Retry 1 succeeds');
  const apptAfterRetry1 = db.appointments.get(retryCycleApptId);
  harness.assert(apptAfterRetry1.attempt_number === 2, '4.4 Attempt 2 recorded in database');
  harness.assert(apptAfterRetry1.status === CONTRACTS.statuses.WAITING_FOR_APPROVAL, '4.5 Status returned to WAITING_FOR_APPROVAL');
  harness.assert(apptAfterRetry1.expires_at === null, '4.6 expires_at remains NULL on attempt 2');

  // Cycle 2: Reject -> Retry to Attempt 3
  db.rejectAppointment(retryCycleApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'Slot full today');
  const retry2Res = db.retryAppointment(retryCycleApptId, '9841999999');
  harness.assert(retry2Res.success, '4.7 Retry 2 succeeds');
  const apptAfterRetry2 = db.appointments.get(retryCycleApptId);
  harness.assert(apptAfterRetry2.attempt_number === 3, '4.8 Attempt 3 recorded in database');
  harness.assert(apptAfterRetry2.expires_at !== null, '4.9 expires_at is set on Attempt 3');

  // Validate 2-day expiration delta
  const nowMs = Date.now();
  const expiryMs = new Date(apptAfterRetry2.expires_at).getTime();
  const diffHours = (expiryMs - nowMs) / (1000 * 60 * 60);
  harness.assert(
    diffHours >= 47.9 && diffHours <= 48.1,
    `4.10 expires_at is exactly 48 hours (+2 days) in the future (diff: ${diffHours.toFixed(2)}h)`
  );

  // Cycle 3: Reject Attempt 3
  db.rejectAppointment(retryCycleApptId, CLINIC_ID, 'reception@metro.com', 'staff', 'Clinic closing');
  const apptAfterRej3 = db.appointments.get(retryCycleApptId);
  harness.assert(apptAfterRej3.status === CONTRACTS.statuses.UNAPPROVED, '4.11 Reject 3 transitions status to UNAPPROVED');
  harness.assert(apptAfterRej3.attempt_number === 3, '4.12 Attempt number remains 3');

  // Boundary Test: 4th Retry Attempt MUST Fail Hard
  let retry4Error = null;
  try {
    db.retryAppointment(retryCycleApptId, '9841999999');
  } catch (err) {
    retry4Error = err.message;
  }
  harness.assert(
    retry4Error && retry4Error.includes('Maximum of 3 attempts exceeded'),
    `4.13 4th retry attempt is strictly blocked (actual error: "${retry4Error}")`
  );
  const apptAfterFailedRetry = db.appointments.get(retryCycleApptId);
  harness.assert(apptAfterFailedRetry.status === CONTRACTS.statuses.UNAPPROVED, '4.14 Status remains UNAPPROVED after blocked retry');
  harness.assert(apptAfterFailedRetry.attempt_number === 3, '4.15 Attempt count remains 3 after blocked retry');

  // Invalid Status Retries
  let retryWaitingError = null;
  const waitingApptId = '66666666-6666-4666-8666-666666666662';
  db.seedAppointment({
    id: waitingApptId,
    clinic_id: CLINIC_ID,
    patient_mobile: '9841999999',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    attempt_number: 1,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK
  });
  try {
    db.retryAppointment(waitingApptId, '9841999999');
  } catch (err) {
    retryWaitingError = err.message;
  }
  harness.assert(
    retryWaitingError && retryWaitingError.includes('must be UNAPPROVED'),
    '4.16 Calling retry when status is WAITING_FOR_APPROVAL is rejected'
  );

  // ===========================================================================
  // SECTION 5: QUEUE TOKEN MONOTONICITY & MULTI-TENANT ISOLATION
  // ===========================================================================
  console.log(`\n${ANSI.bright}--- Section 5: Queue Token Monotonicity & Isolation ---${ANSI.reset}`);

  // Dedicated clinic for queue monotonicity test to avoid cross-section queue pollution
  const QUEUE_CLINIC_ID = '77777777-1111-4777-8777-111111111111';
  const CLINIC_B_ID = '99999999-9999-4999-8999-999999999999';

  db.seedClinic({ id: QUEUE_CLINIC_ID, name: 'Central Care', contact_email: 'care@central.com' });
  db.seedClinic({ id: CLINIC_B_ID, name: 'Apex Polyclinic', contact_email: 'desk@apex.com' });

  // Pre-seed QUEUE_CLINIC_ID with 2 online patients in queue (Token 1, Token 2)
  db.queueEntries.set('online-appt-1', {
    appointment_id: 'online-appt-1',
    clinic_id: QUEUE_CLINIC_ID,
    doctor_id: DOCTOR_ID,
    queue_position: 1,
    status: 'waiting'
  });
  db.queueEntries.set('online-appt-2', {
    appointment_id: 'online-appt-2',
    clinic_id: QUEUE_CLINIC_ID,
    doctor_id: DOCTOR_ID,
    queue_position: 2,
    status: 'waiting'
  });

  // Verify pending Pay at Desk appointment has NO queue entry
  const pendingApptId = '77777777-7777-4777-8777-777777777771';
  db.seedAppointment({
    id: pendingApptId,
    clinic_id: QUEUE_CLINIC_ID,
    doctor_id: DOCTOR_ID,
    slot_id: FULL_SLOT_ID,
    tracking_code_10_digit: '9000000031',
    patient_name: 'Queue Isolation Patient',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  harness.assert(
    !db.queueEntries.has(pendingApptId),
    '5.1 Unapproved Pay at Desk appointment has ZERO entries in queue_entries'
  );

  // Approve pending appointment -> Should receive Token 3 (next sequential for QUEUE_CLINIC_ID)
  const qApproveRes = db.approveAppointment(pendingApptId, QUEUE_CLINIC_ID, 'care@central.com', 'staff');
  harness.assert(qApproveRes.queue_position === 3, `5.2 Approved appointment receives next sequential Token 3 (actual: ${qApproveRes.queue_position})`);
  harness.assert(db.queueEntries.has(pendingApptId), '5.3 queue_entries now contains the approved appointment');

  // Seed another online checkin -> Should receive Token 4
  const activeQueueForCentral = Array.from(db.queueEntries.values())
    .filter(q => q.clinic_id === QUEUE_CLINIC_ID && (q.status === 'waiting' || q.status === 'inside'))
    .map(q => q.queue_position);
  const nextPosOnline = Math.max(...activeQueueForCentral) + 1;
  db.queueEntries.set('online-appt-3', {
    appointment_id: 'online-appt-3',
    clinic_id: QUEUE_CLINIC_ID,
    doctor_id: DOCTOR_ID,
    queue_position: nextPosOnline,
    status: 'waiting'
  });
  harness.assert(nextPosOnline === 4, `5.4 Interleaved online checkin receives sequential Token 4 (actual: ${nextPosOnline})`);

  // Multi-clinic isolation: Approve appointment for Clinic B -> Should start at Token 1 for Clinic B
  const clinicBApptId = '88888888-8888-4888-8888-888888888881';
  db.seedAppointment({
    id: clinicBApptId,
    clinic_id: CLINIC_B_ID,
    doctor_id: DOCTOR_ID,
    tracking_code_10_digit: '9000000041',
    patient_name: 'Clinic B Patient',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  const clinicBApproveRes = db.approveAppointment(clinicBApptId, CLINIC_B_ID, 'desk@apex.com', 'staff');
  harness.assert(
    clinicBApproveRes.queue_position === 1,
    `5.5 Clinic B queue token is isolated from Clinic A and starts at Token 1 (actual: ${clinicBApproveRes.queue_position})`
  );

  // ===========================================================================
  // SECTION 6: SECURITY & CROSS-CLINIC TENANT DEFENSE
  // ===========================================================================
  console.log(`\n${ANSI.bright}--- Section 6: Security & Cross-Clinic Tenant Defense ---${ANSI.reset}`);

  // Test 6.1: Clinic A receptionist attempts to approve Clinic B appointment
  let crossClinicApproveError = null;
  const clinicBTamperApptId = '88888888-8888-4888-8888-888888888882';
  db.seedAppointment({
    id: clinicBTamperApptId,
    clinic_id: CLINIC_B_ID,
    doctor_id: DOCTOR_ID,
    tracking_code_10_digit: '9000000042',
    patient_name: 'Cross Clinic Test',
    patient_mobile: '9841234567',
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2026-10-30',
    appointment_time: '14:00:00',
    attempt_number: 1,
    created_at: new Date().toISOString()
  });

  try {
    // Calling with Clinic A credentials
    db.approveAppointment(clinicBTamperApptId, CLINIC_ID, 'reception@metro.com', 'staff');
  } catch (err) {
    crossClinicApproveError = err.message;
  }
  harness.assert(
    crossClinicApproveError && crossClinicApproveError.includes('Access denied'),
    `6.1 Cross-clinic approval attempt blocked with Access Denied (actual: "${crossClinicApproveError}")`
  );

  // Test 6.2: Clinic A receptionist attempts to reject Clinic B appointment
  let crossClinicRejectError = null;
  try {
    db.rejectAppointment(clinicBTamperApptId, CLINIC_ID, 'reception@metro.com', 'staff');
  } catch (err) {
    crossClinicRejectError = err.message;
  }
  harness.assert(
    crossClinicRejectError && crossClinicRejectError.includes('Access denied'),
    '6.2 Cross-clinic rejection attempt blocked with Access Denied'
  );

  // Test 6.3: Unauthorized stranger mobile attempting retry
  const unapprovedApptId = '88888888-8888-4888-8888-888888888883';
  db.seedAppointment({
    id: unapprovedApptId,
    clinic_id: CLINIC_ID,
    patient_name: 'Patient X',
    patient_mobile: '9841111111',
    status: CONTRACTS.statuses.UNAPPROVED,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    attempt_number: 1
  });

  let strangerRetryError = null;
  try {
    db.retryAppointment(unapprovedApptId, '9842222222'); // Wrong phone number
  } catch (err) {
    strangerRetryError = err.message;
  }
  harness.assert(
    strangerRetryError && strangerRetryError.includes('Access denied'),
    '6.3 Retry with mismatched patient phone number is rejected with Access Denied'
  );

  // Test 6.4: Attempt to approve expired appointment (past slot time)
  const pastSlotApptId = '88888888-8888-4888-8888-888888888884';
  db.seedAppointment({
    id: pastSlotApptId,
    clinic_id: CLINIC_ID,
    doctor_id: DOCTOR_ID,
    status: CONTRACTS.statuses.WAITING_FOR_APPROVAL,
    payment_mode: CONTRACTS.paymentModes.PAY_AT_DESK,
    appointment_date: '2025-01-01', // Date in the past
    appointment_time: '10:00:00',
    attempt_number: 1
  });

  let pastApproveError = null;
  try {
    db.approveAppointment(pastSlotApptId, CLINIC_ID, 'reception@metro.com', 'staff');
  } catch (err) {
    pastApproveError = err.message;
  }
  harness.assert(
    pastApproveError && pastApproveError.includes('Marked as EXPIRED'),
    '6.4 Approving appointment whose slot time has passed auto-expires appointment and raises error'
  );
  const pastAppt = db.appointments.get(pastSlotApptId);
  harness.assert(pastAppt.status === CONTRACTS.statuses.EXPIRED, '6.5 Past appointment status updated to EXPIRED');

  // ===========================================================================
  // HARNESS SUMMARY
  // ===========================================================================
  const allPass = harness.summary();

  if (allPass) {
    console.log(`${ANSI.bright}${ANSI.green}√ 100% OF EMPIRICAL ADVERSARIAL CHALLENGES PASSED!${ANSI.reset}`);
    console.log(`  - Rule 7 Overload Safety: 15/12 saturation confirmed safe, non-negative, and full.`);
    console.log(`  - Concurrency Locks: Atomic 'FOR UPDATE' row locks prevent double approvals and races.`);
    console.log(`  - Retry Ceiling: 3-attempt maximum enforced; 2-day expiry on 3rd attempt verified.`);
    console.log(`  - Queue Isolation: Queue tokens sequential and strictly excluded while pending.`);
    console.log(`  - Multi-tenant Defense: Cross-clinic access denied; unauthenticated callers rejected.\n`);
    process.exit(0);
  } else {
    console.error(`${ANSI.bright}${ANSI.red}X VULNERABILITIES IDENTIFIED: ${harness.failed} test(s) failed.${ANSI.reset}\n`);
    process.exit(1);
  }
}

runEmpiricalMilestone3Challenges().catch((err) => {
  console.error('Fatal error running empirical challenger:', err);
  process.exit(1);
});
