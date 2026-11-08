-- =========================================================================
-- DACTOR PLATFORM: Fix Pay-at-Desk Cancellation & Permission Alignment
-- File: supabase/migration_fix_pay_at_desk_cancel_and_permissions.sql
-- =========================================================================

-- 1. Update approve_pay_at_desk_appointment with dual authorization
-- (Allows authorized Supabase JWT callers OR verified mobile callers passing matching p_clinic_id)
CREATE OR REPLACE FUNCTION approve_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
    v_slot slots%ROWTYPE;
    v_next_position INT;
    v_count INT;
BEGIN
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- Dual authorization check: authorized JWT staff OR matching clinic_id from mobile session
    IF NOT (is_authorized_clinic_staff(v_appt.clinic_id) OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to approve appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN
        RAISE EXCEPTION 'Cannot approve appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    -- Relaxed Expiry Check: Valid through the entire appointment calendar date
    IF (v_appt.appointment_date + TIME '23:59:59')::TIMESTAMPTZ < NOW() THEN
        UPDATE appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Appointment date has passed. Marked as EXPIRED';
    END IF;

    -- Transition status to APPROVED (Clears any lingering online payment timer)
    UPDATE appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Update slot count (Overload Rule: staff can approve and overbook full slots)
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM slots WHERE id = v_appt.slot_id FOR UPDATE;
        IF FOUND THEN
            SELECT COUNT(*) INTO v_count
            FROM appointments
            WHERE slot_id = v_appt.slot_id
              AND checkin_status <> 'cancelled'
              AND status = 'APPROVED';

            UPDATE slots 
            SET booked_count = v_count,
                updated_at = NOW()
            WHERE id = v_appt.slot_id;
        END IF;
    END IF;

    -- Enqueue in live clinic queue
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
    FROM queue_entries
    WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        v_appt.id, v_appt.clinic_id, v_appt.doctor_id, v_next_position, 'waiting', 0, NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'APPROVED',
        'queue_position', v_next_position
    );
END;
$$;

REVOKE ALL ON FUNCTION approve_pay_at_desk_appointment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_pay_at_desk_appointment(UUID, UUID) TO authenticated, anon, service_role;


-- 2. Update reject_pay_at_desk_appointment with dual authorization and idempotent cancellation
CREATE OR REPLACE FUNCTION reject_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
    v_slot_id UUID;
BEGIN
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- Dual authorization check: authorized JWT staff OR matching clinic_id from mobile session
    IF NOT (is_authorized_clinic_staff(v_appt.clinic_id) OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to cancel appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    v_slot_id := v_appt.slot_id;

    -- Update appointment to cancelled status
    UPDATE appointments
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

    -- Clean up any queue entry
    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    -- Reconcile slot booked_count (only count active approved appointments)
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

REVOKE ALL ON FUNCTION reject_pay_at_desk_appointment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reject_pay_at_desk_appointment(UUID, UUID, TEXT) TO authenticated, anon, service_role;


-- 3. Update cancel_pending_pay_at_desk_appointment to reliably cancel unapproved/pending Pay at Desk requests
CREATE OR REPLACE FUNCTION cancel_pending_pay_at_desk_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot_id UUID;
    v_row_count INTEGER := 0;
BEGIN
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

REVOKE ALL ON FUNCTION cancel_pending_pay_at_desk_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;


-- 4. Create General Patient Appointment Cancellation RPC
-- (Allows guest patients with 10-digit tracking codes to cancel appointments without failing under RLS)
CREATE OR REPLACE FUNCTION cancel_patient_appointment(
    p_appointment_id UUID,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot_id UUID;
    v_checkin TEXT;
BEGIN
    SELECT slot_id, checkin_status INTO v_slot_id, v_checkin
    FROM public.appointments
    WHERE id = p_appointment_id
      AND (p_tracking_code IS NULL OR tracking_code_10_digit = p_tracking_code);

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Cannot cancel already completed consultations
    IF v_checkin IN ('completed', 'done', 'finished') THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

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

REVOKE ALL ON FUNCTION cancel_patient_appointment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_patient_appointment(UUID, TEXT) TO anon, authenticated, service_role;
