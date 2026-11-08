-- ============================================================================
-- Migration: Slot Reservation V2 — 2-Phase Payment Reservation System
-- Date: 2026-10-28
-- Description:
--   Replaces the broken/unused slot_locks system with appointment-level
--   server-authoritative reservation using a 2-phase model:
--     Phase 1: 5-minute decision window (choose payment method)
--     Phase 2: Gateway-specific backstop (15-20 min) once payment initiated
-- ============================================================================

-- 1. Add new columns to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gateway_backstop_expires_at TIMESTAMPTZ;

-- Index for efficient cron cleanup queries
CREATE INDEX IF NOT EXISTS idx_appointments_gateway_backstop
    ON appointments (gateway_backstop_expires_at)
    WHERE status = 'pending_payment' AND payment_mode = 'ONLINE';

CREATE INDEX IF NOT EXISTS idx_appointments_pending_payment_expires
    ON appointments (expires_at)
    WHERE status = 'pending_payment' AND payment_mode = 'ONLINE';

-- ============================================================================
-- 2. Update create_patient_appointment RPC
--    - Set expires_at for ONLINE payments (5-minute decision window)
--    - Increment booked_count immediately to prevent overbooking
--    - Return expires_at in response
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_appointment_time TIME,
    p_patient_name TEXT,
    p_patient_phone TEXT,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt_id UUID := gen_random_uuid();
    v_tracking_code VARCHAR(10);
    v_fee NUMERIC(10, 2);
    v_service_charge NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2);
    v_doctor public.doctors%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_gender TEXT;
    v_caller_profile_id UUID;
    v_ip TEXT;
    v_slot public.slots%ROWTYPE;
    v_is_pad BOOLEAN;
    v_payment_mode_final VARCHAR(30);
    v_status_final VARCHAR(50);
    v_expires_at TIMESTAMPTZ;
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

    -- 4. Authoritative Doctor Link & KYC Verification Check
    SELECT * INTO v_doctor FROM public.doctors
    WHERE id = p_doctor_id
      AND (clinic_id = p_clinic_id OR primary_clinic_id = p_clinic_id OR active_clinic_id = p_clinic_id)
      AND kyc_status IN ('approved', 'verified');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor does not belong to the selected clinic or is not approved.';
    END IF;

    -- 5. Authoritative Fee Computation from doctors Catalog Record
    v_fee := COALESCE(v_doctor.consultation_fee, 500.00);

    v_is_pad := COALESCE(p_is_pay_at_desk, false) OR UPPER(COALESCE(p_payment_mode, '')) = 'PAY_AT_DESK';
    IF v_is_pad THEN
        v_service_charge := round(v_fee * 0.05, 2);
        v_total := v_fee + v_service_charge;
        v_payment_mode_final := 'PAY_AT_DESK';
        v_status_final := 'WAITING_FOR_APPROVAL';
        v_expires_at := NULL;  -- Pay at Desk has its own expiry logic
    ELSE
        v_service_charge := 0.00;
        v_total := v_fee;
        v_payment_mode_final := 'ONLINE';
        v_status_final := 'pending_payment';
        v_expires_at := NOW() + INTERVAL '5 minutes';  -- Phase 1: Decision window
    END IF;

    -- 6. Schedule / Slot Validation
    IF p_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots
        WHERE id = p_slot_id AND clinic_id = p_clinic_id AND doctor_id = p_doctor_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected appointment slot is invalid for this clinic and doctor.';
        END IF;
        IF v_slot.slot_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Cannot book an appointment slot in the past.';
        END IF;

        -- Immediately increment booked_count to prevent overbooking during payment window
        UPDATE public.slots SET booked_count = booked_count + 1
        WHERE id = p_slot_id AND booked_count < max_capacity;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Slot is full. Cannot book this time slot.';
        END IF;
    ELSE
        IF p_appointment_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date cannot be in the past.';
        END IF;
    END IF;

    -- 7. Caller Identity Resolution (Authenticated account vs Guest)
    SELECT id INTO v_caller_profile_id FROM public.profiles
    WHERE (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
       OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
       OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    LIMIT 1;

    -- 8. Collision-Proof 10-Digit Tracking Code
    v_tracking_code := public.generate_unique_tracking_code_10();

    -- 9. Authoritative INSERT with Safe Enforced States
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
        expires_at
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        p_clinic_id,
        p_doctor_id,
        p_slot_id,
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
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt_id,
        'tracking_code', v_tracking_code,
        'tracking_code_10_digit', v_tracking_code,
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

-- ============================================================================
-- 3. New RPC: initiate_online_payment_phase
--    Called when patient taps "Pay with eSewa/Khalti/etc."
--    Clears the 5-min decision window and sets gateway-specific backstop
-- ============================================================================

CREATE OR REPLACE FUNCTION public.initiate_online_payment_phase(
    p_appointment_id UUID,
    p_gateway TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_backstop INTERVAL;
    v_backstop_at TIMESTAMPTZ;
BEGIN
    -- Gateway-specific backstop timeouts
    v_backstop := CASE LOWER(COALESCE(p_gateway, 'esewa'))
        WHEN 'esewa' THEN INTERVAL '15 minutes'
        WHEN 'khalti' THEN INTERVAL '15 minutes'
        WHEN 'fonepay' THEN INTERVAL '20 minutes'
        WHEN 'connectips' THEN INTERVAL '20 minutes'
        ELSE INTERVAL '15 minutes'
    END;

    v_backstop_at := NOW() + v_backstop;

    UPDATE public.appointments SET
        payment_initiated_at = NOW(),
        expires_at = NULL,                          -- Remove Phase 1 decision window
        gateway_backstop_expires_at = v_backstop_at -- Set Phase 2 backstop
    WHERE id = p_appointment_id
      AND status = 'pending_payment'
      AND payment_status != 'paid';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Appointment not found or already processed');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'backstop_expires_at', v_backstop_at::TEXT
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.initiate_online_payment_phase TO anon, authenticated, service_role;

-- ============================================================================
-- 4. New RPC: cancel_pending_appointment
--    Atomically cancels appointment and decrements slot booked_count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_pending_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot_id UUID;
    v_was_updated BOOLEAN := FALSE;
BEGIN
    -- Get slot_id before updating
    SELECT slot_id INTO v_slot_id FROM public.appointments
    WHERE id = p_appointment_id
      AND payment_status != 'paid'
      AND status NOT IN ('EXPIRED', 'CANCELLED', 'APPROVED', 'COMPLETED');

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Cancel the appointment
    UPDATE public.appointments SET
        status = 'EXPIRED',
        checkin_status = 'cancelled',
        payment_status = 'pending',
        updated_at = NOW()
    WHERE id = p_appointment_id
      AND payment_status != 'paid'
      AND status NOT IN ('EXPIRED', 'CANCELLED', 'APPROVED', 'COMPLETED');

    GET DIAGNOSTICS v_was_updated = ROW_COUNT > 0;

    -- Decrement slot booked_count if we actually cancelled
    IF v_was_updated AND v_slot_id IS NOT NULL THEN
        UPDATE public.slots SET booked_count = GREATEST(booked_count - 1, 0)
        WHERE id = v_slot_id;
    END IF;

    RETURN v_was_updated;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_pending_appointment TO anon, authenticated, service_role;

-- ============================================================================
-- 5. Server-side cron cleanup: expire_abandoned_online_appointments
--    Catches appointments where patient crashed / uninstalled / never returned
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_abandoned_online_appointments()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count_phase1 INT := 0;
    v_count_phase2 INT := 0;
BEGIN
    -- Phase 1 abandonments: decision window expired, never initiated payment
    WITH expired_decision AS (
        UPDATE public.appointments SET
            status = 'EXPIRED',
            checkin_status = 'cancelled',
            updated_at = NOW()
        WHERE status = 'pending_payment'
          AND payment_mode = 'ONLINE'
          AND payment_initiated_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
          AND payment_status != 'paid'
        RETURNING slot_id
    )
    UPDATE public.slots SET booked_count = GREATEST(booked_count - 1, 0)
    WHERE id IN (SELECT slot_id FROM expired_decision WHERE slot_id IS NOT NULL);

    GET DIAGNOSTICS v_count_phase1 = ROW_COUNT;

    -- Phase 2 abandonments: gateway backstop expired, payment never completed
    WITH expired_gateway AS (
        UPDATE public.appointments SET
            status = 'EXPIRED',
            checkin_status = 'cancelled',
            updated_at = NOW()
        WHERE status = 'pending_payment'
          AND payment_mode = 'ONLINE'
          AND payment_initiated_at IS NOT NULL
          AND gateway_backstop_expires_at IS NOT NULL
          AND gateway_backstop_expires_at < NOW()
          AND payment_status != 'paid'
        RETURNING slot_id
    )
    UPDATE public.slots SET booked_count = GREATEST(booked_count - 1, 0)
    WHERE id IN (SELECT slot_id FROM expired_gateway WHERE slot_id IS NOT NULL);

    GET DIAGNOSTICS v_count_phase2 = ROW_COUNT;

    RETURN v_count_phase1 + v_count_phase2;
END;
$$;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_online_appointments TO service_role;
