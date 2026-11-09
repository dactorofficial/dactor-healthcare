import {
  generateTrackingCode,
  validateTrackingCode,
  calculateLuhnChecksum,
  getDayOfYear,
  getTerminalId,
  setTerminalId,
  extractTerminalId,
  extractDayOfYear,
  extractCounter,
  parseTrackingCode,
  TrackingCodeGenerator,
} from '../../src/utils/trackingCode.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

console.log('======================================================================');
console.log('=== CHALLENGER 1: ADVERSARIAL STRESS TEST - TRACKING CODE GENERATOR ===');
console.log('======================================================================\n');

// ============================================================================
// 1. COLLISION STRESS TEST (50,000+ CODES ACROSS 20 TERMINALS & SIMULATED YEAR)
// ============================================================================
console.log('--- 1. High Concurrency Collision Stress Test (50,000+ Codes) ---');
const startTime = Date.now();
const uniqueCodes = new Set<string>();
const totalToGenerate = 50000;
const numTerminals = 20; // Terminal IDs 10..29
const daysInYear = 365;

let generationErrors = 0;
let validationFailures = 0;
let parsingFailures = 0;

// Distribute 50,000 codes across 20 terminals and 365 days
for (let i = 0; i < totalToGenerate; i++) {
  const terminalId = 10 + (i % numTerminals); // 10..29
  const dayOfYear = 1 + (Math.floor(i / numTerminals) % daysInYear); // 1..365
  const counter = 1 + (Math.floor(i / (numTerminals * daysInYear)) % 9999);

  // Construct a date matching dayOfYear in year 2025 (non-leap)
  const simulatedDate = new Date(2025, 0, 1);
  simulatedDate.setDate(dayOfYear);

  try {
    const code = generateTrackingCode(terminalId, simulatedDate, counter);

    if (uniqueCodes.has(code)) {
      console.error(`  ❌ Collision detected! Code: ${code} at index ${i}`);
    }
    uniqueCodes.add(code);

    if (!validateTrackingCode(code)) {
      validationFailures++;
    }

    const parsed = parseTrackingCode(code);
    if (
      !parsed ||
      parsed.terminalId !== terminalId ||
      parsed.dayOfYear !== dayOfYear ||
      parsed.counter !== counter
    ) {
      parsingFailures++;
    }
  } catch (err: any) {
    generationErrors++;
    console.error(`  ❌ Generation error at index ${i}:`, err.message);
  }
}

const elapsedMs = Date.now() - startTime;
console.log(`  Generated ${uniqueCodes.size} codes in ${elapsedMs}ms (${Math.round(totalToGenerate / (elapsedMs / 1000))} codes/sec)`);

assert(
  uniqueCodes.size === totalToGenerate,
  `0.0000% collision rate across ${totalToGenerate} codes`,
  `Expected ${totalToGenerate} unique codes, got ${uniqueCodes.size} (Collisions: ${totalToGenerate - uniqueCodes.size})`
);
assert(generationErrors === 0, 'Zero generation errors during stress test', `Errors: ${generationErrors}`);
assert(validationFailures === 0, '100% of generated codes satisfy validateTrackingCode', `Failures: ${validationFailures}`);
assert(parsingFailures === 0, '100% of generated codes parsed back with exact terminal, DOY, and counter', `Failures: ${parsingFailures}`);


// ============================================================================
// 2. COMPREHENSIVE MUTATION FUZZING (100% SINGLE-DIGIT TYPO DETECTION)
// ============================================================================
console.log('\n--- 2. Comprehensive Mutation Fuzzing (100% Single-Digit Typo Detection) ---');
// Generate 1,000 valid baseline codes
const baselineCodes: string[] = [];
for (let i = 0; i < 1000; i++) {
  const tid = 10 + (i % 80); // 10..89
  const doy = 1 + (i % 365);
  const cnt = 1 + ((i * 7) % 9999);
  const d = new Date(2025, 0, 1);
  d.setDate(doy);
  baselineCodes.push(generateTrackingCode(tid, d, cnt));
}

