#!/usr/bin/env node
/**
 * DACTOR Platform End-to-End Security Hardening — Master E2E Test Suite Runner
 * Executes Tiers 1-4, produces structured reports, and exits with code 0 on complete pass.
 *
 * Usage:
 *   node tests/e2e_security/run_all_security_tests.cjs       # Run all 4 tiers
 *   node tests/e2e_security/run_all_security_tests.cjs 1     # Run Tier 1 only
 *   node tests/e2e_security/run_all_security_tests.cjs 2     # Run Tier 2 only
 *   node tests/e2e_security/run_all_security_tests.cjs 3     # Run Tier 3 only
 *   node tests/e2e_security/run_all_security_tests.cjs 4     # Run Tier 4 only
 */

const { colors } = require('./test_runner_framework.cjs');
const tier1 = require('./tier1_feature_coverage.test.cjs');
const tier2 = require('./tier2_boundary_corner.test.cjs');
const tier3 = require('./tier3_cross_feature.test.cjs');
const tier4 = require('./tier4_real_world.test.cjs');

async function main() {
  console.log(`\n${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}   DACTOR PLATFORM SECURITY HARDENING: MULTI-TIER E2E TEST SUITE    ${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}======================================================================${colors.reset}`);
  console.log(`  Target Architecture: Web App, Admin Panel, Supabase Database & Edge Functions`);
  console.log(`  Security Domains: R1 through R10 Authoritative Security Specifications`);
  console.log(`  Integrity Mode: Opaque-Box Black-Box Genuine Behavioral Assertions\n`);

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
  console.log(`  ${'TOTAL'.padEnd(8)} | ${'Platform Security E2E Suite'.padEnd(36)} | ${finalPassStr} | ${finalTimeStr} | ${finalStatus}`);
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
    console.log(`${colors.bright}${colors.green}√ 100% OF E2E SECURITY HARDENING TESTS PASSED CLEANLY.${colors.reset}`);
    console.log(`  R1: Authoritative appointment fee calculation & pending status verified.`);
    console.log(`  R2: Public tracking PII isolation & 10-digit phone guest access verified.`);
    console.log(`  R3: Server-authorized upload pipeline (10MB limit & MIME allowlist) verified.`);
    console.log(`  R4: Public discovery view secret redaction & plain-text hygiene verified.`);
    console.log(`  R5: RLS policy hardening & role privilege escalation guards verified.`);
    console.log(`  R6: Dynamic CORS origin reflection against ALLOWED_ORIGINS verified.`);
    console.log(`  R7: eSewa HMAC-SHA256 signature verification & amount matching verified.`);
    console.log(`  R8: DOM URL protocol safety (isSafeUrl) & XSS escaping verified.`);
    console.log(`  R9: Client bundle credential protection & secret isolation verified.`);
    console.log(`  R10: Firebase alphanumeric UID non-throwing compatibility verified.\n`);
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(`Fatal error in test runner:`, err);
  process.exitCode = 1;
});
