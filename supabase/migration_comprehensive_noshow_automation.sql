-- ============================================================================
-- DACTOR PLATFORM: Comprehensive Automatic Transfer to No-Show
-- Description:
--   Automatically sweeps ALL appointments where the scheduled date has passed
--   (appointment_date < CURRENT_DATE) and consultation was not completed,
--   marking them as 'no_show' in both `appointments` and `queue_entries`.
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
BEGIN
    -- 1. Sweep all appointments whose scheduled day has passed (or today expired) and were not completed
    FOR v_rec IN
        SELECT 
            a.id AS appointment_id,
            a.clinic_id,
            a.doctor_id,
            a.appointment_date,
            a.appointment_time,
            a.checkin_status,
            a.slot_id,
            qe.id AS queue_entry_id
        FROM public.appointments a
        LEFT JOIN public.queue_entries qe ON qe.appointment_id = a.id
        WHERE (p_clinic_id IS NULL OR a.clinic_id = p_clinic_id)
          AND COALESCE(a.checkin_status::TEXT, '') NOT IN ('completed', 'done', 'cancelled', 'no_show')
          AND (
              -- Scheduled day has passed
              a.appointment_date < v_today
              -- Or today passed if requested
              OR (
                  p_include_today = TRUE
                  AND a.appointment_date = v_today
              )
          )
        ORDER BY a.appointment_date ASC
        FOR UPDATE OF a
    LOOP
        -- Update appointment checkin_status to 'no_show'
        UPDATE public.appointments
        SET 
            checkin_status = 'no_show'
        WHERE id = v_rec.appointment_id;

        -- If appointment had a queue entry, transition it to 'no_show'
        IF v_rec.queue_entry_id IS NOT NULL THEN
            UPDATE public.queue_entries
            SET 
                status = 'no_show',
                completed_at = v_now
            WHERE id = v_rec.queue_entry_id;
        END IF;

        -- Recount slot booked count if slot was assigned
        IF v_rec.slot_id IS NOT NULL THEN
            UPDATE public.slots
            SET booked_count = (
                SELECT COUNT(*)
                FROM public.appointments
                WHERE slot_id = v_rec.slot_id
                  AND COALESCE(checkin_status::TEXT, '') NOT IN ('cancelled', 'no_show')
            )
            WHERE id = v_rec.slot_id;
        END IF;

        IF v_rec.clinic_id IS NOT NULL AND NOT (v_rec.clinic_id = ANY(v_affected_clinics)) THEN
            v_affected_clinics := array_append(v_affected_clinics, v_rec.clinic_id);
        END IF;
        IF v_rec.doctor_id IS NOT NULL AND NOT (v_rec.doctor_id = ANY(v_affected_doctors)) THEN
            v_affected_doctors := array_append(v_affected_doctors, v_rec.doctor_id);
        END IF;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    -- 2. Sweep any remaining active queue entries with past date or past created_at
    FOR v_rec IN
        SELECT qe.id AS queue_entry_id, qe.clinic_id, qe.doctor_id
        FROM public.queue_entries qe
        LEFT JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
          AND qe.status IN ('waiting', 'inside', 'skipped')
          AND (
              a.id IS NULL 
              OR a.checkin_status::TEXT IN ('cancelled', 'no_show')
              OR a.appointment_date < v_today
              OR (qe.created_at IS NOT NULL AND (qe.created_at AT TIME ZONE 'Asia/Kathmandu')::DATE < v_today)
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

    -- 3. Re-index active queue positions for affected clinics/doctors
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
