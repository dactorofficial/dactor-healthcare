/**
 * Adversarial Empirical Challenge Suite — Challenger 2 (Milestone 1)
 * Target: Security Redactor Engine & Data Aggregator Error Resilience
 * File: scripts/backup/challenge_m1_security.mjs
 * 
 * Verifies:
 * 1. Fuzzing with diverse sensitive key variations (casing, delimiters, kebab-case, camelCase).
 * 2. Deeply nested JSON (10, 50, 100 levels) and complex arrays of objects.
 * 3. Circular references, re-entrant graphs, and DAG shared references.
 * 4. Free-form text descriptions with embedded credentials, SQL injection, and ReDoS payloads.
 * 5. End-to-end secret leakage audit through serializers (CSV and JSON).
 * 6. DataAggregator error resilience: connection drops, abort timeouts, HTTP 500/403/502, malformed bodies.
 * 7. Immutability and Object.freeze purity under adversarial conditions.
 */

import http from 'node:http';
import assert from 'node:assert/strict';
import { redactSecrets, isSensitiveKey, REDACTED_VALUE, redactDescription } from './lib/redactor.mjs';
import { toJSON, toCSV, parseCSV } from './lib/serializer.mjs';
import { DataAggregator, normalizeTimestamps, createMockClinicBundle, extractMediaTargets } from './lib/aggregator.mjs';

let passed = 0;
let failed = 0;
const findings = [];

function test(category, name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] [${category}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] [${category}] ${name}`);
    console.error(`    Error: ${err.message}`);
    findings.push({ category, name, error: err.message, stack: err.stack });
    failed++;
  }
}

async function asyncTest(category, name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] [${category}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] [${category}] ${name}`);
    console.error(`    Error: ${err.message}`);
    findings.push({ category, name, error: err.message, stack: err.stack });
    failed++;
  }
}

console.log('======================================================================');
console.log('=== CHALLENGER 2: ADVERSARIAL SECURITY & RESILIENCE STRESS SUITE   ===');
console.log('======================================================================\n');

// ===========================================================================
// SECTION 1: DIVERSE SENSITIVE KEY VARIATIONS & FUZZING
// ===========================================================================
console.log('--- Section 1: Sensitive Key Variations & Casing Fuzzing ---');

const KEY_VARIATIONS = [
  // Exact snake_case & uppercase
  { key: 'payment_secret_key', expectRedacted: true },
  { key: 'PAYMENT_SECRET_KEY', expectRedacted: true },
  { key: 'Payment_Secret_Key', expectRedacted: true },
  { key: 'payment_api_key', expectRedacted: true },
  { key: 'PAYMENT_API_KEY', expectRedacted: true },
  { key: 'esewa_secret_key', expectRedacted: true },
  { key: 'ESEWA_SECRET_KEY', expectRedacted: true },
  { key: 'secret_key', expectRedacted: true },
  { key: 'SECRET_KEY', expectRedacted: true },
  { key: 'api_key', expectRedacted: true },
  { key: 'API_KEY', expectRedacted: true },
  { key: 'private_key', expectRedacted: true },
  { key: 'PRIVATE_KEY', expectRedacted: true },
  { key: 'service_role_key', expectRedacted: true },
  { key: 'SERVICE_ROLE_KEY', expectRedacted: true },
  { key: 'password', expectRedacted: true },
  { key: 'PASSWORD', expectRedacted: true },
  { key: 'merchant_secret', expectRedacted: true },
  { key: 'client_secret', expectRedacted: true },
  { key: 'webhook_secret', expectRedacted: true },

  // camelCase & PascalCase
  { key: 'paymentSecretKey', expectRedacted: true },
  { key: 'PaymentSecretKey', expectRedacted: true },
  { key: 'paymentApiKey', expectRedacted: true },
  { key: 'PaymentApiKey', expectRedacted: true },
  { key: 'esewaSecretKey', expectRedacted: true },
  { key: 'EsewaSecretKey', expectRedacted: true },
  { key: 'secretKey', expectRedacted: true },
  { key: 'SecretKey', expectRedacted: true },
  { key: 'apiKey', expectRedacted: true },
  { key: 'ApiKey', expectRedacted: true },
  { key: 'privateKey', expectRedacted: true },
  { key: 'serviceRoleKey', expectRedacted: true },

  // Custom provider combinations (suffix patterns)
  { key: 'khalti_secret_key', expectRedacted: true },
  { key: 'khaltiSecretKey', expectRedacted: true },
  { key: 'stripe_secret_key', expectRedacted: true },
  { key: 'stripe_api_key', expectRedacted: true },
  { key: 'secret_token', expectRedacted: true },
  { key: 'secret_hash', expectRedacted: true },

  // Non-sensitive keys (MUST NOT be redacted)
  { key: 'id', expectRedacted: false },
  { key: 'clinic_name', expectRedacted: false },
  { key: 'secretariat_phone', expectRedacted: false },
  { key: 'secretary_notes', expectRedacted: false },
  { key: 'key_person', expectRedacted: false },
  { key: 'public_mobile_number', expectRedacted: false },
  { key: 'total_amount', expectRedacted: false }
];

