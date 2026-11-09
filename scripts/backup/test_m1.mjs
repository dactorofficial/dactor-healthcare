/**
 * Standalone Verification Suite for Milestone 1 (M1)
 * Data Aggregator, Tabular Serializers, and Security Redaction Engine.
 * 
 * Verifies:
 * 1. Deep recursive redaction of payment secrets, API keys, and nested JSON configurations.
 * 2. RFC 4180 CSV and JSON serialization with proper escaping, complex object handling, and null safety.
 * 3. Aggregation of all 10 clinic relational datasets with soft-delete preservation.
 * 4. ISO 8601 UTC timestamp normalization.
 * 5. Media download target extraction adhering to PROJECT.md interface contracts.
 */

import assert from 'node:assert/strict';
import { redactSecrets, isSensitiveKey, REDACTED_VALUE, redactDescription } from './lib/redactor.mjs';
import { toJSON, toRawJSON, toCSV, parseCSV } from './lib/serializer.mjs';
import { DataAggregator, normalizeTimestamps, createMockClinicBundle, extractMediaTargets } from './lib/aggregator.mjs';

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
    }
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
    }
    failed++;
  }
}

console.log('====================================================');
console.log('Running Milestone 1 Verification Suite');
console.log('====================================================\n');

// ---------------------------------------------------------------------------
// SUITE 1: Security Redactor Engine
// ---------------------------------------------------------------------------
console.log('--- Suite 1: Security Redactor Engine (lib/redactor.mjs) ---');

test('1.1 isSensitiveKey detects known sensitive keys and variants', () => {
  assert.equal(isSensitiveKey('payment_secret_key'), true);
  assert.equal(isSensitiveKey('payment_api_key'), true);
  assert.equal(isSensitiveKey('esewa_secret_key'), true);
  assert.equal(isSensitiveKey('secret_key'), true);
  assert.equal(isSensitiveKey('api_key'), true);
  assert.equal(isSensitiveKey('private_key'), true);
  assert.equal(isSensitiveKey('password'), true);
  assert.equal(isSensitiveKey('custom_secret'), true);
  assert.equal(isSensitiveKey('some_provider_secret_key'), true);
  assert.equal(isSensitiveKey('merchant_secret'), true);

  // Non-sensitive keys
  assert.equal(isSensitiveKey('id'), false);
  assert.equal(isSensitiveKey('name'), false);
  assert.equal(isSensitiveKey('contact_phone'), false);
  assert.equal(isSensitiveKey('patient_name'), false);
  assert.equal(isSensitiveKey('total_amount'), false);
});

test('1.2 redactSecrets strictly replaces direct secret keys with [REDACTED]', () => {
  const rawClinic = {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Kathmandu Health Hub',
    payment_secret_key: 'top_secret_key_123',
    payment_api_key: 'live_api_key_456',
    merchant_id: 'MERCHANT_PUBLIC_ID'
  };

  const redacted = redactSecrets(rawClinic);
  assert.equal(redacted.payment_secret_key, REDACTED_VALUE);
  assert.equal(redacted.payment_api_key, REDACTED_VALUE);
  assert.equal(redacted.merchant_id, 'MERCHANT_PUBLIC_ID');
  assert.equal(redacted.name, 'Kathmandu Health Hub');
});

test('1.3 redactSecrets parses and redacts nested JSON in clinics.description', () => {
  const clinic = {
    description: JSON.stringify({
      notes: 'Main polyclinic',
      payment_gateways_json: {
        esewa: {
          merchant_id: 'EPAYTEST',
          secret_key: 'embedded_super_secret_esewa_key',
          environment: 'test'
        },
        khalti: {
          public_key: 'live_public_123',
          secret_key: 'embedded_super_secret_khalti_key'
        }
      }
    })
  };

  const redacted = redactSecrets(clinic);
  assert.ok(typeof redacted.description === 'string');
  const parsed = JSON.parse(redacted.description);

  assert.equal(parsed.notes, 'Main polyclinic');
  assert.equal(parsed.payment_gateways_json.esewa.merchant_id, 'EPAYTEST');
  assert.equal(parsed.payment_gateways_json.esewa.secret_key, REDACTED_VALUE);
  assert.equal(parsed.payment_gateways_json.khalti.public_key, 'live_public_123');
  assert.equal(parsed.payment_gateways_json.khalti.secret_key, REDACTED_VALUE);

  // Ensure raw secrets do not exist anywhere in the stringified description
  assert.equal(redacted.description.includes('embedded_super_secret_esewa_key'), false);
  assert.equal(redacted.description.includes('embedded_super_secret_khalti_key'), false);
});

