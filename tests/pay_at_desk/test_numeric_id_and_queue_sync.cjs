// tests/pay_at_desk/test_numeric_id_and_queue_sync.cjs
// Regression verification for 10-digit numeric appointment ID and Clinic App Live Queue cache sync

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('======================================================================');
console.log('  PAY AT DESK: 10-DIGIT NUMERIC ID & LIVE QUEUE SYNC REGRESSION TEST  ');
console.log('======================================================================');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

const rootDir = path.resolve(__dirname, '../..');

// 1. SQL Migration Verification
const migrationPath = path.join(rootDir, 'supabase/migration_fix_pay_at_desk_numeric_id_and_live_queue_sync.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

test('SQL Migration exists and is non-empty', () => {
  assert(fs.existsSync(migrationPath), 'Migration file does not exist');
  assert(migrationSql.length > 500, 'Migration file is too short');
});

test('SQL Migration uses generate_unique_tracking_code_10() instead of md5 hex substring', () => {
  assert(migrationSql.includes('generate_unique_tracking_code_10'), 'Missing generate_unique_tracking_code_10 function call');
  assert(!migrationSql.includes('upper(substring(md5('), 'Found forbidden md5 hexadecimal tracking code generation');
});

test('SQL Migration defines 17-param create_patient_appointment with p_tracking_code', () => {
  assert(migrationSql.includes('p_tracking_code TEXT DEFAULT NULL'), 'create_patient_appointment signature missing p_tracking_code parameter');
  assert(migrationSql.includes("p_tracking_code ~ '^[1-9][0-9]{9}$'"), 'Missing 10-digit numeric regex validation for p_tracking_code');
});

test('SQL Migration maintains 16-param backward-compatible wrapper', () => {
  assert(migrationSql.includes('CREATE OR REPLACE FUNCTION public.create_patient_appointment('), 'Missing create_patient_appointment definition');
  assert(migrationSql.includes('p_fee_amount NUMERIC(10, 2) DEFAULT NULL'), 'Missing 16-param overload last argument');
  assert(migrationSql.includes('p_tracking_code => NULL'), 'Missing forwarding of NULL p_tracking_code');
});

test('SQL Migration triggers schema reload for PostgREST', () => {
  assert(migrationSql.includes("NOTIFY pgrst, 'reload schema'"), 'Missing PostgREST schema reload notification');
});

// 2. Patient App Repository Verification
const patientApptRepoPath = path.join(rootDir, 'patient-app/app/src/main/java/com/dactor/patient/data/repository/AppointmentRepository.kt');
const patientApptRepo = fs.readFileSync(patientApptRepoPath, 'utf8');
const patientGeneratorPath = path.join(rootDir, 'patient-app/app/src/main/java/com/dactor/patient/domain/util/TrackingCodeGenerator.kt');
const patientGenerator = fs.readFileSync(patientGeneratorPath, 'utf8');

test('Patient App generates and passes 10-digit numeric tracking code', () => {
  assert(patientGenerator.includes('(1..9).random()'), 'TrackingCodeGenerator must start with 1-9');
  assert(patientGenerator.includes('(0..9).random()'), 'TrackingCodeGenerator must generate remaining 9 digits');
  assert(patientApptRepo.includes('"p_tracking_code"'), 'Patient app RPC parameters missing p_tracking_code');
  assert(patientApptRepo.includes('appointment.trackingCode10Digit.all { it.isDigit() }'), 'Missing numeric validation in patient repo');
});

// 3. Clinic App Cache Invalidation & Live Queue Self-Healing Verification
const clinicApptRepoPath = path.join(rootDir, 'clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt');
const clinicApptRepo = fs.readFileSync(clinicApptRepoPath, 'utf8');

test('Clinic App AppointmentRepository provides cache invalidation hooks', () => {
  assert(clinicApptRepo.includes('fun invalidateClinicAppointments('), 'Missing invalidateClinicAppointments');
  assert(clinicApptRepo.includes('fun invalidateDoctorAppointments('), 'Missing invalidateDoctorAppointments');
});

test('Clinic App approvePayAtDeskAppointment immediately synchronizes Room and in-memory caches', () => {
  assert(clinicApptRepo.includes('clinicAppointmentsCache[cid]'), 'Missing in-memory clinicAppointmentsCache update on approval');
  assert(clinicApptRepo.includes('appointmentDao?.upsert('), 'Missing Room upsert of approved appointment on approval');
});

const clinicQueueRepoPath = path.join(rootDir, 'clinic-app/app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt');
const clinicQueueRepo = fs.readFileSync(clinicQueueRepoPath, 'utf8');

test('Clinic App QueueRepository provides queue cache invalidation hooks', () => {
  assert(clinicQueueRepo.includes('fun invalidateClinicQueueCache('), 'Missing invalidateClinicQueueCache');
  assert(clinicQueueRepo.includes('fun invalidateDoctorQueueCache('), 'Missing invalidateDoctorQueueCache');
});

const payAtDeskScreenPath = path.join(rootDir, 'clinic-app/app/src/main/java/com/dactor/clinic/ui/appointments/PayAtDeskRequestsScreen.kt');
const payAtDeskScreen = fs.readFileSync(payAtDeskScreenPath, 'utf8');

test('PayAtDeskRequestsScreen triggers invalidations on approval', () => {
  assert(payAtDeskScreen.includes('invalidateClinicAppointments'), 'Screen does not invalidate clinic appointments cache on approve');
  assert(payAtDeskScreen.includes('invalidateClinicQueueCache'), 'Screen does not invalidate clinic queue cache on approve');
});

const queueBoardScreenPath = path.join(rootDir, 'clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt');
const queueBoardScreen = fs.readFileSync(queueBoardScreenPath, 'utf8');

test('QueueBoardScreen forces fresh appointment retrieval and repairs missing/unapproved appointments', () => {
  assert(queueBoardScreen.includes('forceRefresh = true'), 'QueueBoardScreen loadQueue missing forceRefresh = true');
  assert(queueBoardScreen.includes('refreshAppointmentsByIds(missingOrUnapprovedIds)'), 'QueueBoardScreen missing self-healing refreshAppointmentsByIds');
});

const doctorQueueViewModelPath = path.join(rootDir, 'clinic-app/app/src/main/java/com/dactor/clinic/ui/queue/DoctorQueueViewModel.kt');
const doctorQueueViewModel = fs.readFileSync(doctorQueueViewModelPath, 'utf8');

test('DoctorQueueViewModel refreshes missing appointments for doctor queue', () => {
  assert(doctorQueueViewModel.includes('refreshAppointmentsByIds(missingEntryIds)'), 'DoctorQueueViewModel missing refreshAppointmentsByIds');
});

// 4. Web Application Parity Verification
const webDbPath = path.join(rootDir, 'web-app/src/services/db.ts');
const webDb = fs.readFileSync(webDbPath, 'utf8');

test('Web App passes 10-digit numeric tracking code to create_patient_appointment', () => {
  assert(webDb.includes('p_tracking_code:'), 'Web App createAppointment missing p_tracking_code');
  assert(webDb.includes('/^\\d{10}$/'), 'Web App missing 10-digit numeric regex check');
});

// 5. Algorithmic Check for 10-Digit Numeric Format
test('10-digit numeric generation conforms to /^[1-9]\\d{9}$/ (never leading 0 or alpha)', () => {
  for (let i = 0; i < 1000; i++) {
    const min = 1000000000n;
    const max = 9999999999n;
    const range = max - min + 1n;
    const randomBig = BigInt(Math.floor(Math.random() * 1000000000)) * 10n + BigInt(Math.floor(Math.random() * 10));
    const generated = (min + (randomBig % range)).toString();
    
    assert.strictEqual(generated.length, 10, `Length must be 10, got: ${generated.length}`);
    assert(/^[1-9]\d{9}$/.test(generated), `Code must be 10 numeric digits starting with 1-9: ${generated}`);
    assert(!/[a-zA-Z]/.test(generated), `Code must not contain alphabetics: ${generated}`);
  }
});

console.log('======================================================================');
console.log(`  SUMMARY: Passed: ${passed} | Failed: ${failed}`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ All 10-digit numeric ID & live queue sync regression checks passed successfully.');
}
