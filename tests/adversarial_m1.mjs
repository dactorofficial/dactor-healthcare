import { redactSecrets, isSensitiveKey, redactDescription } from '../scripts/backup/lib/redactor.mjs';
import { toJSON, toRawJSON, toCSV, parseCSV } from '../scripts/backup/lib/serializer.mjs';
import { DataAggregator, normalizeTimestamps, createMockClinicBundle, extractMediaTargets } from '../scripts/backup/lib/aggregator.mjs';

console.log('=============================================');
console.log('ADVERSARIAL STRESS TEST SUITE (REVIEWER 2)');
console.log('=============================================');

// Test 1: Unquoted plaintext secret in description
console.log('\n--- 1. Plaintext Secret In Description ---');
const t1_quoted = 'Notes: payment_secret_key="mysecret123" and esewa_secret_key="anothersecret456"';
const t1_unquoted = 'Notes: payment_secret_key=mysecret123 and esewa_secret_key: anothersecret456';
console.log('Quoted output:   ', redactDescription(t1_quoted));
console.log('Unquoted output: ', redactDescription(t1_unquoted));
const t1_leak = redactDescription(t1_unquoted).includes('mysecret123');
console.log('Unquoted secret leaked:', t1_leak);

// Test 2: Sensitive key naming variations
console.log('\n--- 2. Sensitive Key Sensitivity Variations ---');
const keyChecks = [
  'payment_secret_key',
  'PAYMENT_SECRET_KEY',
  '  payment_secret_key  ',
  'payment_api_key',
  'esewa_secret_key',
  'esewasecretkey',
  'secret_key',
  'secretkey',
  'secret',
  'api_key',
  'apikey',
  'apiKey',
  'private_key',
  'privatekey',
  'privateKey',
  'access_token',
  'accessToken',
  'auth_token',
  'authToken',
  'password',
  'merchant_secret',
  'service_role_key',
  'service_role'
];
for (const k of keyChecks) {
  console.log(`  ${k.padEnd(25)}: ${isSensitiveKey(k)}`);
}

// Test 3: Diamond DAG Reference (shared sub-object across multiple properties)
console.log('\n--- 3. Diamond DAG Reference in redactSecrets ---');
const sharedService = { service_name: 'Consultation', price: 500 };
const diamondBundle = {
  serviceA: sharedService,
  serviceB: sharedService
};
const redactedDiamond = redactSecrets(diamondBundle);
console.log('Diamond output:', JSON.stringify(redactedDiamond));
console.log('Is serviceB marked [Circular]?', redactedDiamond.serviceB === '[Circular]');

// Test 4: Circular Reference in normalizeTimestamps
console.log('\n--- 4. Circular Reference in normalizeTimestamps ---');
try {
  const circularRecord = { id: 'c1', created_at: '2026-10-22T08:00:00Z' };
  circularRecord.self = circularRecord;
  normalizeTimestamps(circularRecord);
  console.log('normalizeTimestamps circular handling: PASSED');
} catch (err) {
  console.log('normalizeTimestamps circular handling FAILED:', err.name, '-', err.message);
}

// Test 5: Circular Reference in DataAggregator.extractClinicData
console.log('\n--- 5. Circular Reference in extractClinicData ---');
try {
  const aggregator = new DataAggregator({ offline: true });
  const mockBundle = createMockClinicBundle();
  mockBundle.clinic.self = mockBundle.clinic;
  await aggregator.extractClinicData('c1111111-1111-1111-1111-111111111111', { mockData: mockBundle });
  console.log('extractClinicData circular handling: PASSED');
} catch (err) {
  console.log('extractClinicData circular handling FAILED:', err.name, '-', err.message);
}

// Test 6: Time-only strings in normalizeTimestamps
console.log('\n--- 6. Time-only Strings in normalizeTimestamps ---');
const timeOnlyObj = {
  appointment_time: '10:00:00',
  start_time: '09:00:00',
  end_time: '12:00:00',
  created_at: '2026-10-22 08:30:00+00'
};
const normalizedTimes = normalizeTimestamps(timeOnlyObj);
console.log('appointment_time:', normalizedTimes.appointment_time);
console.log('start_time:      ', normalizedTimes.start_time);
console.log('created_at:      ', normalizedTimes.created_at);

// Test 7: CSV Null and Undefined Robustness
console.log('\n--- 7. CSV Boundary & Null Robustness ---');
console.log('toCSV(null):            ', JSON.stringify(toCSV(null)));
console.log('toCSV(undefined):       ', JSON.stringify(toCSV(undefined)));
console.log('toCSV([]):              ', JSON.stringify(toCSV([])));
console.log('toCSV([null, undefined]):', JSON.stringify(toCSV([null, undefined])));
console.log('toCSV([{ a: null, b: undefined }]):', JSON.stringify(toCSV([{ a: null, b: undefined }])));

// Test 8: Malicious & Broken Inputs to Serializers
console.log('\n--- 8. Malicious & Broken Inputs to Serializers ---');
const maliciousRecord = {
  id: 'rec_1',
  injection: '=cmd|\'/C calc\'!A0',
  multiline_quotes: 'Line 1\r\n"Quotes" and \', commas',
  nested_null: { x: null, y: [undefined, { z: 'val' }] }
};
const csvMalicious = toCSV([maliciousRecord]);
console.log('Serialized CSV:\n' + csvMalicious);
const parsedBack = parseCSV(csvMalicious);
console.log('Parsed back successfully:', parsedBack.length === 1 && parsedBack[0].id === 'rec_1');

// Test 9: Corrupted JSON in description during redactSecrets
console.log('\n--- 9. Corrupted JSON in description ---');
const corruptedClinic = {
  id: 'c1',
  description: '{"unclosed_json": true, "payment_secret_key": "secret_in_broken_json"'
};
const redactedCorrupted = redactSecrets(corruptedClinic);
console.log('Corrupted description output:', redactedCorrupted.description);
const leakedInCorrupted = redactedCorrupted.description.includes('secret_in_broken_json');
console.log('Secret leaked in corrupted description?', leakedInCorrupted);

console.log('\n=============================================');
console.log('ADVERSARIAL STRESS TEST COMPLETE');
console.log('=============================================');
