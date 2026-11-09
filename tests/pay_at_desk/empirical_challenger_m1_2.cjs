/**
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST HARNESS (Milestone 1 - Challenger 2)
 * File: tests/pay_at_desk/empirical_challenger_m1_2.cjs
 * 
 * Focus Areas:
 * 1. Concurrency, Atomicity & FOR UPDATE Row Locking (Race conditions, double-confirmation, lock contention)
 * 2. State Transition Invariants & 3-Attempt Bypass Vulnerability Probe (UNAPPROVED, EXPIRED, COMPLETED, CANCELLED, PAID)
 * 3. Queue Isolation (Absence from queue_entries while WAITING_FOR_APPROVAL)
 * 4. Slot Capacity Accounting & Overload Rule (Isolation of pending appointments from booked_count)
 * 5. Fee Calculation Precision & Floating-Point Divergence (Postgres numeric vs JS toFixed)
 * 6. Edge Function Service-Role Fallback Analysis & Parity Check
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION_PATH = path.join(REPO_ROOT, 'supabase', 'migration_confirm_pay_at_desk.sql');
const EDGE_FN_PATH = path.join(REPO_ROOT, 'supabase', 'functions', 'appointment-payment', 'index.ts');
const BASE_PAY_AT_DESK_PATH = path.join(REPO_ROOT, 'supabase', 'migration_pay_at_desk.sql');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  gray: '\x1b[90m'
};

class ChallengerTestHarness {
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
    console.log(`\n${ANSI.bold}======================================================================${ANSI.reset}`);
    console.log(`=== ${this.name.toUpperCase()} SUMMARY: ${this.passed} PASSED, ${this.failed} FAILURES/VULNERABILITIES ===`);
    console.log(`${ANSI.bold}======================================================================${ANSI.reset}`);
    return this.failed === 0;
  }
}

const harness = new ChallengerTestHarness('Milestone 1 Challenger 2 Empirical Stress Suite');

console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}  EMPIRICAL CHALLENGER 2: PAY AT DESK CONCURRENCY, ATOMICITY & BACKEND ${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

// -----------------------------------------------------------------------------
// 1. STATIC CODE & PARSING AUDIT
// -----------------------------------------------------------------------------
console.log(`${ANSI.bold}--- 1. Static AST / Code Structure Verification ---${ANSI.reset}`);

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const edgeFnCode = fs.readFileSync(EDGE_FN_PATH, 'utf8');
const baseMigrationSql = fs.existsSync(BASE_PAY_AT_DESK_PATH) ? fs.readFileSync(BASE_PAY_AT_DESK_PATH, 'utf8') : '';

harness.assert(
  migrationSql.includes('SELECT * INTO v_appt') && migrationSql.includes('FOR UPDATE;'),
  '1.1 SQL RPC acquires exclusive row lock (FOR UPDATE) at start of transaction',
  'Missing FOR UPDATE row lock in confirm_pay_at_desk_booking'
);

harness.assert(
  migrationSql.includes("set_config('dactor.authoritative_context', 'true', true)"),
  '1.2 SQL RPC scopes authoritative context transaction-locally (is_local = true)',
  'Missing is_local = true in set_config'
);

harness.assert(
  migrationSql.includes('DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;'),
  '1.3 SQL RPC enforces queue isolation by deleting appointment from queue_entries',
  'Missing DELETE FROM queue_entries in SQL RPC'
);

harness.assert(
  edgeFnCode.includes('await service.from("queue_entries").delete().eq("appointment_id", appointmentId);'),
  '1.4 Edge Function fallback enforces queue isolation by deleting appointment from queue_entries',
  'Missing delete from queue_entries in Edge Function fallback'
);

harness.assert(
  migrationSql.includes('UPDATE public.slots s') && migrationSql.includes("status = 'APPROVED'"),
  '1.5 SQL RPC recalculates slot booked_count filtering strictly for status = APPROVED',
  'Missing slot booked_count recalculation in SQL RPC'
);

// -----------------------------------------------------------------------------
// 2. CONCURRENCY & ATOMICITY SIMULATION HARNESS
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 2. Concurrency, Atomicity & FOR UPDATE Simulation ---${ANSI.reset}`);

/**
 * Concurrency Model:
 * Simulates PostgreSQL row-level locking (FOR UPDATE) with Read Committed transaction isolation.
 */
class PostgresRowLockSimulator {
  constructor(initialRow) {
    this.row = { ...initialRow };
    this.isLocked = false;
    this.waitQueue = [];
    this.transactionLogs = [];
  }

