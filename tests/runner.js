#!/usr/bin/env node
/**
 * Top-Level Master Test Suite Entry Point
 * Usage:
 *   node tests/runner.js
 *   node tests/runner.js --tier=1
 *   node tests/runner.js --tier=2
 *   node tests/runner.js --tier=3
 *   node tests/runner.js --tier=4
 */

const path = require('path');
const { runDoctorLiveQueueE2E } = require('./e2e_doctor_live_queue/run_all_tests.cjs');

async function main() {
  const exitCode = await runDoctorLiveQueueE2E();
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
