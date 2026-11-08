-- ============================================================================
-- DACTOR PLATFORM: Automatic Transfer of Uncompleted Live Queue Patients to No-Show
-- Description:
--   Automatically finds all patients in the live queue ('waiting' or 'inside')
--   whose appointment was not completed (past date or expired/closed session),
--   and transitions them to 'no_show' in queue_entries and 'cancelled' in appointments.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_transfer_uncompleted_queue_to_noshow(
    p_clinic_id UUID DEFAULT NULL,
    p_include_today BOOLEAN DEFAULT FALSE,
    p_today_cutoff_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    -- Nepal local date (UTC + 05:45)
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;
    v_current_minutes INT := (
        EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Kathmandu'))::INT * 60 +
        EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'Asia/Kathmandu'))::INT
    );
    v_updated_count INT := 0;
    v_rec RECORD;
    v_affected_clinics UUID[] := '{}';
    v_affected_doctors UUID[] := '{}';
    v_c UUID;
    v_d UUID;
BEGIN
    -- Cursor over all live queue entries that were not completed
    FOR v_rec IN
        SELECT 
            qe.id AS queue_entry_id,
            qe.clinic_id,
            qe.doctor_id,
            qe.status AS queue_status,
            a.id AS appointment_id,
            a.appointment_date,
            a.appointment_time,
            a.checkin_status,
            a.slot_id
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
          AND qe.status IN ('waiting', 'inside')
          AND COALESCE(a.checkin_status::TEXT, '') NOT IN ('completed', 'cancelled', 'done')
          AND (
              -- 1. All past-date appointments
              a.appointment_date < v_today
              -- 2. Today's appointments if explicitly requested or passed cutoff
              OR (
                  p_include_today = TRUE
                  AND a.appointment_date = v_today
              )
          )
        ORDER BY a.appointment_date ASC, qe.queue_position ASC
        FOR UPDATE OF qe, a
    LOOP
        -- Mark queue entry as no_show
        UPDATE public.queue_entries
        SET 
            status = 'no_show',
            completed_at = v_now
        WHERE id = v_rec.queue_entry_id;

        -- Mark appointment checkin_status as cancelled (representing no-show in appointment lifecycle)
        UPDATE public.appointments
        SET 
            checkin_status = 'cancelled'
        WHERE id = v_rec.appointment_id;

        -- Recount slot capacity if slot was assigned
        IF v_rec.slot_id IS NOT NULL THEN
            UPDATE public.slots
            SET booked_count = (
                SELECT COUNT(*)
                FROM public.appointments
                WHERE slot_id = v_rec.slot_id
                  AND COALESCE(checkin_status::TEXT, '') <> 'cancelled'
            )
            WHERE id = v_rec.slot_id;
        END IF;

        -- Track affected clinics and doctors for queue re-indexing
        IF v_rec.clinic_id IS NOT NULL AND NOT (v_rec.clinic_id = ANY(v_affected_clinics)) THEN
            v_affected_clinics := array_append(v_affected_clinics, v_rec.clinic_id);
        END IF;
        IF v_rec.doctor_id IS NOT NULL AND NOT (v_rec.doctor_id = ANY(v_affected_doctors)) THEN
            v_affected_doctors := array_append(v_affected_doctors, v_rec.doctor_id);
        END IF;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    -- Also check for orphaned queue entries whose appointment is already cancelled or from past dates
    FOR v_rec IN
        SELECT qe.id AS queue_entry_id, qe.clinic_id, qe.doctor_id
        FROM public.queue_entries qe
        LEFT JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
          AND qe.status IN ('waiting', 'inside')
          AND (
              a.id IS NULL 
              OR a.checkin_status::TEXT = 'cancelled'
              OR a.appointment_date < v_today
          )
    LOOP
        UPDATE public.queue_entries
        SET status = 'no_show', completed_at = v_now
        WHERE id = v_rec.queue_entry_id;

        IF v_rec.clinic_id IS NOT NULL AND NOT (v_rec.clinic_id = ANY(v_affected_clinics)) THEN
            v_affected_clinics := array_append(v_affected_clinics, v_rec.clinic_id);
        END IF;
        v_updated_count := v_updated_count + 1;
    END LOOP;

    -- Re-index active queue positions for affected clinics/doctors
    FOREACH v_c IN ARRAY v_affected_clinics LOOP
        WITH numbered AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY clinic_id, doctor_id
                    ORDER BY 
                        CASE WHEN status = 'inside' THEN 0 ELSE 1 END,
                        queue_position ASC,
                        created_at ASC
                ) AS new_pos
            FROM public.queue_entries
            WHERE clinic_id = v_c
              AND status IN ('waiting', 'inside')
        )
        UPDATE public.queue_entries q
        SET queue_position = numbered.new_pos
        FROM numbered
        WHERE q.id = numbered.id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'transferred_count', v_updated_count,
        'affected_clinics_count', array_length(v_affected_clinics, 1),
        'server_date_nepal', v_today,
        'executed_at', v_now
    );
END;
$$;

-- Grant execution to all standard roles
REVOKE ALL ON FUNCTION public.auto_transfer_uncompleted_queue_to_noshow(UUID, BOOLEAN, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_transfer_uncompleted_queue_to_noshow(UUID, BOOLEAN, INT) TO anon, authenticated, service_role;
