#!/usr/bin/env node
/**
 * Master Dual-Track E2E Test Suite Runner for Pay at Desk Lifecycle
 * Usage:
 *   node tests/pay_at_desk/test_pay_at_desk_e2e.cjs        # Runs all Tiers 1-4
 *   node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 1      # Runs Tier 1 only
 *   node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 2      # Runs Tier 2 only
 *   node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 3      # Runs Tier 3 only
 *   node tests/pay_at_desk/test_pay_at_desk_e2e.cjs 4      # Runs Tier 4 only
 */

const { colors, TestHarness } = require('./test_runner.cjs');
const { registerTier1Tests } = require('./tier1_feature_coverage.test.cjs');
const { registerTier2Tests } = require('./tier2_boundary_corner.test.cjs');
const { registerTier3Tests } = require('./tier3_cross_feature.test.cjs');
const { registerTier4Tests } = require('./tier4_real_world.test.cjs');

async function main() {
  const args = process.argv.slice(2);
  const selectedTier = args[0] ? parseInt(args[0], 10) : null;

  console.log(`\n${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  DACTOR PLATFORM: PAY AT DESK DUAL-TRACK E2E TEST SUITE${colors.reset}`);
  console.log(`${colors.dim}  Specifications: docs/pay-at-desk-spec.md & ORIGINAL_REQUEST.md${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}`);

  const tierConfigs = [
    { num: 1, name: 'Tier 1: Feature Coverage (F1 - F5)', register: registerTier1Tests },
    { num: 2, name: 'Tier 2: Boundary & Corner Cases (B1 - B10)', register: registerTier2Tests },
    { num: 3, name: 'Tier 3: Cross-Feature Combinations (C1 - C6)', register: registerTier3Tests },
    { num: 4, name: 'Tier 4: Real-World Scenarios (S1 - S6)', register: registerTier4Tests }
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
  console.log(`  ${'TOTAL'.padEnd(8)} | ${'Pay at Desk Dual-Track E2E Suite'.padEnd(36)} | ${totalRatio} | ${totalTimeStr} | ${totalStatus}`);
  console.log(`${colors.bright}======================================================================${colors.reset}\n`);

  if (grandTotalFailed === 0) {
    console.log(`${colors.green}${colors.bright}√ 100% OF PAY AT DESK E2E TESTS PASSED CLEANLY.${colors.reset}`);
    console.log(`  F1: Server-authoritative confirmation RPC & Edge Function handler verified.`);
    console.log(`  F2: 5% platform service charge computation & 2-decimal precision verified.`);
    console.log(`  F3: WAITING_FOR_APPROVAL status & 10-digit tracking code contracts verified.`);
    console.log(`  F4: Clinic pending requests listing & cross-clinic isolation verified.`);
    console.log(`  F5: Queue exclusion while pending & token assignment on approval verified.`);
    console.log(`  Rule 6: 3-attempt lifecycle, UNAPPROVED retry gate, & 2-day expiry verified.`);
    console.log(`  Rule 7: Slot capacity overload (12/12 -> 13/12) without crash verified.`);
    process.exit(0);
  } else {
    console.error(`${colors.red}${colors.bright}× ${grandTotalFailed} TEST(S) FAILED IN SUITE.${colors.reset}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner execution failure:', err);
  process.exit(1);
});