test('1.4 redactSecrets handles stringified JSON inside payment_gateways_json', () => {
  const clinic = {
    payment_gateways_json: JSON.stringify({
      esewa: {
        secret_key: 'nested_stringified_secret'
      }
    })
  };

  const redacted = redactSecrets(clinic);
  assert.ok(typeof redacted.payment_gateways_json === 'string');
  const parsed = JSON.parse(redacted.payment_gateways_json);
  assert.equal(parsed.esewa.secret_key, REDACTED_VALUE);
  assert.equal(redacted.payment_gateways_json.includes('nested_stringified_secret'), false);
});

test('1.5 redactSecrets does not mutate original input data', () => {
  const original = {
    payment_secret_key: 'raw_secret_value',
    nested: { api_key: 'raw_api_value' }
  };

  const clone = redactSecrets(original);
  assert.equal(clone.payment_secret_key, REDACTED_VALUE);
  assert.equal(clone.nested.api_key, REDACTED_VALUE);

  // Original remains untouched
  assert.equal(original.payment_secret_key, 'raw_secret_value');
  assert.equal(original.nested.api_key, 'raw_api_value');
});

test('1.6 redactSecrets handles circular references safely', () => {
  const circularObj = { name: 'Circular Test', payment_secret_key: 'circ_secret' };
  circularObj.self = circularObj;

  const result = redactSecrets(circularObj);
  assert.equal(result.payment_secret_key, REDACTED_VALUE);
  assert.equal(result.self, '[Circular]');
});

test('1.7 redactSecrets redacts clinic_payment_credentials and custom secrets', () => {
  const credentials = {
    clinic_id: 'c1111111-1111-1111-1111-111111111111',
    esewa_product_code: 'EPAYTEST',
    esewa_secret_key: 'esewa_very_secret_key',
    service_role_key: 'service_role_supabase_secret',
    client_secret: 'oauth_client_secret_xyz'
  };

  const redacted = redactSecrets(credentials);
  assert.equal(redacted.esewa_product_code, 'EPAYTEST');
  assert.equal(redacted.esewa_secret_key, REDACTED_VALUE);
  assert.equal(redacted.service_role_key, REDACTED_VALUE);
  assert.equal(redacted.client_secret, REDACTED_VALUE);
});

test('1.8 redactDescription handles plain text with secret key patterns', () => {
  const plainText = 'Clinic config: payment_secret_key="my_secret_999", contact="info@clinic.com"';
  const redacted = redactDescription(plainText);
  assert.ok(redacted.includes(`payment_secret_key="${REDACTED_VALUE}"`));
  assert.ok(redacted.includes('info@clinic.com'));
  assert.equal(redacted.includes('my_secret_999'), false);
});

// ---------------------------------------------------------------------------
// SUITE 2: Tabular Serializer Engine
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: Tabular Serializer Engine (lib/serializer.mjs) ---');

test('2.1 toJSON generates 2-space indented JSON with metadata and record count', () => {
  const records = [
    { id: '1', name: 'Service A', price: 100 },
    { id: '2', name: 'Service B', price: 200 }
  ];

  const jsonStr = toJSON(records, 2);
  assert.ok(jsonStr.includes('  "schema_version": "1.0"'));
  assert.ok(jsonStr.includes('  "count": 2'));
  assert.ok(jsonStr.includes('  "exported_at":'));
  assert.ok(jsonStr.includes('  "records": ['));

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.schema_version, '1.0');
  assert.equal(parsed.count, 2);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].name, 'Service A');
});

