/**
 * Master Adversarial Test Runner for Milestone 1
 * Executes both tracking code and offline DB adversarial test suites.
 */

declare const process: any;

console.log('######################################################################');
console.log('###     RUNNING ALL MILESTONE 1 ADVERSARIAL STRESS TEST SUITES     ###');
console.log('######################################################################\n');

async function main() {
  const start = Date.now();

  console.log('>>> [1/2] Executing trackingCode.ts adversarial stress suite...\n');
  await import('./adversarial_trackingCode.test.ts');

  console.log('\n>>> [2/2] Executing clinicOfflineDb.ts adversarial outbox suite...\n');
  await import('./adversarial_outbox.test.ts');

  const totalTime = Date.now() - start;
  console.log('######################################################################');
  console.log(`### ALL ADVERSARIAL TEST SUITES COMPLETED IN ${totalTime}ms`);
  console.log('######################################################################');
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
