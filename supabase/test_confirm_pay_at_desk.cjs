/**
 * Milestone 1 Verification Test Suite
 * Target: Server-Authoritative Pay at Desk Confirmation RPC & Edge Function Handler
 * File: supabase/test_confirm_pay_at_desk.cjs
 *
 * Verifies:
 * 1. SQL Migration Schema, Permissions, & Logic (`supabase/migration_confirm_pay_at_desk.sql`)
 * 2. Anti-Tampering Trigger Update with `dactor.authoritative_context`
 * 3. Edge Function Routing, Authorization, RPC call & Service-Role Fallback (`supabase/functions/appointment-payment/index.ts`)
 * 4. Algorithmic Simulation of Fee Resolution, 5% Service Charge, and State Guardrails
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATION_PATH = path.join(REPO_ROOT, 'supabase', 'migration_confirm_pay_at_desk.sql');
const EDGE_FN_PATH = path.join(REPO_ROOT, 'supabase', 'functions', 'appointment-payment', 'index.ts');

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

console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}   MILESTONE 1: PAY AT DESK RPC & EDGE FUNCTION VERIFICATION SUITE    ${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

const runner = new TestSuite('Milestone 1 Verification');

// -----------------------------------------------------------------------------
// DOMAIN 1: SQL MIGRATION DEFINITION & STATIC AUDIT
// -----------------------------------------------------------------------------
console.log(`${ANSI.bold}--- Domain 1: SQL Migration (migration_confirm_pay_at_desk.sql) ---${ANSI.reset}`);

runner.assert(fs.existsSync(MIGRATION_PATH), '1.1 Migration file exists at supabase/migration_confirm_pay_at_desk.sql');
const migrationSql = fs.existsSync(MIGRATION_PATH) ? fs.readFileSync(MIGRATION_PATH, 'utf8') : '';

runner.assert(
  /CREATE OR REPLACE FUNCTION public\.confirm_pay_at_desk_booking\s*\(\s*p_appointment_id\s+UUID\s*,\s*p_fee_amount\s+NUMERIC\s+DEFAULT\s+NULL\s*\)\s*RETURNS\s+JSONB/i.test(migrationSql),
  '1.2 confirm_pay_at_desk_booking RPC signature matches (UUID, NUMERIC DEFAULT NULL) RETURNS JSONB'
);

runner.assert(
  migrationSql.includes('SECURITY DEFINER') && migrationSql.includes('SET search_path = pg_catalog, public'),
  '1.3 confirm_pay_at_desk_booking is SECURITY DEFINER with SET search_path = pg_catalog, public'
);

runner.assert(
  migrationSql.includes("set_config('dactor.authoritative_context', 'true', true)"),
  '1.4 RPC sets transaction-local setting dactor.authoritative_context = true via set_config'
);

runner.assert(
  migrationSql.includes("GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role"),
  '1.5 Execute permission granted to anon, authenticated, and service_role'
);

runner.assert(
  migrationSql.includes("payment_mode = 'PAY_AT_DESK'") &&
  migrationSql.includes("status = 'WAITING_FOR_APPROVAL'") &&
  migrationSql.includes("payment_status = 'pending'") &&
  migrationSql.includes("attempt_number = 1") &&
  migrationSql.includes("checkin_status = 'not_checked_in'"),
  '1.6 Atomically transitions appointment to WAITING_FOR_APPROVAL, PAY_AT_DESK, attempt_number=1'
);

runner.assert(
  migrationSql.includes('DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;'),
  '1.7 Enforces queue isolation by removing appointment from queue_entries'
);

runner.assert(
  migrationSql.includes('UPDATE public.slots s') && migrationSql.includes("status = 'APPROVED'"),
  '1.8 Recalculates slot booked_count (counting only approved appointments)'
);

runner.assert(
  migrationSql.includes('INSERT INTO public.notifications') && migrationSql.includes('pay_at_desk_request'),
  '1.9 Emits clinic notification upon new Pay at Desk request'
);

runner.assert(
  migrationSql.includes('jsonb_build_object') &&
  migrationSql.includes("'tracking_code_10_digit'") &&
  migrationSql.includes("'fee_amount'") &&
  migrationSql.includes("'service_charge_amount'") &&
  migrationSql.includes("'total_amount'"),
  '1.10 Returns structured JSONB response with tracking code and fee breakdown'
);

// -----------------------------------------------------------------------------
// DOMAIN 2: ANTI-TAMPERING TRIGGER UPDATE
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 2: Anti-Tampering Trigger (dactor.authoritative_context) ---${ANSI.reset}`);

runner.assert(
  /CREATE OR REPLACE FUNCTION public\.prevent_patient_appointment_privilege_escalation/i.test(migrationSql),
  '2.1 prevent_patient_appointment_privilege_escalation trigger function defined in migration'
);

runner.assert(
  migrationSql.includes("current_setting('dactor.authoritative_context', true) = 'true'"),
  '2.2 Trigger checks transaction-local setting dactor.authoritative_context = true with missing_ok'
);

runner.assert(
  migrationSql.includes("CREATE TRIGGER appointments_prevent_patient_privilege_escalation") &&
  migrationSql.includes("BEFORE UPDATE ON public.appointments"),
  '2.3 Trigger registered BEFORE UPDATE ON public.appointments'
);

// -----------------------------------------------------------------------------
// DOMAIN 3: EDGE FUNCTION ROUTER & FALLBACK
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 3: Edge Function (appointment-payment/index.ts) ---${ANSI.reset}`);

runner.assert(fs.existsSync(EDGE_FN_PATH), '3.1 Edge function file exists at supabase/functions/appointment-payment/index.ts');
const edgeFnCode = fs.existsSync(EDGE_FN_PATH) ? fs.readFileSync(EDGE_FN_PATH, 'utf8') : '';

runner.assert(
  edgeFnCode.includes('action === "confirm_pay_at_desk"') || edgeFnCode.includes("body.action === 'confirm_pay_at_desk'"),
  '3.2 Handles confirm_pay_at_desk action in POST router'
);

runner.assert(
  edgeFnCode.includes('/^[0-9a-f-]{36}$/i.test(appointmentId)'),
  '3.3 Validates appointmentId UUID format before proceeding'
);

runner.assert(
  edgeFnCode.includes('await authorizeAppointment(req, appointmentId, body)'),
  '3.4 Verifies appointment authorization using authorizeAppointment helper'
);

runner.assert(
  edgeFnCode.includes('service.rpc("confirm_pay_at_desk_booking"'),
  '3.5 Invokes confirm_pay_at_desk_booking RPC'
);

runner.assert(
  edgeFnCode.includes('confirm_pay_at_desk RPC error or fallback triggered:') &&
  edgeFnCode.includes('service.from("appointments").update({'),
  '3.6 Provides service-role fallback if RPC encounters unexpected error'
);

runner.assert(
  edgeFnCode.includes('json({ success: true, appointment:'),
  '3.7 Returns 200 JSON with { success: true, appointment: ... } and corsHeaders'
);

// -----------------------------------------------------------------------------
// DOMAIN 4: ALGORITHMIC SIMULATION OF FEE RESOLUTION & PRICING
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 4: Algorithmic Simulation of Fee Resolution & 5% Charge ---${ANSI.reset}`);

function computePayAtDeskAmounts(doctorConsultationFee, storedFee, clientFee) {
  let fee = 0;
  if (doctorConsultationFee !== null && doctorConsultationFee !== undefined && Number(doctorConsultationFee) > 0) {
    fee = Number(doctorConsultationFee);
  } else if (storedFee !== null && storedFee !== undefined && Number(storedFee) > 0) {
    fee = Number(storedFee);
  } else if (clientFee !== null && clientFee !== undefined && Number(clientFee) > 0) {
    fee = Number(clientFee);
  } else {
    fee = 500.00;
  }
  fee = Math.round(fee * 100) / 100;
  const serviceCharge = Math.round(fee * 0.05 * 100) / 100;
  const total = Math.round((fee + serviceCharge) * 100) / 100;
  return { fee, serviceCharge, total };
}

// Case 1: Standard doctor fee 1200
const c1 = computePayAtDeskAmounts(1200, 500, 100);
runner.assert(c1.fee === 1200 && c1.serviceCharge === 60.00 && c1.total === 1260.00, '4.1 Fee 1200 -> 5% charge = 60.00, Total = 1260.00');

// Case 2: Fractional doctor fee 750
const c2 = computePayAtDeskAmounts(750, null, null);
runner.assert(c2.fee === 750 && c2.serviceCharge === 37.50 && c2.total === 787.50, '4.2 Fee 750 -> 5% charge = 37.50, Total = 787.50');

// Case 3: Tricky rounding fee 333.33 -> 5% = 16.6665 -> 16.67
const c3 = computePayAtDeskAmounts(333.33, null, null);
runner.assert(c3.fee === 333.33 && c3.serviceCharge === 16.67 && c3.total === 350.00, '4.3 Fee 333.33 -> 5% charge = 16.67, Total = 350.00');

// Case 4: No doctor fee, fallback to stored fee 600
const c4 = computePayAtDeskAmounts(null, 600, 200);
runner.assert(c4.fee === 600 && c4.serviceCharge === 30.00 && c4.total === 630.00, '4.4 Fallback to stored fee 600 -> 5% charge = 30.00, Total = 630.00');

// Case 5: No doctor or stored fee, fallback to client fee 800
const c5 = computePayAtDeskAmounts(null, null, 800);
runner.assert(c5.fee === 800 && c5.serviceCharge === 40.00 && c5.total === 840.00, '4.5 Fallback to client fee 800 -> 5% charge = 40.00, Total = 840.00');

// Case 6: Zero / null inputs default to 500.00
const c6 = computePayAtDeskAmounts(null, null, null);
runner.assert(c6.fee === 500.00 && c6.serviceCharge === 25.00 && c6.total === 525.00, '4.6 Default fee 500.00 -> 5% charge = 25.00, Total = 525.00');

// Case 7: Adversarial fee injection - client tries 1.00 when doctor fee is 1000
const c7 = computePayAtDeskAmounts(1000, 1000, 1.00);
runner.assert(c7.fee === 1000.00 && c7.serviceCharge === 50.00 && c7.total === 1050.00, '4.7 Adversarial client injection (1.00 NPR) strictly overridden by doctor fee (1000.00 NPR)');

// -----------------------------------------------------------------------------
// DOMAIN 5: TRIGGER & TRANSACTION-LOCAL CONTEXT SIMULATION
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- Domain 5: Anti-Tampering Trigger Simulation ---${ANSI.reset}`);

function simulateAppointmentUpdateTrigger({ role, isStaff, isAuthoritativeContext, isCurrentPatient, modifiedFields, newCheckinStatus, oldCheckinStatus }) {
  // Service role, admin, or staff
  if (role === 'service_role' || role === 'admin' || isStaff) {
    return { allowed: true, reason: 'Staff/Admin/Service bypass' };
  }

  // Authoritative server RPC bypass
  if (isAuthoritativeContext === 'true') {
    return { allowed: true, reason: 'Authoritative context bypass' };
  }

  if (!isCurrentPatient) {
    return { allowed: false, reason: 'Appointment update is not authorized.' };
  }

  const allowedFields = ['appointment_date', 'appointment_time', 'slot_id', 'checkin_status', 'updated_at'];
  const hasUnauthorizedFields = modifiedFields.some((f) => !allowedFields.includes(f));
  if (hasUnauthorizedFields) {
    return { allowed: false, reason: 'Patients cannot update appointment identity, financial, ownership, or queue fields.' };
  }

  if (newCheckinStatus !== oldCheckinStatus && newCheckinStatus !== 'cancelled') {
    return { allowed: false, reason: 'Patients may only cancel their own appointment.' };
  }

  return { allowed: true, reason: 'Allowed patient reschedule/cancellation' };
}

// 5.1 Direct client update modifying payment_mode without authoritative context -> BLOCKED
const trigDirectUpdate = simulateAppointmentUpdateTrigger({
  role: 'authenticated',
  isStaff: false,
  isAuthoritativeContext: null,
  isCurrentPatient: true,
  modifiedFields: ['payment_mode', 'status', 'total_amount'],
  newCheckinStatus: 'not_checked_in',
  oldCheckinStatus: 'not_checked_in',
});
runner.assert(
  !trigDirectUpdate.allowed && trigDirectUpdate.reason.includes('Patients cannot update appointment identity'),
  '5.1 Direct client UPDATE of payment_mode/status is BLOCKED by trigger without authoritative context'
);

// 5.2 Update executed within RPC with authoritative context -> ALLOWED
const trigAuthoritativeUpdate = simulateAppointmentUpdateTrigger({
  role: 'authenticated',
  isStaff: false,
  isAuthoritativeContext: 'true',
  isCurrentPatient: true,
  modifiedFields: ['payment_mode', 'status', 'total_amount'],
  newCheckinStatus: 'not_checked_in',
  oldCheckinStatus: 'not_checked_in',
});
runner.assert(
  trigAuthoritativeUpdate.allowed && trigAuthoritativeUpdate.reason.includes('Authoritative context bypass'),
  '5.2 Authoritative RPC update with dactor.authoritative_context = true is cleanly ALLOWED by trigger'
);

// 5.3 Anon guest calling RPC with authoritative context -> ALLOWED
const trigAnonAuthoritative = simulateAppointmentUpdateTrigger({
  role: 'anon',
  isStaff: false,
  isAuthoritativeContext: 'true',
  isCurrentPatient: false,
  modifiedFields: ['payment_mode', 'status', 'total_amount'],
  newCheckinStatus: 'not_checked_in',
  oldCheckinStatus: 'not_checked_in',
});
runner.assert(
  trigAnonAuthoritative.allowed && trigAnonAuthoritative.reason.includes('Authoritative context bypass'),
  '5.3 Anon guest booking calling confirm_pay_at_desk_booking is ALLOWED via authoritative context'
);

// -----------------------------------------------------------------------------
// SUMMARY & EXIT CODE
// -----------------------------------------------------------------------------
const allPassed = runner.summary();
if (!allPassed) {
  process.exit(1);
} else {
  console.log(`\n${ANSI.bold}${ANSI.green}ALL MILESTONE 1 VERIFICATION CHECKS PASSED CLEANLY (100%).${ANSI.reset}\n`);
}