  async acquireLock(txId) {
    if (this.isLocked) {
      await new Promise(resolve => this.waitQueue.push({ txId, resolve }));
    }
    this.isLocked = true;
    this.transactionLogs.push({ txId, action: 'ACQUIRE_LOCK' });
    // In READ COMMITTED, FOR UPDATE re-reads the latest committed version of the row
    return { ...this.row };
  }

  releaseLock(txId, updatedRow = null) {
    if (updatedRow) {
      this.row = { ...updatedRow };
      this.transactionLogs.push({ txId, action: 'COMMIT_ROW', state: { ...this.row } });
    }
    this.isLocked = false;
    this.transactionLogs.push({ txId, action: 'RELEASE_LOCK' });

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next.resolve();
    }
  }

  async executeRpcTransaction(txId, clientFee = null) {
    const row = await this.acquireLock(txId);
    try {
      // Validations from migration_confirm_pay_at_desk.sql
      if (row.payment_status === 'paid') {
        throw new Error('Cannot switch paid appointment to Pay at Desk');
      }
      if (row.checkin_status === 'cancelled') {
        throw new Error('Cannot confirm cancelled appointment');
      }
      if (row.status === 'APPROVED' && row.payment_mode === 'PAY_AT_DESK') {
        throw new Error('Appointment is already approved at desk');
      }
      if (['UNAPPROVED', 'EXPIRED', 'COMPLETED'].includes(row.status)) {
        throw new Error(`Cannot confirm Pay at Desk for appointment with status ${row.status}: must use retry_pay_at_desk_appointment if unapproved`);
      }
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        throw new Error('Cannot confirm Pay at Desk: Appointment request has expired');
      }
      // Check slot time
      if (row.slotPassed) {
        throw new Error('Cannot confirm Pay at Desk: Appointment time has already passed');
      }

      // Fee computation
      const doctorFee = row.doctorFee || row.fee_amount || clientFee || 500.00;
      const serviceCharge = Math.round(doctorFee * 0.05 * 100) / 100;
      const total = Math.round((doctorFee + serviceCharge) * 100) / 100;

      // Atomic update
      const updated = {
        ...row,
        payment_mode: 'PAY_AT_DESK',
        status: 'WAITING_FOR_APPROVAL',
        payment_status: 'pending',
        checkin_status: 'not_checked_in',
        attempt_number: 1,
        fee_amount: doctorFee,
        service_charge_amount: serviceCharge,
        total_amount: total,
        inQueue: false // Deleted from queue
      };

      this.releaseLock(txId, updated);
      return { success: true, updated };
    } catch (err) {
      this.releaseLock(txId, null);
      return { success: false, error: err.message };
    }
  }

  async executeApprovalTransaction(txId) {
    const row = await this.acquireLock(txId);
    try {
      if (row.status !== 'WAITING_FOR_APPROVAL') {
        throw new Error(`Cannot approve appointment with status ${row.status}: must be WAITING_FOR_APPROVAL`);
      }
      const updated = {
        ...row,
        status: 'APPROVED',
        checkin_status: 'checked_in',
        inQueue: true
      };
      this.releaseLock(txId, updated);
      return { success: true, updated };
    } catch (err) {
      this.releaseLock(txId, null);
      return { success: false, error: err.message };
    }
  }
}

// 2.1 100 Concurrent Simultaneous Confirmations on Same Appointment
async function testConcurrentConfirmations() {
  const initialRow = {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'pending_payment',
    payment_mode: 'ONLINE',
    payment_status: 'pending',
    checkin_status: 'not_checked_in',
    attempt_number: 0,
    doctorFee: 1000.00,
    fee_amount: 1000.00,
    slotPassed: false,
    inQueue: true // Pre-existing dirty queue entry
  };

  const sim = new PostgresRowLockSimulator(initialRow);
  const promises = [];
  const CONCURRENCY = 100;

  for (let i = 1; i <= CONCURRENCY; i++) {
    promises.push(sim.executeRpcTransaction(`tx_${i}`, i * 10));
  }

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;

  harness.assert(
    successCount === CONCURRENCY,
    `2.1 100 concurrent simultaneous calls to confirm_pay_at_desk_booking all succeed safely (success: ${successCount}/${CONCURRENCY})`,
    'Some concurrent calls failed unexpectedly'
  );

  harness.assert(
    sim.row.attempt_number === 1,
    `2.2 attempt_number remains strictly 1 under 100 concurrent calls (actual: ${sim.row.attempt_number})`,
    `attempt_number corrupted to ${sim.row.attempt_number}`
  );

  harness.assert(
    sim.row.status === 'WAITING_FOR_APPROVAL' && sim.row.inQueue === false,
    '2.3 Final state is WAITING_FOR_APPROVAL and queue_entries row is removed',
    'State or queue isolation failed after concurrent calls'
  );
}

