-- =========================================================================
-- DACTOR PLATFORM: Block in-place reschedule of completed appointments
-- File: supabase/migration_block_completed_reschedule.sql
--
-- WHY: commit 88ba173 removed the completed-visit guard from
-- reschedule_patient_appointment. Booking a follow-up then rewrote the
-- completed appointment (date/slot/doctor changed, checkin_status reset,
-- consultation_completed_at cleared, queue entries deleted).
-- This restores the guard. Everything else in the function is unchanged
-- from migration_reschedule_appointment_rpc.sql.
--
-- NOT APPLIED AUTOMATICALLY: run manually in the Supabase SQL editor.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.reschedule_patient_appointment(
    p_appointment_id UUID,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_new_slot_id UUID DEFAULT NULL,
    p_new_doctor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_old_slot_id UUID;
    v_target_slot_id UUID;
    v_target_doctor_id UUID;
    v_target_status TEXT;
    v_today_ktm DATE;
    v_next_pos INT;
    v_clean_time VARCHAR;
    v_time_first_part TEXT;
    v_parsed_time TIME;
    v_slot_active_count INT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment ID cannot be null');
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- A completed visit is medical history and must never be moved in place.
    -- Follow-ups are booked as NEW appointments by the apps (see FOLLOW_UP_FIX_README.md).
    IF LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) IN ('completed', 'done', 'finished')
       OR v_appt.consultation_completed_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Completed appointments cannot be rescheduled. Book a follow-up instead.');
    END IF;

    v_old_slot_id := v_appt.slot_id;
    v_target_slot_id := COALESCE(p_new_slot_id, v_appt.slot_id);
    v_target_doctor_id := COALESCE(p_new_doctor_id, v_appt.doctor_id);
    v_today_ktm := (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;

    -- Preserve WAITING_FOR_APPROVAL status for Pay-at-Desk / reception pending bookings
    v_target_status := CASE
        WHEN UPPER(COALESCE(v_appt.status, '')) = 'WAITING_FOR_APPROVAL' THEN 'WAITING_FOR_APPROVAL'
        ELSE 'APPROVED'
    END;

    -- Parse and normalize incoming time string (e.g. "10:00 AM - 11:00 AM" or "10:00:00") safely to TIME
    v_clean_time := TRIM(COALESCE(p_new_time, ''));
    v_time_first_part := TRIM(SPLIT_PART(v_clean_time, '-', 1));
    BEGIN
        IF v_time_first_part <> '' THEN
            v_parsed_time := v_time_first_part::TIME;
        ELSE
            v_parsed_time := v_appt.appointment_time;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_parsed_time := COALESCE(v_appt.appointment_time, '09:00:00'::TIME);
    END;

    -- Validate target slot capacity if moving into a specific slot
    IF p_new_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM public.slots
        WHERE id = p_new_slot_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_parsed_time IS NULL AND v_slot.start_time IS NOT NULL THEN
                v_parsed_time := v_slot.start_time;
            END IF;

            IF v_old_slot_id IS DISTINCT FROM p_new_slot_id THEN
                SELECT COUNT(*) INTO v_slot_active_count
                FROM public.appointments a
                WHERE a.slot_id = p_new_slot_id
                  AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
                  AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED');

                IF v_slot_active_count >= COALESCE(v_slot.max_capacity, 10) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Selected slot is already full');
                END IF;
            END IF;
        END IF;
    END IF;

    -- Update appointment record
    UPDATE public.appointments
    SET appointment_date = p_new_date,
        appointment_time = COALESCE(v_parsed_time, appointment_time),
        slot_id = v_target_slot_id,
        doctor_id = v_target_doctor_id,
        status = v_target_status,
        checkin_status = 'not_checked_in',
        cancelled_at = NULL,
        cancellation_reason = NULL,
        consultation_completed_at = NULL,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Clean up prior queue entries
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Re-inject into today's live queue only for Nepal today and approved appointments
    IF p_new_date = v_today_ktm AND v_target_status <> 'WAITING_FOR_APPROVAL' THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_pos
        FROM public.queue_entries
        WHERE clinic_id = v_appt.clinic_id
          AND status IN ('waiting', 'inside')
          AND (v_target_doctor_id IS NULL OR doctor_id = v_target_doctor_id OR doctor_id IS NULL);

        INSERT INTO public.queue_entries (
            id,
            appointment_id,
            clinic_id,
            doctor_id,
            queue_position,
            estimated_wait_minutes,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            p_appointment_id,
            v_appt.clinic_id,
            v_target_doctor_id,
            v_next_pos,
            GREATEST(0, (v_next_pos - 1) * 15),
            'waiting',
            NOW(),
            NOW()
        );
    END IF;

    -- Reconcile old slot capacity
    IF v_old_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
              AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED')
        )
        WHERE s.id = v_old_slot_id;
    END IF;

    -- Reconcile new slot capacity
    IF v_target_slot_id IS NOT NULL AND v_target_slot_id IS DISTINCT FROM v_old_slot_id THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
              AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED')
        )
        WHERE s.id = v_target_slot_id;
    END IF;

    -- Clinic Alert
    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'Appointment Rescheduled',
            'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' rescheduled appointment #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' to ' || p_new_date || ' at ' || COALESCE(v_parsed_time::TEXT, v_clean_time) ||
                CASE WHEN NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NOT NULL THEN ' (' || TRIM(p_reason) || ')' ELSE '' END || '.',
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Appointment rescheduled successfully',
        'appointment_id', p_appointment_id,
        'date', p_new_date,
        'time', COALESCE(v_parsed_time::TEXT, v_clean_time),
        'status', v_target_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT) TO anon, authenticated, service_role;
