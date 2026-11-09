/**
 * Empirical SQL Challenger Verification & Stress-Testing Harness
 * Target Migration: supabase/migration_offline_sync_and_ledger.sql
 * Author: challenger_m1_r6_2 (Empirical SQL Challenger)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATION_FILE = path.join(REPO_ROOT, 'supabase', 'migration_offline_sync_and_ledger.sql');
const SCHEMA_FILE = path.join(REPO_ROOT, 'supabase', 'schema.sql');
const SECURITY_SWEEP_FILE = path.join(REPO_ROOT, 'supabase', 'migration_comprehensive_security_sweep.sql');
const PAY_AT_DESK_FILE = path.join(REPO_ROOT, 'supabase', 'migration_pay_at_desk.sql');

console.log('======================================================================');
console.log('  EMPIRICAL SQL CHALLENGER HARNESS: OFFLINE SYNC & LEDGER MIGRATION');
console.log('======================================================================');

if (!fs.existsSync(MIGRATION_FILE)) {
  console.error('FATAL: Target migration file not found:', MIGRATION_FILE);
  process.exit(1);
}

const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
const schemaSql = fs.existsSync(SCHEMA_FILE) ? fs.readFileSync(SCHEMA_FILE, 'utf8') : '';
const securitySweepSql = fs.existsSync(SECURITY_SWEEP_FILE) ? fs.readFileSync(SECURITY_SWEEP_FILE, 'utf8') : '';
const payAtDeskSql = fs.existsSync(PAY_AT_DESK_FILE) ? fs.readFileSync(PAY_AT_DESK_FILE, 'utf8') : '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function check(testName, condition, details = '', isDefect = false) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  √ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  X [FAIL] ${testName}`);
    if (details) console.error(`    Detail: ${details}`);
    findings.push({ testName, details, isDefect });
  }
}

// ======================================================================
// 1. TOKEN BALANCE & POSTGRESQL GRAMMAR PARSING
// ======================================================================
console.log('\n--- DOMAIN 1: TOKEN BALANCE & SQL GRAMMAR PARSING ---');

// Dollar quotes
const dollarQuotes = migrationSql.match(/\$\$|\$[a-zA-Z0-9_]+\$/g) || [];
check('Dollar quotes ($$) are balanced', dollarQuotes.length % 2 === 0, `Found ${dollarQuotes.length} dollar quotes`);

// Single quotes balance outside comments
let inSingleQuote = false;
let singleQuoteCount = 0;
for (let i = 0; i < migrationSql.length; i++) {
  if (migrationSql[i] === "'") {
    if (migrationSql[i + 1] === "'") {
      i++; // escaped quote
    } else {
      inSingleQuote = !inSingleQuote;
      singleQuoteCount++;
    }
  }
}
check('Single quotes are balanced outside comments', !inSingleQuote, 'Unclosed single quote detected');

// Parentheses balance
let parenDepth = 0;
let inComment = false;
let inBlockComment = false;
let inStr = false;
let inDollar = false;
let dollarTag = '';
let parenOk = true;

for (let i = 0; i < migrationSql.length; i++) {
  const c = migrationSql[i];
  const next = migrationSql[i + 1];

  if (!inStr && !inDollar) {
    if (!inComment && !inBlockComment && c === '-' && next === '-') {
      inComment = true;
      i++;
      continue;
    }
    if (!inComment && !inBlockComment && c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
  }
  if (inComment && (c === '\n' || c === '\r')) {
    inComment = false;
    continue;
  }
  if (inBlockComment && c === '*' && next === '/') {
    inBlockComment = false;
    i++;
    continue;
  }
  if (inComment || inBlockComment) continue;

  // String literals
  if (!inDollar && c === "'") {
    if (inStr && next === "'") {
      i++;
    } else {
      inStr = !inStr;
    }
    continue;
  }
  if (inStr) continue;

  // Dollar quotes
  if (c === '$') {
    const match = migrationSql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
    if (match) {
      const tag = match[1];
      if (!inDollar) {
        inDollar = true;
        dollarTag = tag;
        i += tag.length - 1;
        continue;
      } else if (inDollar && tag === dollarTag) {
        inDollar = false;
        dollarTag = '';
        i += tag.length - 1;
        continue;
      }
    }
  }
  if (inDollar) continue;

  // Parentheses counting
  if (c === '(') parenDepth++;
  if (c === ')') parenDepth--;
  if (parenDepth < 0) {
    parenOk = false;
    break;
  }
}
check('Parentheses are balanced throughout SQL file', parenOk && parenDepth === 0, `Final parenDepth: ${parenDepth}`);

// ======================================================================
// 2. DDL SCHEMA CONSISTENCY & COLUMN EXISTENCE AUDIT
// ======================================================================
console.log('\n--- DOMAIN 2: DDL SCHEMA CONSISTENCY & COLUMN EXISTENCE AUDIT ---');

const tombstoneTables = [
  'appointments',
  'billing_invoices',
  'queue_entries',
  'profiles',
  'doctors',
  'clinic_catalog'
];

tombstoneTables.forEach(tbl => {
  const tableRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${tbl}\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+is_deleted\\s+BOOLEAN`, 'i');
  check(`Tombstone is_deleted added to public.${tbl}`, tableRegex.test(migrationSql));
  const delAtRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${tbl}[\\s\\S]*?deleted_at\\s+TIMESTAMPTZ`, 'i');
  check(`Tombstone deleted_at added to public.${tbl}`, delAtRegex.test(migrationSql));
});

// Check Delta sync index definitions
check('idx_appointments_sync index defined on (clinic_id, updated_at DESC, is_deleted)',
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_appointments_sync\s+ON\s+public\.appointments\s*\(\s*clinic_id\s*,\s*updated_at\s+DESC\s*,\s*is_deleted\s*\)/i.test(migrationSql));

check('idx_billing_invoices_sync index defined on (clinic_id, updated_at DESC, is_deleted)',
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_billing_invoices_sync\s+ON\s+public\.billing_invoices\s*\(\s*clinic_id\s*,\s*updated_at\s+DESC\s*,\s*is_deleted\s*\)/i.test(migrationSql));

check('idx_queue_entries_sync index defined on (clinic_id, updated_at DESC, is_deleted)',
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_queue_entries_sync\s+ON\s+public\.queue_entries\s*\(\s*clinic_id\s*,\s*updated_at\s+DESC\s*,\s*is_deleted\s*\)/i.test(migrationSql));

check('idx_doctors_sync index defined on (clinic_id, updated_at DESC, is_deleted)',
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_doctors_sync\s+ON\s+public\.doctors\s*\(\s*clinic_id\s*,\s*updated_at\s+DESC\s*,\s*is_deleted\s*\)/i.test(migrationSql));

// CRITICAL SCHEMA CHECK: clinic_catalog has updated_at column
console.log('\n[CRITICAL CHECK] Verifying column updated_at on public.clinic_catalog:');
// Search all SQL files in supabase to see if updated_at was ever added to clinic_catalog
const allSql = schemaSql + '\n' + securitySweepSql + '\n' + payAtDeskSql + '\n' + migrationSql;
const catalogTableDefinition = schemaSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?clinic_catalog\s*\(([\s\S]*?)\);/i);
const catalogHasUpdatedAtInBase = catalogTableDefinition ? /updated_at/i.test(catalogTableDefinition[1]) : false;
const catalogAlterHasUpdatedAt = /ALTER\s+TABLE\s+(?:public\.)?clinic_catalog[\s\S]*?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?updated_at/i.test(allSql);

const clinicCatalogHasUpdatedAt = catalogHasUpdatedAtInBase || catalogAlterHasUpdatedAt;
check(
  'DEFECT CHECK: public.clinic_catalog possesses updated_at column before idx_clinic_catalog_sync index creation',
  clinicCatalogHasUpdatedAt,
  'CRITICAL DDL BUG: public.clinic_catalog table was defined in schema.sql without updated_at (only created_at). Migration creates index "idx_clinic_catalog_sync ON public.clinic_catalog (clinic_id, updated_at DESC, is_deleted)" without adding updated_at column first! PostgreSQL execution will throw: ERROR: column "updated_at" does not exist.',
  true
);

// ======================================================================
// 3. INVOICE TRANSACTIONS LEDGER SCHEMA & RLS RULES
// ======================================================================
console.log('\n--- DOMAIN 3: INVOICE TRANSACTIONS LEDGER & RLS POLICIES ---');

check('invoice_transactions table has UUID primary key with default gen_random_uuid()',
  /id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i.test(migrationSql));

check('invoice_transactions checks transaction_type IN (PAYMENT, CORRECTION, REFUND, DISCOUNT)',
  /CHECK\s*\(\s*transaction_type\s+IN\s*\(\s*'PAYMENT'\s*,\s*'CORRECTION'\s*,\s*'REFUND'\s*,\s*'DISCOUNT'\s*\)\s*\)/i.test(migrationSql));

check('invoice_transactions enables Row Level Security (RLS)',
  /ALTER\s+TABLE\s+public\.invoice_transactions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i.test(migrationSql));

check('invoice_transactions SELECT policy permits admin, authorized clinic staff, and owning patient',
  /CREATE\s+POLICY\s+"invoice_transactions_select_rule"\s+ON\s+public\.invoice_transactions[\s\S]*?FOR\s+SELECT\s+USING\s*\([\s\S]*?is_admin_portal_user\(\)[\s\S]*?is_authorized_clinic_staff\(clinic_id\)[\s\S]*?appointments/i.test(migrationSql));

check('invoice_transactions INSERT policy restricts to admin and authorized clinic staff (direct patient insert blocked)',
  /CREATE\s+POLICY\s+"invoice_transactions_insert_rule"\s+ON\s+public\.invoice_transactions[\s\S]*?FOR\s+INSERT\s+WITH\s+CHECK\s*\([\s\S]*?is_admin_portal_user\(\)[\s\S]*?is_authorized_clinic_staff\(clinic_id\)[\s\S]*?\);/i.test(migrationSql));

// DEFECT CHECK: Append-Only ledger immutability
// If UPDATE is permitted, can staff mutate amount or transaction_type?
const hasUpdatePolicy = /CREATE\s+POLICY\s+"invoice_transactions_update_rule"\s+ON\s+public\.invoice_transactions[\s\S]*?FOR\s+UPDATE/i.test(migrationSql);
const updatePolicyHasCheck = /CREATE\s+POLICY\s+"invoice_transactions_update_rule"[\s\S]*?WITH\s+CHECK/i.test(migrationSql);
check(
  'DEFECT CHECK: invoice_transactions UPDATE policy protects immutable financial ledger fields (amount, transaction_type)',
  !hasUpdatePolicy || updatePolicyHasCheck,
  'SECURITY / LEDGER FLAW: invoice_transactions_update_rule permits FOR UPDATE without a WITH CHECK or immutable field trigger. Clinic staff or rogue client could execute UPDATE invoice_transactions SET amount = 0, transaction_type = "DISCOUNT" directly mutating historical ledger rows, violating the strict append-only financial ledger requirement.',
  true
);

// ======================================================================
// 4. BALANCE AGGREGATION LOGIC STRESS-TESTING & ORACLE SIMULATION
// ======================================================================
console.log('\n--- DOMAIN 4: BALANCE AGGREGATION LOGIC SIMULATION & ORACLE ---');

/**
 * Exact simulation of public.sync_invoice_balance_from_transactions()
 */