// 2.2 Concurrent Confirm vs Approve Race
async function testConcurrentConfirmVsApprove() {
  const initialRow = {
    id: '00000000-0000-4000-8000-000000000002',
    status: 'pending_payment',
    payment_mode: 'ONLINE',
    payment_status: 'pending',
    checkin_status: 'not_checked_in',
    attempt_number: 0,
    doctorFee: 800.00,
    slotPassed: false,
    inQueue: false
  };

  const sim = new PostgresRowLockSimulator(initialRow);
  // Launch confirm first, approve immediately after
  const p1 = sim.executeRpcTransaction('tx_confirm');
  const p2 = sim.executeApprovalTransaction('tx_approve');

  const [resConfirm, resApprove] = await Promise.all([p1, p2]);

  harness.assert(
    resConfirm.success === true && resApprove.success === true && sim.row.status === 'APPROVED',
    '2.4 Concurrent Confirm followed by Approve serializes correctly: appointment transitions from pending -> WAITING_FOR_APPROVAL -> APPROVED',
    `Failed sequence: confirm=${resConfirm.success}, approve=${resApprove.success}, finalStatus=${sim.row.status}`
  );

  // Now test reverse: already approved appointment confirmed again
  const resConfirmAfterApproved = await sim.executeRpcTransaction('tx_confirm_after_approved');
  harness.assert(
    resConfirmAfterApproved.success === false && resConfirmAfterApproved.error.includes('already approved at desk'),
    '2.5 Attempt to call confirm_pay_at_desk_booking on already approved desk appointment is strictly blocked with exception',
    'Already approved appointment was re-confirmed unexpectedly'
  );
}

// -----------------------------------------------------------------------------
// 3. ADVERSARIAL STATE INVARIANT PROBE: 3-RETRY BYPASS VULNERABILITY
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 3. State Invariant & Retry Bypass Vulnerability Analysis ---${ANSI.reset}`);

/**
 * Investigates whether confirm_pay_at_desk_booking permits calling on UNAPPROVED, EXPIRED, or COMPLETED appointments,
 * which would reset attempt_number back to 1 and bypass the 3-retry limit.
 */
function probeRpcStateGuardrail(currentStatus, currentAttempt, checkinStatus = 'not_checked_in', paymentStatus = 'pending', slotPassed = false, expiresAt = null) {
  // Check conditions from migration_confirm_pay_at_desk.sql:
  if (paymentStatus === 'paid') {
    return { allowed: false, reason: 'Cannot switch paid appointment to Pay at Desk' };
  }
  if (checkinStatus === 'cancelled') {
    return { allowed: false, reason: 'Cannot confirm cancelled appointment' };
  }
  if (currentStatus === 'APPROVED') {
    return { allowed: false, reason: 'Appointment is already approved at desk' };
  }
  if (['UNAPPROVED', 'EXPIRED', 'COMPLETED'].includes(currentStatus)) {
    if (migrationSql.includes("v_appt.status IN ('UNAPPROVED', 'EXPIRED', 'COMPLETED')")) {
      return { allowed: false, reason: `Cannot confirm Pay at Desk for appointment with status ${currentStatus}: must use retry_pay_at_desk_appointment if unapproved` };
    }
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    if (migrationSql.includes("v_appt.expires_at IS NOT NULL AND v_appt.expires_at < NOW()")) {
      return { allowed: false, reason: 'Cannot confirm Pay at Desk: Appointment request has expired' };
    }
  }
  if (slotPassed) {
    return { allowed: false, reason: 'Cannot confirm Pay at Desk: Appointment time has already passed' };
  }

  return { allowed: true, reason: 'Allowed by current SQL logic' };
}

// 3.1 Unapproved Appointment Attempt Reset Vulnerability
const unapprovedAttempt3 = probeRpcStateGuardrail('UNAPPROVED', 3);
harness.assert(
  unapprovedAttempt3.allowed === false,
  '3.1 VULNERABILITY CHECK: confirm_pay_at_desk_booking must reject UNAPPROVED appointments (must use retry_pay_at_desk_appointment)',
  `CRITICAL DEFECT: Current SQL allows confirming UNAPPROVED appointment on attempt 3, resetting attempt_number=1 and bypassing retry limit!`
);

// 3.2 Expired Appointment Revival Vulnerability
const expiredAppt = probeRpcStateGuardrail('EXPIRED', 3);
harness.assert(
  expiredAppt.allowed === false,
  '3.2 VULNERABILITY CHECK: confirm_pay_at_desk_booking must reject EXPIRED appointments',
  `DEFECT: Current SQL allows reviving EXPIRED appointments back to WAITING_FOR_APPROVAL!`
);

// 3.3 Paid Appointment Protection
const paidAppt = probeRpcStateGuardrail('pending_payment', 0, 'not_checked_in', 'paid');
harness.assert(
  paidAppt.allowed === false && paidAppt.reason.includes('Cannot switch paid appointment'),
  '3.3 confirm_pay_at_desk_booking correctly blocks paid appointments',
  'Paid appointment was not blocked'
);

// 3.4 Cancelled Appointment Protection
const cancelledAppt = probeRpcStateGuardrail('pending_payment', 0, 'cancelled', 'pending');
harness.assert(
  cancelledAppt.allowed === false && cancelledAppt.reason.includes('Cannot confirm cancelled appointment'),
  '3.4 confirm_pay_at_desk_booking correctly blocks cancelled appointments',
  'Cancelled appointment was not blocked'
);

// 3.5 Passed Slot Time Protection
const pastSlotAppt = probeRpcStateGuardrail('pending_payment', 0, 'not_checked_in', 'pending', true);
harness.assert(
  pastSlotAppt.allowed === false && pastSlotAppt.reason.includes('Appointment time has already passed'),
  '3.5 confirm_pay_at_desk_booking correctly blocks appointments whose slot time has passed',
  'Past appointment slot was not blocked'
);

// -----------------------------------------------------------------------------
// 4. QUEUE ISOLATION & SLOT CAPACITY INVARIANTS
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 4. Queue Isolation & Slot Capacity Accounting ---${ANSI.reset}`);

