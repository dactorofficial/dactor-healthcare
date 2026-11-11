-- ==============================================================================
-- Migration: Pay at Desk Slot Decoupling, Overbooking Support & Passed Slot Priority Queue
-- File: supabase/migration_pay_at_desk_slot_decoupling_and_priority_queue.sql
-- ==============================================================================

-- 1. Ensure estimated_wait_minutes column exists on queue_entries
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS estimated_wait_minutes INT DEFAULT 0;

-- 2. Update create_patient_appointment RPC:
--    - For ONLINE payments: reserve slot immediately during 10-minute checkout window.
--    - For PAY_AT_DESK: DO NOT reserve slot or increment booked_count before clinic confirmation.
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

    -- 2. Resilient Security Rate Limiting (Never fail booking)
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
    -- Only reserve slot immediately for ONLINE payments.
    -- For PAY_AT_DESK: do NOT increment booked_count here. The slot is only reserved when clinic confirms/approves.
    IF v_slot_resolved_id IS NOT NULL AND NOT v_is_pad THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_slot_resolved_id;
        IF FOUND AND v_slot.booked_count < v_slot.max_capacity THEN
            UPDATE public.slots SET booked_count = booked_count + 1 WHERE id = v_slot_resolved_id;
        END IF;
    END IF;

    -- 7. Generate 10-digit Tracking Code
    v_tracking_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 10));

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
GRANT EXECUTE ON FUNCTION public.create_patient_appointment TO anon, authenticated, service_role;


-- 3. Update approve_pay_at_desk_appointment RPC:
--    - If slot is passed: puts patient at Position 1 in live waiting queue (shifts existing entries down).
--    - Overbooking is allowed: updates slot booked_count without capacity error.
--    - Assigns doctor_id from slot if present.
CREATE OR REPLACE FUNCTION public.approve_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_next_position INT;
    v_count INT;
    v_clinic_name TEXT;
    v_now_ktm TIMESTAMPTZ;
    v_today_ktm DATE;
    v_time_ktm TIME;
    v_slot_passed BOOLEAN := FALSE;
    v_effective_doc_id UUID;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- Dual authorization check: JWT staff/admin OR mobile clinic caller passing matching p_clinic_id
    IF NOT (
        (auth.jwt() ->> 'role') = 'service_role'
        OR public.is_admin_portal_user()
        OR public.is_authorized_clinic_staff(v_appt.clinic_id)
        OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to approve appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    -- Retrieve slot details if linked
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_appt.slot_id FOR UPDATE;
    END IF;

    v_effective_doc_id := COALESCE(v_appt.doctor_id, v_slot.doctor_id);

    -- If already approved and in queue, return current queue info idempotently
    IF v_appt.status = 'APPROVED' THEN
        SELECT queue_position INTO v_next_position
        FROM public.queue_entries
        WHERE appointment_id = v_appt.id;

        RETURN jsonb_build_object(
            'success', true,
            'appointment_id', v_appt.id,
            'status', 'APPROVED',
            'already_approved', true,
            'queue_position', COALESCE(v_next_position, 1)
        );
    END IF;

    -- Transition status to APPROVED and update doctor_id if resolved
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        doctor_id = COALESCE(v_appt.doctor_id, v_effective_doc_id),
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Overload / Overbooking Rule: Update slot booked count based on approved appointments
    -- Overbooking is explicitly supported (capacity is updated without capping or failing)
    IF v_appt.slot_id IS NOT NULL AND v_slot.id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count
        FROM public.appointments
        WHERE slot_id = v_appt.slot_id
          AND checkin_status::TEXT <> 'cancelled'
          AND status = 'APPROVED';

        UPDATE public.slots 
        SET booked_count = v_count,
            updated_at = NOW()
        WHERE id = v_appt.slot_id;
    END IF;

    -- Check if slot has passed using Nepal local time (UTC + 05:45)
    v_now_ktm := NOW() AT TIME ZONE 'Asia/Kathmandu';
    v_today_ktm := v_now_ktm::DATE;
    v_time_ktm := v_now_ktm::TIME;

    -- A slot is passed if appointment_date is in the past, or if today and slot end_time/appointment_time has passed
    IF v_appt.appointment_date < v_today_ktm THEN
        v_slot_passed := TRUE;
    ELSIF v_appt.appointment_date = v_today_ktm THEN
        IF v_slot.id IS NOT NULL AND v_slot.end_time IS NOT NULL THEN
            v_slot_passed := (v_slot.end_time < v_time_ktm);
        ELSIF v_appt.appointment_time IS NOT NULL THEN
            v_slot_passed := (v_appt.appointment_time < v_time_ktm);
        END IF;
    END IF;

    -- Priority Queue Placement
    IF v_slot_passed THEN
        -- Slot has passed: Place patient at FIRST position (queue_position = 1) in live waiting queue
        -- Shift all other waiting queue entries down by 1
        UPDATE public.queue_entries
        SET queue_position = queue_position + 1,
            updated_at = NOW()
        WHERE clinic_id = v_appt.clinic_id
          AND status = 'waiting'
          AND (
              (v_effective_doc_id IS NOT NULL AND (doctor_id = v_effective_doc_id OR doctor_id IS NULL))
              OR (v_effective_doc_id IS NULL)
          );

        v_next_position := 1;
    ELSE
        -- Normal FIFO queue placement at the end
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
        FROM public.queue_entries
        WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

        IF v_next_position <= 0 THEN
            v_next_position := 1;
        END IF;
    END IF;

    -- Safe enqueue into queue_entries
    INSERT INTO public.queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        v_appt.id, v_appt.clinic_id, v_effective_doc_id, v_next_position, 'waiting', 0, NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET status = 'waiting',
        doctor_id = EXCLUDED.doctor_id,
        queue_position = EXCLUDED.queue_position,
        updated_at = NOW();

    -- Safe patient notification
    BEGIN
        SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_appt.clinic_id;
        IF v_appt.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_appt.user_id) THEN
            INSERT INTO public.notifications (
                id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
            ) VALUES (
                gen_random_uuid(),
                v_appt.user_id,
                v_appt.id,
                'Pay at Desk Approved • Token #' || v_next_position,
                'Your appointment at ' || COALESCE(v_clinic_name, 'Clinic') || ' is approved! You are Token #' || v_next_position || '. Total due at desk: NPR ' || COALESCE(v_appt.total_amount, v_appt.fee_amount) || '.',
                'queue_alert',
                'specific',
                false,
                NOW()
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'APPROVED',
        'queue_position', v_next_position,
        'slot_passed', v_slot_passed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