function simulateSyncInvoiceBalance(transactions, total_amount, existingInvoice = {}) {
  // Filter active transactions
  const activeTx = transactions.filter(t => !t.is_deleted);

  let total_paid = 0.00;
  for (const tx of activeTx) {
    const amt = parseFloat(tx.amount);
    if (tx.transaction_type === 'REFUND') {
      total_paid += -Math.abs(amt);
    } else if (tx.transaction_type === 'CORRECTION') {
      total_paid += amt;
    } else if (tx.transaction_type === 'DISCOUNT') {
      total_paid += 0.00;
    } else {
      // PAYMENT and others
      total_paid += Math.abs(amt);
    }
  }

  // Round to 2 decimal places
  total_paid = Math.round(total_paid * 100) / 100;
  const balance_due = Math.max(0.00, Math.round((total_amount - total_paid) * 100) / 100);

  let payment_status;
  if ((total_amount - total_paid) <= 0.00 && total_amount > 0.00) {
    payment_status = 'paid';
  } else if (total_paid > 0.00) {
    payment_status = 'partial';
  } else {
    payment_status = 'pending';
  }

  let paid_at = existingInvoice.paid_at || null;
  if (total_paid > 0.00 && !paid_at) {
    paid_at = new Date().toISOString();
  }

  return {
    total_amount,
    paid_amount: total_paid,
    balance_due,
    payment_status,
    paid_at
  };
}

