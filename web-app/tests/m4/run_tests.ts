import { runClinicPortalIntegrationTests } from './clinicPortalIntegration.test.ts';

declare const process: any;

async function main() {
  console.log('STARTING MILESTONE 4 VERIFICATION TEST RUNNER...');
  try {
    await runClinicPortalIntegrationTests();
    console.log('\n======================================================');
    console.log('✅ ALL MILESTONE 4 TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ TEST RUNNER TERMINATED WITH FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