let totalMutations = 0;
let undetectedMutations = 0;

for (const code of baselineCodes) {
  // At each of the 10 positions
  for (let pos = 0; pos < 10; pos++) {
    const originalDigit = code.charCodeAt(pos) - 48;
    // Mutate to all other 9 digits (0..9)
    for (let newDigit = 0; newDigit <= 9; newDigit++) {
      if (newDigit === originalDigit) continue;

      const mutated =
        code.substring(0, pos) + String(newDigit) + code.substring(pos + 1);

      totalMutations++;
      if (validateTrackingCode(mutated)) {
        undetectedMutations++;
        console.error(
          `  ❌ Single-digit typo missed! Original: ${code}, Mutated: ${mutated} at pos ${pos}`
        );
      }
    }
  }
}

const detectionRate = ((totalMutations - undetectedMutations) / totalMutations) * 100;
console.log(`  Tested ${totalMutations} single-digit mutations across 1,000 codes.`);
console.log(`  Undetected mutations: ${undetectedMutations}`);
console.log(`  Detection rate: ${detectionRate.toFixed(4)}%`);

assert(
  undetectedMutations === 0,
  `100.00% single-digit typo detection rate (${totalMutations} tests)`,
  `Missed ${undetectedMutations} mutations out of ${totalMutations}`
);


// ============================================================================
// 3. TRANSPOSITION FUZZING
// ============================================================================
console.log('\n--- 3. Adjacent Transposition Fuzzing ---');
let totalTranspositions = 0;
let detectedTranspositions = 0;
let undetectedTranspositions = 0;
let non09Undetected = 0;

for (const code of baselineCodes) {
  for (let pos = 0; pos < 9; pos++) {
    if (code[pos] === code[pos + 1]) continue; // Identical digits swap is identical code

    totalTranspositions++;
    const swapped =
      code.substring(0, pos) +
      code[pos + 1] +
      code[pos] +
      code.substring(pos + 2);

    const isValid = validateTrackingCode(swapped);
    if (!isValid) {
      detectedTranspositions++;
    } else {
      undetectedTranspositions++;
      const d1 = code.charCodeAt(pos) - 48;
      const d2 = code.charCodeAt(pos + 1) - 48;
      // In Luhn mod-10, the ONLY pair of adjacent digits whose transposition preserves
      // checksum is (0, 9) and (9, 0) because 2*0 + 9 = 9 and 2*9 - 9 + 0 = 9.
      if (!((d1 === 0 && d2 === 9) || (d1 === 9 && d2 === 0))) {
        non09Undetected++;
        console.error(`  ❌ Unexpected transposition undetected for pair (${d1}, ${d2}): ${code} -> ${swapped}`);
      }
    }
  }
}

const transDetectionRate = (detectedTranspositions / totalTranspositions) * 100;
console.log(`  Total adjacent transpositions tested: ${totalTranspositions}`);
console.log(`  Detected transpositions: ${detectedTranspositions} (${transDetectionRate.toFixed(2)}%)`);
console.log(`  Undetected (0,9)/(9,0) transpositions (Luhn mathematical invariant): ${undetectedTranspositions}`);
console.log(`  Undetected non-(0,9) transpositions: ${non09Undetected}`);

assert(
  non09Undetected === 0,
  '100% detection for all adjacent transpositions where |a - b| != 9',
  `Failed ${non09Undetected} non-(0,9) transpositions`
);
assert(
  transDetectionRate > 95.0,
  `Adjacent transposition detection rate > 95% (observed: ${transDetectionRate.toFixed(2)}%)`,
  `Observed: ${transDetectionRate.toFixed(2)}%`
);


// ============================================================================
// 4. BOUNDARY & ADVERSARIAL EDGE CASES
// ============================================================================
console.log('\n--- 4. Boundary & Adversarial Edge Cases ---');

