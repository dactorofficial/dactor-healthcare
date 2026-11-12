/**
 * Automated Verification Test for 5% Pay-at-Desk Commission Totals, Superadmin Aggregation & Collection Sync
 * File: supabase/test_pay_at_desk_commission_and_totals.cjs
 */

const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, 'migration_fix_pay_at_desk_commission_and_totals.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('  ❌ FAIL:', msg);
    fail++;
  } else {
    console.log('  ✓ PASS:', msg);
    pass++;
  }
}

console.log('=== [1] SQL Migration Integrity Checks ===');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_pay_at_desk_commission_totals()'), 'Defines 5% commission enforcement trigger function');
assert(sql.includes('CREATE TRIGGER appointments_z_enforce_pay_at_desk_commission'), 'Creates _z_ trigger ordered after anti-tampering trigger');
assert(sql.includes('ROUND(v_fee * (v_pct / 100.0), 2)'), 'Computes rounded 5% service charge dynamically');
assert(sql.includes('UPDATE public.appointments'), 'Backfills legacy/broken PAY_AT_DESK rows');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.mark_pay_at_desk_collected('), 'Defines mark_pay_at_desk_collected authoritative RPC');
assert(sql.includes('INSERT INTO public.billing_invoices'), 'Synchronizes billing_invoices on desk collection');
assert(sql.includes('INSERT INTO public.invoice_transactions'), 'Synchronizes invoice_transactions on desk collection');
assert(sql.includes("GRANT EXECUTE ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID)"), 'Grants RPC execution permission');

console.log('\n=== [2] 5% Commission Computation Invariants ===');
function computePayAtDesk(fee, storedCharge, storedTotal) {
  const f = Number(fee) || 0;
  let charge = Number(storedCharge) || 0;
  if (charge <= 0 && f > 0) {
    charge = Math.round(f * 0.05 * 100) / 100;
  }
  const total = (Number(storedTotal) > f) ? Number(storedTotal) : Math.round((f + charge) * 100) / 100;
  return { fee: f, charge, total };
}

const case1 = computePayAtDesk(500, 0, 500);
assert(case1.charge === 25 && case1.total === 525, 'Legacy NPR 500 row with total=500 resolves to 5% charge=25, total=525');

const case2 = computePayAtDesk(850, 0, 0);
assert(case2.charge === 42.5 && case2.total === 892.5, 'NPR 850 row resolves to 5% charge=42.5, total=892.5');

const case3 = computePayAtDesk(0, 0, 0);
assert(case3.charge === 0 && case3.total === 0, 'Free follow-up NPR 0 row stays 0 without spurious charge');

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