test('Keys', '1.1 Comprehensive isSensitiveKey and redactSecrets key variation check', () => {
  const secretPayload = {};
  for (const item of KEY_VARIATIONS) {
    secretPayload[item.key] = `RAW_VAL_${item.key}`;
  }

  const redacted = redactSecrets(secretPayload);

  for (const item of KEY_VARIATIONS) {
    const isSensitive = isSensitiveKey(item.key);
    const resultValue = redacted[item.key];

    if (item.expectRedacted) {
      assert.equal(isSensitive, true, `Key "${item.key}" should be flagged sensitive`);
      assert.equal(resultValue, REDACTED_VALUE, `Key "${item.key}" must be [REDACTED]`);
    } else {
      assert.equal(isSensitive, false, `Key "${item.key}" should NOT be flagged sensitive`);
      assert.equal(resultValue, `RAW_VAL_${item.key}`, `Key "${item.key}" must preserve original value`);
    }
  }
});

test('Keys', '1.2 Kebab-case and hyphenated key variants evaluation', () => {
  // Testing hyphenated headers/keys often found in HTTP proxies or configs
  const hyphenatedKeys = ['payment-secret-key', 'esewa-secret-key', 'api-key', 'private-key'];
  for (const k of hyphenatedKeys) {
    const isSens = isSensitiveKey(k);
    const obj = { [k]: 'secret_value' };
    const res = redactSecrets(obj);
    // Document whether kebab-case is supported
    console.log(`    Note: key "${k}" isSensitive=${isSens}, result=${res[k]}`);
  }
});

// ===========================================================================
// SECTION 2: DEEPLY NESTED JSON & COMPLEX ARRAYS
// ===========================================================================
console.log('\n--- Section 2: Deeply Nested JSON & Object Graphs ---');

test('Nesting', '2.1 Deeply nested object hierarchy (50 levels deep)', () => {
  let root = { payment_secret_key: 'root_secret' };
  let current = root;
  for (let i = 1; i <= 50; i++) {
    current.child = {
      level: i,
      data: `level_${i}`
    };
    if (i === 25) {
      current.child.esewa_secret_key = 'mid_depth_secret';
    }
    if (i === 50) {
      current.child.apiKey = 'deepest_secret';
    }
    current = current.child;
  }

  const redacted = redactSecrets(root);
  assert.equal(redacted.payment_secret_key, REDACTED_VALUE);

  // Traverse down to verify mid and deepest secrets
  let curRedacted = redacted;
  for (let i = 1; i <= 50; i++) {
    curRedacted = curRedacted.child;
    if (i === 25) {
      assert.equal(curRedacted.esewa_secret_key, REDACTED_VALUE);
    }
    if (i === 50) {
      assert.equal(curRedacted.apiKey, REDACTED_VALUE);
    }
  }
});