test('2.2 toRawJSON serializes raw records without metadata wrapping', () => {
  const records = [{ id: '1', name: 'Raw' }];
  const rawStr = toRawJSON(records, 2);
  const parsed = JSON.parse(rawStr);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].name, 'Raw');
});

test('2.3 toCSV generates RFC 4180 header and row structure', () => {
  const records = [
    { id: 's1', name: 'Consultation', price: 500 },
    { id: 's2', name: 'Blood Test', price: 1200 }
  ];

  const csv = toCSV(records);
  assert.ok(csv.startsWith('id,name,price\r\n'));
  assert.ok(csv.includes('s1,Consultation,500\r\n'));
  assert.ok(csv.includes('s2,Blood Test,1200\r\n'));
});

test('2.4 toCSV properly escapes quotes, commas, and newlines per RFC 4180', () => {
  const records = [
    {
      id: 'rec1',
      notes: 'Doctor said "Rest well, drink fluids"',
      address: 'House #4, Thamel, Kathmandu',
      multiline: 'Line 1\r\nLine 2\nLine 3'
    }
  ];

  const csv = toCSV(records);
  // Quotes escaped as "" and wrapped in "..."
  assert.ok(csv.includes('"Doctor said ""Rest well, drink fluids"""'));
  // Comma wrapped in "..."
  assert.ok(csv.includes('"House #4, Thamel, Kathmandu"'));
  // Multiline wrapped in "..."
  assert.ok(csv.includes('"Line 1\r\nLine 2\nLine 3"'));
});

test('2.5 toCSV serializes complex objects and arrays as valid JSON strings', () => {
  const invoiceRecords = [
    {
      id: 'inv1',
      items: [
        { item_name: 'Consultation', unit_price: 500, quantity: 1 },
        { item_name: 'Lipid Test', unit_price: 1200, quantity: 1 }
      ],
      specialties: ['Cardiology', 'Pediatrics']
    }
  ];

  const csv = toCSV(invoiceRecords);
  // Verify CSV output can be round-tripped and parsed back accurately
  const parsed = parseCSV(csv);
  assert.equal(parsed.length, 1);
  assert.ok(Array.isArray(parsed[0].items));
  assert.equal(parsed[0].items.length, 2);
  assert.equal(parsed[0].items[0].item_name, 'Consultation');
  assert.equal(parsed[0].items[0].unit_price, 500);
  assert.deepEqual(parsed[0].specialties, ['Cardiology', 'Pediatrics']);
});

test('2.6 toCSV handles null and undefined values cleanly as empty fields', () => {
  const records = [
    { id: '1', optional_phone: null, status: 'active', remarks: undefined },
    { id: '2', optional_phone: '+977-98111', status: 'pending', remarks: 'Needs review' }
  ];

  const csv = toCSV(records);
  const parsed = parseCSV(csv);
  assert.equal(parsed[0].id, '1');
  assert.equal(parsed[0].optional_phone, '');
  assert.equal(parsed[0].remarks, '');
  assert.equal(parsed[1].optional_phone, '+977-98111');
});

test('2.7 toCSV round-trip verification with parseCSV', () => {
  const sampleRecords = [
    { id: '1', patient: 'Aarav "The Great"', condition: 'Normal, Stable', score: 98 },
    { id: '2', patient: 'Bikash', condition: 'Checkup required', score: 85 }
  ];

  const csv = toCSV(sampleRecords);
  const parsed = parseCSV(csv);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, '1');
  assert.equal(parsed[0].patient, 'Aarav "The Great"');
  assert.equal(parsed[0].condition, 'Normal, Stable');
  assert.equal(Number(parsed[0].score), 98);
  assert.equal(parsed[1].patient, 'Bikash');
});

test('2.8 toCSV handles empty records and column headers', () => {
  const emptyWithoutCols = toCSV([]);
  assert.equal(emptyWithoutCols, '');

  const emptyWithCols = toCSV([], { columns: ['id', 'name', 'status'] });
  assert.equal(emptyWithCols, 'id,name,status\r\n');
});

