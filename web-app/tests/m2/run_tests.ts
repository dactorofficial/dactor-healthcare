import { runClinicSyncManagerTests } from './clinicSyncManager.test.ts';

declare const process: any;

async function main() {
  console.log('STARTING MILESTONE 2 VERIFICATION TEST RUNNER...');
  try {
    await runClinicSyncManagerTests();
    console.log('\n======================================================');
    console.log('✅ ALL MILESTONE 2 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ TEST RUNNER TERMINATED WITH FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
