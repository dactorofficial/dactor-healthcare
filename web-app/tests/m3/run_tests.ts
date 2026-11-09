import { runClinicBackupServiceTests } from './clinicBackupService.test.ts';

declare const process: any;

async function main() {
  console.log('STARTING MILESTONE 3 VERIFICATION TEST RUNNER...');
  try {
    await runClinicBackupServiceTests();
    console.log('\n======================================================');
    console.log('✅ ALL MILESTONE 3 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ TEST RUNNER TERMINATED WITH FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
