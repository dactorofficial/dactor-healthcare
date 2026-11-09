import { isSensitiveKey, redactSecrets } from './lib/redactor.mjs';
import { normalizeTimestamps } from './lib/aggregator.mjs';

console.log('=== EMPIRICAL REPRODUCTION OF FINDINGS ===\n');

console.log('--- REPRO 1: Key Variations Bypass ---');
console.log('isSensitiveKey("privateKey"):', isSensitiveKey('privateKey'));
console.log('isSensitiveKey("payment-secret-key"):', isSensitiveKey('payment-secret-key'));
console.log('isSensitiveKey("esewa-secret-key"):', isSensitiveKey('esewa-secret-key'));
console.log('isSensitiveKey("clientSecret"):', isSensitiveKey('clientSecret'));
console.log('isSensitiveKey("merchantSecret"):', isSensitiveKey('merchantSecret'));
console.log('isSensitiveKey("accessToken"):', isSensitiveKey('accessToken'));

console.log('\n--- REPRO 2: Remarks / Notes Secret Leak ---');
const invoice = { id: 'i1', remarks: 'Payment note: payment_secret_key="top_secret_123"' };
const redactedInvoice = redactSecrets(invoice);
console.log('Original remarks:', invoice.remarks);
console.log('Redacted remarks:', redactedInvoice.remarks);
console.log('Leaked secret in remarks?:', redactedInvoice.remarks.includes('top_secret_123'));

const transaction = { id: 'tx1', notes: 'Gateway secret_key="gateway_sec_456"' };
const redactedTx = redactSecrets(transaction);
console.log('Original transaction notes:', transaction.notes);
console.log('Redacted transaction notes:', redactedTx.notes);
console.log('Leaked secret in notes?:', redactedTx.notes.includes('gateway_sec_456'));

console.log('\n--- REPRO 3: normalizeTimestamps Circular Overflow ---');
const circ = { id: 'c1' };
circ.self = circ;
try {
  normalizeTimestamps(circ);
  console.log('Did not throw');
} catch (e) {
  console.log('normalizeTimestamps circular error caught:', e.name, '-', e.message);
}

console.log('\n--- REPRO 4: normalizeTimestamps Invalid Date Throw ---');
try {
  normalizeTimestamps({ created_at: new Date('invalid') });
  console.log('Did not throw');
} catch (e) {
  console.log('normalizeTimestamps invalid Date error caught:', e.name, '-', e.message);
}

console.log('\n--- REPRO 5: DAG Shared Reference Corruption ---');
const shared = { name: 'Shared Contact', phone: '123' };
const root = { primary: shared, secondary: shared };
const redRoot = redactSecrets(root);
console.log('redRoot.primary:', redRoot.primary);
console.log('redRoot.secondary:', redRoot.secondary);
console.log('Is secondary incorrectly marked [Circular]?:', redRoot.secondary === '[Circular]');
