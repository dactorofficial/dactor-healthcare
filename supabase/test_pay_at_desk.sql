-- =========================================================================
-- DACTOR PLATFORM: SECURE TEST HARNESS FOR PAY AT DESK BACKEND
-- Validates:
-- 1. Server-Side Price & Fee Integrity (Tampering Prevention)
-- 2. Caller Identity & User ID Neutralization for Guests
-- 3. Strict Entity, Doctor Affiliation & Slot Validation
-- 4. Rate Limiting Protection (Anti-Spam)
-- 5. PII Protection & Listing Authorization (Anon/Stranger Blocked, Staff/Admin Allowed)
-- 6. Approval Authorization & Cross-Clinic Spoofing Prevention
-- 7. Overload Rule (12/12 -> 13/12) and Live Queue Enrollment
-- 8. Strict Status Transitions (Cannot Re-Approve or Reject Approved)
-- 9. Rejection Authorization (Stranger Blocked, Staff Allowed)
-- 10. Retry Authorization & Strict 3-Attempt Lifecycle (Stranger Blocked, Owner Allowed)
-- 11. Confinement of Global Expiry (Anon/Stranger Blocked, Service Role Allowed)
-- 12. Clean Transaction Rollback (Zero DB Pollution)
-- =========================================================================

DO $$
DECLARE
    v_test_clinic_1 UUID;
    v_test_clinic_2 UUID;
    v_test_doctor_1 UUID;
    v_test_doctor_2 UUID;
    v_test_slot_1 UUID;
    v_appt_res JSONB;
    v_appt_id UUID;
    v_tracking_code VARCHAR(10);
    v_q_count INT;
    v_slot_booked INT;
    v_expired_count INT;
    v_error_caught BOOLEAN;
    v_appt_row appointments%ROWTYPE;
    v_list_count INT;
    v_idx INT;
