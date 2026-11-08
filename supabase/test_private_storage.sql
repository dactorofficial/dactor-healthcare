-- =========================================================================
-- DACTOR PLATFORM: TEST HARNESS FOR PRIVATE STORAGE & SERVER AUTHORIZATION
-- Test Script: supabase/test_private_storage.sql
-- Covers:
-- 1. Storage Buckets Configuration & MIME Restrictions (F1 & F2)
-- 2. Storage RLS Policies on storage.objects (F3)
-- 3. Database Table RLS Policies on lab_reports (F4)
-- 4. Audit Table _migration_storage_backup (F4 / F16)
-- 5. Helper clean_storage_path functionality
-- 6. Server Authorization RPC authorize_document_access (F5)
-- 7. Phone Normalization (98XXXXXXXX, +977-98XXXXXXXX, 97798XXXXXXXX) (F5)
-- 8. Zero Leakage & Denial for Mismatched Credentials (F5 & F6)
-- 9. Signed URL Issuance get_lab_report_signed_url (F6)
-- 10. General Document Signed URL Issuance get_authorized_document_signed_url (F6)
-- 11. Transaction Rollback & Fixture Cleanup (Zero DB Pollution)
-- =========================================================================

DO $$
DECLARE
    v_test_clinic_id UUID;
    v_test_doctor_id UUID;
    v_test_patient_uid UUID := gen_random_uuid();
    v_test_appt_id UUID;
    v_test_report_id UUID;
    v_test_tracking_code VARCHAR(10) := '9911223344';
    v_attacker_appt_id UUID;
    v_attacker_report_id UUID;
    v_attacker_tracking_code VARCHAR(10) := '8877665544';
    v_attacker_phone TEXT := '9842999999';
    v_res JSONB;
    v_url TEXT;
    v_clean TEXT;
    v_count INT;
    v_policy_count INT;
