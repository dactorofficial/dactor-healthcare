-- ==============================================================================
-- Migration: Pay at Desk Confirm - Past Date Auto-Expiry & Exact Slot Queue Placement
-- File: supabase/migration_pay_at_desk_slot_expiry_and_exact_slot_queue.sql
--
-- Behavior when clinic confirms a Pay at Desk request:
--   1. Slot date < today (Asia/Kathmandu): Automatically expire & cancel request
--      (status = 'EXPIRED', checkin_status = 'cancelled'). Do not enqueue or reserve slot.
--   2. Slot date > today (Future date): Approve appointment & reserve slot
--      (overbooking allowed). Do not add prematurely to today's live queue_entries.
--   3. Slot date == today & slot time has passed (end_time < now): Approve, reserve
--      slot (overbooking allowed), and place patient at TOP of the waiting queue
--      (Position 1 if no patient is inside, or right after the inside patient).
--   4. Slot date == today & slot time has NOT passed (end_time >= now): Approve,
--      reserve slot (overbooking allowed), and place patient at the END of the
--      same exact slot position (after inside & same/earlier slots, before later slots).
-- ==============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS estimated_wait_minutes INT DEFAULT 0;

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
    v_next_position INT := 1;
    v_count INT;
    v_clinic_name TEXT;
    v_now_ktm TIMESTAMPTZ;
    v_today_ktm DATE;
    v_time_ktm TIME;
    v_effective_date DATE;
    v_target_start_time TIME;
    v_target_end_time TIME;
    v_slot_passed BOOLEAN := FALSE;
    v_is_future_date BOOLEAN := FALSE;
    v_effective_doc_id UUID;
    v_doctor_count INT := 0;
    v_active_ids UUID[] := ARRAY[]::UUID[];
    v_last_match_idx INT := 0;
    v_inside_count INT := 0;
    v_idx INT := 0;
    v_row RECORD;
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
    SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_appt.clinic_id;

    -- If already approved, return current info idempotently
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

    -- Nepal standard time evaluation (Asia/Kathmandu = UTC + 05:45)
    v_now_ktm := NOW() AT TIME ZONE 'Asia/Kathmandu';
    v_today_ktm := v_now_ktm::DATE;
    v_time_ktm := v_now_ktm::TIME;

    v_effective_date := COALESCE(v_slot.slot_date, v_appt.appointment_date);
    v_target_start_time := COALESCE(v_slot.start_time, v_appt.appointment_time, TIME '00:00:00');
    v_target_end_time := COALESCE(v_slot.end_time, v_appt.appointment_time, TIME '23:59:59');

    -- =========================================================================
    -- RULE 1: Chosen slot date has already passed -> Expire & Cancel itself
    -- =========================================================================
    IF v_effective_date < v_today_ktm THEN
        UPDATE public.appointments
        SET status = 'EXPIRED',
            checkin_status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            cancellation_reason = 'Slot date has already passed',
            expires_at = NULL,
            updated_at = NOW()
        WHERE id = v_appt.id
        RETURNING * INTO v_appt;

        DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

        BEGIN
            IF v_appt.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_appt.user_id) THEN
                INSERT INTO public.notifications (
                    id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
                ) VALUES (
                    gen_random_uuid(),
                    v_appt.user_id,
                    v_appt.id,
                    'Pay at Desk Request Expired',
                    'Your appointment request #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' at ' || COALESCE(v_clinic_name, 'Clinic') || ' has expired and been cancelled because the chosen slot date (' || v_effective_date::TEXT || ') has already passed.',
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
            'expired', true,
            'appointment_id', v_appt.id,
            'status', 'EXPIRED',
            'message', 'Chosen slot date has already passed. Request has been expired and cancelled.'
        );
    END IF;

    -- Transition status to APPROVED and resolve doctor_id
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        doctor_id = COALESCE(v_appt.doctor_id, v_effective_doc_id),
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Reconcile slot booked_count (Overbooking explicitly allowed)
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

    -- Check clinic doctor count for queue partitioning (handles lab/single-doctor vs multi-doctor)
    SELECT COUNT(*) INTO v_doctor_count
    FROM public.doctors d
    WHERE (d.clinic_id = v_appt.clinic_id OR d.primary_clinic_id = v_appt.clinic_id OR d.active_clinic_id = v_appt.clinic_id);

    -- =========================================================================
    -- Future Date Handling: Approved without prematurely polling today's live queue
    -- =========================================================================
    IF v_effective_date > v_today_ktm THEN
        v_is_future_date := TRUE;
        v_slot_passed := FALSE;

        SELECT COUNT(*) INTO v_next_position
        FROM public.appointments a
        LEFT JOIN public.slots s ON s.id = a.slot_id
        WHERE a.clinic_id = v_appt.clinic_id
          AND a.appointment_date = v_effective_date
          AND a.checkin_status::TEXT <> 'cancelled'
          AND a.status = 'APPROVED'
          AND (
              (v_effective_doc_id IS NOT NULL AND (a.doctor_id = v_effective_doc_id OR (a.doctor_id IS NULL AND v_doctor_count <= 1)))
              OR (v_effective_doc_id IS NULL AND (a.doctor_id IS NULL OR v_doctor_count <= 1))
          )
          AND (
              (v_appt.slot_id IS NOT NULL AND a.slot_id = v_appt.slot_id)
              OR COALESCE(s.start_time, a.appointment_time, TIME '00:00:00') <= v_target_start_time
          );

        IF COALESCE(v_next_position, 0) < 1 THEN
            v_next_position := 1;
        END IF;

        BEGIN
            IF v_appt.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_appt.user_id) THEN
                INSERT INTO public.notifications (
                    id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
                ) VALUES (
                    gen_random_uuid(),
                    v_appt.user_id,
                    v_appt.id,
                    'Pay at Desk Approved • ' || v_effective_date::TEXT,
                    'Your appointment at ' || COALESCE(v_clinic_name, 'Clinic') || ' for ' || v_effective_date::TEXT || ' is approved! Estimated slot token #' || v_next_position || '. Total due at desk: NPR ' || COALESCE(v_appt.total_amount, v_appt.fee_amount) || '.',
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
            'expired', false,
            'is_future_date', true,
            'appointment_id', v_appt.id,
            'status', 'APPROVED',
            'queue_position', v_next_position,
            'slot_passed', false
        );
    END IF;

    -- =========================================================================
    -- Today's Date: Compare slot end time against current Nepal time
    -- =========================================================================
    v_slot_passed := (v_target_end_time < v_time_ktm);

    FOR v_row IN
        SELECT
            qe.id,
            qe.status::TEXT AS qe_status,
            a.slot_id AS a_slot_id,
            COALESCE(s.start_time, a.appointment_time, TIME '00:00:00') AS eff_start_time
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        LEFT JOIN public.slots s ON s.id = a.slot_id
        WHERE qe.clinic_id = v_appt.clinic_id
          AND qe.status IN ('waiting', 'inside')
          AND a.appointment_date = v_today_ktm
          AND qe.appointment_id <> v_appt.id
          AND (
              (v_effective_doc_id IS NOT NULL AND (qe.doctor_id = v_effective_doc_id OR (qe.doctor_id IS NULL AND v_doctor_count <= 1)))
              OR (v_effective_doc_id IS NULL AND (qe.doctor_id IS NULL OR v_doctor_count <= 1))
          )
        ORDER BY
            CASE WHEN qe.status = 'inside' THEN 0 ELSE 1 END ASC,
            qe.queue_position ASC,
            qe.created_at ASC
        FOR UPDATE OF qe
    LOOP
        v_idx := v_idx + 1;
        v_active_ids := array_append(v_active_ids, v_row.id);

        IF v_row.qe_status = 'inside' THEN
            v_inside_count := v_inside_count + 1;
            v_last_match_idx := v_idx;
        ELSIF NOT v_slot_passed THEN
            -- Rule 3: Same or earlier time slot precedes this newly confirmed slot booking
            IF (v_appt.slot_id IS NOT NULL AND v_row.a_slot_id = v_appt.slot_id)
               OR (v_row.eff_start_time <= v_target_start_time) THEN
                v_last_match_idx := v_idx;
            END IF;
        END IF;
    END LOOP;

    IF v_slot_passed THEN
        -- Rule 2: Slot time passed -> Put at TOP of waiting queue (Pos 1 if nobody inside, else immediately after inside patient)
        v_next_position := v_inside_count + 1;
    ELSE
        -- Rule 3: Slot time NOT passed -> Put at END of the same exact slot position
        v_next_position := v_last_match_idx + 1;
    END IF;

    -- Two-pass collision-safe shift using temporary negative offsets
    IF array_length(v_active_ids, 1) IS NOT NULL THEN
        FOR v_idx IN 1..array_length(v_active_ids, 1) LOOP
            UPDATE public.queue_entries
            SET queue_position = -(100000 + v_idx),
                updated_at = NOW()
            WHERE id = v_active_ids[v_idx];
        END LOOP;

        FOR v_idx IN 1..array_length(v_active_ids, 1) LOOP
            UPDATE public.queue_entries
            SET queue_position = CASE
                    WHEN v_idx < v_next_position THEN v_idx
                    ELSE v_idx + 1
                END,
                updated_at = NOW()
            WHERE id = v_active_ids[v_idx];
        END LOOP;
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
        'expired', false,
        'is_future_date', false,
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
