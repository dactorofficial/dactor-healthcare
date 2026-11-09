-- =========================================================================
-- DACTOR PLATFORM: FIX PAY AT DESK DATABASE ERROR & ATOMIC QUEUE TRANSFER
-- File: supabase/migration_fix_pay_at_desk_queue_transfer.sql
-- =========================================================================

-- 1. Ensure appointments status constraint supports all valid states
DO $$
BEGIN
    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_status 
        CHECK (status IN (
            'WAITING_FOR_APPROVAL', 
            'APPROVED', 
            'UNAPPROVED', 
            'EXPIRED', 
            'pending_payment', 
            'pending', 
            'CANCELLED', 
            'COMPLETED',
            'REJECTED'
        ));

    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_mode;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_payment_mode 
        CHECK (UPPER(payment_mode) IN ('ONLINE', 'PAY_AT_DESK', 'DESK', 'CASH'));
END $$;


-- 2. Authoritative RPC: confirm_pay_at_desk_booking
-- Directly approves and enqueues the Pay-at-Desk appointment into the live OPD queue
CREATE OR REPLACE FUNCTION public.confirm_pay_at_desk_booking(
    p_appointment_id UUID,
    p_fee_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_doc_fee NUMERIC(10, 2);
    v_fee NUMERIC(10, 2);
    v_service_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_clinic_owner_id UUID;
    v_clinic_name TEXT;
BEGIN
    -- Scoped transaction-local bypass for anti-tampering triggers
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

    IF v_appt.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Cannot switch paid appointment to Pay at Desk';
    END IF;

    IF v_appt.checkin_status::TEXT = 'cancelled' OR v_appt.status IN ('CANCELLED', 'REJECTED') THEN
        RAISE EXCEPTION 'Cannot confirm cancelled or rejected appointment';
    END IF;

    -- Authoritative Fee Determination: doctor catalog fee takes precedence
    IF v_appt.doctor_id IS NOT NULL THEN
        SELECT consultation_fee INTO v_doc_fee
        FROM public.doctors
        WHERE id = v_appt.doctor_id;

        v_fee := COALESCE(v_doc_fee, v_appt.fee_amount, p_fee_amount, 500.00);
    ELSE
        v_fee := COALESCE(v_appt.fee_amount, p_fee_amount, 500.00);
    END IF;

    IF v_fee <= 0 THEN
        v_fee := 500.00;
    END IF;

    v_service_charge := ROUND(v_fee * 0.05, 2);
    v_total := v_fee + v_service_charge;

    -- Update appointment atomically to WAITING_FOR_APPROVAL, payment_status pending, payment_mode PAY_AT_DESK
    UPDATE public.appointments
    SET payment_mode = 'PAY_AT_DESK',
        status = 'WAITING_FOR_APPROVAL',
        payment_status = 'pending',
        checkin_status = 'not_checked_in',
        attempt_number = 1,
        fee_amount = v_fee,
        service_charge_amount = v_service_charge,
        total_amount = v_total,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Live queue isolation: pending Pay at Desk must not be in live queue until approved
    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    -- Reconcile slot booked count (only approved appointments count towards slot capacity)
    IF v_appt.slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_appt.slot_id;
    END IF;

    -- Safe Notification Handling (Protected by exception handler to prevent FK/constraint aborts)
    BEGIN
        SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_appt.clinic_id;

        -- Notify clinic staff profile if matching email exists
        IF v_appt.clinic_id IS NOT NULL THEN
            SELECT p.id INTO v_clinic_owner_id
            FROM public.clinics c
            JOIN public.profiles p ON LOWER(p.email) = LOWER(c.contact_email)
            WHERE c.id = v_appt.clinic_id
            LIMIT 1;

            IF v_clinic_owner_id IS NOT NULL THEN
                INSERT INTO public.notifications (
                    id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
                ) VALUES (
                    gen_random_uuid(),
                    v_clinic_owner_id,
                    v_appt.id,
                    'New Pay at Desk Request',
                    'New appointment request #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' from ' || v_appt.patient_name || ' (NPR ' || v_total || ' due at desk).',
                    'pay_at_desk_request',
                    'specific',
                    false,
                    NOW()
                );
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Notification logging never rolls back the transaction
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'tracking_code', COALESCE(v_appt.tracking_code_10_digit, v_appt.tracking_code),
        'tracking_code_10_digit', COALESCE(v_appt.tracking_code_10_digit, v_appt.tracking_code),
        'status', v_appt.status,
        'payment_mode', v_appt.payment_mode,
        'payment_status', v_appt.payment_status,
        'checkin_status', v_appt.checkin_status,
        'attempt_number', v_appt.attempt_number,
        'fee_amount', v_appt.fee_amount,
        'service_charge_amount', v_appt.service_charge_amount,
        'total_amount', v_appt.total_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role;


-- 3. Authoritative RPC: approve_pay_at_desk_appointment (Hardened with safe notifications)
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

    -- Dual authorization check
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

    -- If already approved and in queue, return current queue info
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

    -- Transition status to APPROVED
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Overload Rule: Update slot booked count
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_appt.slot_id FOR UPDATE;
        IF FOUND THEN
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
    END IF;

    -- Enqueue in live clinic queue
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
    FROM public.queue_entries
    WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

    IF v_next_position <= 0 THEN
        v_next_position := 1;
    END IF;

    INSERT INTO public.queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        v_appt.id, v_appt.clinic_id, v_appt.doctor_id, v_next_position, 'waiting', 0, NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET status = 'waiting',
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
        'queue_position', v_next_position
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) TO anon, authenticated, service_role;


-- 4. Authoritative RPC: cancel_pending_pay_at_desk_appointment (Safe notifications)
CREATE OR REPLACE FUNCTION public.cancel_pending_pay_at_desk_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot_id UUID;
    v_clinic_owner_id UUID;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_appt.checkin_status::TEXT IN ('completed', 'done', 'finished') THEN
        RETURN FALSE;
    END IF;

    v_slot_id := v_appt.slot_id;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Delete from live queue
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Reconcile slot capacity
    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    -- Safe notification to clinic
    BEGIN
        IF v_appt.clinic_id IS NOT NULL THEN
            SELECT p.id INTO v_clinic_owner_id
            FROM public.clinics c
            JOIN public.profiles p ON LOWER(p.email) = LOWER(c.contact_email)
            WHERE c.id = v_appt.clinic_id
            LIMIT 1;

            IF v_clinic_owner_id IS NOT NULL THEN
                INSERT INTO public.notifications (
                    id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
                ) VALUES (
                    gen_random_uuid(),
                    v_clinic_owner_id,
                    v_appt.id,
                    'Booking Cancelled',
                    'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' cancelled their appointment (#' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ').',
                    'queue_alert',
                    'specific',
                    false,
                    NOW()
                );
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;