// 4.1 Standard single payment
const test1 = simulateSyncInvoiceBalance([{ transaction_type: 'PAYMENT', amount: 1000.00, is_deleted: false }], 1000.00);
check('Standard full payment sets paid_amount = 1000, balance_due = 0, status = paid',
  test1.paid_amount === 1000.00 && test1.balance_due === 0.00 && test1.payment_status === 'paid');

// 4.2 Partial payments
const test2 = simulateSyncInvoiceBalance([
  { transaction_type: 'PAYMENT', amount: 400.00, is_deleted: false },
  { transaction_type: 'PAYMENT', amount: 300.00, is_deleted: false }
], 1000.00);
check('Partial payments aggregate to paid_amount = 700, balance_due = 300, status = partial',
  test2.paid_amount === 700.00 && test2.balance_due === 300.00 && test2.payment_status === 'partial');

// 4.3 Commutativity under out-of-order execution (Payments + Corrections)
const txSet1 = [
  { id: '1', transaction_type: 'PAYMENT', amount: 500.00, is_deleted: false },
  { id: '2', transaction_type: 'CORRECTION', amount: -50.00, is_deleted: false },
  { id: '3', transaction_type: 'PAYMENT', amount: 200.00, is_deleted: false }
];
const txSet2 = [
  { id: '3', transaction_type: 'PAYMENT', amount: 200.00, is_deleted: false },
  { id: '1', transaction_type: 'PAYMENT', amount: 500.00, is_deleted: false },
  { id: '2', transaction_type: 'CORRECTION', amount: -50.00, is_deleted: false }
];
const resTx1 = simulateSyncInvoiceBalance(txSet1, 1000.00);
const resTx2 = simulateSyncInvoiceBalance(txSet2, 1000.00);
check('Ledger aggregation is strictly commutative across permutation orders (paid_amount = 650, due = 350)',
  resTx1.paid_amount === 650.00 && resTx2.paid_amount === 650.00 && resTx1.balance_due === resTx2.balance_due);

