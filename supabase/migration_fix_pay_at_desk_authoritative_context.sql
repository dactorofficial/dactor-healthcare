-- =========================================================================
-- DACTOR PLATFORM: Fix Pay-at-Desk Confirmation, Cancellation & Authoritative Context
-- Migration File: supabase/migration_fix_pay_at_desk_authoritative_context.sql
-- =========================================================================

-- 1. Ensure the Anti-Tampering Trigger honors authoritative context
CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Allow service_role, admin portal users, or authorized clinic staff
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(OLD.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Allow authoritative server RPCs (scoped transaction-locally via set_config)
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_current_patient_for_appointment(OLD.id) THEN
        RAISE EXCEPTION 'Appointment update is not authorized.';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at']) THEN
        RAISE EXCEPTION 'Patients cannot update appointment identity, financial, ownership, or queue fields.';
    END IF;

    IF NEW.checkin_status IS DISTINCT FROM OLD.checkin_status
       AND NEW.checkin_status::TEXT <> 'cancelled' THEN
        RAISE EXCEPTION 'Patients may only cancel their own appointment.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_patient_privilege_escalation ON public.appointments;
CREATE TRIGGER appointments_prevent_patient_privilege_escalation
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_patient_appointment_privilege_escalation();


-- 2. Authoritative RPC: approve_pay_at_desk_appointment
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
BEGIN
    -- Set transaction-local authoritative context so anti-tampering trigger permits update
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

    -- Dual authorization check: authorized JWT staff OR matching clinic_id from mobile session
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

    -- Idempotent check: if already approved, return success
    IF v_appt.status = 'APPROVED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'appointment_id', v_appt.id,
            'status', 'APPROVED',
            'already_approved', true
        );
    END IF;

    IF v_appt.status NOT IN ('WAITING_FOR_APPROVAL', 'pending_payment', 'pending') THEN
        RAISE EXCEPTION 'Cannot approve appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    -- Relaxed Expiry Check: Valid through the entire appointment calendar date
    IF v_appt.appointment_date IS NOT NULL AND (v_appt.appointment_date + TIME '23:59:59')::TIMESTAMPTZ < NOW() THEN
        UPDATE public.appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Appointment date has passed. Marked as EXPIRED';
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

    -- Update slot count (Overload Rule: staff can approve and overbook full slots)
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_appt.slot_id FOR UPDATE;
        IF FOUND THEN
            SELECT COUNT(*) INTO v_count
            FROM public.appointments
            WHERE slot_id = v_appt.slot_id
              AND checkin_status <> 'cancelled'
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

    INSERT INTO public.queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        v_appt.id, v_appt.clinic_id, v_appt.doctor_id, v_next_position, 'waiting', 0, NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET status = 'waiting',
        updated_at = NOW();

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


-- 3. Authoritative RPC: reject_pay_at_desk_appointment
CREATE OR REPLACE FUNCTION public.reject_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot_id UUID;
BEGIN
    -- Set transaction-local authoritative context
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
        RAISE EXCEPTION 'Access denied: Caller is not authorized to cancel appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    v_slot_id := v_appt.slot_id;

    -- Update appointment to CANCELLED
    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        rejected_at = NOW(),
        notes = CASE 
            WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 
            THEN COALESCE(notes || E'\n', '') || 'Cancellation reason: ' || trim(p_reason)
            ELSE notes
        END,
        updated_at = NOW()
    WHERE id = v_appt.id;

    -- Clean up live queue
    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    -- Reconcile slot booked_count
    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'CANCELLED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_pay_at_desk_appointment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_pay_at_desk_appointment(UUID, UUID, TEXT) TO anon, authenticated, service_role;


-- 4. Authoritative RPC: cancel_pending_pay_at_desk_appointment
CREATE OR REPLACE FUNCTION public.cancel_pending_pay_at_desk_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_slot_id UUID;
    v_row_count INTEGER := 0;
BEGIN
    -- Set transaction-local authoritative context
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT slot_id INTO v_slot_id FROM public.appointments
    WHERE id = p_appointment_id
      AND (
          UPPER(COALESCE(payment_mode, '')) IN ('PAY_AT_DESK', 'DESK', 'CASH')
          OR status IN ('WAITING_FOR_APPROVAL', 'UNAPPROVED', 'REJECTED', 'pending_payment', 'pending')
      );

    IF NOT FOUND THEN
        SELECT slot_id INTO v_slot_id FROM public.appointments
        WHERE id = p_appointment_id
          AND checkin_status NOT IN ('completed', 'done', 'finished');
        IF NOT FOUND THEN
            RETURN FALSE;
        END IF;
    END IF;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    -- Delete from live queue
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Reconcile slot capacity
    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;


-- 5. Authoritative RPC: cancel_patient_appointment
CREATE OR REPLACE FUNCTION public.cancel_patient_appointment(
    p_appointment_id UUID,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
BEGIN
    -- Set transaction-local authoritative context
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

    IF v_appt.checkin_status IN ('completed', 'done', 'finished') THEN
        RETURN FALSE;
    END IF;

    IF p_tracking_code IS NOT NULL AND v_appt.tracking_code_10_digit <> p_tracking_code THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Clean up live queue
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Reconcile slot capacity
    IF v_appt.slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_appt.slot_id;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_patient_appointment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_patient_appointment(UUID, TEXT) TO anon, authenticated, service_role;
