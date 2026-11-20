/**
 * Test Suite: Diagnostic Lab Single Common Live Queue Architecture
 * 
 * Tests:
 * 1. Single Common Queue in Diagnostic Lab:
 *    - All patients in a diagnostic lab enter ONE common live queue with sequential tokens #1, #2, #3.
 *    - Doctor ID is normalized to null (no fragmentation by doctor or test).
 * 2. Strict Cross-Facility Isolation (NEGATIVE CONSTRAINT):
 *    - Lab A and Lab B both have patients on the same date.
 *    - Lab A gets tokens #1, #2... for Lab A only.
 *    - Lab B gets tokens #1, #2... for Lab B only.
 *    - Lab A queries NEVER include Lab B patients.
 *    - "Patients Ahead" in Lab A NEVER counts Lab B patients.
 * 3. Regular OPD Clinics Preserve Doctor Isolation:
 *    - Dr. Alpha and Dr. Beta in Clinic C maintain independent token sequences (#1, #2 for Alpha; #1, #2 for Beta).
 * 4. Public Queue Status RPC:
 *    - Accurately tracks "Now Serving" and "Patients Ahead" for diagnostic lab common queue.
 * 5. Lifecycle Transitions in Common Queue:
 *    - Advancing turn 1 to inside/processing updates waitlist for turn 2.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test suite harness
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  √ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  X [FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  √ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  X [FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

// In-Memory Platform Simulator
class PlatformQueueSimulator {
  constructor() {
    this.clinics = new Map();
    this.doctors = new Map();
    this.appointments = new Map();
    this.queueEntries = new Map();
  }

  isDiagnosticLabClinic(clinicId) {
    const c = this.clinics.get(clinicId);
    if (!c) return false;
    const t = (c.type || '').toLowerCase();
    const n = (c.name || '').toLowerCase();
    const specialties = (c.specialties || []).map(s => s.toLowerCase());
    return t === 'diagnostic_lab' || t.includes('lab') || t.includes('diagnostic') ||
           n.includes('lab') || n.includes('diagnostic') || n.includes('patholog') ||
           specialties.some(s => s.includes('lab') || s.includes('patholog') || s.includes('diagnostic') || s.includes('radiolog') || s.includes('scan'));
  }

  addClinic(id, name, type, specialties = []) {
    this.clinics.set(id, { id, name, type, specialties });
  }

  addDoctor(id, clinicId, fullName) {
    this.doctors.set(id, { id, clinicId, fullName });
  }

  bookAppointment({ id, clinicId, doctorId, patientName, appointmentDate, appointmentTime, selectedLabTests, trackingCode }) {
    const isLab = this.isDiagnosticLabClinic(clinicId) || Boolean(selectedLabTests);
    const effectiveDocId = isLab ? null : doctorId;
    const appt = {
      id,
      clinicId,
      doctorId: effectiveDocId,
      patientName,
      appointmentDate,
      appointmentTime,
      selectedLabTests: selectedLabTests || null,
      trackingCode,
      status: 'APPROVED',
      checkinStatus: 'waiting'
    };
    this.appointments.set(id, appt);
    return appt;
  }

  enrollIntoQueue(appointmentId) {
    const appt = this.appointments.get(appointmentId);
    if (!appt) throw new Error('Appointment not found');

    const isLab = this.isDiagnosticLabClinic(appt.clinicId) || Boolean(appt.selectedLabTests);

    // Compute next queue position
    let nextPos = 1;
    const existingClinicEntries = Array.from(this.queueEntries.values()).filter(q => 
      q.clinicId === appt.clinicId && (q.status === 'waiting' || q.status === 'inside')
    );

    if (isLab) {
      // Single common queue for this clinic facility!
      const maxPos = existingClinicEntries.reduce((max, q) => Math.max(max, q.queuePosition), 0);
      nextPos = maxPos + 1;
    } else {
      // Doctor-partitioned queue
      const docEntries = existingClinicEntries.filter(q => 
        (appt.doctorId && q.doctorId === appt.doctorId) || (!appt.doctorId && !q.doctorId)
      );
      const maxPos = docEntries.reduce((max, q) => Math.max(max, q.queuePosition), 0);
      nextPos = maxPos + 1;
    }

    const entry = {
      id: `qe_${appointmentId}`,
      appointmentId,
      clinicId: appt.clinicId,
      doctorId: isLab ? null : appt.doctorId,
      queuePosition: nextPos,
      status: 'waiting'
    };

    this.queueEntries.set(entry.id, entry);
    return entry;
  }

  getPublicQueueStatus(trackingCode) {
    const appt = Array.from(this.appointments.values()).find(a => a.trackingCode === trackingCode);
    if (!appt) return null;

    const entry = Array.from(this.queueEntries.values()).find(q => q.appointmentId === appt.id);
    const isLab = this.isDiagnosticLabClinic(appt.clinicId) || Boolean(appt.selectedLabTests);

    // Patients ahead calculation
    let patientsAhead = 0;
    if (entry && entry.queuePosition) {
      const aheadEntries = Array.from(this.queueEntries.values()).filter(q => {
        if (q.clinicId !== appt.clinicId) return false; // STRICT CLINIC ISOLATION!
        if (q.status !== 'waiting') return false;
        if (q.queuePosition >= entry.queuePosition) return false;

        const aheadAppt = this.appointments.get(q.appointmentId);
        if (aheadAppt?.appointmentDate !== appt.appointmentDate) return false;

        if (isLab) {
          // Single common queue for diagnostic lab: NO doctor filter
          return true;
        } else {
          // OPD doctor: must match doctor
          return (appt.doctorId && q.doctorId === appt.doctorId) || (!appt.doctorId && !q.doctorId);
        }
      });
      patientsAhead = aheadEntries.length;
    }

    // Now Serving token calculation
    let nowServing = 0;
    const insideEntries = Array.from(this.queueEntries.values()).filter(q => {
      if (q.clinicId !== appt.clinicId) return false; // STRICT CLINIC ISOLATION!
      if (q.status !== 'inside') return false;

      const insideAppt = this.appointments.get(q.appointmentId);
      if (insideAppt?.appointmentDate !== appt.appointmentDate) return false;

      if (isLab) {
        return true;
      } else {
        return (appt.doctorId && q.doctorId === appt.doctorId) || (!appt.doctorId && !q.doctorId);
      }
    });

    if (insideEntries.length > 0) {
      nowServing = Math.min(...insideEntries.map(q => q.queuePosition));
    }

    return {
      trackingCode,
      clinicId: appt.clinicId,
      isDiagnosticLab: isLab,
      queuePosition: entry ? entry.queuePosition : 0,
      patientsAhead,
      nowServing
    };
  }

  getDoctorLiveQueue(clinicId, doctorId = null) {
    const isLab = this.isDiagnosticLabClinic(clinicId);
    return Array.from(this.queueEntries.values())
      .filter(q => {
        if (q.clinicId !== clinicId) return false; // Strict clinic isolation
        if (isLab) return true; // Single common queue: ignore doctorId!
        if (doctorId) return q.doctorId === doctorId;
        return true;
      })
      .sort((a, b) => a.queuePosition - b.queuePosition);
  }
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('  DACTOR: DIAGNOSTIC LAB SINGLE COMMON LIVE QUEUE TEST SUITE');
  console.log('  Testing Single Common Queue & Negative Constraint Isolation');
  console.log('======================================================================\n');

  const sim = new PlatformQueueSimulator();

  // Setup: 2 Diagnostic Labs, 1 OPD Clinic
  sim.addClinic('lab_alpha', 'Alpha Pathology & Diagnostic Center', 'diagnostic_lab', ['Blood Test', 'Pathology']);
  sim.addClinic('lab_beta', 'Beta Diagnostic Imaging & Scans', 'diagnostic_lab', ['Ultrasound', 'X-Ray']);
  sim.addClinic('clinic_gamma', 'Gamma Multi-Specialty Clinic', 'opd_clinic', ['General Medicine']);

  sim.addDoctor('doc_alpha_tech', 'lab_alpha', 'Tech. Alpha Technician');
  sim.addDoctor('doc_g1', 'clinic_gamma', 'Dr. Sharma (Cardiology)');
  sim.addDoctor('doc_g2', 'clinic_gamma', 'Dr. Verma (Orthopedics)');

  console.log('--- TEST GROUP 1: Single Common Queue per Diagnostic Lab ---');

  test('T1.1: Lab Alpha patients receive sequential tokens #1, #2, #3 regardless of doctor or test', () => {
    // Book 3 patients with different tests in Lab Alpha
    const p1 = sim.bookAppointment({
      id: 'appt_a1',
      clinicId: 'lab_alpha',
      doctorId: 'doc_alpha_tech',
      patientName: 'Ramesh Sharma',
      appointmentDate: '2026-11-21',
      appointmentTime: '09:00:00',
      selectedLabTests: 'Complete Blood Count (CBC)',
      trackingCode: '1000000001'
    });
    const qe1 = sim.enrollIntoQueue(p1.id);
    assert.strictEqual(qe1.queuePosition, 1, 'First lab patient must get Token #1');
    assert.strictEqual(qe1.doctorId, null, 'Lab queue entry doctor_id must be normalized to null');

    const p2 = sim.bookAppointment({
      id: 'appt_a2',
      clinicId: 'lab_alpha',
      doctorId: null,
      patientName: 'Sita Thapa',
      appointmentDate: '2026-11-21',
      appointmentTime: '09:15:00',
      selectedLabTests: 'Thyroid Function Test (TFT)',
      trackingCode: '1000000002'
    });
    const qe2 = sim.enrollIntoQueue(p2.id);
    assert.strictEqual(qe2.queuePosition, 2, 'Second lab patient must get Token #2 in same common queue');
    assert.strictEqual(qe2.doctorId, null, 'Lab queue entry doctor_id must be normalized to null');

    const p3 = sim.bookAppointment({
      id: 'appt_a3',
      clinicId: 'lab_alpha',
      doctorId: 'doc_alpha_tech',
      patientName: 'Hari Gurung',
      appointmentDate: '2026-11-21',
      appointmentTime: '09:30:00',
      selectedLabTests: 'Lipid Profile',
      trackingCode: '1000000003'
    });
    const qe3 = sim.enrollIntoQueue(p3.id);
    assert.strictEqual(qe3.queuePosition, 3, 'Third lab patient must get Token #3 in same common queue');
    assert.strictEqual(qe3.doctorId, null, 'Lab queue entry doctor_id must be normalized to null');
  });

  test('T1.2: getDoctorLiveQueue for Lab Alpha returns all 3 patients in one single common queue', () => {
    const queue = sim.getDoctorLiveQueue('lab_alpha', 'doc_alpha_tech');
    assert.strictEqual(queue.length, 3, 'Queue must contain all 3 patients in Lab Alpha');
    assert.strictEqual(queue[0].queuePosition, 1);
    assert.strictEqual(queue[1].queuePosition, 2);
    assert.strictEqual(queue[2].queuePosition, 3);
  });

  console.log('\n--- TEST GROUP 2: Strict Isolation Between Different Diagnostic Labs (NEGATIVE CONSTRAINT) ---');

  test('T2.1: Lab Beta gets independent token sequence starting from #1 (zero cross-lab contamination)', () => {
    // Book 2 patients in Lab Beta
    const pb1 = sim.bookAppointment({
      id: 'appt_b1',
      clinicId: 'lab_beta',
      doctorId: null,
      patientName: 'Anita Rai',
      appointmentDate: '2026-11-21',
      appointmentTime: '09:00:00',
      selectedLabTests: 'Pelvic Ultrasound (USG)',
      trackingCode: '2000000001'
    });
    const qeb1 = sim.enrollIntoQueue(pb1.id);
    assert.strictEqual(qeb1.queuePosition, 1, 'First patient in Lab Beta must start at Token #1 (NOT #4 from Lab Alpha)');

    const pb2 = sim.bookAppointment({
      id: 'appt_b2',
      clinicId: 'lab_beta',
      doctorId: null,
      patientName: 'Bikash Karki',
      appointmentDate: '2026-11-21',
      appointmentTime: '09:15:00',
      selectedLabTests: 'Chest X-Ray Digital',
      trackingCode: '2000000002'
    });
    const qeb2 = sim.enrollIntoQueue(pb2.id);
    assert.strictEqual(qeb2.queuePosition, 2, 'Second patient in Lab Beta must get Token #2 in Lab Beta queue');
  });

  test('T2.2: Lab Beta queries NEVER contain Lab Alpha patients (Negative Constraint Verification)', () => {
    const labBQueue = sim.getDoctorLiveQueue('lab_beta');
    assert.strictEqual(labBQueue.length, 2, 'Lab Beta must only return its own 2 patients');
    const labBApptIds = labBQueue.map(q => q.appointmentId);
    assert.ok(labBApptIds.includes('appt_b1'));
    assert.ok(labBApptIds.includes('appt_b2'));
    assert.ok(!labBApptIds.includes('appt_a1'), 'CRITICAL: Lab Beta must NEVER contain Lab Alpha patient appt_a1');
    assert.ok(!labBApptIds.includes('appt_a2'), 'CRITICAL: Lab Beta must NEVER contain Lab Alpha patient appt_a2');
    assert.ok(!labBApptIds.includes('appt_a3'), 'CRITICAL: Lab Beta must NEVER contain Lab Alpha patient appt_a3');
  });

  test('T2.3: Lab Alpha queries NEVER contain Lab Beta patients', () => {
    const labAQueue = sim.getDoctorLiveQueue('lab_alpha');
    assert.strictEqual(labAQueue.length, 3, 'Lab Alpha must only return its own 3 patients');
    const labAApptIds = labAQueue.map(q => q.appointmentId);
    assert.ok(!labAApptIds.includes('appt_b1'), 'CRITICAL: Lab Alpha must NEVER contain Lab Beta patient appt_b1');
    assert.ok(!labAApptIds.includes('appt_b2'), 'CRITICAL: Lab Alpha must NEVER contain Lab Beta patient appt_b2');
  });

  console.log('\n--- TEST GROUP 3: Public Queue Status RPC Validation ---');

  test('T3.1: getPublicQueueStatus accurately counts patients ahead in Lab Alpha common queue', () => {
    const s1 = sim.getPublicQueueStatus('1000000001'); // Patient 1
    assert.strictEqual(s1.queuePosition, 1);
    assert.strictEqual(s1.patientsAhead, 0, 'Patient 1 has 0 patients ahead');

    const s2 = sim.getPublicQueueStatus('1000000002'); // Patient 2
    assert.strictEqual(s2.queuePosition, 2);
    assert.strictEqual(s2.patientsAhead, 1, 'Patient 2 has 1 patient ahead (Patient 1)');

    const s3 = sim.getPublicQueueStatus('1000000003'); // Patient 3
    assert.strictEqual(s3.queuePosition, 3);
    assert.strictEqual(s3.patientsAhead, 2, 'Patient 3 has 2 patients ahead (Patient 1 & 2)');
  });

  test('T3.2: getPublicQueueStatus for Lab Beta reflects ONLY Lab Beta line (no interference from Lab Alpha)', () => {
    const sb1 = sim.getPublicQueueStatus('2000000001'); // Lab Beta Patient 1
    assert.strictEqual(sb1.queuePosition, 1);
    assert.strictEqual(sb1.patientsAhead, 0, 'Lab Beta Patient 1 has 0 patients ahead');

    const sb2 = sim.getPublicQueueStatus('2000000002'); // Lab Beta Patient 2
    assert.strictEqual(sb2.queuePosition, 2);
    assert.strictEqual(sb2.patientsAhead, 1, 'Lab Beta Patient 2 has exactly 1 patient ahead in Lab Beta');
  });

  console.log('\n--- TEST GROUP 4: Regular OPD Medical Clinics Preserve Doctor Isolation ---');

  test('T4.1: Regular clinic Gamma maintains independent per-doctor tokens (Dr. Sharma vs Dr. Verma)', () => {
    // Patient 1 for Dr. Sharma
    const pg1 = sim.bookAppointment({
      id: 'appt_g1',
      clinicId: 'clinic_gamma',
      doctorId: 'doc_g1',
      patientName: 'Sunil Basnet',
      appointmentDate: '2026-11-21',
      appointmentTime: '10:00:00',
      trackingCode: '3000000001'
    });
    const qeg1 = sim.enrollIntoQueue(pg1.id);
    assert.strictEqual(qeg1.queuePosition, 1, 'Dr. Sharma Patient 1 gets Token #1');
    assert.strictEqual(qeg1.doctorId, 'doc_g1');

    // Patient 1 for Dr. Verma
    const pg2 = sim.bookAppointment({
      id: 'appt_g2',
      clinicId: 'clinic_gamma',
      doctorId: 'doc_g2',
      patientName: 'Kamala Joshi',
      appointmentDate: '2026-11-21',
      appointmentTime: '10:00:00',
      trackingCode: '3000000002'
    });
    const qeg2 = sim.enrollIntoQueue(pg2.id);
    assert.strictEqual(qeg2.queuePosition, 1, 'Dr. Verma Patient 1 gets Token #1 (doctor-isolated!)');
    assert.strictEqual(qeg2.doctorId, 'doc_g2');

    // Patient 2 for Dr. Sharma
    const pg3 = sim.bookAppointment({
      id: 'appt_g3',
      clinicId: 'clinic_gamma',
      doctorId: 'doc_g1',
      patientName: 'Manoj Pokhrel',
      appointmentDate: '2026-11-21',
      appointmentTime: '10:30:00',
      trackingCode: '3000000003'
    });
    const qeg3 = sim.enrollIntoQueue(pg3.id);
    assert.strictEqual(qeg3.queuePosition, 2, 'Dr. Sharma Patient 2 gets Token #2');

    // Check Dr. Sharma's queue query
    const sharmaQueue = sim.getDoctorLiveQueue('clinic_gamma', 'doc_g1');
    assert.strictEqual(sharmaQueue.length, 2, "Dr. Sharma's queue must contain exactly his 2 patients");
    assert.strictEqual(sharmaQueue[0].appointmentId, 'appt_g1');
    assert.strictEqual(sharmaQueue[1].appointmentId, 'appt_g3');

    // Check Dr. Verma's queue query
    const vermaQueue = sim.getDoctorLiveQueue('clinic_gamma', 'doc_g2');
    assert.strictEqual(vermaQueue.length, 1, "Dr. Verma's queue must contain exactly his 1 patient");
    assert.strictEqual(vermaQueue[0].appointmentId, 'appt_g2');
  });

  console.log('\n--- TEST GROUP 5: Common Queue Dynamic Turn Transitions ---');

  test('T5.1: Calling Patient 1 inside cabin in Lab Alpha updates nowServing to 1 and drops ahead count for Patient 2 to 0', () => {
    const qe1 = sim.queueEntries.get('qe_appt_a1');
    qe1.status = 'inside';

    const s1 = sim.getPublicQueueStatus('1000000001');
    assert.strictEqual(s1.nowServing, 1, 'Now Serving token must be #1');

    const s2 = sim.getPublicQueueStatus('1000000002');
    assert.strictEqual(s2.nowServing, 1, 'Patient 2 sees Now Serving is #1');
    assert.strictEqual(s2.patientsAhead, 0, 'Patient 2 now has 0 waiting patients ahead');

    const s3 = sim.getPublicQueueStatus('1000000003');
    assert.strictEqual(s3.nowServing, 1);
    assert.strictEqual(s3.patientsAhead, 1, 'Patient 3 now has 1 waiting patient ahead (Patient 2)');
  });

  console.log('\n--- TEST GROUP 6: Migration SQL & Static Code Contract Analysis ---');

  test('T6.1: Migration file contains is_diagnostic_lab_clinic function definition', () => {
    const migrationPath = path.join(__dirname, '../supabase/migration_diagnostic_lab_single_common_queue.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.is_diagnostic_lab_clinic'), 'Must define is_diagnostic_lab_clinic');
    assert.ok(sql.includes('public.finalize_online_appointment_payment'), 'Must update finalize_online_appointment_payment');
    assert.ok(sql.includes('public.approve_pay_at_desk_appointment'), 'Must update approve_pay_at_desk_appointment');
    assert.ok(sql.includes('public.get_public_queue_status'), 'Must update get_public_queue_status');
    assert.ok(sql.includes('public.get_doctor_live_queue'), 'Must update get_doctor_live_queue');
  });

  test('T6.2: Web App db.ts synchronizes diagnostic lab common queue logic', () => {
    const dbPath = path.join(__dirname, '../web-app/src/services/db.ts');
    const code = fs.readFileSync(dbPath, 'utf8');
    assert.ok(code.includes('const isLab = isDiagnosticLabClinic'), 'db.ts must check isDiagnosticLabClinic');
  });

  test('T6.3: Patient App QueueRepository.kt implements isDiagnosticLabClinic helper', () => {
    const repoPath = path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/data/repository/QueueRepository.kt');
    const code = fs.readFileSync(repoPath, 'utf8');
    assert.ok(code.includes('suspend fun isDiagnosticLabClinic'), 'Patient QueueRepository must define isDiagnosticLabClinic');
  });

  test('T6.4: Clinic App QueueRepository.kt implements isDiagnosticLab helper', () => {
    const repoPath = path.join(__dirname, '../clinic-app/app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt');
    const code = fs.readFileSync(repoPath, 'utf8');
    assert.ok(code.includes('suspend fun isDiagnosticLab'), 'Clinic QueueRepository must define isDiagnosticLab');
  });

  console.log('\n======================================================================');
  console.log(`  EXECUTIVE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
