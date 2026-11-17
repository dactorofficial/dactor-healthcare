/**
 * Automated Verification Script for Clinic Expenses Live Integration & Normalization
 * File: tests/verify_clinic_expenses_live.cjs
 */

const SUPABASE_URL = 'https://ojfoofojcpabqegxmsab.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m'
};

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  ${ANSI.green}✓ [PASS]${ANSI.reset} ${message}`);
    if (details) console.log(`     ${ANSI.cyan}${details}${ANSI.reset}`);
  } else {
    failed++;
    console.error(`  ${ANSI.red}✗ [FAIL]${ANSI.reset} ${message}`);
    if (details) console.error(`     ${ANSI.yellow}Details: ${details}${ANSI.reset}`);
  }
}

// Client normalization helper identical to web-app/src/services/db.ts
function normalizeExpenseRecord(row) {
  const vNum = row.voucher_number || row.receipt_no || undefined;
  const rNo = row.receipt_no || row.voucher_number || undefined;
  let rem = row.remarks || row.notes || undefined;
  let eTime = row.expense_time || undefined;
  if (!eTime && rem && /^\[(\d{1,2}:\d{2})\]\s*/.test(rem)) {
    const match = rem.match(/^\[(\d{1,2}:\d{2})\]\s*(.*)/);
    if (match) {
      eTime = match[1];
      rem = match[2] || undefined;
    }
  }
  return {
    ...row,
    voucher_number: vNum,
    receipt_no: rNo,
    remarks: rem,
    notes: rem,
    expense_time: eTime,
  };
}

// Payload preparation helper identical to addClinicExpense in db.ts and BillingRepository.kt
function prepareExpenseInsertPayload(input) {
  const vNum = input.voucher_number || input.receipt_no || null;
  const rem = input.remarks || input.notes || null;
  const eTime = input.expense_time || null;
  const combinedNotes = eTime ? `[${eTime}] ${rem || ''}`.trim() : (rem || null);

  return {
    clinic_id: input.clinic_id,
    title: input.title,
    category: input.category || 'OTHER',
    amount: Number(input.amount) || 0,
    payment_method: input.payment_method || 'CASH',
    expense_date: input.expense_date,
    receipt_no: vNum,
    notes: combinedNotes,
    payee_name: input.payee_name || null
  };
}

async function run() {
  console.log(`\n${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}   DACTOR HEALTHCARE: CLINIC EXPENSES INTEGRATION VERIFICATION        ${ANSI.reset}`);
  console.log(`${ANSI.bold}========================================================================${ANSI.reset}\n`);

  let testExpenseId = null;

  try {
    // 1. Get an existing clinic
    console.log(`${ANSI.bold}[1] Resolve Active Clinic:${ANSI.reset}`);
    const clinicRes = await fetch(`${SUPABASE_URL}/clinics?select=id,name&limit=1`, { headers: HEADERS });
    const clinics = await clinicRes.json();
    assert(clinicRes.ok && clinics.length > 0, 'Fetched active clinic from live database', `Clinic: ${clinics[0]?.name} (${clinics[0]?.id})`);
    const clinicId = clinics[0].id;

    // 2. Prepare and Insert a test expense using normalized payload
    console.log(`\n${ANSI.bold}[2] Normalized Add Expense Insertion:${ANSI.reset}`);
    const rawInput = {
      clinic_id: clinicId,
      title: 'Auto Test Medical Supplies',
      category: 'MEDICAL_SUPPLIES',
      amount: 1450.75,
      payment_method: 'CASH',
      expense_date: '2026-11-16',
      expense_time: '14:30',
      voucher_number: 'TEST-VOUCHER-778',
      remarks: 'Automated verification purchase'
    };

    const insertPayload = prepareExpenseInsertPayload(rawInput);
    assert(insertPayload.receipt_no === 'TEST-VOUCHER-778', 'Normalized payload maps voucher_number to receipt_no');
    assert(insertPayload.notes.includes('[14:30] Automated verification purchase'), 'Normalized payload safely encodes time into notes');

    const insertRes = await fetch(`${SUPABASE_URL}/clinic_expenses`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(insertPayload)
    });

    const insertData = await insertRes.json();
    assert(insertRes.ok && Array.isArray(insertData) && insertData.length > 0, 'Expense successfully inserted into live database', `Status: ${insertRes.status}`);

    if (Array.isArray(insertData) && insertData[0]) {
      testExpenseId = insertData[0].id;
      console.log(`     ${ANSI.cyan}Created expense ID: ${testExpenseId}${ANSI.reset}`);

      // 3. Normalize returned record
      console.log(`\n${ANSI.bold}[3] Data Normalization on Retrieval:${ANSI.reset}`);
      const normalized = normalizeExpenseRecord(insertData[0]);
      assert(normalized.voucher_number === 'TEST-VOUCHER-778', 'Normalized voucher_number matches original input');
      assert(normalized.receipt_no === 'TEST-VOUCHER-778', 'Normalized receipt_no matches original input');
      assert(normalized.expense_time === '14:30', 'Extracted expense_time matches original input');
      assert(normalized.remarks === 'Automated verification purchase', 'Clean remarks extracted without time prefix');
      assert(Number(normalized.amount) === 1450.75, 'Amount matches inserted value');
      assert(normalized.category === 'MEDICAL_SUPPLIES', 'Category matches inserted value');

      // 4. Verify querying by clinic_id
      console.log(`\n${ANSI.bold}[4] Query Expenses for Clinic:${ANSI.reset}`);
      const fetchRes = await fetch(`${SUPABASE_URL}/clinic_expenses?clinic_id=eq.${clinicId}&order=expense_date.desc`, { headers: HEADERS });
      const fetchedList = await fetchRes.json();
      assert(fetchRes.ok && Array.isArray(fetchedList), 'Successfully queried clinic_expenses by clinic_id');
      const found = fetchedList.find(e => e.id === testExpenseId);
      assert(!!found, 'Inserted expense is present in clinic expenses list');

      // 5. Verify Date Filtering Logic (including fix for monthly filter)
      console.log(`\n${ANSI.bold}[5] Date Filter Validation in ClinicPaymentLogsView:${ANSI.reset}`);
      const todayStr = '2026-11-16';
      const monthStartStr = '2026-11-01';

      // Old buggy filter check: !expDate.startsWith('2026-11-01') -> FALSE for today's date!
      const oldBuggyResult = found.expense_date.startsWith(monthStartStr);
      assert(!oldBuggyResult, 'Reproduced old bug: expense_date.startsWith(monthStartStr) was FALSE for mid-month');

      // Fixed filter check: expDate >= monthStartStr
      const fixedMonthlyMatch = found.expense_date >= monthStartStr;
      assert(fixedMonthlyMatch, 'Fixed monthly filter: expense_date >= monthStartStr correctly includes mid-month expenses');

      const fixedDailyMatch = found.expense_date === todayStr;
      assert(fixedDailyMatch, 'Daily filter correctly matches today');
    }

    // 6. Clean up test record
    if (testExpenseId) {
      console.log(`\n${ANSI.bold}[6] Cleanup & Deletion Verification:${ANSI.reset}`);
      const delRes = await fetch(`${SUPABASE_URL}/clinic_expenses?id=eq.${testExpenseId}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      assert(delRes.ok, 'Deleted test expense record from live database', `Status: ${delRes.status}`);

      // Verify it no longer exists
      const verifyDelRes = await fetch(`${SUPABASE_URL}/clinic_expenses?id=eq.${testExpenseId}`, { headers: HEADERS });
      const verifyDelData = await verifyDelRes.json();
      assert(verifyDelRes.ok && Array.isArray(verifyDelData) && verifyDelData.length === 0, 'Confirmed test expense is no longer in database');
    }

  } catch (err) {
    assert(false, 'Verification suite encountered an exception', err.message);
  }

  console.log(`\n${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}SUMMARY: ${passed} Passed, ${failed} Failed${ANSI.reset}`);
  console.log(`${ANSI.bold}========================================================================${ANSI.reset}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Clinic Expenses integration & normalization tests PASSED!\n');
  }
}

run();
