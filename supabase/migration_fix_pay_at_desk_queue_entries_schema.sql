-- ==============================================================================
-- Migration: Fix Pay at Desk Approval and queue_entries schema
-- File: supabase/migration_fix_pay_at_desk_queue_entries_schema.sql
-- ==============================================================================

-- 1. Ensure estimated_wait_minutes column exists on queue_entries
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS estimated_wait_minutes INT DEFAULT 0;

-- 2. Update approve_pay_at_desk_appointment with safe schema handling and dual authorization
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
    -- Set authoritative context so anti-tampering triggers allow the transaction
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

    -- Transition status to APPROVED
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Overload Rule: Update slot booked count if slot exists
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

    -- Calculate next queue position in live clinic queue
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
    FROM public.queue_entries
    WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

    IF v_next_position <= 0 THEN
        v_next_position := 1;
    END IF;

    -- Safe enqueue into queue_entries
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

-- Permissions & PostgREST reload
REVOKE ALL ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