test('2.9 toCSV handles single record object', () => {
  const single = { id: 'single-1', name: 'Single Item' };
  const csv = toCSV(single);
  assert.ok(csv.startsWith('id,name\r\n'));
  assert.ok(csv.includes('single-1,Single Item\r\n'));
});

test('2.10 toJSON handles null, primitives, and custom indent', () => {
  assert.equal(toJSON(null), 'null');
  assert.equal(toJSON(123), '123');
  const custom = toJSON({ a: 1 }, 4);
  assert.ok(custom.includes('    "a": 1'));
});

// ---------------------------------------------------------------------------
// SUITE 3: Data Aggregator Engine
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: Data Aggregator Engine (lib/aggregator.mjs) ---');

test('3.1 normalizeTimestamps converts all dates and timestamp fields to ISO 8601 UTC', () => {
  const sample = {
    id: 'rec-1',
    created_at: '2026-10-22 08:30:00+00',
    updated_at: 1729585800000,
    deleted_at: new Date('2026-10-22T08:30:00Z'),
    appointment_time: '10:00:00', // Time string only - should remain or format cleanly
    patient_name: 'Sita',
    nested: {
      called_at: '2026-10-22T09:15:00+05:45'
    }
  };

  const normalized = normalizeTimestamps(sample);
  assert.match(normalized.created_at, ISO_TIMESTAMP_REGEX);
  assert.match(normalized.updated_at, ISO_TIMESTAMP_REGEX);
  assert.match(normalized.deleted_at, ISO_TIMESTAMP_REGEX);
  assert.match(normalized.nested.called_at, ISO_TIMESTAMP_REGEX);
  assert.equal(normalized.patient_name, 'Sita');
});

await runAsyncTest('3.2 extractClinicData partitions all 10 datasets scoped to clinic_id', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const clinicId = 'c1111111-1111-1111-1111-111111111111';

  const data = await aggregator.extractClinicData(clinicId);

  // 1. Clinics
  assert.ok(data.clinic, 'clinic dataset must be present');
  assert.equal(data.clinic.id, clinicId);

  // 2. Services
  assert.ok(Array.isArray(data.services), 'services must be an array');
  assert.ok(data.services.length >= 2);
  assert.equal(data.services[0].clinic_id, clinicId);

  // 3. Catalog
  assert.ok(Array.isArray(data.catalog), 'catalog must be an array');
  assert.ok(data.catalog.length >= 2);
  assert.equal(data.catalog[0].clinic_id, clinicId);

  // 4. Doctors
  assert.ok(Array.isArray(data.doctors), 'doctors must be an array');
  assert.ok(data.doctors.length >= 1);
  assert.equal(data.doctors[0].clinic_id, clinicId);

  // 5. Slots
  assert.ok(Array.isArray(data.slots), 'slots must be an array');
  assert.ok(data.slots.length >= 1);
  assert.equal(data.slots[0].clinic_id, clinicId);

  // 6. Appointments
  assert.ok(Array.isArray(data.appointments), 'appointments must be an array');
  assert.ok(data.appointments.length >= 2);
  assert.equal(data.appointments[0].clinic_id, clinicId);

  // 7. Queue Entries
  assert.ok(Array.isArray(data.queueEntries), 'queueEntries must be an array');
  assert.ok(data.queueEntries.length >= 2);
  assert.equal(data.queueEntries[0].clinic_id, clinicId);

  // 8. Billing Invoices
  assert.ok(Array.isArray(data.billingInvoices), 'billingInvoices must be an array');
  assert.ok(data.billingInvoices.length >= 2);
  assert.equal(data.billingInvoices[0].clinic_id, clinicId);

  // 9. Invoice Transactions (Append-Only Ledger)
  assert.ok(Array.isArray(data.invoiceTransactions), 'invoiceTransactions must be an array');
  assert.ok(data.invoiceTransactions.length >= 2);
  assert.equal(data.invoiceTransactions[0].clinic_id, clinicId);

  // 10. Lab Reports
  assert.ok(Array.isArray(data.labReports), 'labReports must be an array');
  assert.ok(data.labReports.length >= 1);
  assert.equal(data.labReports[0].clinic_id, clinicId);
});