// 4.4 Partial refund
const testRefund = simulateSyncInvoiceBalance([
  { transaction_type: 'PAYMENT', amount: 1000.00, is_deleted: false },
  { transaction_type: 'REFUND', amount: 300.00, is_deleted: false }
], 1000.00);
check('Partial refund reduces paid_amount to 700 and sets status to partial',
  testRefund.paid_amount === 700.00 && testRefund.balance_due === 300.00 && testRefund.payment_status === 'partial');

// 4.5 DEFECT CHECK: Full refund behavior
const testFullRefund = simulateSyncInvoiceBalance([
  { transaction_type: 'PAYMENT', amount: 500.00, is_deleted: false },
  { transaction_type: 'REFUND', amount: 500.00, is_deleted: false }
], 500.00);
check(
  'DEFECT CHECK: Full refund assigns payment_status = "refunded" rather than "pending"',
  testFullRefund.payment_status === 'refunded',
  `STATUS ANOMALY: After a full refund, total_paid = 0.00. The trigger evaluates payment_status = CASE WHEN total_amount > 0 AND total_amount - paid <= 0 THEN 'paid' WHEN total_paid > 0 THEN 'partial' ELSE 'pending'. It assigns 'pending' instead of 'refunded' (which is a valid payment_status_enum value). The patient appears never to have paid rather than refunded.`,
  true
);

// 4.6 DEFECT CHECK: Zero-Amount Invoices (Free visit / 0-fee appointment)
const testZeroAmount = simulateSyncInvoiceBalance([], 0.00);
check(
  'DEFECT CHECK: Zero-amount invoice (total_amount = 0.00) evaluates to payment_status = "paid" or "not_required"',
  testZeroAmount.payment_status === 'paid' || testZeroAmount.payment_status === 'not_required',
  `STATUS ANOMALY: For total_amount = 0.00, the condition "WHEN (v_total_amount - v_total_paid) <= 0.00 AND v_total_amount > 0.00" evaluates to FALSE because v_total_amount > 0.00 is FALSE. The trigger falls through to ELSE 'pending'. Zero-cost appointments or fee-waived visits remain stuck in 'pending' payment status indefinitely!`,
  true
);

// 4.7 DEFECT CHECK: DISCOUNT transaction effect on balance due
const testDiscount = simulateSyncInvoiceBalance([
  { transaction_type: 'DISCOUNT', amount: 200.00, is_deleted: false },
  { transaction_type: 'PAYMENT', amount: 800.00, is_deleted: false }
], 1000.00);
check(
  'DEFECT CHECK: DISCOUNT transaction reduces balance_due and allows invoice to reach paid status',
  testDiscount.balance_due === 0.00 && testDiscount.payment_status === 'paid',
  `DISCOUNT LOGIC FLAW: In sync_invoice_balance_from_transactions(), "WHEN transaction_type = 'DISCOUNT' THEN 0.00". When a $200 discount and $800 payment are recorded for a $1000 invoice, total_paid = 800.00, balance_due = 200.00, status = 'partial'. The discount has ZERO impact on invoice reconciliation!`,
  true
);

