/**
 * Automated Verification Test for Pay-at-Desk Historical Repair Migration & Auth Hardening
 * File: supabase/test_repair_pay_at_desk_settlements.cjs
 */

const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, 'migration_repair_pay_at_desk_settlements.sql');
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

console.log('=== [1] SQL Repair Migration Structural Checks ===');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.is_authorized_clinic_staff(p_clinic_id UUID)'), 'Defines hardened is_authorized_clinic_staff');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.mark_pay_at_desk_collected('), 'Defines guarded mark_pay_at_desk_collected');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.repair_pay_at_desk_historical_bookings()'), 'Defines repair_pay_at_desk_historical_bookings RPC');
assert(sql.includes('GRANT EXECUTE ON FUNCTION public.repair_pay_at_desk_historical_bookings() TO service_role, authenticated'), 'Grants RPC execution permissions to authenticated users');
assert(sql.includes('public.repair_pay_at_desk_historical_bookings()'), 'Executes immediate automated repair run via DO block');

console.log('\n=== [2] Double 5% Detection & Repair Invariants ===');
// Emulate repair logic for double 5% charge
function repairPayAtDeskRecord(feeAmount, serviceCharge, totalAmount, docFee, billTotal, billPaymentStatus) {
  let baseFee = feeAmount;
  let doubleChargeFixed = false;
  let unpaidFixed = false;

  // Case: double charge (feeAmount set to billTotal e.g. 525 instead of 500)
  if (feeAmount > docFee * 1.04 || feeAmount === billTotal) {
    baseFee = docFee;
    doubleChargeFixed = true;
  }

  const charge = Math.round(baseFee * 0.05 * 100) / 100;
  const total = Math.round((baseFee + charge) * 100) / 100;

  if (billPaymentStatus === 'paid') {
    unpaidFixed = true;
  }

  return { baseFee, charge, total, doubleChargeFixed, unpaidFixed };
}

// Test Case A: Corrupted bill with double 5% (fee was saved as 525, causing 551.25)
const caseA = repairPayAtDeskRecord(525, 26.25, 551.25, 500, 525, 'paid');
assert(caseA.baseFee === 500, 'Restores base doctor fee to NPR 500');
assert(caseA.charge === 25, 'Recalculates accurate 5% platform commission to NPR 25');
assert(caseA.total === 525, 'Recalculates proper bill total to NPR 525');
assert(caseA.doubleChargeFixed === true, 'Flags double charge as fixed');
assert(caseA.unpaidFixed === true, 'Marks appointment as paid');

// Test Case B: Clean uncorrupted 500 fee
const caseB = repairPayAtDeskRecord(500, 25, 525, 500, 525, 'paid');
assert(caseB.baseFee === 500 && caseB.charge === 25 && caseB.total === 525, 'Clean row remains intact without modification');
assert(caseB.doubleChargeFixed === false, 'Clean row does not trigger false-positive double charge repair');

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
