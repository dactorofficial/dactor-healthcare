import { runTrackingCodeTests } from './trackingCode.test.ts';
import { runClinicOfflineDbTests } from './clinicOfflineDb.test.ts';

declare const process: any;

async function main() {
  console.log('STARTING MILESTONE 1 VERIFICATION TEST RUNNER...');
  try {
    runTrackingCodeTests();
    await runClinicOfflineDbTests();
    console.log('\n======================================================');
    console.log('✅ ALL MILESTONE 1 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ TEST RUNNER TERMINATED WITH FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
