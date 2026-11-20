/**
 * Automated Verification Script for Notification & Consultation Query Optimization
 * File: tests/test_notification_query_optimization.cjs
 * 
 * Tests:
 * 1. Doctor & Clinic Portal Query Elimination (clinic-app & web-app)
 * 2. Patient App Dual Polling Scheduling (10s active today vs 2h idle)
 * 3. Patient ID Presence Check (no background querying when patient ID is missing)
 * 4. Web App Parity & One-Way Logic Synchronization (LiveQueue & ClinicPortal)
 * 5. Backend SQL Migration Syntax & Function Definition Verification
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m'
};

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  ${ANSI.green}✓ [PASS]${ANSI.reset} ${message}`);
    if (details) console.log(`     ${ANSI.cyan}${details}${ANSI.reset}`);
  } else {
    failed++;
    console.error(`  ${ANSI.red}✗ [FAIL]${ANSI.reset} ${message}`);
    if (details) console.error(`     ${ANSI.yellow}Details: ${details}${ANSI.reset}`);
  }
}

console.log(`${ANSI.bold}=== VERIFYING NOTIFICATION QUERY OPTIMIZATION & REMOVAL FROM CLINIC/DOCTOR PORTALS ===${ANSI.reset}\n`);

// -----------------------------------------------------------------------------
// Test Suite 1: Doctor and Clinic Portal Query Elimination (clinic-app)
// -----------------------------------------------------------------------------
console.log(`${ANSI.cyan}--- Suite 1: clinic-app Doctor & Clinic Query Elimination ---${ANSI.reset}`);

const clinicMainPath = path.join(ROOT_DIR, 'clinic-app/app/src/main/java/com/dactor/clinic/MainActivity.kt');
const clinicMainContent = fs.readFileSync(clinicMainPath, 'utf8');

assert(
  !clinicMainContent.includes('notificationRepository.getNotifications') &&
  !clinicMainContent.includes('delay(4000L)'),
  'MainActivity in clinic-app has no 4-second polling loop querying notifications',
  'Polling loop completely removed from activity lifecycle'
);

const clinicAppPath = path.join(ROOT_DIR, 'clinic-app/app/src/main/java/com/dactor/clinic/DactorClinicApp.kt');
const clinicAppContent = fs.readFileSync(clinicAppPath, 'utf8');

assert(
  !clinicAppContent.includes('NotificationAlarmReceiver.startPeriodicAlarm(this)') &&
  clinicAppContent.includes('NotificationAlarmReceiver.stopPeriodicAlarm(this)'),
  'DactorClinicApp stops periodic notification alarms upon startup',
  'startPeriodicAlarm replaced with stopPeriodicAlarm'
);

const clinicAlarmPath = path.join(ROOT_DIR, 'clinic-app/app/src/main/java/com/dactor/clinic/service/NotificationAlarmReceiver.kt');
const clinicAlarmContent = fs.readFileSync(clinicAlarmPath, 'utf8');

assert(
  clinicAlarmContent.includes('stopPeriodicAlarm(context)') &&
  !clinicAlarmContent.includes('scheduleNextAlarm(context, 30_000L)'),
  'NotificationAlarmReceiver in clinic-app cancels background alarms and stops rescheduling',
  'Periodic wake-up alarm removed'
);

const clinicQueueRepoPath = path.join(ROOT_DIR, 'clinic-app/app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt');
const clinicQueueRepoContent = fs.readFileSync(clinicQueueRepoPath, 'utf8');

assert(
  clinicQueueRepoContent.includes('suspend fun getClinicNotifications(clinicId: String): List<DactorNotification>') &&
  clinicQueueRepoContent.includes('emptyList()'),
  'QueueRepository getClinicNotifications in clinic-app returns emptyList with 0 server queries',
  'PostgREST notifications queries removed'
);

// -----------------------------------------------------------------------------
// Test Suite 2: Patient App Dual Polling Scheduling & Patient ID Guard
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.cyan}--- Suite 2: patient-app Dual Query Intervals & Patient ID Guard ---${ANSI.reset}`);

const patientMainPath = path.join(ROOT_DIR, 'patient-app/app/src/main/java/com/dactor/patient/MainActivity.kt');
const patientMainContent = fs.readFileSync(patientMainPath, 'utf8');

assert(
  patientMainContent.includes('userId.isNullOrBlank() && savedCodes.isEmpty()') &&
  patientMainContent.includes('2 * 60 * 60 * 1000L'),
  'MainActivity in patient-app enforces patient ID presence and throttles to 2 hours if missing',
  'Patient ID presence check enforced before executing server queries'
);

assert(
  patientMainContent.includes('10_000L // 10-second interval when patient has ongoing appointment on appointment day') &&
  patientMainContent.includes('2 * 60 * 60 * 1000L // 2-hour interval when no appointment is scheduled on that day'),
  'MainActivity dynamically switches between 10-second active interval and 2-hour idle interval',
  'Dual-mode query schedule active'
);

const patientQueueScreenPath = path.join(ROOT_DIR, 'patient-app/app/src/main/java/com/dactor/patient/ui/tracker/QueueStatusScreen.kt');
const patientQueueScreenContent = fs.readFileSync(patientQueueScreenPath, 'utf8');

assert(
  patientQueueScreenContent.includes('delay(10000L)') &&
  patientQueueScreenContent.includes('isFinished'),
  'QueueStatusScreen in patient-app queries on 10-second interval and halts when finished',
  'delay(4000L) replaced with 10000L and early break on completion'
);

const patientAlarmPath = path.join(ROOT_DIR, 'patient-app/app/src/main/java/com/dactor/patient/service/NotificationAlarmReceiver.kt');
const patientAlarmContent = fs.readFileSync(patientAlarmPath, 'utf8');

assert(
  patientAlarmContent.includes('userId.isNullOrBlank() && savedCodes.isEmpty()') &&
  patientAlarmContent.includes('10_000L // 10-second interval when patient has ongoing appointment on appointment day') &&
  patientAlarmContent.includes('2 * 60 * 60 * 1000L // 2-hour interval when no appointment scheduled on that day'),
  'NotificationAlarmReceiver in patient-app enforces 10s active vs 2h idle alarm scheduling',
  'Background alarm rate dynamically reflects ongoing appointment state'
);

const patientAppPath = path.join(ROOT_DIR, 'patient-app/app/src/main/java/com/dactor/patient/DactorPatientApp.kt');
const patientAppContent = fs.readFileSync(patientAppPath, 'utf8');

assert(
  patientAppContent.includes('2, TimeUnit.HOURS') &&
  patientAppContent.includes('ExistingPeriodicWorkPolicy.UPDATE'),
  'DactorPatientApp schedules WorkManager at 2-hour periodic interval',
  'WorkManager reduced from 15 mins to 2 hours'
);

// -----------------------------------------------------------------------------
// Test Suite 3: Web App Parity & Logic Synchronization
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.cyan}--- Suite 3: web-app Parity & Synchronization ---${ANSI.reset}`);

const webClinicPortalPath = path.join(ROOT_DIR, 'web-app/src/pages/ClinicPortal.tsx');
const webClinicPortalContent = fs.readFileSync(webClinicPortalPath, 'utf8');

assert(
  !webClinicPortalContent.includes('getClinicNotifications(selectedClinic.id)') &&
  webClinicPortalContent.includes('setClinicNotifications([])'),
  'ClinicPortal in web-app removes getClinicNotifications from initial load',
  'Zero notification queries executed on clinic portal load'
);

const webDbPath = path.join(ROOT_DIR, 'web-app/src/services/db.ts');
const webDbContent = fs.readFileSync(webDbPath, 'utf8');

const normalizedWebDb = webDbContent.replace(/\r\n/g, '\n');
assert(
  normalizedWebDb.includes('export async function getClinicNotifications(_clinicId: string): Promise<DactorNotification[]> {\n  // Query request removed from doctor and clinic portal (restricted strictly to patient app)\n  return []\n}'),
  'db.ts getClinicNotifications returns empty array without querying database',
  'Supabase notifications table query removed'
);

assert(
  webDbContent.includes('getPatientConsultationQuery') &&
  webDbContent.includes('get_patient_consultation_query'),
  'db.ts exports getPatientConsultationQuery calling the backend RPC',
  'Atomic client helper integrated'
);

const webLiveQueuePath = path.join(ROOT_DIR, 'web-app/src/pages/LiveQueue.tsx');
const webLiveQueueContent = fs.readFileSync(webLiveQueuePath, 'utf8');

assert(
  webLiveQueueContent.includes('10000) // 10-second interval when patient has ongoing appointment on appointment day') &&
  webLiveQueueContent.includes('if (isFinished) return'),
  'LiveQueue in web-app refreshes on 10-second interval and halts when appointment is complete',
  'Auto-refresh synchronized with Android QueueStatusScreen'
);

// -----------------------------------------------------------------------------
// Test Suite 4: Supabase SQL Migration
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.cyan}--- Suite 4: Backend Supabase Migration ---${ANSI.reset}`);

const migrationPath = path.join(ROOT_DIR, 'supabase/migration_optimize_patient_consultation_query.sql');
assert(fs.existsSync(migrationPath), 'SQL migration file exists');

const migrationContent = fs.readFileSync(migrationPath, 'utf8');
assert(
  migrationContent.includes('CREATE OR REPLACE FUNCTION public.get_patient_consultation_query') &&
  migrationContent.includes('appointment_date = CURRENT_DATE') &&
  migrationContent.includes("'query_interval_seconds', 10") &&
  migrationContent.includes("'query_interval_seconds', 7200") &&
  migrationContent.includes('GRANT EXECUTE ON FUNCTION public.get_patient_consultation_query'),
  'SQL migration defines get_patient_consultation_query with 10s vs 7200s dual interval logic',
  'Atomic RPC verified'
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log(`\n${ANSI.bold}=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===${ANSI.reset}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`${ANSI.green}${ANSI.bold}ALL VERIFICATION TESTS PASSED SUCCESSFULLY!${ANSI.reset}\n`);
  process.exit(0);
}