await runAsyncTest('3.3 extractClinicData preserves soft-deleted records', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const data = await aggregator.extractClinicData('c1111111-1111-1111-1111-111111111111');

  // Verify catalog contains soft-deleted item with tombstone
  const deletedCatalogItem = data.catalog.find(item => item.is_deleted === true);
  assert.ok(deletedCatalogItem, 'Must preserve soft-deleted catalog items');
  assert.equal(deletedCatalogItem.is_deleted, true);
  assert.ok(deletedCatalogItem.deleted_at !== null, 'deleted_at must be populated');
  assert.match(deletedCatalogItem.deleted_at, ISO_TIMESTAMP_REGEX);
});

await runAsyncTest('3.4 extractClinicData redacts secrets by default', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const data = await aggregator.extractClinicData('c1111111-1111-1111-1111-111111111111');

  // Direct secrets
  assert.equal(data.clinic.payment_secret_key, REDACTED_VALUE);
  assert.equal(data.clinic.payment_api_key, REDACTED_VALUE);

  // Nested secrets in description
  const parsedDesc = JSON.parse(data.clinic.description);
  assert.equal(parsedDesc.payment_gateways_json.esewa.secret_key, REDACTED_VALUE);
});

await runAsyncTest('3.5 extractMediaTargets extracts valid MediaDownloadTarget descriptors', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const data = await aggregator.extractClinicData('c1111111-1111-1111-1111-111111111111');

  const targets = extractMediaTargets(data);
  assert.ok(Array.isArray(targets));
  assert.ok(targets.length >= 5, `Expected at least 5 media targets, got ${targets.length}`);

  // Check required categories
  const categories = targets.map(t => t.category);
  assert.ok(categories.includes('clinic_photos'), 'Must include clinic_photos');
  assert.ok(categories.includes('clinic_docs'), 'Must include clinic_docs');
  assert.ok(categories.includes('doctor_photos'), 'Must include doctor_photos');
  assert.ok(categories.includes('doctor_kyc'), 'Must include doctor_kyc');
  assert.ok(categories.includes('lab_reports'), 'Must include lab_reports');

  // Check descriptor structure
  for (const t of targets) {
    assert.ok(t.category, 'category is required');
    assert.ok(t.rawUrlOrPath, 'rawUrlOrPath is required');
    assert.ok(t.entityId, 'entityId is required');
    assert.ok(t.defaultFilename, 'defaultFilename is required');
    assert.ok(t.destinationSubdir, 'destinationSubdir is required');
  }
});

await runAsyncTest('3.6 listClinics returns list of clinics with normalized timestamps', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const clinics = await aggregator.listClinics();

  assert.ok(Array.isArray(clinics));
  assert.ok(clinics.length >= 1);
  assert.match(clinics[0].created_at, ISO_TIMESTAMP_REGEX);
  assert.match(clinics[0].updated_at, ISO_TIMESTAMP_REGEX);
});

await runAsyncTest('3.7 extractClinicData with redact=false preserves raw secrets when requested', async () => {
  const aggregator = new DataAggregator({ offline: true });
  const data = await aggregator.extractClinicData('c1111111-1111-1111-1111-111111111111', { redact: false });
  assert.equal(data.clinic.payment_secret_key, 'mock_payment_secret_key_super_secret_999');
});

await runAsyncTest('3.8 extractClinicData with custom mockData executes normalization', async () => {
  const customBundle = {
    clinic: { id: 'c999', name: 'Custom Clinic', created_at: '2026-01-01 12:00:00+00' },
    services: [],
    catalog: [],
    doctors: [],
    slots: [],
    appointments: [],
    queueEntries: [],
    billingInvoices: [],
    invoiceTransactions: [],
    labReports: []
  };
  const aggregator = new DataAggregator();
  const res = await aggregator.extractClinicData('c999', { mockData: customBundle });
  assert.equal(res.clinic.id, 'c999');
  assert.match(res.clinic.created_at, ISO_TIMESTAMP_REGEX);
});

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n====================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL MILESTONE 1 TESTS PASSED SUCCESSFULLY! ✓');
  process.exit(0);
}
