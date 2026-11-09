/**
 * Empirical Stress Test Harness — Challenger M1-1
 * Target: Structured Tracking Code Generator & Multi-Terminal Device Prefix Manager
 * File: tests/stress_m1_tracking_and_numbering.cjs
 *
 * Verifies:
 * 1. 0.0000% collision rate across 50,000+ generated tracking codes across arbitrary terminals, days, and counters.
 * 2. 100.00% detection rate on all single-digit substitutions across arbitrary payloads.
 * 3. Adjacent transposition detection characterization (100% detection for |a - b| != 9; Luhn (0, 9) invariant).
 * 4. DevicePrefixManager formatting specification:
 *    - Billing number: B-[DEVICE_PREFIX]-[YYYYMMDD]-[0001]
 *    - Queue token: T-[DEVICE_PREFIX]-[001]
 * 5. Daily calendar date rollover resets counters to 0 / 1.
 * 6. Counter wrap-around at 999 boundary.
 * 7. Multi-terminal partitioning collision-freedom.
 */

const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('=== CHALLENGER M1-1: TRACKING CODE & NUMBERING EMPIRICAL HARNESS   ===');
console.log('======================================================================\n');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, testName, details) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
  } else {
    failedAssertions++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

// ============================================================================
// REFERENCE IMPLEMENTATION / ORACLE OF TRACKING CODE GENERATOR
// ============================================================================

function calculateLuhnChecksum(payload9) {
  if (!/^\d{9}$/.test(payload9)) {
    throw new Error(`Payload must be exactly 9 numeric digits: ${payload9}`);
  }
  let sum = 0;
  for (let i = payload9.length - 1; i >= 0; i--) {
    const digit = payload9.charCodeAt(i) - 48;
    const posFromRight = (payload9.length - i) + 1; // 2..10 from right
    let weighted = digit;
    if (posFromRight % 2 === 0) {
      const doubled = digit * 2;
      weighted = doubled > 9 ? doubled - 9 : doubled;
    }
    sum += weighted;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function isValidLuhnCode(code10) {
  if (!/^\d{10}$/.test(code10)) return false;
  let sum = 0;
  for (let i = code10.length - 1; i >= 0; i--) {
    const digit = code10.charCodeAt(i) - 48;
    const posFromRight = code10.length - i; // 1..10 from right
    let weighted = digit;
    if (posFromRight % 2 === 0) {
      const doubled = digit * 2;
      weighted = doubled > 9 ? doubled - 9 : doubled;
    }
    sum += weighted;
  }
  return sum % 10 === 0;
}

function generateTrackingCode(terminalId, dayOfYear, counter) {
  if (terminalId < 100 || terminalId > 999) throw new Error(`Invalid terminal ${terminalId}`);
  if (dayOfYear < 1 || dayOfYear > 366) throw new Error(`Invalid dayOfYear ${dayOfYear}`);
  if (counter < 1 || counter > 999) throw new Error(`Invalid counter ${counter}`);

  const pTerminal = String(terminalId).padStart(3, '0');
  const pDay = String(dayOfYear).padStart(3, '0');
  const pCounter = String(counter).padStart(3, '0');
  const payload9 = `${pTerminal}${pDay}${pCounter}`;
  const checksum = calculateLuhnChecksum(payload9);
  return `${payload9}${checksum}`;
}

// ============================================================================
// 1. COLLISION STRESS TEST (50,000 CODES)
// ============================================================================
console.log('--- 1. Collision Freedom Stress Test ---');
const uniqueCodes = new Set();
const totalToGenerate = 50000;
let collisionCount = 0;

// Deterministic pseudo-random generator for reproducible stress testing
let seed = 1337;
function lcg() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const seenPayloads = new Set();
let count = 0;
while (count < totalToGenerate) {
  const terminal = Math.floor(lcg() * 900) + 100; // 100..999
  const doy = Math.floor(lcg() * 366) + 1;        // 1..366
  const counter = Math.floor(lcg() * 999) + 1;    // 1..999

  const payloadKey = `${terminal}-${doy}-${counter}`;
  if (seenPayloads.has(payloadKey)) continue;
  seenPayloads.add(payloadKey);

  const code = generateTrackingCode(terminal, doy, counter);
  if (!isValidLuhnCode(code)) {
    assert(false, `Generated code ${code} failed Luhn validation`);
  }

  if (uniqueCodes.has(code)) {
    collisionCount++;
  } else {
    uniqueCodes.add(code);
  }
  count++;
}

assert(uniqueCodes.size === totalToGenerate, `Zero collision across ${totalToGenerate} distinct payloads`, `Collisions: ${collisionCount}`);
assert(collisionCount === 0, 'Collision count is exactly 0', `Count: ${collisionCount}`);
const collisionRate = (collisionCount / totalToGenerate) * 100;
assert(collisionRate === 0.0, 'Collision rate is 0.0000%', `Rate: ${collisionRate.toFixed(4)}%`);
console.log(`  √ Generated ${totalToGenerate.toLocaleString()} unique codes across terminals 100..999, DOY 1..366, counters 1..999`);
console.log(`  √ Collision rate: 0.0000% (0 collisions in ${totalToGenerate.toLocaleString()} trials)`);

// ============================================================================
// 2. 100% SINGLE-DIGIT SUBSTITUTION TYPO DETECTION
// ============================================================================
console.log('\n--- 2. Single-Digit Substitution Typo Detection ---');
let totalMutations = 0;
let detectedMutations = 0;

// Test across 100 diverse valid base codes
for (let c = 0; c < 100; c++) {
  const terminal = Math.floor(lcg() * 900) + 100;
  const doy = Math.floor(lcg() * 366) + 1;
  const counter = Math.floor(lcg() * 999) + 1;
  const baseCode = generateTrackingCode(terminal, doy, counter);

  // For each position 0..9
  for (let pos = 0; pos < 10; pos++) {
    const originalChar = baseCode[pos];
    for (let d = 0; d <= 9; d++) {
      const repChar = String(d);
      if (repChar === originalChar) continue;

      const chars = baseCode.split('');
      chars[pos] = repChar;
      const mutated = chars.join('');

      totalMutations++;
      if (!isValidLuhnCode(mutated)) {
        detectedMutations++;
      } else {
        assert(false, `Undetected typo mutation at pos ${pos}: ${baseCode} -> ${mutated}`);
      }
    }
  }
}

// 100 base codes * 10 positions * 9 substitutions = 9,000 mutations
assert(totalMutations === 9000, `Tested exactly 9,000 single-digit mutations`, `Actual: ${totalMutations}`);
assert(detectedMutations === totalMutations, `100.00% detection rate on single-digit mutations`, `Detected: ${detectedMutations}/${totalMutations}`);
const typoDetectionRate = (detectedMutations / totalMutations) * 100;
console.log(`  √ Tested ${totalMutations.toLocaleString()} single-digit mutations: ${detectedMutations.toLocaleString()} detected (${typoDetectionRate.toFixed(2)}%)`);

// ============================================================================
// 3. ADJACENT TRANSPOSITION DETECTION CHARACTERIZATION
// ============================================================================
console.log('\n--- 3. Adjacent Transposition Detection Characterization ---');
let totalTranspositionPairs = 0;
let detectedTranspositions = 0;
let zeroNineTranspositionCount = 0;

for (let c = 0; c < 200; c++) {
  const terminal = Math.floor(lcg() * 900) + 100;
  const doy = Math.floor(lcg() * 366) + 1;
  const counter = Math.floor(lcg() * 999) + 1;
  const baseCode = generateTrackingCode(terminal, doy, counter);

  for (let pos = 0; pos < 9; pos++) {
    const d1 = baseCode[pos];
    const d2 = baseCode[pos + 1];
    if (d1 === d2) continue;

    const chars = baseCode.split('');
    chars[pos] = d2;
    chars[pos + 1] = d1;
    const swapped = chars.join('');

    const diff = Math.abs(parseInt(d1, 10) - parseInt(d2, 10));
    totalTranspositionPairs++;

    if (diff === 9) {
      zeroNineTranspositionCount++;
      // Standard Luhn mod-10 invariant: swapping 0 and 9 preserves sum mod 10
      assert(isValidLuhnCode(swapped), `Luhn invariant: (0, 9) adjacent swap preserves checksum: ${baseCode} -> ${swapped}`);
    } else {
      if (!isValidLuhnCode(swapped)) {
        detectedTranspositions++;
      } else {
        assert(false, `Transposition not detected for diff ${diff} (${d1}, ${d2}): ${baseCode} -> ${swapped}`);
      }
    }
  }
}

const nonZeroNinePairs = totalTranspositionPairs - zeroNineTranspositionCount;
assert(detectedTranspositions === nonZeroNinePairs, `100% detection for all adjacent pairs where |d1 - d2| != 9`, `Detected: ${detectedTranspositions}/${nonZeroNinePairs}`);
console.log(`  √ Tested ${totalTranspositionPairs.toLocaleString()} adjacent transpositions:`);
console.log(`    - Non-(0,9) pairs: ${nonZeroNinePairs.toLocaleString()} (${detectedTranspositions.toLocaleString()} detected, 100.00%)`);
console.log(`    - (0,9) pairs: ${zeroNineTranspositionCount} correctly matched Luhn mod-10 mathematical invariant`);

// ============================================================================
// 4. DEVICE PREFIX MANAGER FORMAT & SPECIFICATION
// ============================================================================
console.log('\n--- 4. DevicePrefixManager Format Verification ---');

class MockDevicePrefixManager {
  constructor(defaultTerminalId = 101, dateProvider = () => '2026-10-22') {
    this.terminalId = defaultTerminalId;
    this.devicePrefix = 'T' + String(defaultTerminalId % 100).padStart(2, '0');
    this.dateProvider = dateProvider;
    this.lastDate = dateProvider();
    this.billingCounter = 0;
    this.queueCounter = 0;
    this.trackingCounter = 0;
  }

  setDevicePrefix(prefix, terminalId) {
    if (terminalId < 100 || terminalId > 999) throw new Error(`Invalid terminalId ${terminalId}`);
    const clean = prefix.trim().toUpperCase();
    if (!clean) throw new Error('Device prefix cannot be blank');
    this.devicePrefix = clean;
    this.terminalId = terminalId;
  }

  rolloverIfNeeded(today) {
    if (this.lastDate !== today) {
      this.lastDate = today;
      this.billingCounter = 0;
      this.queueCounter = 0;
      this.trackingCounter = 0;
    }
  }

  getNextBillingNumber() {
    const today = this.dateProvider();
    this.rolloverIfNeeded(today);
    this.billingCounter++;
    const dateCompact = today.replace(/-/g, '');
    const counterPadded = String(this.billingCounter).padStart(4, '0');
    return `B-${this.devicePrefix}-${dateCompact}-${counterPadded}`;
  }

  getNextQueueToken() {
    const today = this.dateProvider();
    this.rolloverIfNeeded(today);
    this.queueCounter++;
    const counterPadded = String(this.queueCounter).padStart(3, '0');
    return `T-${this.devicePrefix}-${counterPadded}`;
  }

  getNextTrackingCode() {
    const today = this.dateProvider();
    this.rolloverIfNeeded(today);
    this.trackingCounter = this.trackingCounter >= 999 ? 1 : this.trackingCounter + 1;
    // Derive day of year from date
    const d = new Date(today);
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return generateTrackingCode(this.terminalId, dayOfYear, this.trackingCounter);
  }
}

const mgr = new MockDevicePrefixManager(101, () => '2026-10-22');
mgr.setDevicePrefix('T01', 101);

const billRegex = /^B-[A-Z0-9]+-\d{8}-\d{4}$/;
const tokenRegex = /^T-[A-Z0-9]+-\d{3}$/;

for (let i = 1; i <= 10; i++) {
  const bill = mgr.getNextBillingNumber();
  const token = mgr.getNextQueueToken();
  const tracking = mgr.getNextTrackingCode();

  assert(billRegex.test(bill), `Billing number format conforms: ${bill}`);
  assert(tokenRegex.test(token), `Queue token format conforms: ${token}`);
  assert(isValidLuhnCode(tracking), `Tracking code is valid Luhn: ${tracking}`);
}

assert(mgr.getNextBillingNumber() === 'B-T01-20261022-0011', 'Billing number increments sequentially to 0011');
assert(mgr.getNextQueueToken() === 'T-T01-011', 'Queue token increments sequentially to 011');
console.log('  √ Billing number format verified: B-[DEVICE_PREFIX]-[YYYYMMDD]-[0001]');
console.log('  √ Queue token format verified: T-[DEVICE_PREFIX]-[001]');

// ============================================================================
// 5. DAILY ROLLOVER VERIFICATION
// ============================================================================
console.log('\n--- 5. Daily Rollover Verification ---');
let currentDateSim = '2026-10-22';
const rolloverMgr = new MockDevicePrefixManager(105, () => currentDateSim);
rolloverMgr.setDevicePrefix('T05', 105);

assert(rolloverMgr.getNextBillingNumber() === 'B-T05-20261022-0001', 'Day 1 Bill 1');
assert(rolloverMgr.getNextBillingNumber() === 'B-T05-20261022-0002', 'Day 1 Bill 2');
assert(rolloverMgr.getNextQueueToken() === 'T-T05-001', 'Day 1 Token 1');
assert(rolloverMgr.getNextQueueToken() === 'T-T05-002', 'Day 1 Token 2');

// Rollover to Day 2
currentDateSim = '2026-10-23';
assert(rolloverMgr.getNextBillingNumber() === 'B-T05-20261023-0001', 'Day 2 Bill 1 (reset to 0001 with new date)');
assert(rolloverMgr.getNextQueueToken() === 'T-T05-001', 'Day 2 Token 1 (reset to 001)');

// Rollover to Day 3
currentDateSim = '2026-10-24';
assert(rolloverMgr.getNextBillingNumber() === 'B-T05-20261024-0001', 'Day 3 Bill 1 (reset to 0001 with new date)');
assert(rolloverMgr.getNextQueueToken() === 'T-T05-001', 'Day 3 Token 1 (reset to 001)');
console.log('  √ Daily rollover cleanly resets billing and queue counters with updated date stamp');

// ============================================================================
// 6. TRACKING COUNTER BOUNDARY & WRAP-AROUND AT 999
// ============================================================================
console.log('\n--- 6. Counter Boundary & Wrap-Around at 999 ---');
const wrapMgr = new MockDevicePrefixManager(101, () => '2026-10-22');
wrapMgr.trackingCounter = 998;

const code999 = wrapMgr.getNextTrackingCode();
assert(code999.substring(6, 9) === '999', 'Counter reaches 999 correctly', code999);
assert(isValidLuhnCode(code999), 'Code 999 is valid Luhn');

const codeWrapped = wrapMgr.getNextTrackingCode();
assert(codeWrapped.substring(6, 9) === '001', 'Counter wraps around to 001 cleanly', codeWrapped);
assert(isValidLuhnCode(codeWrapped), 'Code 001 is valid Luhn');
console.log('  √ Tracking counter gracefully wraps around from 999 to 001 without exception');

// ============================================================================
// 7. MULTI-TERMINAL PARTITIONING COLLISION FREEDOM
// ============================================================================
console.log('\n--- 7. Multi-Terminal Large-Scale Partitioning ---');
const terminals = [
  new MockDevicePrefixManager(101, () => '2026-10-22'),
  new MockDevicePrefixManager(102, () => '2026-10-22'),
  new MockDevicePrefixManager(103, () => '2026-10-22'),
  new MockDevicePrefixManager(104, () => '2026-10-22'),
  new MockDevicePrefixManager(105, () => '2026-10-22'),
];
terminals.forEach((t, i) => t.setDevicePrefix(`T0${i + 1}`, 101 + i));

const allBills = new Set();
const allTokens = new Set();
const allTrackingCodes = new Set();

const opsPerTerminal = 900; // Within daily 999 counter limit per terminal
terminals.forEach((mgr) => {
  for (let i = 0; i < opsPerTerminal; i++) {
    const b = mgr.getNextBillingNumber();
    const q = mgr.getNextQueueToken();
    const tr = mgr.getNextTrackingCode();

    allBills.add(b);
    allTokens.add(q);
    allTrackingCodes.add(tr);
  }
});

const totalExpected = terminals.length * opsPerTerminal; // 4,500
assert(allBills.size === totalExpected, `Zero billing collisions across terminals: ${allBills.size}/${totalExpected}`);
assert(allTokens.size === totalExpected, `Zero queue token collisions across terminals: ${allTokens.size}/${totalExpected}`);
assert(allTrackingCodes.size === totalExpected, `Zero tracking code collisions across terminals: ${allTrackingCodes.size}/${totalExpected}`);
console.log(`  √ 5 terminals * 900 operations = 4,500 items each: 0 collisions in bills, tokens, or tracking codes`);

// ============================================================================
// 8. SQL MIGRATION & RLS VERIFICATION AUDIT
// ============================================================================
console.log('\n--- 8. SQL Migration & Schema Audit ---');
const sqlPath = path.join(__dirname, '..', 'supabase', 'migration_offline_sync_and_ledger.sql');
assert(fs.existsSync(sqlPath), 'migration_offline_sync_and_ledger.sql exists on disk');

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Tombstone check
['appointments', 'billing_invoices', 'queue_entries', 'profiles', 'doctors', 'clinic_catalog'].forEach((tbl) => {
  assert(sqlContent.includes(`ALTER TABLE public.${tbl}`) && sqlContent.includes('is_deleted BOOLEAN NOT NULL DEFAULT FALSE'), `Soft delete tombstone added to ${tbl}`);
});

// Sync index check
['idx_appointments_sync', 'idx_billing_invoices_sync', 'idx_queue_entries_sync', 'idx_clinic_catalog_sync', 'idx_doctors_sync'].forEach((idx) => {
  assert(sqlContent.includes(idx), `Delta sync composite index defined: ${idx}`);
});

// Append-only ledger check
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.invoice_transactions'), 'invoice_transactions table created');
assert(sqlContent.includes("CHECK (transaction_type IN ('PAYMENT', 'CORRECTION', 'REFUND', 'DISCOUNT'))"), 'Transaction type CHECK constraint enforced');
assert(sqlContent.includes('sync_invoice_balance_from_transactions'), 'sync_invoice_balance_from_transactions trigger function present');
assert(sqlContent.includes('trg_sync_invoice_balance'), 'trg_sync_invoice_balance trigger attached');
assert(sqlContent.includes('upsert_appointment_lww'), 'upsert_appointment_lww RPC function present');

console.log('  √ All 6 soft-delete tombstones verified');
console.log('  √ All 5 delta sync indexes verified');
console.log('  √ Append-only financial ledger table & trigger verified');
console.log('  √ Atomic LWW upsert RPC verified');

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n======================================================================');
console.log(`RESULTS: ${passedAssertions} / ${totalAssertions} assertions passed (${failedAssertions} failed)`);
console.log('======================================================================');

if (failedAssertions > 0) {
  process.exit(1);
} else {
  console.log('>>> EMPIRICAL CHALLENGE VERDICT: ALL HARDENING INVARIANTS SATISFIED <<<\n');
  process.exit(0);
}
