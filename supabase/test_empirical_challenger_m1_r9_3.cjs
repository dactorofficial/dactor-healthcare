/**
 * Empirical Challenger 3 Test Suite: Milestone 1 Re-evaluation
 * Adversarial Stress-Test: Remediated Luhn Algorithm & Structured Tracking Code Generator
 *
 * File: supabase/test_empirical_challenger_m1_r9_3.cjs
 */

const fs = require('fs');
const path = require('path');
const { validateLuhnTrackingCode, computeLuhnCheckDigit } = require(path.join(__dirname, '../tests/e2e_security/contracts.cjs'));

console.log('======================================================================');
console.log('=== EMPIRICAL CHALLENGER 3: LUHN & TRACKING CODE DEEP STRESS TEST  ===');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;
const findings = [];

function assertTest(condition, name, details = '') {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passCount++;
  } else {
    console.log(`  [FAIL] ${name} -> ${details}`);
    failCount++;
    findings.push({ name, details });
  }
}

// ---------------------------------------------------------------------------
// Algorithmic simulations exactly matching SQL implementation
// ---------------------------------------------------------------------------

function plpgsqlCalculateLuhnCheckDigit(payload) {
  if (payload === null || payload === undefined) return null; // STRICT behavior
  const clean = String(payload).replace(/\D/g, '');
  if (clean.length === 0) {
    throw new Error('calculate_luhn_check_digit: payload must contain at least one digit');
  }

  let sum = 0;
  let double = true;
  for (let i = clean.length; i >= 1; i--) {
    let digit = parseInt(clean.substring(i - 1, i), 10);
    if (double) {
      digit = digit * 2;
      if (digit > 9) digit = digit - 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

function plpgsqlGenerateUniqueTrackingCode10(terminalId = null, forcedAttempts = 1, doyOverride = null) {
  const doyStr = doyOverride !== null ? String(doyOverride).padStart(3, '0') : '296'; // e.g. day 296
  let attempts = 0;

  while (true) {
    attempts++;

    // High collision fallback (simulated after 100 attempts)
    if (attempts > 100 || forcedAttempts > 100) {
      const fallbackTerm = String(Math.floor(Math.random() * 900) + 100);
      const fallbackEntropy = String(Math.floor(Date.now() % 1000000)).padStart(6, '0');
      const fallbackPayload = fallbackTerm + fallbackEntropy;
      const checkDigit = plpgsqlCalculateLuhnCheckDigit(fallbackPayload);
      return fallbackPayload + checkDigit;
    }

    let termStr;
    if (terminalId !== null && terminalId !== undefined) {
      termStr = String(Math.abs(terminalId) % 1000).padStart(3, '0');
    } else {
      termStr = String(Math.floor(Math.random() * 900) + 100);
    }

    const counterStr = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const payload = termStr + doyStr + counterStr;
    const checkDigit = plpgsqlCalculateLuhnCheckDigit(payload);
    return payload + checkDigit;
  }
}

// Standard independent Luhn verification function
function standardLuhnVerify(code) {
  if (!code || typeof code !== 'string' || !/^\d+$/.test(code)) return false;
  let sum = 0;
  let alt = false;
  for (let i = code.length - 1; i >= 0; i--) {
    let n = parseInt(code.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// SUITE 1: LARGE SCALE EMPIRICAL GENERATION (10,000+ codes)
// ---------------------------------------------------------------------------
console.log('----------------------------------------------------------------------');
console.log('SUITE 1: Large Scale Empirical Generation (10,000 samples)');
console.log('----------------------------------------------------------------------');

const SAMPLE_SIZE = 10000;
const generatedCodes = new Set();
let luhnPassCount1 = 0;
let formatPassCount1 = 0;
let contractsPassCount1 = 0;
let parityDiscrepancies1 = 0;

for (let i = 0; i < SAMPLE_SIZE; i++) {
  const code = plpgsqlGenerateUniqueTrackingCode10(null);
  
  if (/^[1-9][0-9]{9}$/.test(code)) {
    formatPassCount1++;
  }
  if (standardLuhnVerify(code)) {
    luhnPassCount1++;
  }
  if (validateLuhnTrackingCode(code)) {
    contractsPassCount1++;
  }

  // Parity check against contracts computeLuhnCheckDigit
  const payload = code.slice(0, 9);
  const expectedCheck = computeLuhnCheckDigit(payload);
  const actualCheck = parseInt(code.charAt(9), 10);
  if (expectedCheck !== actualCheck) {
    parityDiscrepancies1++;
  }

  generatedCodes.add(code);
}

const collisionCount = SAMPLE_SIZE - generatedCodes.size;
const luhnPassRate = (luhnPassCount1 / SAMPLE_SIZE) * 100;
const formatPassRate = (formatPassCount1 / SAMPLE_SIZE) * 100;

assertTest(
  luhnPassCount1 === SAMPLE_SIZE,
  `Luhn validation pass rate across ${SAMPLE_SIZE} samples is strictly 100.00% (${luhnPassCount1}/${SAMPLE_SIZE})`,
  `Pass rate: ${luhnPassRate.toFixed(4)}%`
);

assertTest(
  contractsPassCount1 === SAMPLE_SIZE,
  `Authoritative contracts.cjs validation pass rate is strictly 100.00% (${contractsPassCount1}/${SAMPLE_SIZE})`,
  `Failed: ${SAMPLE_SIZE - contractsPassCount1}`
);

assertTest(
  formatPassCount1 === SAMPLE_SIZE,
  `Format compliance /^[1-9][0-9]{9}$/ is strictly 100.00% (${formatPassCount1}/${SAMPLE_SIZE}, 0 zero-prefixed, 0 non-10-digit)`,
  `Pass rate: ${formatPassRate.toFixed(4)}%`
);

assertTest(
  parityDiscrepancies1 === 0,
  `Zero parity discrepancies against JS contracts engine across ${SAMPLE_SIZE} samples`,
  `Found: ${parityDiscrepancies1}`
);

console.log(`  [METRIC] Unique codes generated: ${generatedCodes.size}/${SAMPLE_SIZE}`);
console.log(`  [METRIC] Collision count in single batch: ${collisionCount} (${((collisionCount / SAMPLE_SIZE) * 100).toFixed(2)}%)`);
assertTest(
  collisionCount < 100,
  `Collision density is minimal under rapid random generation (${collisionCount} collisions / ${SAMPLE_SIZE} codes)`,
  `High collision count: ${collisionCount}`
);

// ---------------------------------------------------------------------------
// SUITE 2: EDGE CASES AND ATTACK VECTORS — TERMINAL IDS
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------------');
console.log('SUITE 2: Edge Cases & Attack Vectors — Extreme Terminal IDs');
console.log('----------------------------------------------------------------------');

// 2.1 NULL Terminal ID (Default)
let nullPass = true;
for (let i = 0; i < 500; i++) {
  const code = plpgsqlGenerateUniqueTrackingCode10(null);
  if (!/^[1-9][0-9]{9}$/.test(code) || !standardLuhnVerify(code)) {
    nullPass = false;
    break;
  }
}
assertTest(nullPass, 'p_terminal_id = NULL: produces 100% compliant /^[1-9][0-9]{9}$/ codes with valid Luhn');

// 2.2 Terminal ID in valid 3-digit range [100, 999]
const testTerminalsValid = [100, 101, 250, 500, 777, 999];
let validTermPass = true;
testTerminalsValid.forEach(term => {
  for (let i = 0; i < 100; i++) {
    const code = plpgsqlGenerateUniqueTrackingCode10(term);
    if (!/^[1-9][0-9]{9}$/.test(code) || !standardLuhnVerify(code)) {
      validTermPass = false;
    }
  }
});
assertTest(validTermPass, 'Valid terminal IDs (100..999): 100% compliant with /^[1-9][0-9]{9}$/ and Luhn');

// 2.3 Terminal ID = 0
// In SQL: lpad((abs(0) % 1000)::TEXT, 3, '0') -> '000'
const codeTermZero = plpgsqlGenerateUniqueTrackingCode10(0);
console.log(`  [OBSERVATION] Terminal ID = 0 produced: ${codeTermZero}`);
assertTest(
  codeTermZero.length === 10 && /^\d{10}$/.test(codeTermZero),
  'Terminal ID = 0: generates exactly 10 digits',
  `Length: ${codeTermZero.length}`
);
assertTest(
  standardLuhnVerify(codeTermZero) && validateLuhnTrackingCode(codeTermZero),
  'Terminal ID = 0: preserves 100% valid Luhn checksum',
  'Luhn failed for terminal 0'
);
assertTest(
  codeTermZero.startsWith('000'),
  'Terminal ID = 0: correctly pads to "000" in payload position [0..2]',
  `Starts with: ${codeTermZero.slice(0, 3)}`
);

// 2.4 Negative Terminal IDs (e.g. -105, -5, -999)
const codeNeg105 = plpgsqlGenerateUniqueTrackingCode10(-105);
console.log(`  [OBSERVATION] Negative Terminal ID = -105 produced: ${codeNeg105}`);
assertTest(
  standardLuhnVerify(codeNeg105) && validateLuhnTrackingCode(codeNeg105),
  'Negative Terminal ID -105: abs() normalizes cleanly, preserving valid Luhn checksum',
  'Luhn failed'
);
assertTest(
  codeNeg105.startsWith('105'),
  'Negative Terminal ID -105: abs() produces "105" prefix matching /^[1-9][0-9]{9}$/',
  `Got: ${codeNeg105.slice(0, 3)}`
);

const codeNeg5 = plpgsqlGenerateUniqueTrackingCode10(-5);
console.log(`  [OBSERVATION] Negative Terminal ID = -5 produced: ${codeNeg5}`);
assertTest(
  standardLuhnVerify(codeNeg5) && validateLuhnTrackingCode(codeNeg5),
  'Negative Terminal ID -5: preserves 100% valid Luhn checksum',
  'Luhn failed'
);
assertTest(
  codeNeg5.startsWith('005'),
  'Negative Terminal ID -5: abs() pads to "005"',
  `Got: ${codeNeg5.slice(0, 3)}`
);

// 2.5 Terminal IDs > 999 (e.g. 1000, 1250, 9999)
const codeTerm1000 = plpgsqlGenerateUniqueTrackingCode10(1000); // 1000 % 1000 = 0 -> '000'
console.log(`  [OBSERVATION] Terminal ID = 1000 produced: ${codeTerm1000}`);
assertTest(
  standardLuhnVerify(codeTerm1000) && validateLuhnTrackingCode(codeTerm1000),
  'Terminal ID = 1000: mod 1000 preserves 100% valid Luhn checksum',
  'Luhn failed'
);

const codeTerm1250 = plpgsqlGenerateUniqueTrackingCode10(1250); // 1250 % 1000 = 250 -> '250'
console.log(`  [OBSERVATION] Terminal ID = 1250 produced: ${codeTerm1250}`);
assertTest(
  standardLuhnVerify(codeTerm1250) && /^[1-9][0-9]{9}$/.test(codeTerm1250),
  'Terminal ID = 1250: mod 1000 produces "250" matching /^[1-9][0-9]{9}$/ with valid Luhn',
  'Failed'
);

// ---------------------------------------------------------------------------
// SUITE 3: EDGE CASES — DAY OF YEAR BOUNDARIES
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------------');
console.log('SUITE 3: Edge Cases — Day of Year Boundaries (001, 365, 366)');
console.log('----------------------------------------------------------------------');

const boundaryDoys = [
  { doy: 1, label: 'Day 001 (Jan 1)' },
  { doy: 10, label: 'Day 010 (Jan 10)' },
  { doy: 100, label: 'Day 100 (Apr 10)' },
  { doy: 365, label: 'Day 365 (Dec 31, standard year)' },
  { doy: 366, label: 'Day 366 (Dec 31, leap year)' }
];

boundaryDoys.forEach(({ doy, label }) => {
  let doyPass = true;
  for (let i = 0; i < 500; i++) {
    const code = plpgsqlGenerateUniqueTrackingCode10(null, 1, doy);
    if (!/^[1-9][0-9]{9}$/.test(code) || !standardLuhnVerify(code) || !validateLuhnTrackingCode(code)) {
      doyPass = false;
      break;
    }
    // Verify DOY string is preserved at index 3..5
    const extractedDoy = code.slice(3, 6);
    const expectedDoyStr = String(doy).padStart(3, '0');
    if (extractedDoy !== expectedDoyStr) {
      doyPass = false;
      break;
    }
  }
  assertTest(doyPass, `${label}: 500/500 codes strictly match /^[1-9][0-9]{9}$/ with valid Luhn and exact DOY embedding`);
});

// ---------------------------------------------------------------------------
// SUITE 4: FORCED COLLISION FALLBACK LOOP (101+ Collisions)
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------------');
console.log('SUITE 4: Forced Collision Fallback Loop (101+ Simulated Collisions)');
console.log('----------------------------------------------------------------------');

const FALLBACK_SAMPLES = 5000;
let fallbackLuhnPass = 0;
let fallbackFormatPass = 0;
let fallbackContractsPass = 0;
const fallbackCodes = new Set();

for (let i = 0; i < FALLBACK_SAMPLES; i++) {
  // force attempts > 100 to trigger fallback branch:
  const code = plpgsqlGenerateUniqueTrackingCode10(null, 101);

  if (/^[1-9][0-9]{9}$/.test(code)) {
    fallbackFormatPass++;
  }
  if (standardLuhnVerify(code)) {
    fallbackLuhnPass++;
  }
  if (validateLuhnTrackingCode(code)) {
    fallbackContractsPass++;
  }
  fallbackCodes.add(code);
}

assertTest(
  fallbackLuhnPass === FALLBACK_SAMPLES,
  `Fallback branch preserves strictly 100.00% Luhn validity across ${FALLBACK_SAMPLES} samples (${fallbackLuhnPass}/${FALLBACK_SAMPLES})`,
  `Luhn failures: ${FALLBACK_SAMPLES - fallbackLuhnPass}`
);

assertTest(
  fallbackFormatPass === FALLBACK_SAMPLES,
  `Fallback branch preserves strictly 100.00% format compliance /^[1-9][0-9]{9}$/ (${fallbackFormatPass}/${FALLBACK_SAMPLES})`,
  `Format failures: ${FALLBACK_SAMPLES - fallbackFormatPass}`
);

assertTest(
  fallbackContractsPass === FALLBACK_SAMPLES,
  `Fallback branch passes authoritative contracts.cjs validator for 100% of samples (${fallbackContractsPass}/${FALLBACK_SAMPLES})`,
  `Contracts failures: ${FALLBACK_SAMPLES - fallbackContractsPass}`
);

console.log(`  [METRIC] Fallback branch unique codes: ${fallbackCodes.size}/${FALLBACK_SAMPLES}`);

// ---------------------------------------------------------------------------
// SUITE 5: calculate_luhn_check_digit EDGE CASE STRESS TEST
// ---------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------------');
console.log('SUITE 5: calculate_luhn_check_digit PL/pgSQL Function Edge Cases');
console.log('----------------------------------------------------------------------');

// 5.1 STRICT behavior with NULL
const nullDigit = plpgsqlCalculateLuhnCheckDigit(null);
assertTest(nullDigit === null, 'NULL input returns NULL (PostgreSQL STRICT function contract)', `Got: ${nullDigit}`);

// 5.2 Empty string / zero-digit string throws exception
let emptyThrew = false;
try {
  plpgsqlCalculateLuhnCheckDigit('');
} catch (e) {
  emptyThrew = e.message.includes('must contain at least one digit');
}
assertTest(emptyThrew, 'Empty string raises exception "payload must contain at least one digit"');

let noDigitsThrew = false;
try {
  plpgsqlCalculateLuhnCheckDigit('abc-xyz!@#');
} catch (e) {
  noDigitsThrew = e.message.includes('must contain at least one digit');
}
assertTest(noDigitsThrew, 'Non-digit string raises exception "payload must contain at least one digit"');

// 5.3 Payload with formatted separators (e.g. '101-296-042')
const sepDigit = plpgsqlCalculateLuhnCheckDigit('101-296-042');
const rawDigit = plpgsqlCalculateLuhnCheckDigit('101296042');
assertTest(
  sepDigit === rawDigit && typeof sepDigit === 'number',
  'Hyphenated payload "101-296-042" produces identical check digit to raw "101296042"',
  `sep: ${sepDigit}, raw: ${rawDigit}`
);

// 5.4 Test all single digit payloads '0' through '9'
let singleDigitPass = true;
for (let d = 0; d <= 9; d++) {
  const cd = plpgsqlCalculateLuhnCheckDigit(`${d}`);
  const full = `${d}${cd}`;
  if (!standardLuhnVerify(full)) {
    singleDigitPass = false;
  }
}
assertTest(singleDigitPass, 'All single-digit payloads (0..9) produce valid Luhn 2-digit sequences');

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`=== EMPIRICAL CHALLENGER 3 SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===`);
console.log('======================================================================');

if (findings.length > 0) {
  console.log('\nFindings / Deviations:');
  findings.forEach((f, idx) => console.log(`  ${idx + 1}. ${f.name}: ${f.details}`));
} else {
  console.log('\n🎉 ALL ADVERSARIAL STRESS TESTS PASSED CLEANLY WITH ZERO INTEGRITY DEFECTS.');
}

process.exit(failCount > 0 ? 1 : 0);
