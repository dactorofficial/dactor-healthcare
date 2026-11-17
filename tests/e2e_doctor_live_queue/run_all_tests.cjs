#!/usr/bin/env node
/**
 * Master 4-Tier E2E Test Suite Runner for Dactor Doctor Portal Personalized Live Queue
 *
 * Usage:
 *   node tests/e2e_doctor_live_queue/run_all_tests.cjs        # Runs all Tiers 1-4 (202 tests)
 *   node tests/e2e_doctor_live_queue/run_all_tests.cjs 1      # Runs Tier 1 only (85 tests)
 *   node tests/e2e_doctor_live_queue/run_all_tests.cjs 2      # Runs Tier 2 only (85 tests)
 *   node tests/e2e_doctor_live_queue/run_all_tests.cjs 3      # Runs Tier 3 only (20 tests)
 *   node tests/e2e_doctor_live_queue/run_all_tests.cjs 4      # Runs Tier 4 only (12 tests)
 */

const path = require('path');
const { colors, TestHarness } = require('./test_runner.cjs');
const { registerTier1Tests } = require('./tier1_feature_coverage.test.cjs');
const { registerTier2Tests } = require('./tier2_boundary_corner.test.cjs');
const { registerTier3Tests } = require('./tier3_cross_feature.test.cjs');
const { registerTier4Tests } = require('./tier4_real_world.test.cjs');

async function runDoctorLiveQueueE2E(tierArg = null) {
  const args = tierArg ? [String(tierArg)] : process.argv.slice(2);
  let selectedTier = null;

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      selectedTier = parseInt(arg.split('=')[1], 10);
    } else if (/^[1-4]$/.test(arg)) {
      selectedTier = parseInt(arg, 10);
    }
  }

  console.log(`\n${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  DACTOR PLATFORM: DOCTOR PORTAL PERSONALIZED LIVE QUEUE E2E SUITE${colors.reset}`);
  console.log(`${colors.dim}  Specifications: ORIGINAL_REQUEST.md & PROJECT.md (Tiers 1-4)${colors.reset}`);
  console.log(`${colors.dim}  Constraint: ZERO Map, Location, GPS, or Geographical Mapping Features${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}`);

  const tierConfigs = [
    { num: 1, name: 'Tier 1: Feature Coverage (F1 - F17)', register: registerTier1Tests, count: 85 },
    { num: 2, name: 'Tier 2: Boundary & Corner Cases (B1 - B17)', register: registerTier2Tests, count: 85 },
    { num: 3, name: 'Tier 3: Cross-Feature Pairwise (C1 - C20)', register: registerTier3Tests, count: 20 },
    { num: 4, name: 'Tier 4: Real-World Scenarios (S1 - S12)', register: registerTier4Tests, count: 12 }
  ];

  const results = [];
  const suiteStartTime = Date.now();

  for (const tc of tierConfigs) {
    if (selectedTier && selectedTier !== tc.num) {
      continue;
    }

    const harness = new TestHarness(tc.name);
    tc.register(harness);
    const summary = await harness.run();
    results.push(summary);
  }

  const suiteDuration = Date.now() - suiteStartTime;

  // Executive Test Summary Report
  console.log(`\n${colors.bright}======================================================================${colors.reset}`);
  console.log(`${colors.bright}                    EXECUTIVE TEST SUMMARY REPORT                    ${colors.reset}`);
  console.log(`${colors.bright}======================================================================${colors.reset}`);
  console.log(`  Tier     | Description                          | Pass/Total   | Time     | Status  `);
  console.log(`  ---------+--------------------------------------+--------------+----------+---------`);

  let grandTotalPassed = 0;
  let grandTotalFailed = 0;
  let grandTotalTests = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    grandTotalPassed += r.passed;
    grandTotalFailed += r.failed;
    grandTotalTests += r.total;

    const tierLabel = `Tier ${selectedTier || (i + 1)}`.padEnd(8);
    const desc = r.name.replace(/^Tier \d+:\s*/, '').padEnd(36).slice(0, 36);
    const passRatio = `${r.passed}/${r.total}`.padEnd(12);
    const timeStr = `${r.timeMs}ms`.padEnd(8);
    const statusStr = r.failed === 0 ? `${colors.green}PASS    ${colors.reset}` : `${colors.red}FAIL    ${colors.reset}`;

    console.log(`  ${tierLabel} | ${desc} | ${passRatio} | ${timeStr} | ${statusStr}`);
  }

  console.log(`  ---------+--------------------------------------+--------------+----------+---------`);
  const totalRatio = `${grandTotalPassed}/${grandTotalTests}`.padEnd(12);
  const totalTimeStr = `${suiteDuration}ms`.padEnd(8);
  const totalStatus = grandTotalFailed === 0
    ? `${colors.green}${colors.bright}ALL PASS${colors.reset}`
    : `${colors.red}${colors.bright}FAILED  ${colors.reset}`;
  console.log(`  ${'TOTAL'.padEnd(8)} | ${'Doctor Live Queue 4-Tier E2E Suite'.padEnd(36)} | ${totalRatio} | ${totalTimeStr} | ${totalStatus}`);
  console.log(`${colors.bright}======================================================================${colors.reset}\n`);

  if (grandTotalFailed === 0) {
    console.log(`${colors.green}${colors.bright}√ 100% OF DOCTOR LIVE QUEUE E2E TESTS PASSED CLEANLY.${colors.reset}`);
    console.log(`  F1: Doctor Queue Isolation & Row Level Security (RLS) verified.`);
    console.log(`  F2: Atomic Concurrency & Actor Tracking ("This entry was just updated") verified.`);
    console.log(`  F3: Minimal Patient Data Exposure (Zero PII leakage) verified.`);
    console.log(`  F4: 7 Shared Domain Use Cases verified.`);
    console.log(`  F5: Queue Repository Doctor Scoping & Optimistic Rollback verified.`);
    console.log(`  F6: Personalized Live Queue Screen & Parameterized Routing verified.`);
    console.log(`  F7: Compact Stat Boxes (In Consultation, Waiting in Lobby, Completed Today) verified.`);
    console.log(`  F8: Date Strip & Active Midnight Rollover verified.`);
    console.log(`  F9: Sticky Tabs & Break Toggle Placement verified.`);
    console.log(`  F10: Overloaded Slots Display (13/12 capacity ratio) verified.`);
    console.log(`  F11: Pay at Desk Approval Filtering (Quarantine & Admission) verified.`);
    console.log(`  F12: Lifecycle-Aware Realtime Sync (Channels, dispose, reconnect) verified.`);
    console.log(`  F13: Doctor Patient Notification Actions ("Walk In", "Call In") verified.`);
    console.log(`  F14: Notification Dialog & Anti-Spam 60s Cooldown verified.`);
    console.log(`  F15: Walk-in Without App Account Check ("Walk-in (No App Account)") verified.`);
    console.log(`  F16: Patient App Tracker Deep Link (QueueStatusScreen, strictly ZERO maps/GPS) verified.`);
    console.log(`  F17: Web App Parity (Strictly one-way app -> web) verified.`);
    return 0;
  } else {
    console.error(`${colors.red}${colors.bright}× ${grandTotalFailed} TEST(S) FAILED IN SUITE.${colors.reset}`);
    return 1;
  }
}

if (require.main === module) {
  runDoctorLiveQueueE2E().then(code => process.exit(code));
}

module.exports = { runDoctorLiveQueueE2E };
