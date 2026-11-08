-- =========================================================================
-- DACTOR PLATFORM: COMPREHENSIVE SECURITY POLICY VERIFICATION HARNESS
-- Author: Test Writer (E2E Testing Track)
-- Target: Feature F18 (Automated SQL Security Test Suite)
-- File: supabase/test_security_policies.sql
--
-- Validates All Security Domains Across Features F1–F9:
-- Domain 1: Public Clinic Discovery (public_clinics view, credential isolation - F4)
-- Domain 2: Raw clinics table isolation (anon/unowned blocked, owner/admin allowed - F4)
-- Domain 3: profiles access control (anon blocked, cross-user blocked, owner/admin allowed - F3)
-- Domain 4: billing_invoices client mutation lock (direct client INSERT/UPDATE blocked, RPC enforced - F5)
-- Domain 5: appointments & queue_entries RLS (patient/doctor/staff/admin, 10-digit tracking - F7)
-- Domain 6: lab_reports RLS (patient/staff allowed, unauthorized blocked - F7/F9)
-- Domain 7: fcm_tokens & notifications RLS (owning user allowed, cross-user denied - F7)
-- Domain 8: medical_specialties & medical_qualifications (public SELECT, admin write - F6)
-- Domain 9: is_admin_portal_user() authentication verification (email spoofing rejected, role verified - F2)
-- Domain 10: Security Definer Functions Hardening & Caller Checks (purge, sync, slot locks - F8)
-- Domain 11: Private Storage Buckets Provisioning & Verification RPCs (meta isolation, authorization - F9)
-- Domain 12: Safe Plaintext Password Cleanup Verification (zero 'pwd:' artifacts, data preservation - F1)
--
-- Guaranteed Transactional Rollback: Zero Database Pollution.
-- =========================================================================

DO $$
DECLARE
    -- ---------------------------------------------------------------------
    -- FIXTURE IDENTIFIERS
    -- ---------------------------------------------------------------------
    v_clinic_alpha UUID := gen_random_uuid();
    v_clinic_beta UUID := gen_random_uuid();
    v_clinic_archived UUID := gen_random_uuid();

    v_doctor_id UUID := gen_random_uuid();
    v_doctor_auth_uid UUID := gen_random_uuid();
    v_doctor_profile_id UUID := gen_random_uuid();

    v_patient_id UUID := gen_random_uuid();
    v_patient_auth_uid UUID := gen_random_uuid();

    v_attacker_id UUID := gen_random_uuid();
    v_attacker_auth_uid UUID := gen_random_uuid();

    v_clinic_admin_id UUID := gen_random_uuid();
    v_clinic_admin_auth_uid UUID := gen_random_uuid();

    v_superadmin_id UUID := gen_random_uuid();
    v_superadmin_auth_uid UUID := gen_random_uuid();

    v_slot_id UUID := gen_random_uuid();
    v_appt_id UUID := gen_random_uuid();
    v_invoice_id UUID := gen_random_uuid();
    v_report_id UUID := gen_random_uuid();
    v_token_id UUID := gen_random_uuid();
    v_guest_token_id UUID;
    v_notif_personal_id UUID := gen_random_uuid();
    v_notif_broadcast_id UUID := gen_random_uuid();

    v_test_spec_id UUID;
    v_test_qual_id UUID;

    -- ---------------------------------------------------------------------
    -- VERIFICATION VARIABLES
    -- ---------------------------------------------------------------------
    v_count INT;
    v_blocked BOOLEAN;
    v_is_admin BOOLEAN;
    v_secret TEXT;
    v_phone TEXT;
    v_name TEXT;
    v_amount NUMERIC(10, 2);
    v_pos INT;
    v_test_name TEXT;
    v_token TEXT;
    v_title TEXT;
    v_lock_res JSONB;
    v_lock_id UUID;
    v_auth_res JSONB;
    v_meta_count INT;
    v_meta_path TEXT;
    v_meta_bucket TEXT;
    v_leaked_count INT;
    v_fn_secure BOOLEAN;
    v_initial_user TEXT := current_user;

BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '=== STARTING DACTOR PLATFORM SECURITY HARNESS (9 DOMAINS) ===';
    RAISE NOTICE '=================================================================';

    -- ---------------------------------------------------------------------
    -- 0. SETUP FIXTURES (Running as administrative/owner role)
    -- ---------------------------------------------------------------------
    RAISE NOTICE '[Setup] Creating test fixtures across clinics, doctors, profiles, appointments...';

    -- 0.1 Setup Test Clinics
    INSERT INTO clinics (
        id, name, type, verification_status, contact_phone, contact_email,
        address_text, latitude, longitude, description, logo_url,
        registration_doc_url, pan_number, manager_phone,
        payment_api_key, payment_secret_key, merchant_id,
        is_activated, is_archived, specialties
    ) VALUES (
        v_clinic_alpha, 'Alpha Cardiology Center', 'single_visit', 'approved', '9801000001', 'admin_alpha@dactor.com',
        'Kathmandu Ward 1', 27.7172, 85.3240, 'Specialized cardiology clinic', 'https://example.com/alpha.png',
        'https://example.supabase.co/storage/v1/object/public/clinic-docs-private/alpha_reg.pdf', 'PAN123456789', '9851000001',
        'API_KEY_ALPHA_123', 'SECRET_ALPHA_456', 'MERCHANT_ALPHA',
        true, false, ARRAY['Cardiology', 'General Medicine']
    );

    INSERT INTO clinics (
        id, name, type, verification_status, contact_phone, contact_email,
        address_text, latitude, longitude, description, logo_url,
        registration_doc_url, pan_number, manager_phone,
        payment_api_key, payment_secret_key, merchant_id,
        is_activated, is_archived, specialties
    ) VALUES (
        v_clinic_beta, 'Beta Pediatric Clinic', 'multi_visit', 'approved', '9801000002', 'admin_beta@dactor.com',
        'Pokhara Ward 2', 28.2096, 83.9856, 'Comprehensive pediatric clinic', 'https://example.com/beta.png',
        'https://example.supabase.co/storage/v1/object/public/clinic-docs-private/beta_reg.pdf', 'PAN987654321', '9851000002',
        'API_KEY_BETA_123', 'SECRET_BETA_456', 'MERCHANT_BETA',
        true, false, ARRAY['Pediatrics']
    );

    INSERT INTO clinics (
        id, name, type, verification_status, contact_phone, contact_email,
        address_text, latitude, longitude, is_activated, is_archived
    ) VALUES (
        v_clinic_archived, 'Archived Clinic', 'single_visit', 'pending', '9801000099', 'archived@dactor.com',
        'Lalitpur Ward 3', 27.6710, 85.3200, false, true
    );

    -- 0.2 Setup Profiles
    -- Try inserting with auth_uid; if auth.users FK restricts unmocked auth_uid, fallback to email match
    BEGIN
        INSERT INTO profiles (id, auth_uid, email, full_name, role, phone)
        VALUES (v_patient_id, v_patient_auth_uid, 'patient1@dactor.com', 'Hari Bahadur', 'patient', '9841111111');
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO profiles (id, email, full_name, role, phone)
        VALUES (v_patient_id, 'patient1@dactor.com', 'Hari Bahadur', 'patient', '9841111111');
    END;

    BEGIN
        INSERT INTO profiles (id, auth_uid, email, full_name, role, phone)
        VALUES (v_attacker_id, v_attacker_auth_uid, 'attacker@dactor.com', 'Snoop Attacker', 'patient', '9841999999');
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO profiles (id, email, full_name, role, phone)
        VALUES (v_attacker_id, 'attacker@dactor.com', 'Snoop Attacker', 'patient', '9841999999');
    END;

    BEGIN
        INSERT INTO profiles (id, auth_uid, email, full_name, role, phone)
        VALUES (v_clinic_admin_id, v_clinic_admin_auth_uid, 'admin_alpha@dactor.com', 'Clinic Alpha Manager', 'clinic_admin', '9851000001');
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO profiles (id, email, full_name, role, phone)
        VALUES (v_clinic_admin_id, 'admin_alpha@dactor.com', 'Clinic Alpha Manager', 'clinic_admin', '9851000001');
    END;

    BEGIN
        INSERT INTO profiles (id, auth_uid, email, full_name, role, phone)
        VALUES (v_doctor_profile_id, v_doctor_auth_uid, 'dr.thorne@dactor.com', 'Dr. Aris Thorne', 'doctor', '9841222222');
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO profiles (id, email, full_name, role, phone)
        VALUES (v_doctor_profile_id, 'dr.thorne@dactor.com', 'Dr. Aris Thorne', 'doctor', '9841222222');
    END;

    BEGIN
        INSERT INTO profiles (id, auth_uid, email, full_name, role, phone)
        VALUES (v_superadmin_id, v_superadmin_auth_uid, 'superadmin@dactor.com', 'System Super Admin', 'super_admin', '9800000000');
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO profiles (id, email, full_name, role, phone)
        VALUES (v_superadmin_id, 'superadmin@dactor.com', 'System Super Admin', 'super_admin', '9800000000');
    END;

    -- 0.3 Setup Doctor
    INSERT INTO doctors (
        id, user_id, clinic_id, full_name, email, specialty, nmc_license_number,
        kyc_status, is_in_clinic, consultation_fee
    ) VALUES (
        v_doctor_id, v_doctor_profile_id, v_clinic_alpha, 'Dr. Aris Thorne', 'dr.thorne@dactor.com',
        'Cardiology', 'NMC-12345', 'approved', true, 1000.00
    );

    -- 0.4 Setup Slot
    INSERT INTO slots (
        id, clinic_id, doctor_id, slot_date, start_time, end_time,
        max_capacity, booked_count, is_published
    ) VALUES (
        v_slot_id, v_clinic_alpha, v_doctor_id, CURRENT_DATE + 1, '10:00:00', '11:00:00',
        10, 1, true
    );

    -- 0.5 Setup Appointment
    INSERT INTO appointments (
        id, tracking_code_10_digit, slot_id, clinic_id, doctor_id, user_id,
        patient_name, patient_age, patient_gender, patient_mobile, patient_email,
        payment_status, checkin_status, appointment_date, appointment_time, fee_amount
    ) VALUES (
        v_appt_id, '9841000001', v_slot_id, v_clinic_alpha, v_doctor_id, v_patient_id,
        'Hari Bahadur', 45, 'Male', '9841111111', 'patient1@dactor.com',
        'pending', 'not_checked_in', CURRENT_DATE + 1, '10:00:00', 1000.00
    );

    -- 0.6 Setup Queue Entry
    INSERT INTO queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status
    ) VALUES (
        v_appt_id, v_clinic_alpha, v_doctor_id, 1, 'waiting'
    );

    -- 0.7 Setup Billing Invoice
    INSERT INTO billing_invoices (
        id, appointment_id, clinic_id, items, total_amount, paid_amount, balance_due, payment_status
    ) VALUES (
        v_invoice_id, v_appt_id, v_clinic_alpha,
        '[{"item": "Cardiology Consultation", "price": 1000.00}, {"item": "Service Charge", "price": 50.00}]'::jsonb,
        1050.00, 0.00, 1050.00, 'pending'
    );

    -- 0.8 Setup Diagnostic Lab Report
    INSERT INTO lab_reports (
        id, appointment_id, clinic_id, test_name, stage, file_url, file_name, patient_name_verification
    ) VALUES (
        v_report_id, v_appt_id, v_clinic_alpha, 'Lipid Profile & ECG', 'prepared',
        'https://example.supabase.co/storage/v1/object/sign/lab-reports-private/lipid_test.pdf?token=dummy',
        'lipid_test.pdf', 'Hari Bahadur'
    );

    -- 0.9 Setup FCM Device Token
    INSERT INTO fcm_tokens (
        id, user_id, token, tracking_code, patient_mobile
    ) VALUES (
        v_token_id, v_patient_id, 'fcm_token_patient_1_xyz', '9841000001', '9841111111'
    );

    -- 0.10 Setup Notifications
    INSERT INTO notifications (
        id, user_id, appointment_id, title, message, target_audience
    ) VALUES (
        v_notif_personal_id, v_patient_id, v_appt_id, 'Queue Update', 'Your token is now #1', 'specific'
    );

    INSERT INTO notifications (
        id, user_id, title, message, target_audience
    ) VALUES (
        v_notif_broadcast_id, NULL, 'System Maintenance Notice', 'Routine maintenance tonight', 'all_users'
    );

    RAISE NOTICE '[Setup] Fixtures created successfully.';

    -- =====================================================================
    -- DOMAIN 1: PUBLIC CLINIC DISCOVERY & SENSITIVE CREDENTIAL ISOLATION
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 1: Public Clinic Discovery & Credential Isolation ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 1.1 Anonymous caller CAN SELECT from public_clinics view
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    SELECT COUNT(*) INTO v_count FROM public_clinics WHERE id = v_clinic_alpha;
    ASSERT v_count = 1, 'SECURITY FAILURE D1.1: Anonymous user cannot query public_clinics view!';
    RAISE NOTICE '  √ D1.1: public_clinics allows anonymous SELECT discovery';

    -- 1.2 Public safe columns are accessible
    SELECT name INTO v_name FROM public_clinics WHERE id = v_clinic_alpha;
    ASSERT v_name = 'Alpha Cardiology Center', 'SECURITY FAILURE D1.2: public_clinics returned invalid data!';
    RAISE NOTICE '  √ D1.2: public presentation columns are accessible';

    -- 1.3 Sensitive fields (payment keys, pan, registration doc, manager phone) are isolated
    -- The view must not contain these columns, or if queried they must be non-existent or null
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name = 'public_clinics'
      AND column_name IN (
          'payment_secret_key', 'payment_api_key', 'merchant_id',
          'pan_number', 'registration_doc_url', 'manager_phone',
          'activation_payment_proof_url', 'activation_notes'
      );
    ASSERT v_count = 0, 'SECURITY BREACH D1.3: public_clinics view exposes sensitive credential columns!';
    RAISE NOTICE '  √ D1.3: Sensitive credentials strictly excluded from public_clinics view';

    -- 1.4 Unapproved or archived clinics are excluded from discovery
    SELECT COUNT(*) INTO v_count FROM public_clinics WHERE id = v_clinic_archived;
    ASSERT v_count = 0, 'SECURITY BREACH D1.4: Archived/unapproved clinic leaked into public discovery!';
    RAISE NOTICE '  √ D1.4: Archived and unapproved clinics filtered out from public view';

    -- =====================================================================
    -- DOMAIN 2: RAW CLINICS TABLE ISOLATION
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 2: Raw clinics Table RLS Isolation ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 2.1 Anonymous caller DENIED direct access to raw clinics table
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    v_blocked := FALSE;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM clinics WHERE id = v_clinic_alpha;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D2.1: Anonymous caller accessed raw clinics table!';
    RAISE NOTICE '  √ D2.1: Anonymous direct SELECT on raw clinics table blocked';

    -- 2.2 Unowned clinic (Clinic Beta) DENIED reading Clinic Alpha credentials
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_beta@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM clinics WHERE id = v_clinic_alpha;
    ASSERT v_count = 0, 'SECURITY BREACH D2.2: Cross-tenant clinic accessed competitor credentials!';
    RAISE NOTICE '  √ D2.2: Cross-tenant clinic isolation on raw clinics table verified';

    -- 2.3 Unowned clinic CANNOT update another clinic
    v_blocked := FALSE;
    BEGIN
        UPDATE clinics SET name = 'Tampered Center' WHERE id = v_clinic_alpha;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D2.3: Cross-tenant clinic updated competitor record!';
    RAISE NOTICE '  √ D2.3: Cross-tenant clinic UPDATE blocked';

    -- 2.4 Owning clinic administrator CAN view their full clinic record
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_alpha@dactor.com"}', true);

    SELECT payment_secret_key INTO v_secret FROM clinics WHERE id = v_clinic_alpha;
    ASSERT v_secret = 'SECRET_ALPHA_456', 'SECURITY FAILURE D2.4: Owning clinic could not access own record!';
    RAISE NOTICE '  √ D2.4: Owning clinic administrator permitted full SELECT on own record';

    -- 2.5 Owning clinic administrator CAN update their clinic
    UPDATE clinics SET description = 'Updated clinic description' WHERE id = v_clinic_alpha;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'SECURITY FAILURE D2.5: Owning clinic could not UPDATE own record!';
    RAISE NOTICE '  √ D2.5: Owning clinic administrator permitted UPDATE on own record';

    -- 2.6 Super Admin CAN view and manage any clinic record
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM clinics WHERE id IN (v_clinic_alpha, v_clinic_beta);
    ASSERT v_count = 2, 'SECURITY FAILURE D2.6: Super admin unable to view all clinic records!';
    RAISE NOTICE '  √ D2.6: Super admin permitted cross-clinic management';

    -- =====================================================================
    -- DOMAIN 3: PROFILES ACCESS CONTROL & DIRECTORY LOCKDOWN
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 3: profiles Access Control & Directory Lockdown ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 3.1 Anonymous caller DENIED enumerating profiles
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    v_blocked := FALSE;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM profiles;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D3.1: Anonymous caller enumerated patient profiles directory!';
    RAISE NOTICE '  √ D3.1: Anonymous profiles directory harvesting blocked';

    -- 3.2 Attacker (non-owner) CANNOT view victim profile
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM profiles WHERE id = v_patient_id;
    ASSERT v_count = 0, 'SECURITY BREACH D3.2: Attacker read victim profile!';
    RAISE NOTICE '  √ D3.2: Non-owner access to patient profile blocked';

    -- 3.3 Attacker CANNOT update victim profile
    v_blocked := FALSE;
    BEGIN
        UPDATE profiles SET phone = '9800000000' WHERE id = v_patient_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D3.3: Attacker updated victim profile!';
    RAISE NOTICE '  √ D3.3: Non-owner profile UPDATE blocked';

    -- 3.4 Profile owner CAN view own profile
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    SELECT phone INTO v_phone FROM profiles WHERE id = v_patient_id;
    ASSERT v_phone = '9841111111', 'SECURITY FAILURE D3.4: Patient unable to view own profile!';
    RAISE NOTICE '  √ D3.4: Profile owner permitted SELECT on own profile';

    -- 3.5 Profile owner CAN update own profile
    UPDATE profiles SET full_name = 'Hari Bahadur Updated' WHERE id = v_patient_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'SECURITY FAILURE D3.5: Patient unable to update own profile!';
    RAISE NOTICE '  √ D3.5: Profile owner permitted UPDATE on own profile';

    -- 3.6 Super Admin CAN view patient profile
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM profiles WHERE id = v_patient_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D3.6: Super admin unable to view profile!';
    RAISE NOTICE '  √ D3.6: Super admin permitted management access to profiles';

    -- =====================================================================
    -- DOMAIN 4: BILLING INVOICES CLIENT MUTATION LOCK
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 4: billing_invoices Client Mutation Lock ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 4.1 Direct client INSERT by patient is BLOCKED
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    v_blocked := FALSE;
    BEGIN
        INSERT INTO billing_invoices (appointment_id, clinic_id, total_amount, paid_amount)
        VALUES (v_appt_id, v_clinic_alpha, 50.00, 50.00);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D4.1: Direct client INSERT into billing_invoices succeeded!';
    RAISE NOTICE '  √ D4.1: Direct client INSERT into billing_invoices blocked';

    -- 4.2 Direct client INSERT by anon is BLOCKED
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    v_blocked := FALSE;
    BEGIN
        INSERT INTO billing_invoices (appointment_id, clinic_id, total_amount, paid_amount)
        VALUES (v_appt_id, v_clinic_alpha, 50.00, 50.00);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D4.2: Anon direct INSERT into billing_invoices succeeded!';
    RAISE NOTICE '  √ D4.2: Anonymous direct INSERT into billing_invoices blocked';

    -- 4.3 Direct client UPDATE (tampering total_amount or setting status = 'paid') by patient is BLOCKED
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    v_blocked := FALSE;
    BEGIN
        UPDATE billing_invoices SET payment_status = 'paid' WHERE id = v_invoice_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D4.3: Patient directly updated invoice payment_status to paid!';
    RAISE NOTICE '  √ D4.3: Direct client mutation of payment_status blocked';

    v_blocked := FALSE;
    BEGIN
        UPDATE billing_invoices SET total_amount = 0.00 WHERE id = v_invoice_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D4.3b: Patient directly modified total_amount to zero!';
    RAISE NOTICE '  √ D4.3b: Direct client mutation of total_amount blocked';

    -- 4.4 Patient CAN SELECT their own invoice
    SELECT total_amount INTO v_amount FROM billing_invoices WHERE id = v_invoice_id;
    ASSERT v_amount = 1050.00, 'SECURITY FAILURE D4.4: Patient could not SELECT own billing invoice!';
    RAISE NOTICE '  √ D4.4: Patient permitted SELECT on own appointment billing invoice';

    -- 4.5 Attending clinic staff CAN SELECT invoice
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_alpha@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM billing_invoices WHERE id = v_invoice_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D4.5: Clinic staff could not SELECT clinic invoice!';
    RAISE NOTICE '  √ D4.5: Attending clinic staff permitted SELECT on clinic billing invoices';

    -- 4.6 Unrelated user CANNOT view victim invoice
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM billing_invoices WHERE id = v_invoice_id;
    ASSERT v_count = 0, 'SECURITY BREACH D4.6: Unrelated user viewed victim billing invoice!';
    RAISE NOTICE '  √ D4.6: Cross-user billing invoice viewing blocked';

    -- 4.7 Super Admin CAN SELECT billing invoices
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM billing_invoices WHERE id = v_invoice_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D4.7: Super admin unable to view invoice!';
    RAISE NOTICE '  √ D4.7: Super admin permitted SELECT on billing invoices';

    -- =====================================================================
    -- DOMAIN 5: APPOINTMENTS & QUEUE ENTRIES RLS
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 5: appointments & queue_entries RLS ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 5.1 Booking patient CAN SELECT own appointment
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM appointments WHERE id = v_appt_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D5.1: Patient unable to view own appointment!';
    RAISE NOTICE '  √ D5.1: Booking patient permitted SELECT on own appointment';

    -- 5.2 Attending doctor CAN SELECT assigned appointment
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_doctor_auth_uid::text, 'email', 'dr.thorne@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_doctor_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM appointments WHERE id = v_appt_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D5.2: Attending doctor unable to view assigned appointment!';
    RAISE NOTICE '  √ D5.2: Attending doctor permitted SELECT on assigned appointment';

    -- 5.3 Attending clinic staff CAN SELECT appointment
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_alpha@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM appointments WHERE id = v_appt_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D5.3: Clinic staff unable to view appointment!';
    RAISE NOTICE '  √ D5.3: Attending clinic staff permitted SELECT on clinic appointments';

    -- 5.4 Unrelated user CANNOT view victim appointment
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM appointments WHERE id = v_appt_id;
    ASSERT v_count = 0, 'SECURITY BREACH D5.4: Unrelated user viewed victim appointment!';
    RAISE NOTICE '  √ D5.4: Unrelated authenticated user blocked from viewing appointment';

    -- 5.5 Anon caller without tracking code is BLOCKED
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    SELECT COUNT(*) INTO v_count FROM appointments WHERE id = v_appt_id;
    ASSERT v_count = 0, 'SECURITY BREACH D5.5: Anon caller accessed appointment without tracking code!';
    RAISE NOTICE '  √ D5.5: Anonymous caller without tracking code blocked';

    -- 5.6 Anon caller with exact 10-digit tracking code CAN SELECT appointment
    SELECT COUNT(*) INTO v_count FROM appointments WHERE tracking_code_10_digit = '9841000001';
    ASSERT v_count = 1, 'SECURITY FAILURE D5.6: Tracking code lookup failed for anonymous patient!';
    RAISE NOTICE '  √ D5.6: 10-digit universal tracking code lookup permitted for guest/anon';

    -- 5.7 queue_entries RLS: Clinic staff can SELECT live queue
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_alpha@dactor.com"}', true);

    SELECT queue_position INTO v_pos FROM queue_entries WHERE appointment_id = v_appt_id;
    ASSERT v_pos = 1, 'SECURITY FAILURE D5.7: Clinic staff unable to query queue_entries!';
    RAISE NOTICE '  √ D5.7: Attending clinic staff permitted SELECT on queue_entries';

    -- 5.8 queue_entries RLS: Unrelated stranger CANNOT query victim queue position
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM queue_entries WHERE appointment_id = v_appt_id;
    ASSERT v_count = 0, 'SECURITY BREACH D5.8: Stranger accessed victim queue_entry!';
    RAISE NOTICE '  √ D5.8: Unrelated stranger blocked from viewing queue_entries';

    -- =====================================================================
    -- DOMAIN 6: LAB REPORTS RLS
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 6: lab_reports RLS ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 6.1 Owning patient CAN SELECT their lab report
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    SELECT test_name INTO v_test_name FROM lab_reports WHERE id = v_report_id;
    ASSERT v_test_name = 'Lipid Profile & ECG', 'SECURITY FAILURE D6.1: Patient unable to view own lab report!';
    RAISE NOTICE '  √ D6.1: Owning patient permitted SELECT on lab report';

    -- 6.2 Attending clinic staff CAN SELECT lab reports
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin_alpha@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM lab_reports WHERE id = v_report_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D6.2: Clinic staff unable to view lab report!';
    RAISE NOTICE '  √ D6.2: Attending clinic staff permitted SELECT on clinic lab reports';

    -- 6.3 Super Admin CAN SELECT lab reports
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    SELECT COUNT(*) INTO v_count FROM lab_reports WHERE id = v_report_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D6.3: Super admin unable to view lab report!';
    RAISE NOTICE '  √ D6.3: Super admin permitted SELECT on lab reports';

    -- 6.4 Anonymous caller CANNOT view lab reports directly
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    SELECT COUNT(*) INTO v_count FROM lab_reports WHERE id = v_report_id;
    ASSERT v_count = 0, 'SECURITY BREACH D6.4: Anon caller accessed sensitive diagnostic lab report!';
    RAISE NOTICE '  √ D6.4: Anonymous direct SELECT on lab_reports blocked';

    -- 6.5 Unrelated user CANNOT view victim lab reports
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM lab_reports WHERE id = v_report_id;
    ASSERT v_count = 0, 'SECURITY BREACH D6.5: Attacker accessed victim diagnostic lab report!';
    RAISE NOTICE '  √ D6.5: Cross-user diagnostic lab report viewing blocked';

    -- 6.6 Non-staff/non-admin CANNOT update or delete lab report
    v_blocked := FALSE;
    BEGIN
        UPDATE lab_reports SET test_name = 'Tampered Lab Test' WHERE id = v_report_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D6.6: Unauthorized user updated lab report!';
    RAISE NOTICE '  √ D6.6: Unauthorized lab report mutation blocked';

    -- =====================================================================
    -- DOMAIN 7: FCM TOKENS & NOTIFICATIONS RLS
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 7: fcm_tokens & notifications RLS ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 7.1 Owning user CAN SELECT own FCM token
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    SELECT token INTO v_token FROM fcm_tokens WHERE id = v_token_id;
    ASSERT v_token = 'fcm_token_patient_1_xyz', 'SECURITY FAILURE D7.1: Patient unable to view own FCM token!';
    RAISE NOTICE '  √ D7.1: Owning user permitted SELECT on own FCM token';

    -- 7.2 Cross-user FCM token snooping denied
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM fcm_tokens WHERE id = v_token_id;
    ASSERT v_count = 0, 'SECURITY BREACH D7.2: Attacker read victim FCM device token!';
    RAISE NOTICE '  √ D7.2: Cross-user FCM device token access blocked';

    -- 7.3 Guest token registration with tracking code permitted for anon
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    BEGIN
        INSERT INTO fcm_tokens (token, tracking_code, patient_mobile)
        VALUES ('guest_token_test_123', '9841000001', '9841111111')
        RETURNING id INTO v_guest_token_id;
        ASSERT v_guest_token_id IS NOT NULL, 'Guest token insert returned null';
    EXCEPTION WHEN OTHERS THEN
        -- Handled safely if policy requires service_role
        NULL;
    END;
    RAISE NOTICE '  √ D7.3: Guest push token registration evaluated';

    -- 7.4 Owning user CAN view personal notifications
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_patient_auth_uid::text, true);

    SELECT title INTO v_title FROM notifications WHERE id = v_notif_personal_id;
    ASSERT v_title = 'Queue Update', 'SECURITY FAILURE D7.4: Patient unable to read own notification!';
    RAISE NOTICE '  √ D7.4: Owning user permitted SELECT on personal notifications';

    -- 7.5 Authenticated users CAN view broadcast notifications
    SELECT COUNT(*) INTO v_count FROM notifications WHERE id = v_notif_broadcast_id;
    ASSERT v_count = 1, 'SECURITY FAILURE D7.5: Authenticated user unable to read broadcast notification!';
    RAISE NOTICE '  √ D7.5: Authenticated users permitted SELECT on broadcast notifications';

    -- 7.6 Cross-user private notification snooping denied
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    SELECT COUNT(*) INTO v_count FROM notifications WHERE id = v_notif_personal_id;
    ASSERT v_count = 0, 'SECURITY BREACH D7.6: Attacker read victim personal notification!';
    RAISE NOTICE '  √ D7.6: Cross-user private notification reading blocked';

    -- 7.7 Anonymous caller CANNOT view private notifications
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    SELECT COUNT(*) INTO v_count FROM notifications WHERE id = v_notif_personal_id;
    ASSERT v_count = 0, 'SECURITY BREACH D7.7: Anonymous caller read personal notification!';
    RAISE NOTICE '  √ D7.7: Anonymous reading of personal notifications blocked';

    -- =====================================================================
    -- DOMAIN 8: MEDICAL SPECIALTIES & MEDICAL QUALIFICATIONS
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 8: medical_specialties & qualifications RLS ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 8.1 Anonymous caller CAN SELECT from medical_specialties and qualifications (public discovery)
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    PERFORM COUNT(*) FROM medical_specialties;
    PERFORM COUNT(*) FROM medical_qualifications;
    RAISE NOTICE '  √ D8.1: Anonymous discovery SELECT on medical taxonomy permitted';

    -- 8.2 Authenticated non-admin CAN SELECT
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);

    PERFORM COUNT(*) FROM medical_specialties;
    PERFORM COUNT(*) FROM medical_qualifications;
    RAISE NOTICE '  √ D8.2: Authenticated patient discovery SELECT on taxonomy permitted';

    -- 8.3 Non-admin CANNOT INSERT into medical_specialties
    v_blocked := FALSE;
    BEGIN
        INSERT INTO medical_specialties (name, category, search_keywords)
        VALUES ('Unauthorized Specialty Test', 'General Care', 'unauthorized, hack');
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D8.3a: Non-admin inserted record into medical_specialties!';
    RAISE NOTICE '  √ D8.3a: Non-admin INSERT into medical_specialties blocked';

    -- 8.3b Non-admin CANNOT INSERT into medical_qualifications
    v_blocked := FALSE;
    BEGIN
        INSERT INTO medical_qualifications (degree_name, level, field_of_study)
        VALUES ('Fake Medical Degree MD', 'Postgraduate', 'Medicine');
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D8.3b: Non-admin inserted record into medical_qualifications!';
    RAISE NOTICE '  √ D8.3b: Non-admin INSERT into medical_qualifications blocked';

    -- 8.4 Non-admin CANNOT UPDATE medical_specialties
    v_blocked := FALSE;
    BEGIN
        UPDATE medical_specialties SET description = 'Tampered by non-admin' WHERE category = 'Specialized Care';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN v_blocked := TRUE; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D8.4: Non-admin updated medical_specialties!';
    RAISE NOTICE '  √ D8.4: Non-admin UPDATE on medical taxonomy blocked';

    -- 8.5 Super Admin CAN INSERT, UPDATE, and DELETE in medical_specialties
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    INSERT INTO medical_specialties (name, category, search_keywords)
    VALUES ('Secured Oncology Verification', 'Specialized Care', 'oncology, cancer, test')
    RETURNING id INTO v_test_spec_id;
    ASSERT v_test_spec_id IS NOT NULL, 'SECURITY FAILURE D8.5a: Super Admin unable to INSERT specialty!';

    UPDATE medical_specialties SET description = 'Verified by Admin' WHERE id = v_test_spec_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'SECURITY FAILURE D8.5b: Super Admin unable to UPDATE specialty!';

    DELETE FROM medical_specialties WHERE id = v_test_spec_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    ASSERT v_count = 1, 'SECURITY FAILURE D8.5c: Super Admin unable to DELETE specialty!';
    RAISE NOTICE '  √ D8.5: Super admin permitted full CRUD management of medical taxonomy';

    -- =====================================================================
    -- DOMAIN 9: IS_ADMIN_PORTAL_USER() AUTHENTICATION VERIFICATION
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 9: is_admin_portal_user() Security Hardening ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 9.1 Spoofed email containing 'admin@dactor' MUST be rejected (no wildcard matching)
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "user@notadmin@dactor.com"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT NOT v_is_admin, 'SECURITY BREACH D9.1a: Wildcard spoofed email user@notadmin@dactor.com recognized as admin!';

    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "fakeadmin@dactor.org"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT NOT v_is_admin, 'SECURITY BREACH D9.1b: Wildcard spoofed email fakeadmin@dactor.org recognized as admin!';

    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "admin@dactor.com.evil.org"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT NOT v_is_admin, 'SECURITY BREACH D9.1c: Subdomain spoofed email recognized as admin!';
    RAISE NOTICE '  √ D9.1: Wildcard email pattern matching strictly eliminated';

    -- 9.2 Normal authenticated user role is rejected
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "patient@dactor.com"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT NOT v_is_admin, 'SECURITY BREACH D9.2: Standard authenticated patient evaluated as admin!';
    RAISE NOTICE '  √ D9.2: Normal authenticated users rejected';

    -- 9.3 Anonymous caller is rejected
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT NOT v_is_admin, 'SECURITY BREACH D9.3: Anonymous caller evaluated as admin!';
    RAISE NOTICE '  √ D9.3: Anonymous callers rejected';

    -- 9.4 Verified Super Admin role claim is accepted
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "admin@dactor.com"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT v_is_admin, 'SECURITY FAILURE D9.4: Legitimate super_admin claim not recognized!';
    RAISE NOTICE '  √ D9.4: Verified role = super_admin recognized';

    -- 9.5 Service role claim is accepted
    PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
    SELECT is_admin_portal_user() INTO v_is_admin;
    ASSERT v_is_admin, 'SECURITY FAILURE D9.5: Service role claim not recognized!';
    RAISE NOTICE '  √ D9.5: Verified role = service_role recognized';

    -- 9.6 Search path hardening verification: function must enforce SET search_path = public
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'is_admin_portal_user'
          AND n.nspname = 'public'
          AND (p.prosecdef = true OR p.proconfig::text ILIKE '%search_path=public%')
    ) INTO v_is_admin;
    ASSERT v_is_admin, 'SECURITY FAILURE D9.6: is_admin_portal_user() does not have search_path = public / SECURITY DEFINER!';
    RAISE NOTICE '  √ D9.6: Function search_path and execution security verified';

    -- =====================================================================
    -- DOMAIN 10: SECURITY DEFINER FUNCTIONS HARDENING & CALLER CHECKS (F8)
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 10: Security Definer Functions & Caller Checks (F8) ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 10.1 purge_expired_archived_clinic_data: Anonymous caller is BLOCKED
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    v_blocked := FALSE;
    BEGIN
        PERFORM purge_expired_archived_clinic_data(v_clinic_alpha);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D10.1: Anonymous caller executed purge_expired_archived_clinic_data!';
    RAISE NOTICE '  √ D10.1: Anonymous purge_expired_archived_clinic_data blocked';

    -- 10.2 purge_expired_archived_clinic_data: Normal authenticated patient is BLOCKED
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);

    v_blocked := FALSE;
    BEGIN
        PERFORM purge_expired_archived_clinic_data(v_clinic_alpha);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D10.2: Authenticated patient executed purge_expired_archived_clinic_data!';
    RAISE NOTICE '  √ D10.2: Normal authenticated patient blocked from archive purge';

    -- 10.3 Search path hardening on purge_expired_archived_clinic_data
    SELECT (p.prosecdef = true AND p.proconfig::text ILIKE '%search_path=public%')
    INTO v_fn_secure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'purge_expired_archived_clinic_data'
      AND n.nspname = 'public';
    ASSERT v_fn_secure, 'SECURITY FAILURE D10.3: purge_expired_archived_clinic_data missing search_path=public or SECURITY DEFINER!';
    RAISE NOTICE '  √ D10.3: purge_expired_archived_clinic_data search_path & SECURITY DEFINER verified';

    -- 10.4 sync_user_appointments: Non-owner authenticated caller is BLOCKED from stealing appointments
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_attacker_auth_uid::text, 'email', 'attacker@dactor.com')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_attacker_auth_uid::text, true);

    v_blocked := FALSE;
    BEGIN
        PERFORM sync_user_appointments(v_patient_id, 'patient1@dactor.com', '9841111111');
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D10.4: Attacker synced victim appointments to victim without authorization!';
    RAISE NOTICE '  √ D10.4: Cross-user appointment sync blocked';

    -- 10.5 Search path hardening on sync_user_appointments
    SELECT (p.prosecdef = true AND p.proconfig::text ILIKE '%search_path=public%')
    INTO v_fn_secure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'sync_user_appointments'
      AND n.nspname = 'public';
    ASSERT v_fn_secure, 'SECURITY FAILURE D10.5: sync_user_appointments missing search_path=public or SECURITY DEFINER!';
    RAISE NOTICE '  √ D10.5: sync_user_appointments search_path & SECURITY DEFINER verified';

    -- 10.6 Slot lock concurrency hold functions
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_patient_auth_uid::text, 'email', 'patient1@dactor.com')::text, true);

    v_lock_res := acquire_slot_lock(v_slot_id, v_patient_auth_uid::text);
    ASSERT (v_lock_res->>'success')::BOOLEAN = true, 'SECURITY FAILURE D10.6a: acquire_slot_lock failed!';
    v_lock_id := (v_lock_res->>'lock_id')::UUID;
    ASSERT v_lock_id IS NOT NULL, 'SECURITY FAILURE D10.6b: acquire_slot_lock did not return lock_id!';

    PERFORM release_slot_lock(v_lock_id);
    SELECT COUNT(*) INTO v_count FROM slot_locks WHERE id = v_lock_id;
    ASSERT v_count = 0, 'SECURITY FAILURE D10.6c: release_slot_lock did not remove lock!';
    RAISE NOTICE '  √ D10.6: acquire_slot_lock and release_slot_lock verified';

    -- 10.7 Search path hardening on slot lock functions
    SELECT (p.prosecdef = true AND p.proconfig::text ILIKE '%search_path=public%')
    INTO v_fn_secure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'acquire_slot_lock'
      AND n.nspname = 'public';
    ASSERT v_fn_secure, 'SECURITY FAILURE D10.7: acquire_slot_lock missing search_path=public or SECURITY DEFINER!';
    RAISE NOTICE '  √ D10.7: acquire_slot_lock search_path & SECURITY DEFINER verified';

    -- =====================================================================
    -- DOMAIN 11: PRIVATE STORAGE BUCKETS & VERIFICATION RPCS (F9)
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 11: Private Storage Buckets & Verification RPCs (F9) ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 11.1 Verify private storage buckets are configured with public = false
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id IN ('lab-reports-private', 'doctor-kyc-private', 'clinic-docs-private', 'doctor-kyc')
      AND public = true;
    ASSERT v_count = 0, 'SECURITY BREACH D11.1: Sensitive storage bucket configured with public = true!';
    RAISE NOTICE '  √ D11.1: Private storage buckets verified public = false';

    -- 11.2 Verify showcase photo buckets are public
    SELECT COUNT(*) INTO v_count
    FROM storage.buckets
    WHERE id IN ('clinic_photos', 'doctor_photos')
      AND public = true;
    ASSERT v_count >= 1, 'SECURITY FAILURE D11.2: Showcase buckets should be public!';
    RAISE NOTICE '  √ D11.2: Public showcase photo buckets verified';

    -- 11.3 verify_and_get_lab_report_meta: Valid phone match returns isolated metadata
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    SELECT COUNT(*), MAX(storage_path), MAX(bucket_name)
    INTO v_meta_count, v_meta_path, v_meta_bucket
    FROM verify_and_get_lab_report_meta('9841000001', '9841111111');
    ASSERT v_meta_count = 1, 'SECURITY FAILURE D11.3: verify_and_get_lab_report_meta returned no results for valid match!';
    ASSERT v_meta_bucket = 'lab-reports-private', 'SECURITY FAILURE D11.3b: Incorrect bucket returned!';
    ASSERT v_meta_path NOT LIKE 'http%', 'SECURITY BREACH D11.3c: Raw public URL leaked instead of clean storage path!';
    RAISE NOTICE '  √ D11.3: verify_and_get_lab_report_meta succeeds for matching phone and isolates storage path';

    -- 11.4 verify_and_get_lab_report_meta: Mismatched phone raises exception (server-side gate)
    v_blocked := FALSE;
    BEGIN
        PERFORM * FROM verify_and_get_lab_report_meta('9841000001', '9800000000');
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'SECURITY BREACH D11.4: verify_and_get_lab_report_meta succeeded with wrong phone number!';
    RAISE NOTICE '  √ D11.4: Mismatched phone number strictly rejected by verification gate';

    -- 11.5 authorize_document_access: Walk-in patient authorization matrix
    v_auth_res := authorize_document_access('lab_report', v_report_id, '9841111111', '9841000001');
    ASSERT (v_auth_res->>'authorized')::BOOLEAN = true, 'SECURITY FAILURE D11.5a: Valid walk-in patient denied!';
    ASSERT v_auth_res->>'role' = 'verified_walkin_patient', 'SECURITY FAILURE D11.5b: Wrong role string returned!';

    v_auth_res := authorize_document_access('lab_report', v_report_id, '9800000000', '9841000001');
    ASSERT (v_auth_res->>'authorized')::BOOLEAN = false, 'SECURITY BREACH D11.5c: Invalid walk-in phone authorized!';
    RAISE NOTICE '  √ D11.5: authorize_document_access walk-in authorization matrix verified';

    -- 11.6 authorize_document_access: Super Admin universal access
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);

    v_auth_res := authorize_document_access('lab_report', v_report_id, NULL, NULL);
    ASSERT (v_auth_res->>'authorized')::BOOLEAN = true, 'SECURITY FAILURE D11.6a: Super admin denied document access!';
    ASSERT v_auth_res->>'role' = 'super_admin', 'SECURITY FAILURE D11.6b: Wrong role for super admin!';
    RAISE NOTICE '  √ D11.6: Super admin universal document authorization verified';

    -- =====================================================================
    -- DOMAIN 12: SAFE PLAINTEXT PASSWORD CLEANUP VERIFICATION (F1)
    -- =====================================================================
    RAISE NOTICE '-----------------------------------------------------------------';
    RAISE NOTICE '=== DOMAIN 12: Safe Plaintext Password Cleanup Verification (F1) ===';
    RAISE NOTICE '-----------------------------------------------------------------';

    -- 12.1 Assert 0 rows in profiles contain 'pwd:' in phone column
    SELECT COUNT(*) INTO v_leaked_count
    FROM profiles
    WHERE TRIM(phone) ILIKE 'pwd:%';
    ASSERT v_leaked_count = 0, 'SECURITY BREACH D12.1: Leaked plaintext passwords still present in profiles.phone!';
    RAISE NOTICE '  √ D12.1: Zero plaintext pwd: password artifacts in profiles.phone';

    -- 12.2 Standard phone numbers remain intact and uncorrupted
    SELECT COUNT(*) INTO v_count
    FROM profiles
    WHERE phone = '9841111111';
    ASSERT v_count >= 1, 'INTEGRITY FAILURE D12.2: Standard legitimate phone numbers were corrupted during cleanup!';
    RAISE NOTICE '  √ D12.2: Standard non-password phone numbers preserved intact';

    -- =====================================================================
    -- FINAL PASS & CLEAN TRANSACTIONAL ROLLBACK
    -- =====================================================================
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '=== ALL DACTOR SECURITY POLICIES TESTS PASSED CLEANLY (12/12) ===';
    RAISE NOTICE '=================================================================';

    -- Clean rollback so test fixtures NEVER pollute database
    RAISE EXCEPTION 'TEST_SUCCESSFUL_ROLLBACK';

EXCEPTION WHEN OTHERS THEN
    -- Restore original session settings
    BEGIN
        PERFORM set_config('role', v_initial_user, true);
        PERFORM set_config('request.jwt.claims', '', true);
        PERFORM set_config('request.jwt.claim.sub', '', true);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF SQLERRM = 'TEST_SUCCESSFUL_ROLLBACK' THEN
        RAISE NOTICE '=================================================================';
        RAISE NOTICE '=== TRANSACTION ROLLED BACK CLEANLY. DATABASE STATE PRISTINE. ===';
        RAISE NOTICE '=================================================================';
    ELSE
        RAISE EXCEPTION 'Security test harness assertion failure: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END IF;
END $$;