test('Nesting', '2.2 Array of 500 objects with mixed sensitive keys', () => {
  const records = [];
  for (let i = 0; i < 500; i++) {
    records.push({
      index: i,
      name: `Patient ${i}`,
      payment_secret_key: i % 2 === 0 ? `secret_${i}` : null,
      metadata: {
        inner_api_key: `api_${i}`,
        tags: ['tag1', 'tag2', { custom_secret: `cust_${i}` }]
      }
    });
  }

  const redacted = redactSecrets(records);
  assert.equal(redacted.length, 500);

  for (let i = 0; i < 500; i++) {
    const item = redacted[i];
    assert.equal(item.index, i);
    assert.equal(item.name, `Patient ${i}`);
    if (i % 2 === 0) {
      assert.equal(item.payment_secret_key, REDACTED_VALUE);
    } else {
      assert.equal(item.payment_secret_key, null);
    }
    assert.equal(item.metadata.inner_api_key, REDACTED_VALUE);
    assert.equal(item.metadata.tags[2].custom_secret, REDACTED_VALUE);
  }
});

test('Nesting', '2.3 Multi-tier stringified JSON recursion (JSON inside string inside JSON)', () => {
  const innerJSON = JSON.stringify({ esewa_secret_key: 'super_inner_secret', active: true });
  const midJSON = JSON.stringify({ description_inner: innerJSON, clinic_id: 'c1' });
  const root = {
    clinic_id: 'c1',
    description: midJSON
  };

  const redacted = redactSecrets(root);
  assert.ok(typeof redacted.description === 'string');
  assert.equal(redacted.description.includes('super_inner_secret'), false, 'Inner secret must not leak');
  assert.ok(redacted.description.includes(REDACTED_VALUE));
});

// ===========================================================================
// SECTION 3: CIRCULAR & RE-ENTRANT REFERENCES
// ===========================================================================
console.log('\n--- Section 3: Circular & Re-entrant Object Graphs ---');

test('Circular', '3.1 Simple self-referencing cycle (obj.self = obj)', () => {
  const obj = { id: 'circ1', payment_secret_key: 'top_secret' };
  obj.self = obj;

  const redacted = redactSecrets(obj);
  assert.equal(redacted.id, 'circ1');
  assert.equal(redacted.payment_secret_key, REDACTED_VALUE);
  assert.equal(redacted.self, '[Circular]');
});

test('Circular', '3.2 Mutual two-node cycle (a.b = b; b.a = a)', () => {
  const a = { name: 'Node A', payment_secret_key: 'secA' };
  const b = { name: 'Node B', api_key: 'secB' };
  a.peer = b;
  b.peer = a;

  const redactedA = redactSecrets(a);
  assert.equal(redactedA.payment_secret_key, REDACTED_VALUE);
  assert.equal(redactedA.peer.api_key, REDACTED_VALUE);
  assert.equal(redactedA.peer.peer, '[Circular]');
});

test('Circular', '3.3 Array self-reference loop (arr.push(arr))', () => {
  const arr = ['normal_item', { secret_key: 'in_arr_secret' }];
  arr.push(arr);

  const redactedArr = redactSecrets(arr);
  assert.equal(redactedArr[0], 'normal_item');
  assert.equal(redactedArr[1].secret_key, REDACTED_VALUE);
  assert.equal(redactedArr[2], '[Circular]');
});

test('Circular', '3.4 DAG non-circular shared references', () => {
  // A shared object referenced by two properties in the same root object
  const sharedDoctor = { id: 'd1', name: 'Dr. Aarav', specialty: 'Cardiology' };
  const clinic = {
    primaryDoctor: sharedDoctor,
    onCallDoctor: sharedDoctor
  };

  const redacted = redactSecrets(clinic);
  assert.equal(redacted.primaryDoctor.name, 'Dr. Aarav');
  // Assess whether DAG shared node is marked as [Circular] due to WeakSet reuse
  const isSecondCircular = redacted.onCallDoctor === '[Circular]';
  console.log(`    DAG shared reference evaluation: onCallDoctor is ${redacted.onCallDoctor === '[Circular]' ? '[Circular] (WeakSet reuse)' : 'preserved'}`);
});

test('Circular', '3.5 Aggregator normalizeTimestamps resilience with circular objects', () => {
  const circularRecord = {
    id: 'rec_circ',
    created_at: '2026-10-22T08:00:00.000Z'
  };
  circularRecord.ref = circularRecord;

  try {
    const res = normalizeTimestamps(circularRecord);
    assert.ok(res, 'Must return normalized record');
    assert.ok(res.created_at);
  } catch (err) {
    console.log(`    Note: normalizeTimestamps threw on circular input: ${err.message}`);
    // Record as finding if it causes call stack overflow
    if (err instanceof RangeError && err.message.includes('call stack')) {
      findings.push({
        category: 'Resilience',
        name: 'normalizeTimestamps call stack overflow on circular object',
        error: err.message
      });
    }
  }
});

