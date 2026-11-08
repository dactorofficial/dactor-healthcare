-- ==============================================================================
-- Migration: Fix Pay-at-Desk Authorization & Payment Status Synchronization
-- Date: 2026-10-28
-- Description:
-- 1. Creates is_admin_portal_user() and is_authorized_clinic_staff(uuid)
-- 2. Updates approve_pay_at_desk_appointment with relaxed date expiry (end of appointment date)
-- 3. Updates reject_pay_at_desk_appointment
-- 4. Updates finalize_esewa_appointment_payment to enforce payment_mode = 'ONLINE' and status = 'APPROVED'
-- 5. Fixes legacy corrupted hybrid records
-- ==============================================================================

-- 1. Helper: Admin Portal Identity Check
CREATE OR REPLACE FUNCTION is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      current_user = 'service_role'
      OR (auth.jwt() ->> 'role') = 'service_role'
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
      OR (auth.jwt() ->> 'role') = 'super_admin'
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE public.profiles.auth_uid = auth.uid()
            AND public.profiles.role = 'super_admin'
        )
      )
    ),
    false
  );
$$;

-- 2. Helper: Clinic Staff Authorization Check
CREATE OR REPLACE FUNCTION is_authorized_clinic_staff(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_uid UUID;
BEGIN
    -- 2.1 Service role or Super Admin
    IF is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    -- Extract JWT email and UID
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid := auth.uid();

    IF v_email = '' AND v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2.2 Clinic Owner / Admin via clinic contact_email
    IF EXISTS (
        SELECT 1 FROM clinics c
        WHERE c.id = p_clinic_id
          AND LOWER(c.contact_email) = v_email
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2.3 Doctor belonging to this clinic
    IF EXISTS (
        SELECT 1 FROM doctors d
        LEFT JOIN profiles p ON p.id = d.user_id
        WHERE d.clinic_id = p_clinic_id
          AND (
            (v_email <> '' AND LOWER(d.email) = v_email)
            OR (v_uid IS NOT NULL AND p.auth_uid = v_uid)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2.4 Accepted Staff Invitation
    IF EXISTS (
        SELECT 1 FROM clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2.5 Profile with role clinic_admin matching clinic contact email
    IF EXISTS (
        SELECT 1 FROM clinics c
        JOIN profiles p ON LOWER(p.email) = LOWER(c.contact_email)
        WHERE c.id = p_clinic_id
          AND (
            (v_uid IS NOT NULL AND p.auth_uid = v_uid)
            OR (v_email <> '' AND LOWER(p.email) = v_email)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION is_admin_portal_user() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_authorized_clinic_staff(UUID) TO authenticated, anon, service_role;

-- 3. Update approve_pay_at_desk_appointment with End-of-Day Window and Overbooking Support
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

    -- Authorization check
    IF NOT is_authorized_clinic_staff(v_appt.clinic_id) THEN
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

GRANT EXECUTE ON FUNCTION approve_pay_at_desk_appointment(UUID, UUID) TO authenticated, anon, service_role;

-- 4. Update reject_pay_at_desk_appointment
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
BEGIN
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    IF NOT is_authorized_clinic_staff(v_appt.clinic_id) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to reject appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN
        RAISE EXCEPTION 'Cannot reject appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    UPDATE appointments
    SET status = 'REJECTED',
        checkin_status = 'cancelled',
        rejected_at = NOW(),
        notes = CASE 
            WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 
            THEN COALESCE(notes || E'\n', '') || 'Rejection reason: ' || trim(p_reason)
            ELSE notes
        END,
        updated_at = NOW()
    WHERE id = v_appt.id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'REJECTED'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION reject_pay_at_desk_appointment(UUID, UUID, TEXT) TO authenticated, anon, service_role;

-- 5. Update finalize_esewa_appointment_payment to ensure status & payment_mode consistency
CREATE OR REPLACE FUNCTION finalize_esewa_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    attempt appointment_payment_attempts%ROWTYPE;
    appt appointments%ROWTYPE;
    next_position INTEGER;
BEGIN
    SELECT * INTO attempt
    FROM appointment_payment_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR round(attempt.amount_npr, 2) <> round(p_verified_amount, 2) THEN
        RETURN FALSE;
    END IF;

    IF attempt.status = 'complete' THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO appt FROM appointments WHERE id = attempt.appointment_id FOR UPDATE;
    IF NOT FOUND OR appt.clinic_id <> attempt.clinic_id THEN
        RETURN FALSE;
    END IF;

    IF appt.payment_status::text = 'paid' THEN
        UPDATE appointment_payment_attempts
        SET status = 'complete', provider_reference = COALESCE(p_provider_reference, provider_reference), updated_at = NOW()
        WHERE id = attempt.id;
        RETURN TRUE;
    END IF;

    -- Update appointment: enforce payment_mode = 'ONLINE' and status = 'APPROVED'
    UPDATE appointments
    SET payment_status = 'paid',
        payment_mode = 'ONLINE',
        status = 'APPROVED',
        checkin_status = 'checked_in',
        fee_amount = attempt.amount_npr,
        updated_at = NOW()
    WHERE id = appt.id;

    IF appt.slot_id IS NOT NULL THEN
        UPDATE slots SET booked_count = (
            SELECT COUNT(*) FROM appointments
            WHERE slot_id = appt.slot_id 
              AND checkin_status::text <> 'cancelled'
              AND status = 'APPROVED'
        ) WHERE id = appt.slot_id;
    END IF;

    -- Also cancel any lingering unapproved Pay at Desk requests for the exact same patient/clinic/date
    UPDATE appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE clinic_id = appt.clinic_id
      AND patient_mobile = appt.patient_mobile
      AND appointment_date = appt.appointment_date
      AND LOWER(TRIM(patient_name)) = LOWER(TRIM(appt.patient_name))
      AND payment_mode = 'PAY_AT_DESK'
      AND status = 'WAITING_FOR_APPROVAL'
      AND id <> appt.id;

    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM queue_entries
    WHERE clinic_id = appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO queue_entries (
        clinic_id, doctor_id, appointment_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        appt.clinic_id, appt.doctor_id, appt.id, next_position, 'waiting', 0, NOW(), NOW()
    ) ON CONFLICT (appointment_id) DO NOTHING;

    UPDATE appointment_payment_attempts
    SET status = 'complete', provider_reference = COALESCE(p_provider_reference, provider_reference), updated_at = NOW()
    WHERE id = attempt.id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;

-- 6. RPC: Atomic cancellation of unapproved Pay at Desk appointments
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
    v_was_updated BOOLEAN := FALSE;
BEGIN
    SELECT slot_id INTO v_slot_id FROM public.appointments
    WHERE id = p_appointment_id
      AND payment_mode = 'PAY_AT_DESK'
      AND status = 'WAITING_FOR_APPROVAL';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    GET DIAGNOSTICS v_was_updated = ROW_COUNT > 0;

    -- Reconcile slot booked_count (only count approved)
    IF v_was_updated AND v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    RETURN v_was_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;

-- 7. Cleanup Corrupted Hybrid Records (Paid eSewa appointments stuck in WAITING_FOR_APPROVAL / PAY_AT_DESK)
UPDATE appointments
SET payment_mode = 'ONLINE',
    status = 'APPROVED',
    updated_at = NOW()
WHERE payment_status = 'paid'
  AND (status = 'WAITING_FOR_APPROVAL' OR payment_mode = 'PAY_AT_DESK');
