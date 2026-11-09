#!/usr/bin/env node
/**
 * Master E2E Test Suite Runner
 * Web Clinic Portal: Offline-First IndexedDB, Supabase Sync & Google Drive Backup
 *
 * Runs Tiers 1-4, asserts ≥138 tests, renders executive summary report, and exits 0 on pass.
 */

const { colors } = require('./test_runner_framework.js');
const tier1 = require('./tier1_feature_coverage.js');
const tier2 = require('./tier2_boundary_corner.js');
const tier3 = require('./tier3_cross_feature.js');
const tier4 = require('./tier4_real_world.js');

async function main() {
  console.log(`\n${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}   DACTOR WEB CLINIC PORTAL: 4-TIER OPAQUE-BOX E2E TEST SUITE       ${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`  Engine: IndexedDB (dactor_clinic_offline_v1) + Supabase LWW Sync + Google Drive Backup`);
  console.log(`  Target Surface: web-app/src/pages/ClinicPortal.tsx & Supporting Services`);
  console.log(`  Target Specifications: ORIGINAL_REQUEST.md (2026-10-22T19:07:28Z), PROJECT.md, TEST_INFRA.md\n`);

  const startTime = Date.now();
  const requestedTierArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  const suites = [
    { tier: 1, name: 'Tier 1: Feature Coverage (12 Features)', suite: tier1 },
    { tier: 2, name: 'Tier 2: Boundary & Corner Cases (12 Features)', suite: tier2 },
    { tier: 3, name: 'Tier 3: Cross-Feature Combinations', suite: tier3 },
    { tier: 4, name: 'Tier 4: Real-World Multi-Step Scenarios', suite: tier4 }
  ].filter((s) => (requestedTierArg ? s.tier === requestedTierArg : true));

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
  console.log(
    `  ${'Tier'.padEnd(8)} | ${'Description'.padEnd(40)} | ${'Pass/Total'.padEnd(12)} | ${'Time'.padEnd(8)} | ${'Status'.padEnd(8)}`
  );
  console.log(
    `  ${'-'.repeat(8)}-+-${'-'.repeat(40)}-+-${'-'.repeat(12)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`
  );

  for (const s of summaries) {
    const tierLabel = `Tier ${s.tier}`.padEnd(8);
    const descLabel = s.name.padEnd(40);
    const passLabel = `${s.passed}/${s.total}`.padEnd(12);
    const timeLabel = `${s.duration}ms`.padEnd(8);
    const statusLabel =
      s.failed === 0
        ? `${colors.green}PASS${colors.reset}    `
        : `${colors.red}FAIL (${s.failed})${colors.reset}`;
    console.log(`  ${tierLabel} | ${descLabel} | ${passLabel} | ${timeLabel} | ${statusLabel}`);
  }

  console.log(
    `  ${'-'.repeat(8)}-+-${'-'.repeat(40)}-+-${'-'.repeat(12)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}`
  );
  const finalPassStr = `${totalPassed}/${totalTests}`.padEnd(12);
  const finalTimeStr = `${totalDuration}ms`.padEnd(8);
  const finalStatus =
    totalFailed === 0
      ? `${colors.bright}${colors.green}ALL PASS${colors.reset}`
      : `${colors.bright}${colors.red}FAILURES${colors.reset}`;
  console.log(`  ${'TOTAL'.padEnd(8)} | ${'Comprehensive Offline Sync & Backup Suite'.padEnd(40)} | ${finalPassStr} | ${finalTimeStr} | ${finalStatus}`);
  console.log(`${colors.bright}${colors.cyan}======================================================================${colors.reset}\n`);

  // Target threshold validation
  const MIN_REQUIRED_TESTS = 138;
  if (!requestedTierArg && totalTests < MIN_REQUIRED_TESTS) {
    console.error(
      `${colors.bright}${colors.red}THRESHOLD VIOLATION: Expected ≥${MIN_REQUIRED_TESTS} tests, but only ran ${totalTests}.${colors.reset}\n`
    );
    process.exitCode = 1;
    return;
  }

  if (allFailures.length > 0) {
    console.log(`${colors.bright}${colors.red}FAILURES DETECTED (${allFailures.length}):${colors.reset}`);
    for (const f of allFailures) {
      console.log(`  [Tier ${f.tier}] ${colors.red}${f.name}${colors.reset}`);
      console.log(`    Error: ${f.error.message}`);
    }
    console.log('');
    process.exitCode = 1;
  } else {
    console.log(`${colors.bright}${colors.green}√ 100% OF E2E TEST CASES PASSED CLEANLY (${totalPassed}/${totalTests} tests).${colors.reset}`);
    console.log(`  IndexedDB object stores and compound indexes validated.`);
    console.log(`  Structured 10-digit Luhn tracking code generator validated.`);
    console.log(`  Mutation outbox FIFO and monotonic timestamp consistency validated.`);
    console.log(`  Supabase idempotent upsert and Last-Write-Wins delta conflict resolution validated.`);
    console.log(`  Recursive secret redaction, SHA-256 integrity hash, and backup restore validated.`);
    console.log(`  Real-world multi-step clinic reception workloads validated.\n`);
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(`Fatal error in test runner:`, err);
  process.exitCode = 1;
});
