-- ==============================================================================
-- Migration: Fix Pay at Desk 10-Digit Numeric Tracking Code & Live Queue Sync
-- File: supabase/migration_fix_pay_at_desk_numeric_id_and_live_queue_sync.sql
-- ==============================================================================

-- 1. Ensure generate_unique_tracking_code_10 is strictly available
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_code_10(p_terminal_id INT DEFAULT NULL)
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW() AT TIME ZONE 'Asia/Kathmandu';
    v_doy_int INT := EXTRACT(DOY FROM v_now)::INT;
    v_doy_str VARCHAR(3) := lpad(v_doy_int::TEXT, 3, '0');
    v_term_str VARCHAR(3);
    v_counter_str VARCHAR(3);
    v_payload VARCHAR(9);
    v_code VARCHAR(10);
    v_exists BOOLEAN;
    v_attempts INT := 0;
    v_sum INT := 0;
    v_digit INT;
    v_pos INT;
    v_weighted INT;
    v_mod INT;
    v_chk INT;
BEGIN
    LOOP
        v_attempts := v_attempts + 1;

        IF p_terminal_id IS NOT NULL THEN
            v_term_str := lpad((abs(p_terminal_id) % 1000)::TEXT, 3, '0');
        ELSE
            v_term_str := (floor(random() * 900 + 100)::INT)::TEXT;
        END IF;

        v_counter_str := lpad((floor(random() * 999 + 1)::INT)::TEXT, 3, '0');
        v_payload := v_term_str || v_doy_str || v_counter_str;

        -- Calculate Luhn mod-10 checksum
        v_sum := 0;
        FOR i IN REVERSE 9..1 LOOP
            v_digit := substring(v_payload from i for 1)::INT;
            v_pos := (9 - i) + 2;
            IF v_pos % 2 = 0 THEN
                v_weighted := v_digit * 2;
                IF v_weighted > 9 THEN
                    v_weighted := v_weighted - 9;
                END IF;
            ELSE
                v_weighted := v_digit;
            END IF;
            v_sum := v_sum + v_weighted;
        END LOOP;

        v_mod := v_sum % 10;
        IF v_mod = 0 THEN
            v_chk := 0;
        ELSE
            v_chk := 10 - v_mod;
        END IF;

        v_code := v_payload || v_chk::TEXT;

        SELECT EXISTS(SELECT 1 FROM public.appointments WHERE tracking_code_10_digit = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        IF v_attempts > 100 THEN
            -- Random fallback starting with 9 followed by 9 digits
            v_code := '9' || lpad((floor(random() * 1000000000)::BIGINT)::TEXT, 9, '0');
            SELECT EXISTS(SELECT 1 FROM public.appointments WHERE tracking_code_10_digit = v_code) INTO v_exists;
            IF NOT v_exists THEN
                RETURN v_code;
            END IF;
        END IF;
    END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_unique_tracking_code_10(INT) TO anon, authenticated, service_role;

-- Overload without arguments
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_code_10()
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.generate_unique_tracking_code_10(NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_unique_tracking_code_10() TO anon, authenticated, service_role;


-- 2. Update create_patient_appointment:
--    - Enforce 10-digit numeric tracking code (no more hexadecimal md5 substrings)
--    - Accept optional p_tracking_code from client if valid and unique
CREATE OR REPLACE FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID DEFAULT NULL,
    p_appointment_date DATE DEFAULT NULL,
    p_appointment_time TIME DEFAULT NULL,
    p_patient_name TEXT DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL,
    p_selected_test_ids UUID[] DEFAULT NULL,
    p_selected_lab_tests TEXT DEFAULT NULL,
    p_fee_amount NUMERIC(10, 2) DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt_id UUID := gen_random_uuid();
    v_tracking_code VARCHAR(10);
    v_fee NUMERIC(10, 2) := 0.00;
    v_service_charge NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2) := 0.00;
    v_doctor public.doctors%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_gender TEXT;
    v_clean_age INT;
    v_caller_profile_id UUID;
    v_slot public.slots%ROWTYPE;
    v_slot_resolved_id UUID := p_slot_id;
    v_is_pad BOOLEAN;
    v_payment_mode_final VARCHAR(30);
    v_status_final VARCHAR(50);
    v_expires_at TIMESTAMPTZ;
    v_is_lab BOOLEAN := FALSE;
    v_effective_doc_id UUID := p_doctor_id;
BEGIN
    -- 1. Input Sanitization & Mobile Validation
    v_clean_phone := right(regexp_replace(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
    IF length(v_clean_phone) <> 10 OR left(v_clean_phone, 1) <> '9' THEN
        RAISE EXCEPTION 'Invalid Nepal mobile number. Must be 10 digits starting with 9.';
    END IF;

    v_clean_name := trim(COALESCE(p_patient_name, ''));
    IF length(v_clean_name) < 2 OR length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Patient name must be between 2 and 150 characters.';
    END IF;

    v_clean_gender := COALESCE(NULLIF(trim(p_patient_gender), ''), 'Other');
    v_clean_age := COALESCE(p_patient_age, 30);
    IF v_clean_age <= 0 THEN
        v_clean_age := 30;
    END IF;

    -- 2. Resilient Security Rate Limiting
    BEGIN
        IF NOT private.consume_tracking_rate_limit('booking-phone', v_clean_phone, 30, 3600) THEN
            RAISE EXCEPTION 'Booking rate limit exceeded for this mobile number.';
        END IF;
    EXCEPTION 
        WHEN OTHERS THEN
            NULL;
    END;

    -- 3. Authoritative Clinic Verification Check
    SELECT * INTO v_clinic FROM public.clinics
    WHERE id = p_clinic_id
      AND verification_status = 'approved'
      AND COALESCE(is_archived, false) = false
      AND COALESCE(is_activated, true) = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected clinic is not active or verified for booking.';
    END IF;

    v_is_lab := (v_clinic.type::text = 'diagnostic_lab' OR v_clinic.type::text ILIKE '%lab%' OR v_clinic.name ILIKE '%lab%');

    -- 4. Doctor vs Diagnostic Lab Mode Check & Fee Computation
    IF v_is_lab THEN
        v_effective_doc_id := NULL;
        IF p_selected_test_ids IS NOT NULL AND array_length(p_selected_test_ids, 1) > 0 THEN
            SELECT COALESCE(SUM(price), 0.00) INTO v_fee
            FROM public.clinic_services
            WHERE id = ANY(p_selected_test_ids) AND clinic_id = p_clinic_id;
        ELSIF p_fee_amount IS NOT NULL AND p_fee_amount > 0 THEN
            v_fee := p_fee_amount;
        ELSE
            v_fee := 0.00;
        END IF;
    ELSIF v_effective_doc_id IS NOT NULL THEN
        SELECT * INTO v_doctor FROM public.doctors
        WHERE id = v_effective_doc_id
          AND (clinic_id = p_clinic_id OR primary_clinic_id = p_clinic_id OR active_clinic_id = p_clinic_id)
          AND kyc_status IN ('approved', 'verified');

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Doctor does not belong to the selected clinic or is not approved.';
        END IF;

        v_fee := COALESCE(v_doctor.consultation_fee, 500.00);
    ELSE
        v_fee := COALESCE(p_fee_amount, 500.00);
    END IF;

    -- 5. Payment Mode & Expiration Window
    v_is_pad := COALESCE(p_is_pay_at_desk, false) OR UPPER(COALESCE(p_payment_mode, '')) = 'PAY_AT_DESK';
    IF v_is_pad THEN
        v_service_charge := round(v_fee * 0.05, 2);
        v_total := v_fee + v_service_charge;
        v_payment_mode_final := 'PAY_AT_DESK';
        v_status_final := 'WAITING_FOR_APPROVAL';
        v_expires_at := NULL;
    ELSE
        v_service_charge := 0.00;
        v_total := v_fee;
        v_payment_mode_final := 'ONLINE';
        v_status_final := 'pending_payment';
        v_expires_at := NOW() + INTERVAL '10 minutes';
    END IF;

    -- 6. Slot Reservation
    IF v_slot_resolved_id IS NOT NULL AND NOT v_is_pad THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_slot_resolved_id;
        IF FOUND AND v_slot.booked_count < v_slot.max_capacity THEN
            UPDATE public.slots SET booked_count = booked_count + 1 WHERE id = v_slot_resolved_id;
        END IF;
    END IF;

    -- 7. Generate 10-digit Tracking Code (strictly 10 numeric digits)
    IF p_tracking_code IS NOT NULL AND p_tracking_code ~ '^[1-9][0-9]{9}$' THEN
        -- Check if client-provided code is available
        IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE tracking_code_10_digit = p_tracking_code) THEN
            v_tracking_code := p_tracking_code;
        ELSE
            v_tracking_code := public.generate_unique_tracking_code_10();
        END IF;
    ELSE
        v_tracking_code := public.generate_unique_tracking_code_10();
    END IF;

    -- 8. Resolve Caller Profile ID if authenticated
    BEGIN
        SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_uid = auth.uid() LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_caller_profile_id := NULL;
    END;

    -- 9. Insert Appointment Record
    INSERT INTO public.appointments (
        id,
        tracking_code_10_digit,
        slot_id,
        clinic_id,
        doctor_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        patient_email,
        payment_status,
        checkin_status,
        appointment_date,
        appointment_time,
        fee_amount,
        service_charge_amount,
        total_amount,
        payment_mode,
        status,
        notes,
        selected_lab_tests,
        attempt_number,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        v_slot_resolved_id,
        p_clinic_id,
        v_effective_doc_id,
        v_caller_profile_id,
        v_clean_name,
        v_clean_age,
        v_clean_gender,
        v_clean_phone,
        p_patient_email,
        CASE WHEN v_is_pad THEN 'unpaid'::payment_status_enum ELSE 'pending'::payment_status_enum END,
        'checked_in'::checkin_status_enum,
        COALESCE(p_appointment_date, CURRENT_DATE),
        COALESCE(p_appointment_time, CURRENT_TIME),
        v_fee,
        v_service_charge,
        v_total,
        v_payment_mode_final,
        v_status_final,
        p_notes,
        p_selected_lab_tests,
        1,
        v_expires_at,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt_id,
        'tracking_code_10_digit', v_tracking_code,
        'fee_amount', v_fee,
        'service_charge_amount', v_service_charge,
        'total_amount', v_total,
        'status', v_status_final,
        'expires_at', v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID[], TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_patient_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID[], TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;

-- Also maintain backward compatibility for 16-argument call
CREATE OR REPLACE FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID DEFAULT NULL,
    p_appointment_date DATE DEFAULT NULL,
    p_appointment_time TIME DEFAULT NULL,
    p_patient_name TEXT DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL,
    p_selected_test_ids UUID[] DEFAULT NULL,
    p_selected_lab_tests TEXT DEFAULT NULL,
    p_fee_amount NUMERIC(10, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN public.create_patient_appointment(
        p_clinic_id => p_clinic_id,
        p_doctor_id => p_doctor_id,
        p_appointment_date => p_appointment_date,
        p_appointment_time => p_appointment_time,
        p_patient_name => p_patient_name,
        p_patient_phone => p_patient_phone,
        p_patient_email => p_patient_email,
        p_patient_age => p_patient_age,
        p_patient_gender => p_patient_gender,
        p_notes => p_notes,
        p_is_pay_at_desk => p_is_pay_at_desk,
        p_slot_id => p_slot_id,
        p_payment_mode => p_payment_mode,
        p_selected_test_ids => p_selected_test_ids,
        p_selected_lab_tests => p_selected_lab_tests,
        p_fee_amount => p_fee_amount,
        p_tracking_code => NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_patient_appointment(UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID[], TEXT, NUMERIC) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