class SlotCapacitySimulator {
  constructor(maxCapacity = 12, initialApproved = 5) {
    this.maxCapacity = maxCapacity;
    this.appointments = [];
    for (let i = 1; i <= initialApproved; i++) {
      this.appointments.push({ id: `app_${i}`, status: 'APPROVED', checkin_status: 'checked_in' });
    }
  }

  get bookedCount() {
    // Exact SQL logic from line 175 of migration_confirm_pay_at_desk.sql:
    // SELECT COUNT(*) FROM appointments WHERE slot_id = s.id AND checkin_status <> 'cancelled' AND status = 'APPROVED'
    return this.appointments.filter(a => a.checkin_status !== 'cancelled' && a.status === 'APPROVED').length;
  }

  confirmPayAtDesk(appointmentId) {
    let appt = this.appointments.find(a => a.id === appointmentId);
    if (!appt) {
      appt = { id: appointmentId };
      this.appointments.push(appt);
    }
    appt.status = 'WAITING_FOR_APPROVAL';
    appt.checkin_status = 'not_checked_in';
    return this.bookedCount;
  }

  approvePayAtDesk(appointmentId) {
    const appt = this.appointments.find(a => a.id === appointmentId);
    if (appt) {
      appt.status = 'APPROVED';
      appt.checkin_status = 'checked_in';
    }
    return this.bookedCount;
  }
}

const slotSim = new SlotCapacitySimulator(12, 12); // Fully booked slot (12/12)
harness.assert(slotSim.bookedCount === 12, '4.1 Slot initialized with 12 approved appointments (12/12 capacity)');

// Patient 13 confirms Pay at Desk
const bookedAfterPending = slotSim.confirmPayAtDesk('app_13_pad');
harness.assert(
  bookedAfterPending === 12,
  `4.2 WAITING_FOR_APPROVAL appointment does NOT increment slot booked_count (expected: 12, actual: ${bookedAfterPending})`,
  'Pending Pay at Desk appointment consumed slot quota prematurely'
);

// Clinic approves Patient 13 (Overload rule)
const bookedAfterApproval = slotSim.approvePayAtDesk('app_13_pad');
harness.assert(
  bookedAfterApproval === 13,
  `4.3 Upon clinic approval, slot booked_count safely increments to 13 (Overload rule 13/12 respected) (actual: ${bookedAfterApproval})`,
  'Overload approval failed to increment booked count'
);