BEGIN
    RAISE NOTICE '=== STARTING SECURE PAY AT DESK BACKEND TEST HARNESS ===';

    -- 1. SETUP TEST FIXTURES
    -- 1.1 Clinic 1 (Owning Clinic)
    INSERT INTO clinics (name, contact_phone, contact_email, address_text, verification_status, is_archived)
    VALUES ('PayAtDesk Secure Clinic 1', '9800000001', 'clinic1_admin@dactor.com', 'Kathmandu Ward 1', 'approved', false)
    RETURNING id INTO v_test_clinic_1;

    -- 1.2 Clinic 2 (Separate Clinic)
    INSERT INTO clinics (name, contact_phone, contact_email, address_text, verification_status, is_archived)
    VALUES ('PayAtDesk Secure Clinic 2', '9800000002', 'clinic2_admin@dactor.com', 'Pokhara Ward 2', 'approved', false)
    RETURNING id INTO v_test_clinic_2;

    -- 1.3 Doctor for Clinic 1 with official consultation_fee = 1000.00
    INSERT INTO doctors (clinic_id, full_name, email, specialty, kyc_status, consultation_fee)
    VALUES (v_test_clinic_1, 'Dr. Aris Thorne', 'dr.thorne@dactor.com', 'Cardiology', 'approved', 1000.00)
    RETURNING id INTO v_test_doctor_1;

    -- 1.4 Doctor for Clinic 2 with official consultation_fee = 800.00
    INSERT INTO doctors (clinic_id, full_name, email, specialty, kyc_status, consultation_fee)
    VALUES (v_test_clinic_2, 'Dr. Maya Sen', 'dr.sen@dactor.com', 'Pediatrics', 'approved', 800.00)
    RETURNING id INTO v_test_doctor_2;

    -- 1.5 Full Slot for Doctor 1 (max_capacity = 12, booked_count = 12)
    INSERT INTO slots (clinic_id, doctor_id, slot_date, start_time, end_time, max_capacity, booked_count, is_published)
    VALUES (v_test_clinic_1, v_test_doctor_1, CURRENT_DATE + 1, '10:00:00', '11:00:00', 12, 12, true)
    RETURNING id INTO v_test_slot_1;

    RAISE NOTICE '[SETUP] Created fixtures: Clinic 1 (%), Clinic 2 (%), Doctor 1 (fee 1000), Doctor 2 (fee 800), Full Slot 1 (12/12)',
        v_test_clinic_1, v_test_clinic_2;

    -- =========================================================================
    -- TEST 1: SERVER-SIDE PRICE & FEE INTEGRITY (PREVENT FEE TAMPERING)
    -- Client attempts to pass p_fee_amount = 5.00; Server must enforce 1000.00
    -- and compute 5% service charge (50.00) for a total of 1050.00.
    -- =========================================================================
    v_appt_res := create_pay_at_desk_appointment(
        p_clinic_id => v_test_clinic_1,
        p_doctor_id => v_test_doctor_1,
        p_slot_id => v_test_slot_1,
        p_patient_name => 'Ram Sharma',
        p_patient_age => 32,
        p_patient_gender => 'Male',
        p_patient_mobile => '9841234567',
        p_appointment_date => CURRENT_DATE + 1,
        p_appointment_time => '10:00:00',
        p_fee_amount => 5.00 -- Tampered client fee!
    );

    v_appt_id := (v_appt_res->>'id')::UUID;
    v_tracking_code := v_appt_res->>'tracking_code_10_digit';

    ASSERT (v_appt_res->>'fee_amount')::NUMERIC = 1000.00, 'TEST 1 FAILED: Server must enforce official doctor fee (1000.00)';
    ASSERT (v_appt_res->>'service_charge_amount')::NUMERIC = 50.00, 'TEST 1 FAILED: 5% service charge of 1000 must be 50.00';
    ASSERT (v_appt_res->>'total_amount')::NUMERIC = 1050.00, 'TEST 1 FAILED: Total amount must be 1050.00';
    ASSERT v_appt_res->>'status' = 'WAITING_FOR_APPROVAL', 'TEST 1 FAILED: Status must be WAITING_FOR_APPROVAL';
    ASSERT v_appt_res->>'payment_mode' = 'PAY_AT_DESK', 'TEST 1 FAILED: Payment mode must be PAY_AT_DESK';
    ASSERT length(v_tracking_code) = 10, 'TEST 1 FAILED: Tracking code must be 10 digits';

    -- Queue Isolation: Not in live queue yet
    SELECT COUNT(*) INTO v_q_count FROM queue_entries WHERE appointment_id = v_appt_id;
    ASSERT v_q_count = 0, 'TEST 1 FAILED: WAITING_FOR_APPROVAL must NOT be in queue_entries';

    RAISE NOTICE '[PASSED] TEST 1: Server-side fee integrity (tampered 5.00 -> 1000.00 fee, 50.00 charge, 1050.00 total) & Queue Isolation';

    -- =========================================================================
    -- TEST 2: GUEST USER_ID FORGERY NEUTRALIZATION
    -- Anonymous guest attempts to pass an arbitrary p_user_id; Server must set user_id to NULL.
    -- =========================================================================
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

    v_appt_res := create_pay_at_desk_appointment(
        p_clinic_id => v_test_clinic_1,
        p_doctor_id => v_test_doctor_1,
        p_slot_id => v_test_slot_1,
        p_patient_name => 'Sita Karki',
        p_patient_age => 28,
        p_patient_gender => 'Female',
        p_patient_mobile => '9847112233',
        p_appointment_date => CURRENT_DATE + 1,
        p_appointment_time => '10:15:00',
        p_user_id => '11111111-2222-3333-4444-555555555555'::UUID -- Arbitrary forged user ID
    );

    SELECT * INTO v_appt_row FROM appointments WHERE id = (v_appt_res->>'id')::UUID;
    ASSERT v_appt_row.user_id IS NULL, 'TEST 2 FAILED: Unauthenticated guest booking must neutralize arbitrary p_user_id to NULL';
    RAISE NOTICE '[PASSED] TEST 2: Arbitrary user_id injection blocked for unauthenticated guest bookings';

    -- =========================================================================
    -- TEST 3: ENTITY, DOCTOR AFFILIATION & SLOT VALIDATION
    -- =========================================================================
    -- 3a. Doctor from Clinic 2 cannot be booked under Clinic 1
    v_error_caught := FALSE;
    BEGIN
        PERFORM create_pay_at_desk_appointment(
            p_clinic_id => v_test_clinic_1,
            p_doctor_id => v_test_doctor_2, -- Doctor belongs to Clinic 2!
            p_slot_id => NULL,
            p_patient_name => 'Mismatched Doctor Test',
            p_patient_age => 40,
            p_patient_gender => 'Male',
            p_patient_mobile => '9849998877',
            p_appointment_date => CURRENT_DATE + 1,
            p_appointment_time => '10:00:00'
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 3a FAILED: Booking with doctor not belonging to clinic must fail';

    -- 3b. Cannot book appointment in the past
    v_error_caught := FALSE;
    BEGIN
        PERFORM create_pay_at_desk_appointment(
            p_clinic_id => v_test_clinic_1,
            p_doctor_id => v_test_doctor_1,
            p_slot_id => NULL,
            p_patient_name => 'Past Date Test',
            p_patient_age => 40,
            p_patient_gender => 'Male',
            p_patient_mobile => '9849998877',
            p_appointment_date => CURRENT_DATE - 2, -- Past date!
            p_appointment_time => '10:00:00'
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 3b FAILED: Booking in the past must fail';

    -- 3c. Invalid phone format rejected
    v_error_caught := FALSE;
    BEGIN
        PERFORM create_pay_at_desk_appointment(
            p_clinic_id => v_test_clinic_1,
            p_doctor_id => v_test_doctor_1,
            p_slot_id => NULL,
            p_patient_name => 'Bad Phone Test',
            p_patient_age => 40,
            p_patient_gender => 'Male',
            p_patient_mobile => '12345', -- Invalid mobile format!
            p_appointment_date => CURRENT_DATE + 1,
            p_appointment_time => '10:00:00'
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 3c FAILED: Invalid mobile format must fail';

    RAISE NOTICE '[PASSED] TEST 3: Doctor affiliation, past-date, and mobile validation enforced';

    -- =========================================================================
    -- TEST 4: SPAM RATE LIMITING
    -- More than 5 appointments for same mobile in 1 hour must be blocked.
    -- =========================================================================
    -- We already created 1 with phone '9841234567'. Create 4 more.
    FOR v_idx IN 2..5 LOOP
        PERFORM create_pay_at_desk_appointment(
            p_clinic_id => v_test_clinic_2, -- spread across clinics
            p_doctor_id => v_test_doctor_2,
            p_slot_id => NULL,
            p_patient_name => 'Spam Test ' || v_idx,
            p_patient_age => 20 + v_idx,
            p_patient_gender => 'Other',
            p_patient_mobile => '9841234567',
            p_appointment_date => CURRENT_DATE + 1,
            p_appointment_time => '12:00:00'
        );
    END LOOP;

    -- The 6th attempt must trigger rate limit exception
    v_error_caught := FALSE;
    BEGIN
        PERFORM create_pay_at_desk_appointment(
            p_clinic_id => v_test_clinic_1,
            p_doctor_id => v_test_doctor_1,
            p_slot_id => NULL,
            p_patient_name => 'Spam Blocked',
            p_patient_age => 35,
            p_patient_gender => 'Male',
            p_patient_mobile => '9841234567',
            p_appointment_date => CURRENT_DATE + 1,
            p_appointment_time => '12:00:00'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Rate limit exceeded%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 4 FAILED: 6th appointment creation for same mobile in 1 hour must trigger rate limit';
    RAISE NOTICE '[PASSED] TEST 4: Spam rate limit strictly enforced (max 5 per mobile per hour)';

    -- =========================================================================
    -- TEST 5: PII PROTECTION & LISTING AUTHORIZATION
    -- Calling list_pending_pay_at_desk_requests as anon or stranger must fail.
    -- Calling as authorized clinic staff or super admin must succeed.
    -- =========================================================================
    -- 5a. Anon caller blocked from listing Clinic 1 requests
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM list_pending_pay_at_desk_requests(v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 5a FAILED: Anon caller must NOT be permitted to list pending requests';

    -- 5b. Unrelated authenticated user (stranger) blocked
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "stranger@other.com"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM list_pending_pay_at_desk_requests(v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 5b FAILED: Unrelated authenticated user must NOT be permitted to list Clinic 1 requests';

    -- 5c. Authorized Clinic 1 staff (clinic1_admin@dactor.com) permitted
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    SELECT COUNT(*) INTO v_list_count FROM list_pending_pay_at_desk_requests(v_test_clinic_1);
    ASSERT v_list_count >= 1, 'TEST 5c FAILED: Authorized clinic staff must be able to list requests';

    -- 5d. Super Admin permitted
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "superadmin@dactor.com"}', true);
    SELECT COUNT(*) INTO v_list_count FROM list_pending_pay_at_desk_requests(v_test_clinic_1);
    ASSERT v_list_count >= 1, 'TEST 5d FAILED: Super Admin must be able to list requests';

    RAISE NOTICE '[PASSED] TEST 5: Patient PII protected: Anon and strangers blocked from listing, staff and admin authorized';

    -- =========================================================================
    -- TEST 6: APPROVAL AUTHORIZATION & CROSS-CLINIC SPOOFING PREVENTION
    -- =========================================================================
    -- 6a. Attacker from Clinic 2 passes Clinic 1's ID to approve appointment belonging to Clinic 1
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic2_admin@dactor.com"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM approve_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 6a FAILED: Clinic 2 staff must NOT be able to approve Clinic 1 appointment even if passing Clinic 1 ID';

    -- 6b. Anon caller blocked from approval
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM approve_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 6b FAILED: Anon caller must NOT be able to approve appointment';

    -- 6c. Authorized Clinic 1 staff approves appointment
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    PERFORM approve_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);

    SELECT * INTO v_appt_row FROM appointments WHERE id = v_appt_id;
    ASSERT v_appt_row.status = 'APPROVED', 'TEST 6c FAILED: Status must be APPROVED';
    ASSERT v_appt_row.approved_at IS NOT NULL, 'TEST 6c FAILED: approved_at must be populated';

    -- Check slot capacity overload: 12/12 became 13
    SELECT booked_count INTO v_slot_booked FROM slots WHERE id = v_test_slot_1;
    ASSERT v_slot_booked = 13, 'TEST 6c FAILED: Overloaded slot booked_count must be 13';

    -- Check live queue enrollment
    SELECT COUNT(*) INTO v_q_count FROM queue_entries WHERE appointment_id = v_appt_id AND status = 'waiting';
    ASSERT v_q_count = 1, 'TEST 6c FAILED: Approved appointment must be entered in queue_entries';

    RAISE NOTICE '[PASSED] TEST 6: Caller spoofing blocked, authorized staff approval succeeds, overload rule (12->13) & queue enrollment verified';

    -- =========================================================================
    -- TEST 7: TRANSITION LOCKS (CANNOT RE-APPROVE OR REJECT APPROVED)
    -- =========================================================================
    v_error_caught := FALSE;
    BEGIN
        PERFORM approve_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 7a FAILED: Re-approving already APPROVED appointment must fail';

    v_error_caught := FALSE;
    BEGIN
        PERFORM reject_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 7b FAILED: Rejecting already APPROVED appointment must fail';

    RAISE NOTICE '[PASSED] TEST 7: Strict transition locks on APPROVED appointment';

    -- =========================================================================
    -- TEST 8: REJECTION AUTHORIZATION & RETRY LIFECYCLE (3 ATTEMPTS MAX)
    -- =========================================================================
    -- Create fresh appointment for retry testing
    v_appt_res := create_pay_at_desk_appointment(
        p_clinic_id => v_test_clinic_1,
        p_doctor_id => v_test_doctor_1,
        p_slot_id => v_test_slot_1,
        p_patient_name => 'Hari Thapa',
        p_patient_age => 45,
        p_patient_gender => 'Male',
        p_patient_mobile => '9851122334',
        p_appointment_date => CURRENT_DATE + 1,
        p_appointment_time => '10:30:00'
    );
    v_appt_id := (v_appt_res->>'id')::UUID;

    -- 8a. Stranger cannot reject Clinic 1 appointment
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "stranger@other.com"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM reject_pay_at_desk_appointment(v_appt_id, v_test_clinic_1, 'Unauthorized reject');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 8a FAILED: Stranger must NOT be able to reject Clinic 1 appointment';

    -- 8b. Authorized Clinic 1 staff rejects appointment -> status UNAPPROVED, attempt = 1
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    PERFORM reject_pay_at_desk_appointment(v_appt_id, v_test_clinic_1, 'Slot full');
    SELECT * INTO v_appt_row FROM appointments WHERE id = v_appt_id;
    ASSERT v_appt_row.status = 'UNAPPROVED', 'TEST 8b FAILED: Status must be UNAPPROVED';
    ASSERT v_appt_row.attempt_number = 1, 'TEST 8b FAILED: Attempt number must be 1';

    -- 8c. Stranger cannot retry appointment
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "stranger@other.com"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM retry_pay_at_desk_appointment(v_appt_id, '9800000000'); -- mismatched mobile
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 8c FAILED: Stranger with mismatched phone must NOT be able to retry';

    -- 8d. Patient with matching mobile successfully retries (Attempt 2)
    PERFORM retry_pay_at_desk_appointment(v_appt_id, '9851122334');
    SELECT * INTO v_appt_row FROM appointments WHERE id = v_appt_id;
    ASSERT v_appt_row.status = 'WAITING_FOR_APPROVAL', 'TEST 8d FAILED: Status must return to WAITING_FOR_APPROVAL';
    ASSERT v_appt_row.attempt_number = 2, 'TEST 8d FAILED: Attempt number must be 2';
    ASSERT v_appt_row.expires_at IS NULL, 'TEST 8d FAILED: expires_at must be NULL on attempt 2';

    -- Reject attempt 2
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    PERFORM reject_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);

    -- 8e. Patient retries (Attempt 3) -> 2-day timer set
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true); -- or patient session
    PERFORM retry_pay_at_desk_appointment(v_appt_id, '9851122334');
    SELECT * INTO v_appt_row FROM appointments WHERE id = v_appt_id;
    ASSERT v_appt_row.status = 'WAITING_FOR_APPROVAL', 'TEST 8e FAILED: Status must return to WAITING_FOR_APPROVAL';
    ASSERT v_appt_row.attempt_number = 3, 'TEST 8e FAILED: Attempt number must be 3';
    ASSERT v_appt_row.expires_at IS NOT NULL, 'TEST 8e FAILED: expires_at must be set on attempt 3';
    ASSERT v_appt_row.expires_at > NOW() + INTERVAL '1 day', 'TEST 8e FAILED: expires_at must be ~2 days in future';

    -- Reject attempt 3
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    PERFORM reject_pay_at_desk_appointment(v_appt_id, v_test_clinic_1);

    -- 8f. 4th retry strictly blocked with maximum attempts exceeded
    v_error_caught := FALSE;
    BEGIN
        PERFORM retry_pay_at_desk_appointment(v_appt_id, '9851122334');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;
    ASSERT v_error_caught, 'TEST 8f FAILED: 4th retry must be strictly blocked';

    RAISE NOTICE '[PASSED] TEST 8: Rejection authorization, retry caller verification, and strict 3-attempt lifecycle verified';

    -- =========================================================================
    -- TEST 9: GLOBAL EXPIRY CONFINEMENT
    -- Anon or normal authenticated callers must be strictly blocked.
    -- Only service_role or Super Admin can run global expiry.
    -- =========================================================================
    -- 9a. Anon blocked
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM expire_pay_at_desk_appointments();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 9a FAILED: Anon caller must NOT be permitted to run global expiry';

    -- 9b. Normal authenticated user blocked
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "email": "clinic1_admin@dactor.com"}', true);
    v_error_caught := FALSE;
    BEGIN
        PERFORM expire_pay_at_desk_appointments();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Access denied%' THEN
            v_error_caught := TRUE;
        END IF;
    END;
    ASSERT v_error_caught, 'TEST 9b FAILED: Clinic admin must NOT be permitted to run global cross-clinic expiry';

    -- 9c. Super Admin permitted
    PERFORM set_config('request.jwt.claims', '{"role": "super_admin", "email": "admin@dactor.com"}', true);
    SELECT expire_pay_at_desk_appointments() INTO v_expired_count;
    ASSERT v_expired_count >= 0, 'TEST 9c FAILED: Super Admin must be able to run expiry engine';

    RAISE NOTICE '[PASSED] TEST 9: Global expiry strictly confined to service_role and platform administrators';

    RAISE NOTICE '=== ALL SECURE PAY AT DESK TESTS PASSED SUCCESSFULLY ===';

    -- Clean rollback so test artifacts do not pollute database
    RAISE EXCEPTION 'TEST_SUCCESSFUL_ROLLBACK';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_SUCCESSFUL_ROLLBACK' THEN
        RAISE NOTICE 'Test transaction rolled back cleanly. No residual test data retained.';
    ELSE
        RAISE EXCEPTION 'Test harness error: %', SQLERRM;
    END IF;
END $$;