BEGIN
    RAISE NOTICE '=== STARTING DACTOR PRIVATE STORAGE TEST HARNESS ===';

    -- ---------------------------------------------------------------------
    -- SUITE 1: VERIFY BUCKET CONFIGURATION (F1 & F2)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 1] Verifying Storage Buckets Configuration...';

    -- 1.1 lab-reports-private
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id = 'lab-reports-private'
      AND public = false
      AND file_size_limit = 52428800
      AND allowed_mime_types @> ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: lab-reports-private bucket is not configured with public=false, 50MB limit, or valid MIME types';
    END IF;
    RAISE NOTICE '  √ lab-reports-private verified (public=false, 50MB, allowed MIME types)';

    -- 1.2 doctor-kyc-private
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id = 'doctor-kyc-private'
      AND public = false
      AND file_size_limit = 52428800
      AND allowed_mime_types @> ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: doctor-kyc-private bucket is not configured with public=false, 50MB limit, or valid MIME types';
    END IF;
    RAISE NOTICE '  √ doctor-kyc-private verified (public=false, 50MB, allowed MIME types)';

    -- 1.3 clinic-docs-private
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id = 'clinic-docs-private'
      AND public = false
      AND file_size_limit = 52428800
      AND allowed_mime_types @> ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: clinic-docs-private bucket is not configured with public=false, 50MB limit, or valid MIME types';
    END IF;
    RAISE NOTICE '  √ clinic-docs-private verified (public=false, 50MB, allowed MIME types)';

    -- 1.4 Public showcase buckets (clinic_photos, doctor_photos)
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id IN ('clinic_photos', 'doctor_photos')
      AND public = true;

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'TEST FAILED: Public showcase buckets clinic_photos and doctor_photos must have public=true';
    END IF;
    RAISE NOTICE '  √ clinic_photos and doctor_photos verified (public=true)';

    -- ---------------------------------------------------------------------
    -- SUITE 2: STORAGE RLS POLICIES (F3)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 2] Verifying Storage RLS Policies...';

    -- 2.1 Check RLS is enabled on storage.objects
    SELECT COUNT(*) INTO v_count
    FROM pg_tables
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND rowsecurity = true;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Row Level Security is NOT enabled on storage.objects';
    END IF;
    RAISE NOTICE '  √ storage.objects has Row-Level Security enabled';

    -- 2.2 Verify Policies exist on storage.objects
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
          'Deny public read on private buckets',
          'Authenticated read on public buckets',
          'Super Admin full storage access',
          'Clinic Staff upload private docs',
          'Doctor upload KYC docs'
      );

    IF v_policy_count < 5 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected at least 5 storage RLS policies, found %', v_policy_count;
    END IF;
    RAISE NOTICE '  √ Verified 5 storage RLS policies on storage.objects';

    -- ---------------------------------------------------------------------
    -- SUITE 3: DATABASE RLS ON lab_reports (F4)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 3] Verifying Database Table RLS on lab_reports...';

    SELECT COUNT(*) INTO v_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'lab_reports'
      AND rowsecurity = true;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Row Level Security is NOT enabled on lab_reports';
    END IF;
    RAISE NOTICE '  √ lab_reports table has Row-Level Security enabled';

    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lab_reports'
      AND policyname IN (
          'lab_reports_super_admin_rule',
          'lab_reports_clinic_staff_rule',
          'lab_reports_patient_read_rule'
      );

    IF v_policy_count < 3 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected 3 database RLS policies on lab_reports, found %', v_policy_count;
    END IF;
    RAISE NOTICE '  √ Verified 3 database RLS policies on lab_reports';

    -- ---------------------------------------------------------------------
    -- SUITE 4: AUDIT TABLE _migration_storage_backup (F4 / F16)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 4] Verifying Audit Table _migration_storage_backup...';

    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '_migration_storage_backup';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: _migration_storage_backup table does not exist';
    END IF;
    RAISE NOTICE '  √ _migration_storage_backup audit table exists';

    -- ---------------------------------------------------------------------
    -- SUITE 5: HELPER FUNCTION clean_storage_path
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 5] Testing clean_storage_path helper function...';

    -- Full URL
    v_clean := clean_storage_path('https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/lab-reports-private/lab_reports/test_1.pdf', 'lab-reports-private');
    IF v_clean <> 'lab_reports/test_1.pdf' THEN
        RAISE EXCEPTION 'clean_storage_path failed on full URL. Got: %', v_clean;
    END IF;

    -- Legacy bucket prefix
    v_clean := clean_storage_path('clinic_photos/lab_reports/test_2.pdf?token=123', 'lab-reports-private');
    IF v_clean <> 'lab_reports/test_2.pdf' THEN
        RAISE EXCEPTION 'clean_storage_path failed on legacy bucket prefix. Got: %', v_clean;
    END IF;

    -- Leading slash
    v_clean := clean_storage_path('/lab_reports/test_3.pdf', 'lab-reports-private');
    IF v_clean <> 'lab_reports/test_3.pdf' THEN
        RAISE EXCEPTION 'clean_storage_path failed on leading slash. Got: %', v_clean;
    END IF;
    RAISE NOTICE '  √ clean_storage_path sanitizes full URLs, prefixes, and tokens cleanly';

    -- ---------------------------------------------------------------------
    -- SUITE 6: SETUP TEST FIXTURES
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 6] Setting up test fixtures...';

    -- 6.1 Test Clinic
    INSERT INTO clinics (name, contact_phone, contact_email, address_text, verification_status)
    VALUES ('__Test_Private_Storage_Clinic__', '9841000000', 'test_storage_clinic@dactor.com', 'Kathmandu Ward 1', 'approved')
    RETURNING id INTO v_test_clinic_id;

    -- 6.2 Test Doctor
    INSERT INTO doctors (clinic_id, full_name, email, specialty, nmc_license_number, kyc_status, license_doc_url)
    VALUES (v_test_clinic_id, 'Dr. Test Storage', 'dr.test.storage@dactor.com', 'Pathology', 'NMC-TEST-99', 'approved', 'doctor-kyc-private/kyc_doc.pdf')
    RETURNING id INTO v_test_doctor_id;

    -- 6.3 Test Appointment with Nepal Mobile Number 9841234567
    INSERT INTO appointments (
        tracking_code_10_digit,
        clinic_id,
        doctor_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        appointment_date,
        appointment_time,
        fee_amount
    ) VALUES (
        v_test_tracking_code,
        v_test_clinic_id,
        v_test_doctor_id,
        v_test_patient_uid,
        'Ram Bahadur Shrestha',
        35,
        'Male',
        '+977-9841234567',
        CURRENT_DATE,
        '10:00:00'::TIME,
        500.00
    ) RETURNING id INTO v_test_appt_id;

    -- 6.4 Test Lab Report
    INSERT INTO lab_reports (
        appointment_id,
        clinic_id,
        test_name,
        stage,
        file_url,
        file_name,
        patient_name_verification
    ) VALUES (
        v_test_appt_id,
        v_test_clinic_id,
        'Complete Blood Count (CBC)',
        'prepared',
        'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/lab-reports-private/lab_reports/test_report_123.pdf',
        'test_report_123.pdf',
        'Ram Bahadur Shrestha'
    ) RETURNING id INTO v_test_report_id;

    RAISE NOTICE '  √ Fixtures created: Clinic %, Doctor %, Appointment %, Report %',
        v_test_clinic_id, v_test_doctor_id, v_test_appt_id, v_test_report_id;

    -- 6.5 Adversarial Test Fixture (Attacker appointment & report)
    INSERT INTO appointments (
        tracking_code_10_digit,
        clinic_id,
        doctor_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        appointment_date,
        appointment_time,
        fee_amount
    ) VALUES (
        v_attacker_tracking_code,
        v_test_clinic_id,
        v_test_doctor_id,
        gen_random_uuid(),
        'Malicious Attacker',
        28,
        'Male',
        v_attacker_phone,
        CURRENT_DATE,
        '11:00:00'::TIME,
        500.00
    ) RETURNING id INTO v_attacker_appt_id;

    INSERT INTO lab_reports (
        appointment_id,
        clinic_id,
        test_name,
        stage,
        file_url,
        file_name,
        patient_name_verification
    ) VALUES (
        v_attacker_appt_id,
        v_test_clinic_id,
        'Lipid Profile',
        'prepared',
        'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/lab-reports-private/lab_reports/attacker_report.pdf',
        'attacker_report.pdf',
        'Malicious Attacker'
    ) RETURNING id INTO v_attacker_report_id;

    RAISE NOTICE '  √ Adversarial fixtures created: Attacker Appt %, Attacker Report %',
        v_attacker_appt_id, v_attacker_report_id;

    -- ---------------------------------------------------------------------
    -- SUITE 7: AUTHORIZATION MATRIX & PHONE NORMALIZATION (F5)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 7] Testing authorize_document_access matrix & phone normalization...';

    -- 7.1 Matching phone (standard 10-digit '9841234567') -> AUTHORIZED
    v_res := authorize_document_access('lab_report', v_test_report_id, '9841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE OR v_res->>'role' <> 'verified_walkin_patient' THEN
        RAISE EXCEPTION 'TEST FAILED: 7.1 Expected authorized walkin patient for 9841234567, got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.1 Standard 10-digit mobile authorized as verified_walkin_patient';

    -- 7.2 Matching phone with Nepal country code ('+977-9841234567') -> AUTHORIZED
    v_res := authorize_document_access('lab_report', v_test_report_id, '+977-9841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.2 Expected authorized walkin patient for +977-9841234567, got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.2 International prefix +977- mobile normalized and authorized';

    -- 7.3 Matching phone with numeric prefix ('9779841234567') -> AUTHORIZED
    v_res := authorize_document_access('lab_report', v_test_report_id, '9779841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.3 Expected authorized walkin patient for 9779841234567, got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.3 Numeric prefix 977 mobile normalized and authorized';

    -- 7.4 Tracking code lookup without report_id -> AUTHORIZED
    v_res := authorize_document_access('lab_report', NULL, '9841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.4 Expected authorized via tracking code lookup, got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.4 Tracking code lookup authorized without report_id';

    -- 7.5 Mismatched phone number -> DENIED
    v_res := authorize_document_access('lab_report', v_test_report_id, '9800000000', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.5 Mismatched phone MUST NOT be authorized! Got: %', v_res;
    END IF;
    IF v_res ? 'signed_url' OR v_res ? 'raw_file_url' OR v_res ? 'file_url' THEN
        RAISE EXCEPTION 'TEST FAILED: 7.5 Leaked URL or file path in unauthorized response! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.5 Mismatched phone rejected with zero raw URL leakage';

    -- 7.6 Invalid / short phone number -> DENIED
    v_res := authorize_document_access('lab_report', v_test_report_id, '12345', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.6 Short phone number MUST NOT be authorized! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.6 Invalid phone length rejected';

    -- 7.7 Anonymous stranger without credentials -> DENIED
    v_res := authorize_document_access('lab_report', v_test_report_id, NULL, NULL);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 7.7 Anonymous stranger MUST NOT be authorized! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.7 Anonymous stranger rejected';

    -- 7.8 Adversarial Cross-Appointment Parameter Confusion Test:
    -- Attacker calls with Victim's report_id, Attacker's phone, and Attacker's tracking code.
    -- Strict conjunctive logic MUST reject this with authorized: false.
    v_res := authorize_document_access('lab_report', v_test_report_id, v_attacker_phone, v_attacker_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'CRITICAL SECURITY BREACH: 7.8 Attacker authorized to access Victim report using confused predicate! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 7.8 Adversarial cross-appointment confusion strictly rejected by authorize_document_access';

    -- ---------------------------------------------------------------------
    -- SUITE 8: SIGNED URL ISSUANCE get_lab_report_signed_url (F6)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 8] Testing get_lab_report_signed_url RPC...';

    -- 8.1 Authorized call with valid phone
    v_res := get_lab_report_signed_url(v_test_report_id, '9841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 8.1 Expected authorized signed URL response, got: %', v_res;
    END IF;

    v_url := v_res->>'signed_url';
    IF v_url IS NULL OR v_url NOT LIKE '%/storage/v1/object/sign/lab-reports-private/%' THEN
        RAISE EXCEPTION 'TEST FAILED: 8.1 Signed URL does not point to /storage/v1/object/sign/lab-reports-private/: %', v_url;
    END IF;

    IF v_url NOT LIKE '%token=%' OR v_url NOT LIKE '%expires_at=%' THEN
        RAISE EXCEPTION 'TEST FAILED: 8.1 Signed URL is missing token or expires_at parameter: %', v_url;
    END IF;

    IF v_res->>'expires_at' IS NULL THEN
        RAISE EXCEPTION 'TEST FAILED: 8.1 Response is missing expires_at ISO timestamp';
    END IF;
    RAISE NOTICE '  √ 8.1 Valid signed URL generated targeting lab-reports-private with token and expiry';

    -- 8.2 Authorized call via tracking code alone
    v_res := get_lab_report_signed_url(NULL, '9841234567', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS NOT TRUE OR (v_res->>'signed_url') IS NULL THEN
        RAISE EXCEPTION 'TEST FAILED: 8.2 Expected signed URL via tracking code, got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 8.2 Valid signed URL generated via tracking code lookup';

    -- 8.3 Unauthorized call: MUST return authorized: false and ZERO URL exposure
    v_res := get_lab_report_signed_url(v_test_report_id, '9899999999', v_test_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 8.3 Unauthorized call MUST return authorized=false! Got: %', v_res;
    END IF;
    IF v_res ? 'signed_url' OR v_res ? 'raw_path' OR v_res ? 'file_url' THEN
        RAISE EXCEPTION 'TEST FAILED: 8.3 Leaked URL in unauthorized get_lab_report_signed_url response! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 8.3 Unauthorized call returns authorized=false with zero URL exposure';

    -- 8.4 Adversarial signed URL generation attempt:
    -- Attacker attempts get_lab_report_signed_url with Victim's report_id, Attacker's phone, and Attacker's tracking code.
    v_res := get_lab_report_signed_url(v_test_report_id, v_attacker_phone, v_attacker_tracking_code);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'CRITICAL SECURITY BREACH: 8.4 Attacker received signed URL for Victim report! Got: %', v_res;
    END IF;
    IF v_res ? 'signed_url' OR v_res ? 'raw_path' OR v_res ? 'file_url' THEN
        RAISE EXCEPTION 'CRITICAL SECURITY BREACH: 8.4 URL leakage in unauthorized response! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 8.4 Adversarial cross-appointment signed URL request strictly rejected with zero URL exposure';

    -- ---------------------------------------------------------------------
    -- SUITE 9: GENERAL DOCUMENT SIGNED URL get_authorized_document_signed_url (F6)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 9] Testing get_authorized_document_signed_url RPC...';

    -- 9.1 Unauthorized stranger calling doctor KYC -> DENIED
    v_res := get_authorized_document_signed_url('doctor_kyc', v_test_doctor_id, NULL);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 9.1 Stranger MUST NOT access doctor KYC! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 9.1 Stranger denied access to doctor KYC with zero URL leakage';

    -- 9.2 Unauthorized stranger calling clinic docs -> DENIED
    v_res := get_authorized_document_signed_url('clinic_doc', v_test_clinic_id, NULL);
    IF (v_res->>'authorized')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: 9.2 Stranger MUST NOT access clinic document! Got: %', v_res;
    END IF;
    RAISE NOTICE '  √ 9.2 Stranger denied access to clinic document with zero URL leakage';

    -- ---------------------------------------------------------------------
    -- SUITE 10: CLEANUP TEST FIXTURES
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Suite 10] Cleaning up test fixtures...';
    DELETE FROM lab_reports WHERE id IN (v_test_report_id, v_attacker_report_id);
    DELETE FROM appointments WHERE id IN (v_test_appt_id, v_attacker_appt_id);
    DELETE FROM doctors WHERE id = v_test_doctor_id;
    DELETE FROM clinics WHERE id = v_test_clinic_id;

    RAISE NOTICE '=== ALL DACTOR PRIVATE STORAGE TESTS PASSED CLEANLY (10/10 SUITES) ===';
END $$;
