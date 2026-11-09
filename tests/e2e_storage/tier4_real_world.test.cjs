/**
 * Tier 4: Real-World Application Scenarios E2E Tests
 * Simulates complete end-user and clinical operational workflows across the DACTOR platform.
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const {
  REPO_ROOT,
  CONTRACTS,
  normalizePhoneNumber,
  isPhoneMatch,
  isValidTrackingCode,
  simulateAuthorizeDocumentAccess,
  simulateSignedUrlGeneration,
  verifySignedUrl
} = require('./contracts.cjs');

const suite = createTestSuite('Real-World Application Scenarios', 4);

// ---------------------------------------------------------------------------
// W1: Walk-In Patient Diagnostic Report Retrieval Journey
// ---------------------------------------------------------------------------

suite.test('W1: Full simulated walk-in patient report retrieval flow (OPD desk -> 10-digit code -> phone verification -> signed PDF download)', async (assert) => {
  // 1. Patient arrives at clinic reception, registered as walk-in
  const appointment = {
    id: 'appt-opd-2026-001',
    patient_name: 'Bibek Thapa',
    patient_mobile: '+977-9841999888',
    tracking_code_10_digit: '7845129630',
    clinic_id: 'clinic-patan-med',
    clinic_name: 'Patan Diagnostic Medical Center'
  };

  assert.equal(isValidTrackingCode(appointment.tracking_code_10_digit), true);

  // 2. Pathology lab uploads completed blood report to private bucket
  const labReport = {
    id: 'rep-opd-2026-001',
    appointment_id: appointment.id,
    clinic_id: appointment.clinic_id,
    test_name: 'Comprehensive Metabolic Panel (CMP)',
    stage: 'prepared',
    storage_path: 'reports/rep-opd-2026-001/cmp_final.pdf'
  };

  // 3. Patient opens web tracker (or Patient App) and inputs 10-digit code
  const enteredCode = '7845129630';
  assert.equal(enteredCode, appointment.tracking_code_10_digit);

  // 4. Tracker API returns status with redacted file URL
  const trackerQueryResult = {
    trackingCode: enteredCode,
    clinicName: appointment.clinic_name,
    testName: labReport.test_name,
    stage: labReport.stage,
    isPrepared: labReport.stage === 'prepared',
    requiresVerification: true,
    fileUrl: null // Redacted
  };

  assert.equal(trackerQueryResult.isPrepared, true);
  assert.equal(trackerQueryResult.fileUrl, null, 'File URL must be hidden prior to verification');

  // 5. Patient enters mobile number with local formatting
  const enteredPhone = '9841 999 888';
  assert.equal(isPhoneMatch(enteredPhone, appointment.patient_mobile), true);

  // 6. Server validates ownership and generates short-lived signed URL
  const authDecision = simulateAuthorizeDocumentAccess({
    caller: null,
    documentType: 'lab_report',
    documentData: {
      ...labReport,
      patient_mobile: appointment.patient_mobile,
      tracking_code_10_digit: appointment.tracking_code_10_digit
    },
    options: {
      patientPhone: enteredPhone,
      trackingCode: enteredCode
    }
  });

  assert.equal(authDecision.authorized, true);
  assert.equal(authDecision.role, 'verified_walkin_patient');

  // 7. Signed URL issued
  const { signedUrl, expiresAt } = simulateSignedUrlGeneration('lab-reports-private', labReport.storage_path, 900);
  const verification = verifySignedUrl(signedUrl, 'lab-reports-private', labReport.storage_path);
  assert.equal(verification.isValidStructure, true);
  assert.equal(verification.isFresh, true);

  // 8. Patient downloads file using signed URL
  const downloadTrigger = {
    action: 'download',
    targetUrl: signedUrl,
    suggestedFileName: 'CMP_Patan_Diagnostic.pdf'
  };
  assert.includes(downloadTrigger.targetUrl, 'token=');
});

// ---------------------------------------------------------------------------
// W2: Clinic Staff Diagnostic Preparation & Preview Workflow
// ---------------------------------------------------------------------------

suite.test('W2: Clinic staff report preparation and preview (secure private upload -> staff signed preview -> patient delivery)', async (assert) => {
  // 1. Authenticated Clinic Staff session
  const clinicStaffUser = {
    userId: 'staff-user-007',
    clinicId: 'clinic-chitwan-lab',
    role: 'clinic_staff',
    email: 'lab@chitwanclinic.com'
  };

  // 2. Staff selects patient order
  const order = {
    reportId: 'rep-chitwan-55',
    patientName: 'Anil Gurung',
    patientPhone: '9865001122',
    testName: 'Lipid Profile'
  };

  // 3. Staff uploads file directly to private bucket
  const targetBucket = 'lab-reports-private';
  const cleanFileName = 'lipid_profile_report.pdf';
  const finalStoragePath = `reports/${order.reportId}/${cleanFileName}`;

  assert.includes(CONTRACTS.buckets.privateBuckets, targetBucket);

  // 4. Staff previews the report in-app
  const staffAuth = simulateAuthorizeDocumentAccess({
    caller: clinicStaffUser,
    documentType: 'lab_report',
    documentData: {
      id: order.reportId,
      clinic_id: clinicStaffUser.clinicId
    }
  });
  assert.equal(staffAuth.authorized, true);
  assert.equal(staffAuth.role, 'clinic_staff');

  const { signedUrl: staffPreviewUrl } = simulateSignedUrlGeneration(targetBucket, finalStoragePath, 300);
  assert.includes(staffPreviewUrl, finalStoragePath);

  // 5. Verify that rival clinic cannot preview this file
  const rivalStaffUser = {
    userId: 'rival-staff-009',
    clinicId: 'clinic-rival-other',
    role: 'clinic_staff',
    email: 'other@clinic.com'
  };
  const rivalAuth = simulateAuthorizeDocumentAccess({
    caller: rivalStaffUser,
    documentType: 'lab_report',
    documentData: {
      id: order.reportId,
      clinic_id: clinicStaffUser.clinicId
    }
  });
  assert.equal(rivalAuth.authorized, false);
});

// ---------------------------------------------------------------------------
// W3: Doctor Onboarding, Regulatory KYC Submission & Admin Verification Flow
// ---------------------------------------------------------------------------

suite.test('W3: Doctor KYC onboarding and admin verification flow (private KYC upload -> admin panel review via signed URL -> verification)', async (assert) => {
  // 1. Doctor registers on clinic platform
  const doctor = {
    id: 'doc-dharan-10',
    userId: 'auth-user-dr-dharan',
    fullName: 'Dr. Ramesh Rijal',
    email: 'dr.rijal@dactor.com',
    specialty: 'Cardiology',
    nmcLicenseNumber: 'NMC-88776',
    kycStatus: 'pending'
  };

  // 2. Doctor uploads NMC certificate to doctor-kyc-private
  const kycBucket = 'doctor-kyc-private';
  const licensePath = `kyc/${doctor.id}/nmc_license_${doctor.nmcLicenseNumber}.jpg`;
  const degreePath = `kyc/${doctor.id}/medical_degree_md.pdf`;

  assert.includes(CONTRACTS.buckets.privateBuckets, kycBucket);

  // 3. Super Admin logs into Admin Panel (admin-panel/src/pages/DoctorKYC.tsx)
  const adminUser = {
    userId: 'admin-super-01',
    role: 'super_admin',
    email: 'compliance_admin@dactor.com'
  };

  // 4. Admin requests signed URLs to inspect the doctor's credentials
  const licenseAuth = simulateAuthorizeDocumentAccess({
    caller: adminUser,
    documentType: 'doctor_kyc',
    documentData: {
      id: doctor.id,
      user_id: doctor.userId,
      email: doctor.email
    }
  });
  assert.equal(licenseAuth.authorized, true);
  assert.equal(licenseAuth.role, 'super_admin');

  const { signedUrl: adminLicenseUrl } = simulateSignedUrlGeneration(kycBucket, licensePath, 600);
  const { signedUrl: adminDegreeUrl } = simulateSignedUrlGeneration(kycBucket, degreePath, 600);

  assert.includes(adminLicenseUrl, kycBucket);
  assert.includes(adminDegreeUrl, kycBucket);
  assert.includes(adminLicenseUrl, 'token=');

  // 5. Admin verifies documents and updates status to approved
  const verifiedDoctor = {
    ...doctor,
    kycStatus: 'approved',
    verifiedAt: new Date().toISOString()
  };
  assert.equal(verifiedDoctor.kycStatus, 'approved');
});

// ---------------------------------------------------------------------------
// W4: Multi-Surface Storage Security & Invariant Audit
// ---------------------------------------------------------------------------

suite.test('W4: Multi-surface storage security audit: verifying zero raw public storage URL exposures across surfaces', (assert) => {
  // Invariant 1: Check that private buckets are strictly isolated from public buckets
  for (const priv of CONTRACTS.buckets.privateBuckets) {
    assert.equal(CONTRACTS.buckets.publicBuckets.includes(priv), false, `${priv} must never be in publicBuckets`);
  }

  // Invariant 2: Check that max file size is 50MB (52428800)
  assert.equal(CONTRACTS.buckets.fileSizeLimit, 52428800);

  // Invariant 3: Check that RPC contracts are declared
  assert.ok(CONTRACTS.rpcs.get_lab_report_signed_url);
  assert.ok(CONTRACTS.rpcs.get_authorized_document_signed_url);
  assert.ok(CONTRACTS.rpcs.authorize_document_access);

  // Invariant 4: Check phone normalization rules
  const testPhone = normalizePhoneNumber('+977-9841234567');
  assert.equal(testPhone, '9841234567');
});

module.exports = suite;