// 4.1 Counter roll-over
console.log('  Testing counter roll-over boundaries:');
const roll9999 = generateTrackingCode(10, new Date(2025, 5, 15), 9999);
const roll10000 = generateTrackingCode(10, new Date(2025, 5, 15), 10000);
const roll19999 = generateTrackingCode(10, new Date(2025, 5, 15), 19999);
assert(extractCounter(roll9999) === 9999, 'Explicit counter 9999 produces counter 9999');
assert(extractCounter(roll10000) === 1, 'Explicit counter 10000 cleanly wraps around to counter 1');
assert(extractCounter(roll19999) === 1, 'Explicit counter 19999 wraps cleanly to counter 1');

// Explicit counter = 0 or negative
const roll0 = generateTrackingCode(10, new Date(2025, 5, 15), 0);
assert(validateTrackingCode(roll0), 'Explicit counter 0 does not crash and produces valid code');
const rollNeg = generateTrackingCode(10, new Date(2025, 5, 15), -100);
assert(validateTrackingCode(rollNeg), 'Negative explicit counter does not crash and produces valid code');

// 4.2 Leap year day 366
console.log('  Testing leap year day 366:');
const leapDec31 = new Date(2024, 11, 31, 12, 0, 0); // Dec 31, 2024 is day 366
const leapDoy = getDayOfYear(leapDec31);
assert(leapDoy === 366, `Leap year Dec 31 calculates DOY as 366 (got: ${leapDoy})`);
const leapCode = generateTrackingCode(15, leapDec31, 500);
assert(validateTrackingCode(leapCode), 'Leap year day 366 produces valid tracking code');
assert(extractDayOfYear(leapCode) === 366, `extractDayOfYear extracts 366 from leap year code (got: ${extractDayOfYear(leapCode)})`);

// 4.3 Terminal ID boundaries
console.log('  Testing Terminal ID boundaries:');
// Valid boundaries
const codeTerm10 = generateTrackingCode(10, new Date(2025, 0, 1), 1);
const codeTerm99 = generateTrackingCode(99, new Date(2025, 0, 1), 1);
assert(extractTerminalId(codeTerm10) === 10, 'Terminal 10 (minimum valid) produces correct terminal ID');
assert(extractTerminalId(codeTerm99) === 99, 'Terminal 99 (maximum valid) produces correct terminal ID');

// Out of range terminal IDs (should fallback to default without error)
const codeTerm9 = generateTrackingCode(9, new Date(2025, 0, 1), 1);
const codeTerm100 = generateTrackingCode(100, new Date(2025, 0, 1), 1);
const codeTermNeg = generateTrackingCode(-5, new Date(2025, 0, 1), 1);
assert(validateTrackingCode(codeTerm9), 'Terminal ID 9 gracefully falls back to default terminal ID');
assert(validateTrackingCode(codeTerm100), 'Terminal ID 100 gracefully falls back to default terminal ID');
assert(validateTrackingCode(codeTermNeg), 'Negative terminal ID (-5) gracefully falls back to default terminal ID');
assert(extractTerminalId(codeTermNeg) === getTerminalId(), 'Negative terminal ID produces default terminal ID');

// setTerminalId validation
let caughtSetNeg = false;
try {
  setTerminalId(-1);
} catch (_) {
  caughtSetNeg = true;
}
assert(caughtSetNeg, 'setTerminalId(-1) throws Error for negative terminal ID');

let caughtSet100 = false;
try {
  setTerminalId(100);
} catch (_) {
  caughtSet100 = true;
}
assert(caughtSet100, 'setTerminalId(100) throws Error for terminal ID > 99');


// ============================================================================
// 5. INPUT SANITIZATION & MALICIOUS INJECTION HARNESS
// ============================================================================
console.log('\n--- 5. Malicious Input & Injection Fuzzing ---');

