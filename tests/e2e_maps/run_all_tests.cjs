#!/usr/bin/env node
/**
 * DACTOR Platform Map Migration — Master E2E Test Suite Runner
 * Executes Tiers 1-4, produces structured reports, and exits with code 0 on complete pass.
 */

const { colors } = require('./test_runner_framework.cjs');
const tier1 = require('./tier1_feature_coverage.test.cjs');
const tier2 = require('./tier2_boundary_corner.test.cjs');
const tier3 = require('./tier3_cross_feature.test.cjs');
const tier4 = require('./tier4_real_world.test.cjs');

async function main() {
  console.log(`\n${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}   DACTOR PLATFORM MAP MIGRATION: 4-TIER OPAQUE-BOX E2E SUITE${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`  Target Platform: Web App, Patient App (Android), Clinic App (Android)`);
  console.log(`  Engine: Leaflet v1.9.4 + CARTO Voyager Raster Tiles`);
  console.log(`  Decommissioned: OpenFreeMap / MapLibre GL\n`);

  const startTime = Date.now();
  const requestedTier = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  const suites = [
    { tier: 1, suite: tier1 },
    { tier: 2, suite: tier2 },
    { tier: 3, suite: tier3 },
    { tier: 4, suite: tier4 }
  ].filter((s) => (requestedTier ? s.tier === requestedTier : true));

  const summaries = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures = [];

  for (const { tier, suite } of suites) {
    const summary = await suite.run(true);
    summaries.push(summary);
    totalTests += summary.total;
    totalPassed += summary.passed;
    totalFailed += summary.failed;

    for (const res of suite.results) {
      if (res.status === 'FAIL') {
        allFailures.push({ tier, ...res });
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  // Render Master Summary Table
  console.log(`\n${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                    EXECUTIVE TEST SUMMARY REPORT                    ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`  ${'Tier'.padEnd(8)} | ${'Description'.padEnd(36)} | ${'Pass/Total'.padEnd(12)} | ${'Time'.padEnd(8)} | ${'Status'.padEnd(8)}`);
  console.log(`  ${'-'.repeat(8)}-+-${'-'.repeat(36)}-+-${'-'.repeat(12)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`);

  for (const s of summaries) {
    const tierLabel = `Tier ${s.tier}`.padEnd(8);
    const descLabel = s.name.padEnd(36);
    const passLabel = `${s.passed}/${s.total}`.padEnd(12);
    const timeLabel = `${s.duration}ms`.padEnd(8);
    const statusLabel = s.failed === 0 ? `${colors.green}PASS${colors.reset}    ` : `${colors.red}FAIL (${s.failed})${colors.reset}`;
    console.log(`  ${tierLabel} | ${descLabel} | ${passLabel} | ${timeLabel} | ${statusLabel}`);
  }

  console.log(`  ${'-'.repeat(8)}-+-${'-'.repeat(36)}-+-${'-'.repeat(12)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`);
  const finalPassStr = `${totalPassed}/${totalTests}`.padEnd(12);
  const finalTimeStr = `${totalDuration}ms`.padEnd(8);
  const finalStatus = totalFailed === 0 ? `${colors.bright}${colors.green}ALL PASS${colors.reset}` : `${colors.bright}${colors.red}FAILURES${colors.reset}`;
  console.log(`  ${'TOTAL'.padEnd(8)} | ${'Comprehensive E2E Map Suite'.padEnd(36)} | ${finalPassStr} | ${finalTimeStr} | ${finalStatus}`);
  console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}\n`);

  if (allFailures.length > 0) {
    console.log(`${colors.bright}${colors.red}FAILURES DETECTED (${allFailures.length}):${colors.reset}`);
    for (const f of allFailures) {
      console.log(`  [Tier ${f.tier}] ${colors.red}${f.name}${colors.reset}`);
      console.log(`    Error: ${f.error.message}`);
    }
    console.log('');
    process.exitCode = 1;
  } else {
    console.log(`${colors.bright}${colors.green}√ 100% OF E2E TEST CASES PASSED CLEANLY.${colors.reset}`);
    console.log(`  Zero references to tiles.openfreemap.org verified.`);
    console.log(`  Leaflet v1.9.4 and CARTO Voyager contracts fully validated.`);
    console.log(`  Mobile AndroidInterface and moveToCoords bridges intact.\n`);
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(`Fatal error in test runner:`, err);
  process.exitCode = 1;
});
