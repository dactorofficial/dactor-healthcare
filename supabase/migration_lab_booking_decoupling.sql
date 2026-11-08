-- ============================================================================
-- Migration: Diagnostic Lab Booking Decoupling & Lab Test Pricing Fix
-- ============================================================================

-- 1. Ensure slots.doctor_id is nullable (allows lab collection slots without doctors)
ALTER TABLE public.slots ALTER COLUMN doctor_id DROP NOT NULL;

-- 2. Ensure appointments has selected_lab_tests column
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS selected_lab_tests TEXT;

-- 3. Update Anti-Tampering Trigger for Diagnostic Lab Appointments
CREATE OR REPLACE FUNCTION public.prevent_appointment_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_doc_fee NUMERIC(10, 2);
    v_service_charge NUMERIC(10, 2);
    v_clinic_type TEXT;
BEGIN
    -- Allow service_role, administrative portal users, or authorized clinic staff (desk walk-ins)
    IF (auth.jwt() ->> 'role') = 'service_role' 
       OR public.is_admin_portal_user() 
       OR public.is_authorized_clinic_staff(NEW.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Block direct insertions that attempt to self-assign paid or confirmed statuses
    IF NEW.payment_status IS NOT NULL AND NEW.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign paid payment_status. Use create_patient_appointment RPC.';
    END IF;

    IF NEW.checkin_status IS NOT NULL AND NEW.checkin_status = 'checked_in' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign checked_in status. Use create_patient_appointment RPC.';
    END IF;

    SELECT type INTO v_clinic_type FROM public.clinics WHERE id = NEW.clinic_id;

    -- Diagnostic Lab Mode: force doctor_id to NULL so doctor fees never apply
    IF v_clinic_type = 'diagnostic_lab' OR v_clinic_type ILIKE '%lab%' THEN
        NEW.doctor_id := NULL;
        NEW.fee_amount := COALESCE(NEW.fee_amount, 0.00);
    ELSIF NEW.doctor_id IS NOT NULL THEN
        SELECT COALESCE(consultation_fee, 500.00) INTO v_doc_fee
        FROM public.doctors WHERE id = NEW.doctor_id;
        IF v_doc_fee IS NULL THEN
            v_doc_fee := 500.00;
        END IF;

        IF NEW.fee_amount IS NOT NULL AND NEW.fee_amount <> v_doc_fee THEN
            RAISE EXCEPTION 'Appointment tampering detected: client fee_amount (%) does not match doctor consultation fee (%). Use create_patient_appointment RPC.', NEW.fee_amount, v_doc_fee;
        END IF;

        NEW.fee_amount := v_doc_fee;
    ELSE
        NEW.fee_amount := COALESCE(NEW.fee_amount, 0.00);
    END IF;

    -- Force authoritative defaults
    NEW.payment_status := 'pending';
    NEW.checkin_status := 'not_checked_in';
    NEW.is_walkin := FALSE;

    IF NEW.payment_mode = 'PAY_AT_DESK' THEN
        v_service_charge := round(NEW.fee_amount * 0.05, 2);
        NEW.service_charge_amount := v_service_charge;
        NEW.total_amount := NEW.fee_amount + v_service_charge;
        NEW.status := 'WAITING_FOR_APPROVAL';
    ELSE
        NEW.service_charge_amount := 0.00;
        NEW.total_amount := NEW.fee_amount;
        NEW.status := 'pending_payment';
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Authoritative create_patient_appointment RPC with Lab Decoupling
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
SET search_path = public
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
    v_caller_profile_id UUID;
    v_ip TEXT;
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

    -- 2. Security Rate Limiting by Phone and IP
    IF NOT private.consume_tracking_rate_limit('booking-phone', v_clean_phone, 10, 3600) THEN
        RAISE EXCEPTION 'Booking rate limit exceeded for this mobile number (max 10 per hour).';
    END IF;

    BEGIN
        v_ip := COALESCE(
            current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
            current_setting('request.headers', true)::json ->> 'x-forwarded-for',
            'unknown-ip'
        );
        IF v_ip <> 'unknown-ip' AND length(v_ip) > 0 THEN
            IF NOT private.consume_tracking_rate_limit('booking-ip', v_ip, 30, 3600) THEN
                RAISE EXCEPTION 'Booking rate limit exceeded for this network (max 30 per hour).';
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
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

    v_is_lab := (v_clinic.type = 'diagnostic_lab' OR v_clinic.type ILIKE '%lab%' OR v_clinic.name ILIKE '%lab%');

    -- 4. Doctor vs Diagnostic Lab Mode Check & Fee Computation
    IF v_is_lab THEN
        -- Strictly Diagnostic Lab Mode: Force doctor_id to NULL
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
        -- OPD Doctor Mode
        SELECT * INTO v_doctor FROM public.doctors
        WHERE id = v_effective_doc_id
          AND (clinic_id = p_clinic_id OR primary_clinic_id = p_clinic_id OR active_clinic_id = p_clinic_id)
          AND kyc_status IN ('approved', 'verified');

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Doctor does not belong to the selected clinic or is not approved.';
        END IF;

        v_fee := COALESCE(v_doctor.consultation_fee, 500.00);
    ELSE
        -- Clinic standard fee
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
        v_expires_at := NOW() + INTERVAL '5 minutes';
    END IF;

    -- 6. Schedule / Slot Validation
    IF v_slot_resolved_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots
        WHERE id = v_slot_resolved_id AND clinic_id = p_clinic_id;

        IF FOUND THEN
            IF v_slot.slot_date < CURRENT_DATE THEN
                RAISE EXCEPTION 'Cannot book an appointment slot in the past.';
            END IF;

            UPDATE public.slots SET booked_count = booked_count + 1
            WHERE id = v_slot_resolved_id AND booked_count < max_capacity;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Slot is full. Cannot book this time slot.';
            END IF;
        ELSE
            v_slot_resolved_id := NULL;
        END IF;
    END IF;

    IF v_slot_resolved_id IS NULL AND p_appointment_date IS NOT NULL THEN
        IF p_appointment_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date cannot be in the past.';
        END IF;

        IF v_is_lab AND p_appointment_time IS NOT NULL THEN
            SELECT id INTO v_slot_resolved_id FROM public.slots
            WHERE clinic_id = p_clinic_id 
              AND doctor_id IS NULL 
              AND slot_date = p_appointment_date 
              AND start_time = p_appointment_time
            LIMIT 1;

            IF v_slot_resolved_id IS NOT NULL THEN
                UPDATE public.slots SET booked_count = booked_count + 1
                WHERE id = v_slot_resolved_id AND booked_count < max_capacity;
            ELSE
                INSERT INTO public.slots (
                    id,
                    clinic_id,
                    doctor_id,
                    slot_date,
                    start_time,
                    end_time,
                    max_capacity,
                    booked_count,
                    is_published
                ) VALUES (
                    gen_random_uuid(),
                    p_clinic_id,
                    NULL,
                    p_appointment_date,
                    p_appointment_time,
                    (p_appointment_time + INTERVAL '1 hour')::TIME,
                    30,
                    1,
                    TRUE
                ) RETURNING id INTO v_slot_resolved_id;
            END IF;
        END IF;
    END IF;

    -- 7. Caller Identity Resolution
    SELECT id INTO v_caller_profile_id FROM public.profiles
    WHERE (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
       OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
       OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    LIMIT 1;

    -- 8. Unique 10-Digit Tracking Code
    v_tracking_code := public.generate_unique_tracking_code_10();

    -- 9. Insert Appointment
    INSERT INTO public.appointments (
        id,
        tracking_code_10_digit,
        clinic_id,
        doctor_id,
        slot_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        patient_email,
        appointment_date,
        appointment_time,
        fee_amount,
        service_charge_amount,
        total_amount,
        payment_mode,
        status,
        payment_status,
        checkin_status,
        attempt_number,
        is_walkin,
        notes,
        selected_lab_tests,
        expires_at
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        p_clinic_id,
        v_effective_doc_id,
        v_slot_resolved_id,
        v_caller_profile_id,
        v_clean_name,
        COALESCE(p_patient_age, 0),
        v_clean_gender,
        v_clean_phone,
        NULLIF(trim(p_patient_email), ''),
        p_appointment_date,
        p_appointment_time,
        v_fee,
        v_service_charge,
        v_total,
        v_payment_mode_final,
        v_status_final,
        'pending',
        'not_checked_in',
        1,
        FALSE,
        p_notes,
        p_selected_lab_tests,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt_id,
        'tracking_code', v_tracking_code,
        'tracking_code_10_digit', v_tracking_code,
        'slot_id', v_slot_resolved_id,
        'fee_amount', v_fee,
        'service_charge_amount', v_service_charge,
        'total_amount', v_total,
        'payment_status', 'pending',
        'checkin_status', 'not_checked_in',
        'status', v_status_final,
        'expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_patient_appointment TO anon, authenticated, service_role;