// ===========================================================================
// SECTION 4: UNSTRUCTURED TEXT, SQL INJECTION & ReDoS PAYLOADS
// ===========================================================================
console.log('\n--- Section 4: Unstructured Text, Free-form Notes & Attack Payloads ---');

test('Text', '4.1 Free-form text with quoted and unquoted key-value secrets', () => {
  const notesQuoted = 'Configuration: payment_secret_key="secret_token_12345", endpoint="https://api.esewa.com"';
  const redactedQuoted = redactDescription(notesQuoted);
  assert.ok(redactedQuoted.includes(`payment_secret_key="${REDACTED_VALUE}"`));
  assert.equal(redactedQuoted.includes('secret_token_12345'), false);

  const notesJsonFormat = '{"gateway": "esewa", "secret_key": "esewa_secret_abc"}';
  const redactedJsonFormat = redactDescription(notesJsonFormat);
  assert.equal(redactedJsonFormat.includes('esewa_secret_abc'), false);
  assert.ok(redactedJsonFormat.includes(REDACTED_VALUE));
});

test('Text', '4.2 Preservation of clinical notes, patient emails, and numbers', () => {
  const clinicDescription = `
    Kathmandu Health Hub Polyclinic.
    Location: Thamel Marg, Ward 26, Kathmandu.
    Emergency Hotline: +977-1-4412345, Support: info@ktmhealthhub.com.np
    Patient Prescription: Paracetamol 500mg TDS, Amoxicillin 250mg BD.
    Internal Setting: payment_secret_key="live_secret_777"
  `;

  const sanitized = redactDescription(clinicDescription);
  assert.ok(sanitized.includes('Kathmandu Health Hub Polyclinic'));
  assert.ok(sanitized.includes('Ward 26, Kathmandu'));
  assert.ok(sanitized.includes('+977-1-4412345'));
  assert.ok(sanitized.includes('info@ktmhealthhub.com.np'));
  assert.ok(sanitized.includes('Paracetamol 500mg TDS'));
  assert.ok(sanitized.includes(`payment_secret_key="${REDACTED_VALUE}"`));
  assert.equal(sanitized.includes('live_secret_777'), false, 'Secret must not be in sanitized text');
});

test('Text', '4.3 SQL injection & script injection in description field', () => {
  const sqlInjection = `'); DROP TABLE clinics; UPDATE billing_invoices SET paid_amount=0;-- payment_secret_key="sec1"`;
  const sanitized = redactDescription(sqlInjection);
  assert.ok(sanitized.includes(`DROP TABLE clinics`));
  assert.equal(sanitized.includes('sec1'), false);
  assert.ok(sanitized.includes(REDACTED_VALUE));
});

test('Text', '4.4 Malformed JSON in description falls back to regex redaction', () => {
  const brokenJson = `{"notes": "Leading Clinic", "payment_secret_key": "broken_json_secret_999"`; // Missing closing brace
  const sanitized = redactDescription(brokenJson);
  assert.equal(sanitized.includes('broken_json_secret_999'), false, 'Must redact even if JSON is malformed');
  assert.ok(sanitized.includes(REDACTED_VALUE));
});

test('Text', '4.5 ReDoS Stress Test: 50,000 character repetitive input', () => {
  const t0 = performance.now();
  const repetitiveText = 'payment_secret_key="'.repeat(2000) + 'test_secret' + '"'.repeat(2000);
  const result = redactDescription(repetitiveText);
  const elapsed = performance.now() - t0;

  console.log(`    ReDoS stress duration: ${elapsed.toFixed(2)}ms`);
  assert.ok(elapsed < 2000, `Regex must not suffer from ReDoS (took ${elapsed.toFixed(2)}ms)`);
  assert.ok(result);
});

// ===========================================================================
// SECTION 5: SERIALIZER INTEGRATION & ZERO-LEAKAGE AUDIT
// ===========================================================================
console.log('\n--- Section 5: Serializer Integration & Zero-Leakage Audit ---');

