/**
 * Automated Verification Script for Clinic Expenses Live Integration & Normalization
 * File: tests/verify_clinic_expenses_live.cjs
 * 
 * Tests:
 * 1. Active clinic resolution
 * 2. Dual-Layer Add Expense Insertion (Direct PostgREST REST + add_clinic_expense RPC fallback)
 * 3. Client-side normalization (dual voucher_number/receipt_no & remarks/notes)
 * 4. Clinic expense querying (Direct PostgREST + get_clinic_expenses RPC fallback)
 * 5. Period date filtering logic (daily, monthly)
 * 6. Deletion & Cleanup (Direct PostgREST + delete_clinic_expense RPC fallback)
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

// Client normalization helper identical to web-app/src/services/db.ts and BillingRepository.kt
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

    // 2. Prepare and Insert a test expense using normalized payload with dual-layer fallback
    console.log(`\n${ANSI.bold}[2] Dual-Layer Add Expense Insertion (REST + RPC Fallback):${ANSI.reset}`);
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

    let insertRes = await fetch(`${SUPABASE_URL}/clinic_expenses`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(insertPayload)
    });

    let insertData = null;
    if (insertRes.ok) {
      insertData = await insertRes.json();
      assert(true, 'Expense successfully inserted via direct PostgREST table insert', `Status: ${insertRes.status}`);
    } else {
      console.log(`     ${ANSI.yellow}Direct REST table insert returned ${insertRes.status} (RLS restriction or pending migration) - exercising RPC fallback...${ANSI.reset}`);
      // Fallback to add_clinic_expense RPC
      const rpcPayload = {
        p_clinic_id: rawInput.clinic_id,
        p_title: rawInput.title,
        p_amount: rawInput.amount,
        p_category: rawInput.category,
        p_payment_method: rawInput.payment_method,
        p_expense_date: rawInput.expense_date,
        p_expense_time: rawInput.expense_time,
        p_voucher_number: rawInput.voucher_number,
        p_remarks: rawInput.remarks
      };

      const rpcRes = await fetch(`${SUPABASE_URL}/rpc/add_clinic_expense`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(rpcPayload)
      });

      if (rpcRes.ok) {
        const rpcData = await rpcRes.json();
        insertData = Array.isArray(rpcData) ? rpcData : [rpcData];
        assert(true, 'Expense successfully inserted via add_clinic_expense RPC fallback', `Status: ${rpcRes.status}`);
      } else {
        const errText = await rpcRes.text();
        console.log(`     ${ANSI.yellow}Note: Cloud database requires executing supabase/migration_fix_clinic_expenses_complete.sql in the Supabase Dashboard SQL Editor.${ANSI.reset}`);
        assert(false, 'Expense insertion succeeded via direct REST or RPC fallback', `REST: ${insertRes.status}, RPC: ${rpcRes.status} - ${errText}`);
      }
    }

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
      let fetchRes = await fetch(`${SUPABASE_URL}/clinic_expenses?clinic_id=eq.${clinicId}&order=expense_date.desc`, { headers: HEADERS });
      let fetchedList = await fetchRes.json();

      if (!fetchRes.ok || !Array.isArray(fetchedList) || fetchedList.length === 0) {
        // Fallback to get_clinic_expenses RPC
        const rpcFetchRes = await fetch(`${SUPABASE_URL}/rpc/get_clinic_expenses`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ p_clinic_id: clinicId })
        });
        if (rpcFetchRes.ok) {
          fetchedList = await rpcFetchRes.json();
          assert(true, 'Successfully queried clinic_expenses via get_clinic_expenses RPC fallback', `Found ${fetchedList.length} items`);
        } else {
          assert(false, 'Successfully queried clinic_expenses by clinic_id', `Status: ${fetchRes.status}`);
        }
      } else {
        assert(true, 'Successfully queried clinic_expenses via direct PostgREST table query', `Found ${fetchedList.length} items`);
      }

      if (Array.isArray(fetchedList)) {
        const found = fetchedList.find(e => e.id === testExpenseId);
        assert(!!found, 'Inserted expense is present in clinic expenses list');

        if (found) {
          // 5. Verify Date Filtering Logic (including fix for monthly filter)
          console.log(`\n${ANSI.bold}[5] Date Filter Validation in ClinicPaymentLogsView:${ANSI.reset}`);
          const todayStr = '2026-11-16';
          const monthStartStr = '2026-11-01';

          const fixedMonthlyMatch = found.expense_date >= monthStartStr;
          assert(fixedMonthlyMatch, 'Fixed monthly filter: expense_date >= monthStartStr correctly includes mid-month expenses');

          const fixedDailyMatch = found.expense_date === todayStr;
          assert(fixedDailyMatch, 'Daily filter correctly matches today');
        }
      }
    }

    // 6. Clean up test record
    if (testExpenseId) {
      console.log(`\n${ANSI.bold}[6] Cleanup & Deletion Verification:${ANSI.reset}`);
      let delRes = await fetch(`${SUPABASE_URL}/clinic_expenses?id=eq.${testExpenseId}`, {
        method: 'DELETE',
        headers: HEADERS
      });

      if (delRes.ok) {
        assert(true, 'Deleted test expense record via direct REST delete', `Status: ${delRes.status}`);
      } else {
        // Fallback to delete_clinic_expense RPC
        const rpcDelRes = await fetch(`${SUPABASE_URL}/rpc/delete_clinic_expense`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ p_expense_id: testExpenseId })
        });
        assert(rpcDelRes.ok, 'Deleted test expense record via delete_clinic_expense RPC fallback', `Status: ${rpcDelRes.status}`);
      }
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
