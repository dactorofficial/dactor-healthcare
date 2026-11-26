'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ts = require('../web-app/node_modules/typescript');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${err.message}`);
    failed++;
  }
}

function loadTsModule(relPath, customRequireMap = {}) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(fullPath),
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (specifier) => {
    if (customRequireMap[specifier]) return customRequireMap[specifier];
    return require(specifier);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled);
  fn(mod.exports, localRequire, mod, fullPath, path.dirname(fullPath));
  return mod.exports;
}

const typesMod = loadTsModule('web-app/src/types/index.ts');
const ledgerMod = loadTsModule('web-app/src/utils/paymentLedger.ts', {
  '../types': typesMod,
});

// Source files for parity & structural verification
const quickDialogKt = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/billing/QuickPushEditBillDialog.kt', 'utf8');
const apptRepoKt = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt', 'utf8');
const queueBoardKt = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt', 'utf8');
const patDirKt = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/patients/PatientDirectoryScreen.kt', 'utf8');
const patDetailKt = fs.readFileSync('clinic-app/app/src/main/java/com/dactor/clinic/ui/patients/PatientDetailScreen.kt', 'utf8');
const clinicPortalTsx = fs.readFileSync('web-app/src/pages/ClinicPortal.tsx', 'utf8');
const dbTs = fs.readFileSync('web-app/src/services/db.ts', 'utf8');

// =========================================================================
// 1. REAL RUNTIME TESTS (web-app types & paymentLedger)
// =========================================================================

test('Single Pay-at-Desk visit preserves 5% charge + catalog addition', () => {
  const appt = {
    id: 'a1',
    trackingCode10Digit: '7700112233',
    paymentMode: 'PAY_AT_DESK',
    paymentStatus: 'unpaid',
    feeAmount: 500,
    serviceChargeAmount: 25,
    totalAmount: 525,
    attemptNumber: 1,
    appointmentDate: '2026-11-26',
  };
  const inv = {
    id: 'inv1',
    appointmentId: 'a1',
    totalAmount: 675,
    paidAmount: 200,
    paymentStatus: 'partial',
    items: [
      { itemName: 'OPD Consultation', quantity: 1, price: 500, total: 500 },
      { itemName: 'Blood Glucose Test', quantity: 1, price: 150, total: 150 },
    ],
  };

  assert.strictEqual(typesMod.getEffectiveAppointmentTotal(appt), 525);
  assert.strictEqual(typesMod.getEffectiveInvoiceTotal(appt, inv), 675);

  const summary = ledgerMod.computeCombinedBillingSummary([appt], { a1: inv });
  assert.strictEqual(summary.visitsCount, 1);
  assert.strictEqual(summary.totalBill, 675);
  assert.strictEqual(summary.totalPaid, 200);
  assert.strictEqual(summary.balanceDue, 475);
  assert.ok(summary.items.some((i) => i.name.includes('Pay at Desk')), '5% charge preserved');
});

test('Multi-visit follow-up combines linked trackingCode10Digit bills & guards free follow-up', () => {
  const visit1 = {
    id: 'v1',
    trackingCode10Digit: '8800991122',
    paymentMode: 'PAY_AT_DESK',
    paymentStatus: 'paid',
    feeAmount: 500,
    serviceChargeAmount: 25,
    totalAmount: 525,
    attemptNumber: 1,
    appointmentDate: '2026-11-20',
  };
  const visit2FreeFollowUp = {
    id: 'v2',
    trackingCode10Digit: '8800991122',
    paymentMode: 'FREE',
    visitType: 'follow_up',
    paymentStatus: 'pending',
    feeAmount: 0,
    totalAmount: 0,
    attemptNumber: 2,
    appointmentDate: '2026-11-26',
  };

  const priorOnly = ledgerMod.computeCombinedBillingSummary([visit1], {
    v1: {
      id: 'iv1',
      appointmentId: 'v1',
      totalAmount: 525,
      paidAmount: 525,
      paymentStatus: 'paid',
      items: [
        { itemName: 'OPD Consultation', quantity: 1, price: 500, total: 500 },
        { itemName: 'Pay at Desk Service Charge (5%)', quantity: 1, price: 25, total: 25 },
      ],
    },
  });
  assert.strictEqual(priorOnly.totalBill, 525);
  assert.strictEqual(priorOnly.totalPaid, 525);
  assert.strictEqual(priorOnly.balanceDue, 0);

  // Follow-up has added lab test Rs. 400 (consultation stays Rs. 0)
  const combinedWithLab = ledgerMod.computeCombinedBillingSummary([visit1, visit2FreeFollowUp], {
    v1: { id: 'iv1', appointmentId: 'v1', totalAmount: 525, paidAmount: 525, paymentStatus: 'paid' },
    v2: {
      id: 'iv2',
      appointmentId: 'v2',
      totalAmount: 400,
      paidAmount: 0,
      paymentStatus: 'unpaid',
      items: [{ itemName: 'CBC Blood Count', quantity: 1, price: 400, total: 400 }],
    },
  });
  assert.strictEqual(combinedWithLab.visitsCount, 2);
  assert.strictEqual(combinedWithLab.totalBill, 925);
  assert.strictEqual(combinedWithLab.totalPaid, 525);
  assert.strictEqual(combinedWithLab.balanceDue, 400);

  // Pure free follow-up without added lab tests must stay 0 (never default to 500)
  const combinedFree = ledgerMod.computeCombinedBillingSummary([visit1, visit2FreeFollowUp], {
    v1: { id: 'iv1', appointmentId: 'v1', totalAmount: 525, paidAmount: 525, paymentStatus: 'paid' },
    v2: { id: 'iv2', appointmentId: 'v2', totalAmount: 0, paidAmount: 0, paymentStatus: 'pending', items: [] },
  });
  assert.strictEqual(combinedFree.totalBill, 525);
  assert.strictEqual(combinedFree.balanceDue, 0);
});