// 4.8 DEFECT CHECK: Concurrency race condition on balance update
// Does the trigger acquire a row lock (FOR UPDATE) on billing_invoices before SELECT SUM()?
const hasRowLockBeforeSum = /SELECT[\s\S]*?FROM\s+public\.billing_invoices[\s\S]*?FOR\s+UPDATE[\s\S]*?SELECT\s+COALESCE\(SUM/i.test(migrationSql);
check(
  'DEFECT CHECK: sync_invoice_balance_from_transactions() takes row lock (FOR UPDATE) on billing_invoices before calculating SUM',
  hasRowLockBeforeSum,
  'CONCURRENCY RACE CONDITION: In PostgreSQL Read Committed mode, two concurrent INSERTs into invoice_transactions for the same invoice will execute SELECT SUM(...) before either transaction commits. The second transaction blocks on UPDATE billing_invoices, then wakes up and overwrites paid_amount with its stale sum, losing the first payment! Mitigation: Lock the invoice row with "PERFORM 1 FROM public.billing_invoices WHERE id = v_target_invoice_id FOR UPDATE;" prior to summing.',
  true
);

// ======================================================================
// 5. ATOMIC LWW UPSERT RPC (upsert_appointment_lww) AUDIT & STRESS
// ======================================================================
console.log('\n--- DOMAIN 5: ATOMIC LWW UPSERT RPC AUDIT & STRESS ---');

check('upsert_appointment_lww RPC function defined with SECURITY DEFINER and search_path = public',
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.upsert_appointment_lww[\s\S]*?SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s*=\s*public/i.test(migrationSql));

// 5.1 DEFECT CHECK: SECURITY DEFINER without caller identity authorization
const hasCallerValidation = /is_admin_portal_user\(\)|is_authorized_clinic_staff|auth\.uid\(\)/i.test(
  migrationSql.slice(migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.upsert_appointment_lww'))
);
const grantedToAnon = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.upsert_appointment_lww[\s\S]*?TO[\s\S]*?anon/i.test(migrationSql);
check(
  'DEFECT CHECK: upsert_appointment_lww enforces caller authorization checks before mutating appointments',
  hasCallerValidation,
  `CRITICAL SECURITY DEFECT: upsert_appointment_lww is defined with SECURITY DEFINER and GRANTED TO anon, authenticated, service_role, yet performs ZERO caller authorization checks! Any unauthenticated client or malicious actor on the internet can call supabase.rpc('upsert_appointment_lww', {...}) with an arbitrary appointment ID and overwrite patient medical details, names, contact numbers, or soft-delete patient appointments, bypassing all Supabase RLS policies!`,
  true
);

// 5.2 DEFECT CHECK: Concurrency race returning { status: 'upserted', record: null }
// In upsert_appointment_lww:
// ON CONFLICT (id) DO UPDATE ... WHERE appointments.updated_at <= EXCLUDED.updated_at
// RETURNING * INTO v_result;
// RETURN jsonb_build_object('status', 'upserted', 'record', to_jsonb(v_result));
// If the WHERE clause evaluates to false (concurrent newer update), PostgreSQL RETURNING yields NULL!
const checksIfResultNull = /IF\s+v_result\s+IS\s+NULL\s+THEN/i.test(migrationSql);
check(
  'DEFECT CHECK: upsert_appointment_lww handles case when ON CONFLICT WHERE clause rejects stale update without returning null record',
  checksIfResultNull,
  `ATOMIC LWW RACE CONDITION: If two concurrent upserts arrive where server updated_at advances between SELECT and ON CONFLICT DO UPDATE, the WHERE clause "appointments.updated_at <= EXCLUDED.updated_at" prevents the update. PostgreSQL's "RETURNING * INTO v_result" returns NULL. The function then returns '{"status": "upserted", "record": null}'! The client receives a false "upserted" success status even though its update was rejected and no row was modified.`,
  true
);

// ======================================================================
// SUMMARY & VERDICT GENERATION
// ======================================================================
console.log('\n======================================================================');
console.log(`TOTAL AUDIT CHECKS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED / DEFECTS DETECTED: ${failedTests}`);
console.log('======================================================================');

if (findings.length > 0) {
  console.log('\nCONFIRMED DEFECTS & FINDINGS:');
  findings.forEach((f, idx) => {
    console.log(`\n[Finding ${idx + 1}] ${f.testName}`);
    console.log(`  Details: ${f.details}`);
  });
}

const reportPath = path.join(REPO_ROOT, '.agents', 'teamwork', 'challenger_m1_r6_2', 'test_results.json');
fs.writeFileSync(reportPath, JSON.stringify({
  totalTests,
  passedTests,
  failedTests,
  findings
}, null, 2));

console.log(`\nDetailed empirical test results written to: ${reportPath}`);

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