const maliciousInputs: any[] = [
  null,
  undefined,
  1000100014,
  true,
  false,
  {},
  [],
  NaN,
  Infinity,
  -Infinity,
  () => {},
  '', // empty
  '1',
  '12345',
  '123456789', // 9 digits
  '12345678901', // 11 digits
  '10001000140', // 11 digits
  '100010001', // 9 digits of valid code
  '1000100014\x00', // Null byte suffix
  '\x001000100014', // Null byte prefix
  ' 1000100014', // Leading space
  '1000100014 ', // Trailing space
  '10001 00014', // Middle space
  '10001\n00014', // Newline
  '10001\t00014', // Tab
  '10001\r00014', // CR
  '10001a00014', // Letter in middle
  'abcdefghij', // 10 letters
  '10001-0001', // Hyphen
  '-100010001', // Negative number string
  '+100010001', // Positive sign string
  '1.00010001', // Floating point string
  '1e10000000', // Scientific notation
  '0x10001000', // Hex string
  // SQL Injection payloads
  "' OR '1'='1",
  "1000100014' OR '1'='1",
  "1000100014; DROP TABLE appointments;--",
  "1000100014 UNION SELECT * FROM profiles--",
  // XSS payloads
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "10001<script>alert(1)</script>",
  // Path traversal
  "../../../../etc/passwd",
  "..\\..\\..\\windows\\win.ini",
  // Unicode digits & special chars
  "१०१२३४५६७८", // Devanagari 10 digits
  "١٢٣٤٥٦٧٨٩٠", // Arabic 10 digits
  "１０００１０００１４", // Full-width digits
  "10001\u200B00014", // Zero-width space
  "10001\uFEFF00014", // BOM
  "🎯🏥💊💉🩺", // Emojis
  'A'.repeat(10000), // Buffer overflow attempt
  '9'.repeat(10000), // Long numeric string
];

let rejectedMalicious = 0;
let unhandledMaliciousExceptions = 0;

for (const input of maliciousInputs) {
  try {
    const valid = validateTrackingCode(input);
    const parsed = parseTrackingCode(input);
    const term = extractTerminalId(input);
    const doy = extractDayOfYear(input);
    const cnt = extractCounter(input);

    if (valid === false && parsed === null && term === null && doy === null && cnt === null) {
      rejectedMalicious++;
    } else {
      console.error(`  ❌ Malicious input NOT fully rejected:`, { input, valid, parsed, term, doy, cnt });
    }
  } catch (err: any) {
    unhandledMaliciousExceptions++;
    console.error(`  ❌ Unhandled exception on malicious input:`, { input, err: err.message });
  }
}

console.log(`  Tested ${maliciousInputs.length} dirty/malicious inputs.`);
console.log(`  Cleanly rejected without exceptions: ${rejectedMalicious} / ${maliciousInputs.length}`);

assert(
  rejectedMalicious === maliciousInputs.length,
  `100% of malicious/dirty inputs safely rejected (${maliciousInputs.length} tests)`,
  `Only ${rejectedMalicious} / ${maliciousInputs.length} rejected`
);
assert(
  unhandledMaliciousExceptions === 0,
  'Zero unhandled exceptions on malicious inputs',
  `Exceptions: ${unhandledMaliciousExceptions}`
);

// ============================================================================
// 6. FLOATING POINT & WEIRD TERMINAL ID BEHAVIOR
// ============================================================================
console.log('\n--- 6. Floating-point & Non-integer Terminal ID Handling ---');
// Let's test what happens when someone passes a float terminalId to generateTrackingCode
let floatTermThrew = false;
let floatCode = '';
try {
  floatCode = generateTrackingCode(15.7, new Date(2025, 0, 1), 10);
  console.log(`  generateTrackingCode(15.7) returned: ${floatCode}, valid: ${validateTrackingCode(floatCode)}`);
} catch (err: any) {
  floatTermThrew = true;
  console.log(`  generateTrackingCode(15.7) threw: ${err.message}`);
}

// Check whether it generates a valid code or if it breaks Luhn
if (!floatTermThrew) {
  assert(validateTrackingCode(floatCode), 'Float terminalId (15.7) generates valid code or is sanitized');
} else {
  console.log('  Note: Float terminalId 15.7 threw an exception inside calculateLuhnChecksum.');
}

console.log('\n======================================================================');
console.log(`TRACKING CODE ADVERSARIAL SUITE: ${passedTests} / ${totalTests} assertions passed (${failedTests} failed)`);
console.log('======================================================================\n');

export { totalTests, passedTests, failedTests };