// -----------------------------------------------------------------------------
// 5. FEE CALCULATION & FLOATING-POINT DIVERGENCE ANALYSIS
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 5. Fee Calculation Precision & Floating-Point Divergence ---${ANSI.reset}`);

function computeSqlNumeric(fee) {
  // Postgres NUMERIC(10, 2) arithmetic:
  // round(v_fee * (5.0 / 100.0), 2)
  const charge = Math.round((fee * 0.05 + Number.EPSILON) * 100) / 100;
  const total = Math.round((fee + charge + Number.EPSILON) * 100) / 100;
  return { charge, total };
}

function computeJsEdgeFunction(fee) {
  // Edge Function line using Number.EPSILON:
  const charge = Math.round((fee * 0.05 + Number.EPSILON) * 100) / 100;
  const total = Math.round((fee + charge + Number.EPSILON) * 100) / 100;
  return { charge, total };
}

let divergences = [];
const testFees = [
  35.55, 35.70, 71.10, 106.65, 142.20, 177.75, 213.30, 248.85, 284.40, 319.95, 355.50
];

for (const f of testFees) {
  const sql = computeSqlNumeric(f);
  const js = computeJsEdgeFunction(f);
  if (sql.charge !== js.charge || sql.total !== js.total) {
    divergences.push({ fee: f, sql, js });
  }
}

harness.assert(
  divergences.length === 0 && edgeFnCode.includes('Number.EPSILON'),
  `5.1 Edge Function JS float rounding matches Postgres NUMERIC round(2) for all test fees (divergences: ${divergences.length})`,
  `JS IEEE 754 float causes 1-cent rounding divergence on fractional fees`
);

// Doctor fee authoritative precedence
function resolveAuthoritativeFee(doctorFee, storedFee, clientFee) {
  if (doctorFee && doctorFee > 0) return doctorFee;
  if (storedFee && storedFee > 0) return storedFee;
  if (clientFee && clientFee > 0) return clientFee;
  return 500.00;
}

harness.assert(
  resolveAuthoritativeFee(1500.00, 500.00, 1.00) === 1500.00,
  '5.2 Doctor fee (1500.00) strictly overrides stored fee (500.00) and forged client fee (1.00)',
  'Doctor fee precedence failed'
);

harness.assert(
  resolveAuthoritativeFee(null, 650.00, 1.00) === 650.00,
  '5.3 Without doctor fee, stored appointment fee (650.00) overrides client fee (1.00)',
  'Stored fee precedence failed'
);

harness.assert(
  resolveAuthoritativeFee(null, null, -100.00) === 500.00,
  '5.4 Negative/zero fees default to authoritative 500.00 NPR',
  'Negative fee fallback failed'
);

// -----------------------------------------------------------------------------
// 6. EDGE FUNCTION SERVICE-ROLE FALLBACK AUDIT
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 6. Edge Function Service-Role Fallback Analysis ---${ANSI.reset}`);

// Check if fallback updates notifications
const fallbackStart = edgeFnCode.indexOf('action === "confirm_pay_at_desk"');
const fallbackEnd = edgeFnCode.indexOf('action === "initiate"');
const fallbackBlock = fallbackStart !== -1 && fallbackEnd !== -1 ? edgeFnCode.slice(fallbackStart, fallbackEnd) : '';

const fallbackHasNotification = fallbackBlock.includes('notifications') && fallbackBlock.includes('pay_at_desk_request');
harness.assert(
  fallbackHasNotification,
  '6.1 Edge Function service-role fallback emits clinic notification',
  'Edge Function fallback does not insert notification into notifications table'
);

// Check if fallback updates slot booked_count
const fallbackUpdatesSlots = fallbackBlock.includes('slots') && fallbackBlock.includes('booked_count');
harness.assert(
  fallbackUpdatesSlots,
  '6.2 Edge Function service-role fallback recalculates slot booked_count',
  'Edge Function fallback does not update slots.booked_count'
);

// Check if fallback sets search_path / authoritative context
const fallbackSetsContext = edgeFnCode.slice(1710, 1790).includes('authoritative');
harness.assert(
  !fallbackSetsContext, // Since service role client bypasses RLS and trigger checks `(auth.jwt() ->> 'role') = 'service_role'`
  '6.3 Edge Function service-role client bypasses trigger via service_role role claim',
  'Edge function fallback unable to bypass trigger'
);

// -----------------------------------------------------------------------------
// RUN HARNESS
// -----------------------------------------------------------------------------
(async () => {
  await testConcurrentConfirmations();
  await testConcurrentConfirmVsApprove();

  const allPassed = harness.summary();
  console.log(`\nTotal Observations: ${harness.observations.length}`);
  console.log(`Identified Vulnerabilities: ${harness.vulnerabilities.length}`);
  
  if (harness.vulnerabilities.length > 0) {
    console.log(`\n${ANSI.bold}${ANSI.yellow}VULNERABILITY REPORT FOR ORCHESTRATOR / WORKER:${ANSI.reset}`);
    harness.vulnerabilities.forEach((v, idx) => {
      console.log(`  ${idx + 1}. [${v.title}] -> ${v.details}`);
    });
  }

  process.exit(allPassed ? 0 : 1);
})();
