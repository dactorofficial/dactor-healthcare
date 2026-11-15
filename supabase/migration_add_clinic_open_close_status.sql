-- ============================================================================
-- DACTOR PLATFORM: Clinic Open / Closed Status & Automated Queue Closure Sweep
-- Description:
--   Adds is_open and closed_at columns to clinics table.
--   When a clinic is closed, patients live tracking will see the clinic is closed,
--   and all remaining active queue patients are moved to no_show.
-- ============================================================================

-- 1. Add is_open and closed_at columns to clinics if not present
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT TRUE;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 2. Create index for fast status lookups
CREATE INDEX IF NOT EXISTS idx_clinics_is_open ON public.clinics(is_open);

-- 3. Enhance auto_transfer_uncompleted_queue_to_noshow to support immediate full sweep on close
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
    v_updated_count INT := 0;
    v_rec RECORD;
    v_affected_clinics UUID[] := '{}';
    v_affected_doctors UUID[] := '{}';
    v_c UUID;
BEGIN
    -- Sweep uncompleted appointments (past date, or today if explicitly requested or clinic closing)
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
          AND COALESCE(a.checkin_status::TEXT, '') NOT IN (
              'completed', 'done', 'cancelled', 'no_show', 'processing', 'sample_collected', 'report_prepared'
          )
          AND COALESCE(qe.status::TEXT, '') NOT IN (
              'done', 'no_show', 'processing', 'sample_collected', 'report_prepared'
          )
          AND (
              -- 1. All past-date appointments
              a.appointment_date < v_today
              -- 2. Today's appointments if requested (e.g. clinic closure)
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
            checkin_status = 'no_show',
            updated_at = v_now
        WHERE id = v_rec.appointment_id;

        -- If appointment had a queue entry, transition it to 'no_show'
        IF v_rec.queue_entry_id IS NOT NULL THEN
            UPDATE public.queue_entries
            SET 
                status = 'no_show',
                completed_at = v_now,
                updated_at = v_now
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

    -- Also sweep any orphan or direct active queue entries in waiting or inside
    FOR v_rec IN
        SELECT qe.id AS queue_entry_id, qe.clinic_id, qe.doctor_id
        FROM public.queue_entries qe
        LEFT JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
          AND qe.status IN ('waiting', 'inside', 'skipped')
          AND (
              p_include_today = TRUE
              OR a.id IS NULL
              OR a.checkin_status::TEXT IN ('cancelled', 'no_show')
              OR a.appointment_date < v_today
          )
    LOOP
        UPDATE public.queue_entries
        SET 
            status = 'no_show', 
            completed_at = v_now,
            updated_at = v_now
        WHERE id = v_rec.queue_entry_id;

        IF v_rec.clinic_id IS NOT NULL AND NOT (v_rec.clinic_id = ANY(v_affected_clinics)) THEN
            v_affected_clinics := array_append(v_affected_clinics, v_rec.clinic_id);
        END IF;
        v_updated_count := v_updated_count + 1;
    END LOOP;

    -- Re-index active queue positions for affected clinics
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

REVOKE ALL ON FUNCTION public.auto_transfer_uncompleted_queue_to_noshow(UUID, BOOLEAN, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_transfer_uncompleted_queue_to_noshow(UUID, BOOLEAN, INT) TO anon, authenticated, service_role;