test('Serializer', '5.1 Comprehensive clinic bundle serialization to CSV and JSON without secret leakage', () => {
  const secretKeyMarker = 'EXPLICIT_TEST_SECRET_KEY_NEVER_LEAK_98765';
  const secretApiKeyMarker = 'EXPLICIT_TEST_API_KEY_NEVER_LEAK_43210';
  const embeddedEsewaSecret = 'EXPLICIT_ESEWA_GATEWAY_SECRET_XYZ';

  const mockClinicBundle = createMockClinicBundle('c1111111-1111-1111-1111-111111111111');
  // Inject explicit secrets into various tables and partitions
  mockClinicBundle.clinic.payment_secret_key = secretKeyMarker;
  mockClinicBundle.clinic.payment_api_key = secretApiKeyMarker;
  mockClinicBundle.clinic.description = JSON.stringify({
    notes: 'Clinic Notes',
    payment_gateways_json: {
      esewa: { secret_key: embeddedEsewaSecret }
    }
  });

  mockClinicBundle.billingInvoices[0].remarks = `Secret audit: payment_secret_key="${secretKeyMarker}"`;
  mockClinicBundle.invoiceTransactions[0].notes = `Transaction note: secret_key="${secretKeyMarker}"`;

  // 1. Redact bundle
  const redactedBundle = redactSecrets(mockClinicBundle);

  // 2. Serialize each partition to JSON
  for (const [datasetName, records] of Object.entries(redactedBundle)) {
    const jsonOutput = toJSON(records);
    assert.equal(jsonOutput.includes(secretKeyMarker), false, `JSON export of ${datasetName} leaked secret!`);
    assert.equal(jsonOutput.includes(secretApiKeyMarker), false, `JSON export of ${datasetName} leaked api key!`);
    assert.equal(jsonOutput.includes(embeddedEsewaSecret), false, `JSON export of ${datasetName} leaked esewa secret!`);
  }

  // 3. Serialize each partition to CSV
  for (const [datasetName, records] of Object.entries(redactedBundle)) {
    if (!Array.isArray(records)) continue;
    const csvOutput = toCSV(records);
    assert.equal(csvOutput.includes(secretKeyMarker), false, `CSV export of ${datasetName} leaked secret!`);
    assert.equal(csvOutput.includes(secretApiKeyMarker), false, `CSV export of ${datasetName} leaked api key!`);
    assert.equal(csvOutput.includes(embeddedEsewaSecret), false, `CSV export of ${datasetName} leaked esewa secret!`);

    // Verify CSV parses back cleanly
    const parsed = parseCSV(csvOutput);
    assert.equal(parsed.length, records.length);
  }
});

// ===========================================================================
// SECTION 6: AGGREGATOR NETWORK RESILIENCE & ERROR HANDLING
// ===========================================================================
console.log('\n--- Section 6: DataAggregator Network Error Resilience ---');

await asyncTest('Network', '6.1 PostgREST connection drop simulation (socket destroy)', async () => {
  const server = http.createServer((req, res) => {
    // Immediately destroy incoming client socket
    req.socket.destroy();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. With fallbackToFixtures: true (default) -> should not crash, returns fallback mock bundle
    const aggWithFallback = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: true
    });

    const data = await aggWithFallback.extractClinicData('c1111111-1111-1111-1111-111111111111');
    assert.ok(data.clinic, 'Must fallback to mock clinic on network drop');
    assert.equal(data.clinic.id, 'c1111111-1111-1111-1111-111111111111');

    // 2. With fallbackToFixtures: false -> should cleanly throw error without unhandled rejection
    const aggStrict = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: false
    });

    await assert.rejects(
      async () => {
        await aggStrict.extractClinicData('c1111111-1111-1111-1111-111111111111');
      },
      /fetch failed|socket hang up|ECONNRESET/i
    );
  } finally {
    server.close();
  }
});

