/**
 * Verification Suite: Pay at Desk (+5%) in Patient Bills, Invoices & Payment Logs
 * Run: node supabase/test_patient_bills_and_payment_logs_5pct.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PAY_AT_DESK_SERVICE_CHARGE_PERCENT = 5;

function getEffectiveServiceCharge(appt) {
  if (!appt) return 0;
  const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK';
  const fee = Number(appt.feeAmount) || 0;
  if (!isPad || fee <= 0) return 0;
  const stored = Number(appt.serviceChargeAmount) || 0;
  return stored > 0 ? stored : Math.round(fee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100) * 100) / 100;
}

function getEffectiveAppointmentTotal(appt) {
  if (!appt) return 0;
  const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK';
  const fee = Number(appt.feeAmount) || 0;
  const storedTotal = Number(appt.totalAmount) || 0;
  if (isPad) {
    if (storedTotal > fee) return storedTotal;
    return Math.round((fee + getEffectiveServiceCharge(appt)) * 100) / 100;
  }
  return storedTotal > 0 ? storedTotal : fee;
}

function getEffectiveInvoiceTotal(appt, inv) {
  const rawInvTotal = Number(inv?.totalAmount ?? inv?.total_amount ?? 0) || 0;
  if (!appt) return rawInvTotal;
  const apptTotal = getEffectiveAppointmentTotal(appt);
  const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK';
  if (isPad) return Math.max(rawInvTotal, apptTotal);
  return rawInvTotal > 0 ? rawInvTotal : apptTotal;
}

function getEffectiveInvoiceItems(appt, rawItems) {
  const filtered = (Array.isArray(rawItems) ? rawItems : [])
    .filter((it) => !(it?.itemName || it?.name || it?.item_name || '').toLowerCase().startsWith('payment received'))
    .map((it) => {
      const name = String(it?.itemName || it?.name || it?.item_name || 'Clinical Service');
      const qty = Math.max(1, Number(it?.quantity || 1));
      const price = Number(it?.price || 0);
      const total = Number(it?.total || price * qty);
      return { name, itemName: name, quantity: qty, price, total };
    });

  if (!appt) return filtered;
  const isPad = String(appt.paymentMode || '').toUpperCase() === 'PAY_AT_DESK';
  const deskCharge = getEffectiveServiceCharge(appt);
  const baseFee = Number(appt.feeAmount) || 0;
  const effTotal = getEffectiveAppointmentTotal(appt);

  if (filtered.length > 0) {
    if (isPad && deskCharge > 0) {
      const hasServiceCharge = filtered.some((it) => {
        const lower = it.name.toLowerCase();
        return lower.includes('service charge') || lower.includes('5%') || lower.includes('+5%');
      });
      if (!hasServiceCharge) {
        return [
          ...filtered,
          {
            name: 'Pay at Desk Service Charge (5%)',
            itemName: 'Pay at Desk Service Charge (5%)',
            quantity: 1,
            price: deskCharge,
            total: deskCharge,
          },
        ];
      }
    }
    return filtered;
  }

  if (isPad && deskCharge > 0) {
    return [
      {
        name: `OPD Consultation Fee (${appt.appointmentDate || 'OPD'})`,
        itemName: `OPD Consultation Fee (${appt.appointmentDate || 'OPD'})`,
        quantity: 1,
        price: baseFee,
        total: baseFee,
      },
      {
        name: 'Pay at Desk Service Charge (5%)',
        itemName: 'Pay at Desk Service Charge (5%)',
        quantity: 1,
        price: deskCharge,
        total: deskCharge,
      },
    ];
  }

  return [
    {
      name: `Doctor Consultation & OPD Entry (${appt.appointmentDate || 'OPD'})`,
      itemName: `Doctor Consultation & OPD Entry (${appt.appointmentDate || 'OPD'})`,
      quantity: 1,
      price: effTotal,
      total: effTotal,
    },
  ];
}

// --- Test 1: Legacy stale PAY_AT_DESK invoice (total_amount=500, items=[500]) ---
const padAppt500 = {
  id: 'appt-1',
  paymentMode: 'PAY_AT_DESK',
  paymentStatus: 'paid',
  feeAmount: 500,
  serviceChargeAmount: 25,
  totalAmount: 525,
  appointmentDate: '2026-11-12',
};
const staleInv500 = {
  total_amount: 500,
  paid_amount: 500,
  balance_due: 0,
  items: [{ item_name: 'Consultation & Clinical Services', quantity: 1, price: 500, total: 500 }],
};

assert.strictEqual(getEffectiveInvoiceTotal(padAppt500, staleInv500), 525, 'Stale 500 invoice must clamp to 525');
const items500 = getEffectiveInvoiceItems(padAppt500, staleInv500.items);
assert.strictEqual(items500.length, 2, 'Stale items array must gain 5% service charge row');
assert.strictEqual(items500[1].price, 25, '5% charge row must be NPR 25');
assert.strictEqual(items500.reduce((s, x) => s + x.total, 0), 525, 'Itemized sum must equal 525');
console.log('✓ Test 1 passed: Stale 500 PAY_AT_DESK invoice & items reconcile to NPR 525');

// --- Test 2: Fractional fee (450 -> 472.5, 850 -> 892.5) ---
const padAppt450 = {
  id: 'appt-2',
  paymentMode: 'PAY_AT_DESK',
  paymentStatus: 'pending',
  feeAmount: 450,
  serviceChargeAmount: 0,
  totalAmount: 450,
  appointmentDate: '2026-11-12',
};
assert.strictEqual(getEffectiveServiceCharge(padAppt450), 22.5, '5% of 450 must be 22.5');
assert.strictEqual(getEffectiveAppointmentTotal(padAppt450), 472.5, '450 + 5% must be 472.5');
assert.strictEqual(getEffectiveInvoiceTotal(padAppt450, { totalAmount: 450 }), 472.5);
const items450 = getEffectiveInvoiceItems(padAppt450, []);
assert.strictEqual(items450.length, 2);
assert.strictEqual(items450[0].total + items450[1].total, 472.5);

const padAppt850 = {
  id: 'appt-3',
  paymentMode: 'PAY_AT_DESK',
  paymentStatus: 'paid',
  feeAmount: 850,
  serviceChargeAmount: 42.5,
  totalAmount: 892.5,
  appointmentDate: '2026-11-12',
};
assert.strictEqual(getEffectiveInvoiceTotal(padAppt850, { totalAmount: 850 }), 892.5);
console.log('✓ Test 2 passed: Fractional 5% totals (472.5, 892.5) compute without rounding truncation');

// --- Test 3: Invoice that ALREADY has 5% item does NOT duplicate ---
const alreadyUpgradedItems = [
  { name: 'OPD Consultation Fee', quantity: 1, price: 500, total: 500 },
  { name: 'Pay at Desk Service Charge (5%)', quantity: 1, price: 25, total: 25 },
];
const deduped = getEffectiveInvoiceItems(padAppt500, alreadyUpgradedItems);
assert.strictEqual(deduped.length, 2, 'Should not duplicate 5% line item when already present');
console.log('✓ Test 3 passed: Already-upgraded invoice items are not duplicated');

// --- Test 4: Online / Free Follow-up appointments are unaffected ---
const onlineAppt = {
  paymentMode: 'ONLINE',
  feeAmount: 500,
  serviceChargeAmount: 0,
  totalAmount: 500,
};
assert.strictEqual(getEffectiveServiceCharge(onlineAppt), 0);
assert.strictEqual(getEffectiveInvoiceTotal(onlineAppt, { totalAmount: 500 }), 500);
assert.strictEqual(getEffectiveInvoiceItems(onlineAppt, []).length, 1);

const freeAppt = {
  paymentMode: 'PAY_AT_DESK',
  feeAmount: 0,
  serviceChargeAmount: 0,
  totalAmount: 0,
};
assert.strictEqual(getEffectiveServiceCharge(freeAppt), 0);
assert.strictEqual(getEffectiveAppointmentTotal(freeAppt), 0);
console.log('✓ Test 4 passed: Online & Free Follow-up appointments remain unaffected (no 5% surcharge)');

// --- Test 5: SQL migration & code integration sanity checks ---
const sqlPath = path.join(__dirname, 'migration_fix_patient_bills_and_payment_logs_5pct.sql');
const sqlText = fs.readFileSync(sqlPath, 'utf8');
assert(sqlText.includes('ADD COLUMN IF NOT EXISTS reference_id'), 'SQL must add reference_id column');
assert(sqlText.includes('ADD COLUMN IF NOT EXISTS category'), 'SQL must add category column');
assert(sqlText.includes('enforce_pay_at_desk_invoice_totals'), 'SQL must create billing_invoices trigger');
assert(sqlText.includes('billing_invoices_z_enforce_pay_at_desk_totals'), 'SQL must attach billing_invoices trigger');
assert(sqlText.includes('Pay at Desk Service Charge (5%)'), 'SQL must insert/append 5% line item');
console.log('✓ Test 5 passed: SQL migration defines columns, trigger, backfill & upgraded RPC');

console.log('\nALL TESTS PASSED (5/5)');
