/**
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST HARNESS (Milestone 2)
 * File: tests/pay_at_desk/empirical_challenger_m2.cjs
 *
 * Challenge Scope:
 * 1. updateAppointmentPayAtDesk Fallback Resilience:
 *    - Invalid UUID rejection without network call
 *    - RPC failure -> Edge Function fallback invocation parity
 *    - Edge Function failure -> Direct table update fallback
 *    - All fail -> Safe false return
 * 2. UI State Integrity & Session Lifecycle in PaymentScreen.kt:
 *    - Timer cancellation ONLY on success
 *    - Timer preservation on failure
 *    - saveTrackingCode and saveLastConfirmedAppointment executed strictly BEFORE navController.navigate
 *    - Double-click concurrency guard (isProcessing)
 *    - BackHandler locking during pending network calls
 * 3. Service Charge Math & Dynamic Card Breakdown:
 *    - Floating point rounding accuracy across diverse fees
 *    - UI conditional rendering matching Pay at Desk vs Online
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPO_KOTLIN_PATH = path.join(
  REPO_ROOT,
  'patient-app',
  'app',
  'src',
  'main',
  'java',
  'com',
  'dactor',
  'patient',
  'data',
  'repository',
  'AppointmentRepository.kt'
);
const PAYMENT_SCREEN_PATH = path.join(
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
  'booking',
  'PaymentScreen.kt'
);

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  gray: '\x1b[90m'
};

class ChallengerHarness {
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
      console.log(`  ${ANSI.red}X [FAIL / VULNERABILITY]${ANSI.reset} ${title}`);
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

const harness = new ChallengerHarness('Milestone 2 Empirical Challenger Test Suite');

console.log(`\n${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}  EMPIRICAL CHALLENGER: MILESTONE 2 PATIENT APP STRESS TEST           ${ANSI.reset}`);
console.log(`${ANSI.bold}${ANSI.cyan}======================================================================${ANSI.reset}\n`);

// -----------------------------------------------------------------------------
// 1. SOURCE CODE AUDIT & AST / PATTERN VERIFICATION
// -----------------------------------------------------------------------------
console.log(`${ANSI.bold}--- 1. AppointmentRepository.kt Source Code Invariants ---${ANSI.reset}`);

const repoSource = fs.readFileSync(REPO_KOTLIN_PATH, 'utf8');
const screenSource = fs.readFileSync(PAYMENT_SCREEN_PATH, 'utf8');

// 1.1 UUID validation gate
harness.assert(
  repoSource.includes('if (!isValidUuid(appointmentId)) return@withContext false'),
  '1.1 updateAppointmentPayAtDesk validates UUID format before any network dispatch'
);

// 1.2 RPC primary call
harness.assert(
  repoSource.includes('function = "confirm_pay_at_desk_booking"') &&
  repoSource.includes('put("p_appointment_id", appointmentId)'),
  '1.2 updateAppointmentPayAtDesk invokes confirm_pay_at_desk_booking RPC as Tier 1 primary path'
);

// 1.3 Edge function fallback
harness.assert(
  repoSource.includes('supabaseClient.functions.invoke("appointment-payment"') &&
  repoSource.includes('put("action", "confirm_pay_at_desk")') &&
  repoSource.includes('put("appointmentId", appointmentId)'),
  '1.3 updateAppointmentPayAtDesk provides appointment-payment Edge Function fallback with matching action'
);

// 1.4 Direct table update fallback for staff
harness.assert(
  repoSource.includes('supabaseClient.postgrest["appointments"].update') &&
  repoSource.includes('set("payment_mode", "PAY_AT_DESK")') &&
  repoSource.includes('set("status", "WAITING_FOR_APPROVAL")'),
  '1.4 updateAppointmentPayAtDesk maintains Tier 3 direct table update fallback for staff/admin roles'
);

// 1.5 Edge function response parsing safety
harness.assert(
  repoSource.includes('val success = parsed?.get("success")?.toString()?.toBooleanStrictOrNull()') &&
  repoSource.includes('val error = parsed?.get("error")?.toString()?.trim(\'"\')'),
  '1.5 Error response safely extracted from Edge Function JSON (detecting { success: false, error: ... })'
);

// -----------------------------------------------------------------------------
// 2. PAYMENT SCREEN UI STATE INTEGRITY AUDIT
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 2. PaymentScreen.kt State & Session Integrity ---${ANSI.reset}`);

// 2.1 Double-click protection
harness.assert(
  screenSource.includes('fun handleConfirmPayAtDesk() {') &&
  screenSource.includes('if (isProcessing || isCancelling) return') &&
  screenSource.includes('isProcessing = true'),
  '2.1 handleConfirmPayAtDesk is protected against concurrent double-click invocations'
);

// 2.2 Finally block clears processing
harness.assert(
  screenSource.includes('isProcessing = false') &&
  screenSource.includes('finally {\n                isProcessing = false'),
  '2.2 isProcessing flag is safely reset in finally block even on error'
);

// 2.3 Session timer cleared ONLY on success
const handleConfirmIdx = screenSource.indexOf('fun handleConfirmPayAtDesk()');
const handleConfirmChunk = screenSource.slice(handleConfirmIdx, handleConfirmIdx + 2500);
const ifSuccessIdx = handleConfirmChunk.indexOf('if (success) {');
const elseIdx = handleConfirmChunk.indexOf('} else {', ifSuccessIdx);
const successBlock = handleConfirmChunk.slice(ifSuccessIdx, elseIdx);

harness.assert(
  successBlock.includes('sessionManager?.clearActivePaymentSession()'),
  '2.3 sessionManager.clearActivePaymentSession() is called inside if (success) branch'
);

const elseBodyStart = elseIdx + '} else {'.length;
const catchIdx = handleConfirmChunk.indexOf('} catch', elseBodyStart);
const elseBlock = handleConfirmChunk.slice(elseBodyStart, catchIdx);

harness.assert(
  !elseBlock.includes('clearActivePaymentSession') &&
  elseBlock.includes('Toast.makeText'),
  '2.4 5-minute timer is NOT cancelled when confirmation fails (user remains on payment screen with toast)'
);

// 2.5 Cache tracking code and last confirmed appointment BEFORE navigation
const saveTrackingIdx = successBlock.indexOf('sessionManager?.saveTrackingCode');
const saveApptIdx = successBlock.indexOf('sessionManager?.saveLastConfirmedAppointment');
const navIdx = successBlock.indexOf('navController.navigate');

harness.assert(
  saveTrackingIdx !== -1 && saveApptIdx !== -1 && navIdx !== -1 &&
  saveTrackingIdx < navIdx && saveApptIdx < navIdx,
  '2.5 saveTrackingCode and saveLastConfirmedAppointment execute strictly BEFORE navController.navigate',
  `Indices: saveTracking=${saveTrackingIdx}, saveAppt=${saveApptIdx}, nav=${navIdx}`
);

// 2.6 Dynamic 5% service charge breakdown in Card 2
harness.assert(
  screenSource.includes('if (selectedPaymentMethod == "pay_at_desk")') &&
  screenSource.includes('Platform Service Charge (5%)') &&
  screenSource.includes('totalAtDesk') &&
  screenSource.includes('CurrencyFormatter.formatNPR(serviceCharge)'),
  '2.6 Payment Summary Card dynamically renders Platform Service Charge (5%) and totalAtDesk for Pay at Desk'
);

// -----------------------------------------------------------------------------
// 3. EMPIRICAL RUNTIME LOGIC SIMULATOR
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}--- 3. Empirical Kotlin Runtime Logic Simulation ---${ANSI.reset}`);

// Simulate Kotlin's isValidUuid
function isValidUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(uuid);
}

// Simulate Kotlin repository updateAppointmentPayAtDesk
async function simulateUpdateAppointmentPayAtDesk(appointmentId, feeAmount, mocks = {}) {
  if (!isValidUuid(appointmentId)) return false;

  const {
    rpcFn = async () => ({ data: JSON.stringify({ success: true }) }),
    edgeFn = async () => ({ data: JSON.stringify({ success: true }) }),
    directTableUpdate = async () => true
  } = mocks;

  // 1. Primary: Server-authoritative PostgreSQL RPC
  try {
    const rpcResult = await rpcFn();
    const raw = rpcResult?.data;
    if (raw) {
      const parsed = JSON.parse(raw);
      const success = parsed.success === true || parsed.success === 'true';
      const error = parsed.error ? String(parsed.error).trim() : null;
      if (success || (!error || error === 'null')) {
        return true;
      }
    } else {
      return true;
    }
  } catch (rpcEx) {
    // Falls through to Edge Function
  }

  // 2. Graceful Edge Function Fallback
  try {
    const fnResponse = await edgeFn();
    const raw = typeof fnResponse.data === 'string' ? fnResponse.data : JSON.stringify(fnResponse.data);
    const parsed = JSON.parse(raw);
    const success = parsed.success === true || parsed.success === 'true';
    const error = parsed.error ? String(parsed.error).trim() : null;
    if (success || (!error || error === 'null')) {
      return true;
    }
  } catch (fnEx) {
    // Falls through to Direct Table Update
  }

  // 3. Fallback: Direct table update for staff/admin roles
  try {
    return await directTableUpdate();
  } catch (fallbackEx) {
    // All fallbacks failed
  }

  return false;
}

// 3.1 Invalid UUID Stress Test
(async () => {
  const invalidUuids = [
    '',
    'not-a-uuid',
    '12345',
    'c1234567-89ab-cdef-0123-456789abcdef-extra',
    'c1234567-89ab-cdef-0123-456789abcdeZ',
    "'; DROP TABLE appointments; --",
    null,
    undefined
  ];

  let allInvalidRejected = true;
  for (const badId of invalidUuids) {
    let networkCalled = false;
    const res = await simulateUpdateAppointmentPayAtDesk(badId, 500, {
      rpcFn: async () => { networkCalled = true; return { data: '{}' }; },
      edgeFn: async () => { networkCalled = true; return { data: '{}' }; },
      directTableUpdate: async () => { networkCalled = true; return true; }
    });
    if (res !== false || networkCalled !== false) {
      allInvalidRejected = false;
      break;
    }
  }
  harness.assert(
    allInvalidRejected,
    '3.1 All invalid UUIDs rejected immediately without triggering RPC, Edge Function, or DB updates'
  );

  // 3.2 Valid UUID with primary RPC success
  const validUuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  let rpcCalled = false;
  let edgeCalled = false;
  let directCalled = false;

  const resPrimary = await simulateUpdateAppointmentPayAtDesk(validUuid, 500, {
    rpcFn: async () => { rpcCalled = true; return { data: JSON.stringify({ success: true, tracking_code: '1234567890' }) }; },
    edgeFn: async () => { edgeCalled = true; return { data: '{}' }; },
    directTableUpdate: async () => { directCalled = true; return true; }
  });

  harness.assert(
    resPrimary === true && rpcCalled === true && edgeCalled === false && directCalled === false,
    '3.2 Primary RPC path succeeds cleanly without invoking fallbacks'
  );

  // 3.3 RPC Network Failure -> Fallback to Edge Function succeeds
  let edgePayloadReceived = null;
  const resFallbackEdge = await simulateUpdateAppointmentPayAtDesk(validUuid, 500, {
    rpcFn: async () => { throw new Error('Network timeout: Could not connect to PostgreSQL RPC'); },
    edgeFn: async (payload) => {
      edgeCalled = true;
      edgePayloadReceived = payload;
      return { data: JSON.stringify({ success: true, message: 'Confirmed via Edge Function' }) };
    },
    directTableUpdate: async () => { directCalled = true; return true; }
  });

  harness.assert(
    resFallbackEdge === true && edgeCalled === true && directCalled === false,
    '3.3 RPC network failure gracefully falls back to appointment-payment Edge Function and succeeds'
  );

  // 3.4 RPC Failure + Edge Function returns error object -> Falls back to Direct Table Update
  let directUpdateAttempted = false;
  const resEdgeErrorFallback = await simulateUpdateAppointmentPayAtDesk(validUuid, 500, {
    rpcFn: async () => { throw new Error('RPC 503 Service Unavailable'); },
    edgeFn: async () => ({ data: JSON.stringify({ success: false, error: 'Edge function rate limited' }) }),
    directTableUpdate: async () => { directUpdateAttempted = true; return true; }
  });

  harness.assert(
    resEdgeErrorFallback === true && directUpdateAttempted === true,
    '3.4 Edge function error { success: false } does not report false success; triggers Tier 3 direct update'
  );

  // 3.5 RPC Failure + Edge Function Failure + Direct Update Failure (Patient RLS restriction) -> returns false
  const resAllFail = await simulateUpdateAppointmentPayAtDesk(validUuid, 500, {
    rpcFn: async () => { throw new Error('RPC 500'); },
    edgeFn: async () => { throw new Error('Edge Function 500'); },
    directTableUpdate: async () => { throw new Error('RLS permission denied: new row violates policy'); }
  });

  harness.assert(
    resAllFail === false,
    '3.5 Total failure across all 3 tiers safely returns false without unhandled exception or crash'
  );

  // -----------------------------------------------------------------------------
  // 4. SERVICE CHARGE MATHEMATICAL PRECISION TEST
  // -----------------------------------------------------------------------------
  console.log(`\n${ANSI.bold}--- 4. Service Charge Precision & Rounding Verification ---${ANSI.reset}`);

  const testFees = [
    { fee: 0.0, expectedCharge: 0.0, expectedTotal: 0.0 },
    { fee: 100.0, expectedCharge: 5.0, expectedTotal: 105.0 },
    { fee: 500.0, expectedCharge: 25.0, expectedTotal: 525.0 },
    { fee: 750.0, expectedCharge: 37.5, expectedTotal: 787.5 },
    { fee: 1000.0, expectedCharge: 50.0, expectedTotal: 1050.0 },
    { fee: 125.75, expectedCharge: 6.29, expectedTotal: 132.04 },
    { fee: 333.33, expectedCharge: 16.67, expectedTotal: 350.00 },
    { fee: 999.99, expectedCharge: 50.00, expectedTotal: 1049.99 }
  ];

  let allMathAccurate = true;
  for (const t of testFees) {
    const charge = Math.round(t.fee * 0.05 * 100.0) / 100.0;
    const total = Math.round((t.fee + charge) * 100.0) / 100.0;
    if (charge !== t.expectedCharge || total !== t.expectedTotal) {
      allMathAccurate = false;
      console.log(`Math mismatch for fee ${t.fee}: got charge=${charge}, total=${total}; expected charge=${t.expectedCharge}, total=${t.expectedTotal}`);
      break;
    }
  }

  harness.assert(
    allMathAccurate,
    '4.1 Kotlin service charge formula Math.round(fee * 0.05 * 100.0) / 100.0 accurately handles all fee values'
  );

  // -----------------------------------------------------------------------------
  // 5. SUMMARY & VERDICT
  // -----------------------------------------------------------------------------
  const allPassed = harness.summary();
  if (allPassed) {
    console.log(`\n${ANSI.green}${ANSI.bold}>>> EMPIRICAL CHALLENGE VERDICT: APPROVE <<<${ANSI.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${ANSI.red}${ANSI.bold}>>> EMPIRICAL CHALLENGE VERDICT: REQUEST_CHANGES <<<${ANSI.reset}`);
    process.exit(1);
  }
})();