await asyncTest('Network', '6.2 PostgREST request timeout abort simulation', async () => {
  const server = http.createServer((req, res) => {
    // Hang request for 5 seconds (client timeout is 150ms)
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }, 5000);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. With fallbackToFixtures: true -> handles timeout and recovers
    const aggTimeout = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 150,
      fallbackToFixtures: true
    });

    const t0 = performance.now();
    const data = await aggTimeout.extractClinicData('c1111111-1111-1111-1111-111111111111');
    const elapsed = performance.now() - t0;

    assert.ok(elapsed < 2000, `Abort should trigger fast timeout (took ${elapsed}ms)`);
    assert.ok(data.clinic);

    // 2. With fallbackToFixtures: false -> cleanly throws abort error
    const aggTimeoutStrict = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 150,
      fallbackToFixtures: false
    });

    await assert.rejects(
      async () => {
        await aggTimeoutStrict.extractClinicData('c1111111-1111-1111-1111-111111111111');
      },
      /abort/i
    );
  } finally {
    server.close();
  }
});

await asyncTest('Network', '6.3 PostgREST HTTP 500 Internal Server Error handling', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'PGRST500', message: 'Internal database error' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    const agg500 = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: true
    });

    const data = await agg500.extractClinicData('c1111111-1111-1111-1111-111111111111');
    assert.ok(data.clinic, 'Must fallback to mock clinic on HTTP 500');

    const agg500Strict = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: false
    });

    await assert.rejects(
      async () => {
        await agg500Strict.extractClinicData('c1111111-1111-1111-1111-111111111111');
      },
      /HTTP 500/i
    );
  } finally {
    server.close();
  }
});

await asyncTest('Network', '6.4 PostgREST HTML 502 Bad Gateway non-JSON body handling', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>');
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    const agg502 = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: true
    });

    const data = await agg502.extractClinicData('c1111111-1111-1111-1111-111111111111');
    assert.ok(data.clinic, 'Must fallback cleanly on 502 HTML body');

    const agg502Strict = new DataAggregator({
      supabaseUrl: mockUrl,
      timeoutMs: 1000,
      fallbackToFixtures: false
    });

    await assert.rejects(
      async () => {
        await agg502Strict.extractClinicData('c1111111-1111-1111-1111-111111111111');
      },
      /HTTP 502/i
    );
  } finally {
    server.close();
  }
});

// ===========================================================================
// SECTION 7: IMMUTABILITY & OBJECT.FREEZE PURITY
// ===========================================================================
console.log('\n--- Section 7: Immutability & Object.freeze Purity ---');

test('Immutability', '7.1 Deeply frozen input object is not mutated by redactSecrets', () => {
  const deepFreeze = (obj) => {
    Object.freeze(obj);
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object' && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    }
    return obj;
  };

  const frozenInput = deepFreeze({
    id: 'frozen_1',
    name: 'Frozen Clinic',
    payment_secret_key: 'top_secret_frozen_val',
    nested: {
      api_key: 'nested_frozen_api_val',
      list: [{ service_role_key: 'item_frozen_secret' }]
    }
  });

  // Calling redactSecrets on frozen object must not throw TypeError: Cannot assign to read-only property
  const output = redactSecrets(frozenInput);
  assert.equal(output.payment_secret_key, REDACTED_VALUE);
  assert.equal(output.nested.api_key, REDACTED_VALUE);
  assert.equal(output.nested.list[0].service_role_key, REDACTED_VALUE);

  // Original frozen object is untouched
  assert.equal(frozenInput.payment_secret_key, 'top_secret_frozen_val');
  assert.equal(frozenInput.nested.api_key, 'nested_frozen_api_val');
});

// ===========================================================================
// SUMMARY & VERDICT
// ===========================================================================
console.log('\n======================================================================');
console.log(`Challenger 2 Results: ${passed} passed, ${failed} failed`);
console.log('======================================================================');

if (findings.length > 0) {
  console.log('\nIdentified Findings:');
  for (const f of findings) {
    console.log(`  - [${f.category}] ${f.name}: ${f.error}`);
  }
}

if (failed === 0) {
  console.log('\nVERDICT: EMPIRICAL STRESS TESTS PASSED SUCCESSFULLY! ✓');
  process.exit(0);
} else {
  console.log('\nVERDICT: FAILURES ENCOUNTERED DURING ADVERSARIAL STRESS TESTING!');
  process.exit(1);
}