test('Payment ledger remarks round-trip preserves clean clinical remarks and timestamped entries', () => {
  const payments = [
    { id: 'p1', amount: 300, dateTime: '2026-11-26 10:15 AM', paymentMethod: 'CASH', note: 'Advance Desk' },
    { id: 'p2', amount: 200, dateTime: '2026-11-26 02:30 PM', paymentMethod: 'ESEWA', note: 'Cleared Balance' },
  ];
  const encoded = ledgerMod.buildCombinedRemarks('Rx Tab Paracetamol 500mg BD x 3d', payments);
  assert.strictEqual(ledgerMod.extractCleanClinicalRemarks(encoded), 'Rx Tab Paracetamol 500mg BD x 3d');
  const parsed = ledgerMod.parsePaymentRecords(encoded, 500);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].amount + parsed[1].amount, 500);
});

// =========================================================================
// 2. ANDROID + WEB POPUP & PARITY INVARIANTS
// =========================================================================

test('Android QuickPushEditBillDialog implements overlapping Confirm/Cancel dialog & combined ledger', () => {
  assert.ok(quickDialogKt.includes('fun QuickPushEditBillDialog('));
  assert.ok(quickDialogKt.includes('Confirm Push / Update Bill'));
  assert.ok(quickDialogKt.includes('Remaining Due:'));
  assert.ok(quickDialogKt.includes('Text("Confirm"'));
  assert.ok(quickDialogKt.includes('Text("Cancel"'));
  assert.ok(quickDialogKt.includes('computeCombinedBillingSummary'));
  assert.ok(quickDialogKt.includes('createCompletedBillingVisit('));
});

test('Android AppointmentRepository.createCompletedBillingVisit inserts completed non-queued billing visit', () => {
  assert.ok(apptRepoKt.includes('open suspend fun createCompletedBillingVisit('));
  const fnBlock = apptRepoKt.slice(apptRepoKt.indexOf('open suspend fun createCompletedBillingVisit('), apptRepoKt.indexOf('open suspend fun createCompletedBillingVisit(') + 3200);
  assert.ok(fnBlock.includes('checkinStatus = "completed"'));
  assert.ok(fnBlock.includes('feeAmount = 0.0'));
  assert.ok(!fnBlock.includes('queue_entries'));
});

test('Android QueueBoardScreen Completed tab has direct Push / Edit Bill button on all cards & never navigates away', () => {
  assert.ok(queueBoardKt.includes('Text("Push / Edit Bill"'));
  assert.ok(queueBoardKt.includes('openBillPopupForItem(item)'));
  assert.ok(queueBoardKt.includes('QuickPushEditBillDialog('));
  assert.ok(!queueBoardKt.includes('NavRoutes.BillingScreen'));
});

test('Android PatientDirectoryScreen & PatientDetailScreen open in-place QuickPushEditBillDialog across all tabs', () => {
  assert.ok(patDirKt.includes('fun openPatientBillPopup('));
  assert.ok(patDirKt.includes('Text("Push / Edit Bill"'));
  assert.ok(patDirKt.includes('QuickPushEditBillDialog('));
  assert.ok(!patDirKt.includes('NavRoutes.BillingScreen'));
  assert.ok(patDetailKt.includes('QuickPushEditBillDialog('));
  assert.ok(!patDetailKt.includes('NavRoutes.BillingScreen'));
});

test('Web db.ts exposes createCompletedBillingVisit without queue_entries', () => {
  const dbNorm = dbTs.replace(/\r\n/g, '\n');
  assert.ok(dbNorm.includes('export async function createCompletedBillingVisit('));
  const fnIdx = dbNorm.indexOf('export async function createCompletedBillingVisit(');
  const fnEnd = dbNorm.indexOf('\n}\n', fnIdx);
  assert.ok(fnEnd > fnIdx, 'createCompletedBillingVisit end brace not found');
  const fnBlock = dbNorm.slice(fnIdx, fnEnd);
  assert.ok(fnBlock.includes("checkin_status: 'completed'"));
  assert.ok(fnBlock.includes('fee_amount: 0'));
  assert.ok(!fnBlock.includes('queue_entries'));
});

test('Web ClinicPortal Live Queue Completed section & Directory open modal + overlapping Confirm/Cancel dialog', () => {
  assert.ok(clinicPortalTsx.includes("(queueSubTab === 'past' || isDone)"));
  assert.ok(clinicPortalTsx.includes('<span>Push / Edit Bill</span>'));
  assert.ok(clinicPortalTsx.includes('billConfirmOpen'));
  assert.ok(clinicPortalTsx.includes('Confirm Push / Update Bill'));
  assert.ok(clinicPortalTsx.includes('billPriorSummary'));
  assert.ok(clinicPortalTsx.includes('createCompletedBillingVisit('));
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
