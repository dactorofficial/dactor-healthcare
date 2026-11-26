-- =============================================================================
-- Migration: Dynamic Realtime Queue Sync & Instant Cabin State Transition
-- =============================================================================
-- 1. Enables REPLICA IDENTITY FULL and adds queue_entries, appointments,
--    doctors, and clinics to supabase_realtime publication.
-- 2. Enhances trg_appointments_sync_queue_entry to sync 'done', 'completed',
--    'no_show', and 'inside' status directly to queue_entries so completed
--    patients vacate the cabin instantly.
-- 3. Hardens get_live_queue_status to exclude completed/cancelled/no_show
--    appointments from the cabin and waiting line scan.
-- =============================================================================

-- 1. Enable REPLICA IDENTITY FULL for Realtime change payloads
ALTER TABLE public.queue_entries REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.doctors REPLICA IDENTITY FULL;
ALTER TABLE public.clinics REPLICA IDENTITY FULL;

-- 2. Add tables to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'queue_entries'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'appointments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'doctors'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'clinics'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.clinics;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Enhanced Event-Driven Trigger on public.appointments
CREATE OR REPLACE FUNCTION public.trg_appointments_sync_queue_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today DATE := public.dactor_today();
    v_status TEXT := UPPER(COALESCE(NEW.status, ''));
    v_checkin TEXT := LOWER(COALESCE(NEW.checkin_status::TEXT, ''));
    v_is_lab BOOLEAN := FALSE;
    v_effective_doc_id UUID;
    v_next_pos INT := 1;
BEGIN
    -- 1. Purge queue entry immediately if appointment is unapproved or cancelled
    IF v_status NOT IN ('APPROVED', 'CONFIRMED') OR v_checkin = 'cancelled' THEN
        DELETE FROM public.queue_entries WHERE appointment_id = NEW.id;
        RETURN NEW;
    END IF;

    -- 2. If appointment was marked completed / done, update queue entry to done immediately
    IF v_checkin IN ('completed', 'done') OR v_status IN ('COMPLETED', 'DONE') THEN
        UPDATE public.queue_entries
           SET status = 'done',
               updated_at = NOW()
         WHERE appointment_id = NEW.id
           AND status::TEXT <> 'done';
        RETURN NEW;
    END IF;

    -- 3. If appointment was marked no-show, update queue entry to no_show immediately
    IF v_checkin = 'no_show' OR v_status = 'NO_SHOW' THEN
        UPDATE public.queue_entries
           SET status = 'no_show',
               updated_at = NOW()
         WHERE appointment_id = NEW.id
           AND status::TEXT <> 'no_show';
        RETURN NEW;
    END IF;

    -- 4. If appointment was marked inside/in_consultation, synchronize queue entry to inside
    IF v_checkin IN ('inside', 'in_consultation') THEN
        UPDATE public.queue_entries
           SET status = 'inside',
               inside_at = COALESCE(inside_at, NOW()),
               updated_at = NOW()
         WHERE appointment_id = NEW.id
           AND status::TEXT <> 'inside';
    END IF;

    -- Keep existing authoritative reschedule/follow-up RPC mutations intact
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Resolve diagnostic lab vs doctor partitioning
    v_is_lab := public.is_diagnostic_lab_clinic(NEW.clinic_id);
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE NEW.doctor_id END;

    -- Sync clinic/doctor assignment if an existing queue_entry differs
    IF TG_OP = 'UPDATE' AND (OLD.clinic_id IS DISTINCT FROM NEW.clinic_id OR OLD.doctor_id IS DISTINCT FROM NEW.doctor_id) THEN
        UPDATE public.queue_entries
           SET clinic_id = NEW.clinic_id,
               doctor_id = v_effective_doc_id,
               updated_at = NOW()
         WHERE appointment_id = NEW.id;
    END IF;

    -- 5. Auto-enroll today's active approved appointments if not yet enrolled
    IF NEW.appointment_date = v_today
       AND v_checkin NOT IN ('completed', 'done', 'cancelled', 'no_show', 'processing', 'sample_collected', 'report_prepared') THEN
        IF NOT EXISTS (SELECT 1 FROM public.queue_entries WHERE appointment_id = NEW.id) THEN
            SELECT COALESCE(MAX(qe.queue_position), 0) + 1
              INTO v_next_pos
              FROM public.queue_entries qe
              JOIN public.appointments a ON a.id = qe.appointment_id
             WHERE qe.clinic_id = NEW.clinic_id
               AND a.appointment_date = NEW.appointment_date
               AND (
                   (v_is_lab = TRUE AND qe.doctor_id IS NULL)
                   OR (v_is_lab = FALSE AND (
                       (v_effective_doc_id IS NOT NULL AND qe.doctor_id = v_effective_doc_id)
                       OR (v_effective_doc_id IS NULL AND qe.doctor_id IS NULL)
                   ))
               );

            INSERT INTO public.queue_entries (
                id,
                appointment_id,
                clinic_id,
                doctor_id,
                queue_position,
                status,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                NEW.id,
                NEW.clinic_id,
                v_effective_doc_id,
                v_next_pos,
                'waiting',
                NOW(),
                NOW()
            )
            ON CONFLICT (appointment_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_sync_queue_entry ON public.appointments;
CREATE TRIGGER appointments_sync_queue_entry
AFTER INSERT OR UPDATE OF status, checkin_status, appointment_date, doctor_id, clinic_id
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.trg_appointments_sync_queue_entry();

-- 4. Hardened STABLE Single-Pass get_live_queue_status RPC
DROP FUNCTION IF EXISTS public.get_live_queue_status(TEXT);
CREATE OR REPLACE FUNCTION public.get_live_queue_status(p_code_or_id TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    appointment_id UUID,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TIME,
    checkin_status TEXT,
    queue_status TEXT,
    token_number INT,
    queue_position INT,
    patients_ahead INT,
    current_serving_token INT,
    doctor_is_in_clinic BOOLEAN,
    is_anyone_inside BOOLEAN,
    estimated_wait_minutes INT,
    slot_notice TEXT,
    current_inside_since TIMESTAMPTZ,
    avg_consultation_seconds INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_clean TEXT := trim(COALESCE(p_code_or_id, ''));
    v_today DATE := public.dactor_today();
    v_appt public.appointments%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_doctor public.doctors%ROWTYPE;
    v_stats public.queue_time_stats%ROWTYPE;
    v_token INT := 0;
    v_ahead INT := 0;
    v_serving_token INT := 0;
    v_is_inside_anyone BOOLEAN := FALSE;
    v_inside_at TIMESTAMPTZ := NULL;
    v_doc_in_clinic BOOLEAN := FALSE;
    v_status TEXT := 'waiting';
    v_avg_seconds INT := 600;
    v_avg_mins INT := 10;
    v_wait_mins INT := 0;
    v_is_lab BOOLEAN := FALSE;
    v_effective_doc_id UUID;
    v_notice TEXT := '';
BEGIN
    IF v_clean = '' THEN
        RETURN;
    END IF;

    -- Lookup appointment by UUID or 10-digit tracking code with active/today/future priority
    IF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_appt FROM public.appointments a WHERE a.id = v_clean::UUID LIMIT 1;
    ELSE
        SELECT * INTO v_appt
        FROM public.appointments a
        WHERE a.tracking_code_10_digit = v_clean
        ORDER BY
            EXISTS (
                SELECT 1 FROM public.queue_entries qe
                WHERE qe.appointment_id = a.id AND qe.status::TEXT IN ('waiting', 'inside')
            ) DESC,
            (a.appointment_date = v_today) DESC,
            (a.appointment_date > v_today) DESC,
            COALESCE(a.attempt_number, 1) DESC,
            a.appointment_date DESC,
            a.created_at DESC
        LIMIT 1;
    END IF;

    IF v_appt.id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_clinic FROM public.clinics c WHERE c.id = v_appt.clinic_id LIMIT 1;

    IF v_appt.doctor_id IS NOT NULL THEN
        SELECT * INTO v_doctor FROM public.doctors d WHERE d.id = v_appt.doctor_id LIMIT 1;
        v_doc_in_clinic := COALESCE(v_doctor.is_in_clinic, FALSE);
    END IF;

    v_is_lab := (
        COALESCE(v_clinic.type::TEXT, '') = 'diagnostic_lab'
        OR COALESCE(v_clinic.type::TEXT, '') ILIKE '%lab%'
        OR COALESCE(v_clinic.name, '') ILIKE '%lab%'
    );
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE v_appt.doctor_id END;

    -- Compute effective average seconds directly using already-fetched v_clinic + queue_time_stats
    v_avg_mins := GREATEST(COALESCE(v_clinic.manual_avg_consultation_time_minutes, v_clinic.avg_consultation_time_minutes, 10), 1);
    IF v_avg_mins = 10 AND v_clinic.description IS NOT NULL AND v_clinic.description ~ '^\s*\{' THEN
        BEGIN
            v_avg_mins := GREATEST(COALESCE(NULLIF((v_clinic.description::jsonb ->> 'avg_consultation_time_minutes'), '')::INT, 10), 1);
        EXCEPTION WHEN OTHERS THEN
            v_avg_mins := 10;
        END;
    END IF;
    v_avg_seconds := v_avg_mins * 60;

    IF COALESCE(v_clinic.avg_time_mode, 'auto') <> 'manual' THEN
        SELECT * INTO v_stats
        FROM public.queue_time_stats s
        WHERE s.clinic_id = v_appt.clinic_id
          AND s.doctor_key = COALESCE(v_effective_doc_id, '00000000-0000-0000-0000-000000000000'::UUID);

        IF FOUND AND v_stats.today_date = v_today AND v_stats.today_count >= 1 THEN
            v_avg_seconds := GREATEST(ROUND(v_stats.today_avg_seconds)::INT, 60);
        ELSIF FOUND AND v_stats.alltime_count >= 1 THEN
            v_avg_seconds := GREATEST(ROUND(v_stats.alltime_avg_seconds)::INT, 60);
        END IF;
    END IF;

    -- Authoritative daily token number from appointment record
    v_token := COALESCE(v_appt.token_number, 1);

    -- This appointment's queue status
    SELECT qe.status::TEXT
      INTO v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;
    v_status := COALESCE(v_status, 'waiting');

    -- Single-pass scan for currently serving token/timestamp AND waiting patients ahead
    -- CRITICAL: strictly filter out appointments that are completed, done, cancelled, or no-show
    SELECT
        COALESCE(MIN(CASE WHEN cur.status::TEXT IN ('inside', 'in_consultation') THEN COALESCE(ca.token_number, cur.queue_position) END), 0)::INT,
        MIN(CASE WHEN cur.status::TEXT IN ('inside', 'in_consultation') THEN COALESCE(cur.inside_at, cur.called_at) END),
        COUNT(*) FILTER (
            WHERE cur.status::TEXT = 'waiting'
              AND COALESCE(ca.token_number, cur.queue_position) < v_token
        )::INT
      INTO v_serving_token, v_inside_at, v_ahead
      FROM public.queue_entries cur
      JOIN public.appointments ca ON ca.id = cur.appointment_id
     WHERE cur.clinic_id = v_appt.clinic_id
       AND (
           (v_is_lab = TRUE AND cur.doctor_id IS NULL)
           OR (v_is_lab = FALSE AND (
               (v_effective_doc_id IS NOT NULL AND cur.doctor_id = v_effective_doc_id)
               OR (v_effective_doc_id IS NULL AND cur.doctor_id IS NULL)
           ))
       )
       AND ca.appointment_date = v_appt.appointment_date
       AND cur.status::TEXT IN ('waiting', 'inside', 'in_consultation')
       AND LOWER(COALESCE(ca.checkin_status::TEXT, '')) NOT IN ('completed', 'done', 'cancelled', 'no_show')
       AND UPPER(COALESCE(ca.status::TEXT, '')) IN ('APPROVED', 'CONFIRMED');

    -- If no valid active patient is inside the cabin, clear serving token & inside_at
    IF v_inside_at IS NOT NULL AND v_serving_token > 0 THEN
        v_is_inside_anyone := TRUE;
    ELSE
        v_is_inside_anyone := FALSE;
        v_inside_at := NULL;
        v_serving_token := 0;
    END IF;

    IF LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) IN ('completed', 'done') OR v_status IN ('done', 'completed') THEN
        v_status := 'completed';
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'Consultation completed. Download your digital prescription & bill.';
    ELSIF v_appt.checkin_status::TEXT = 'cancelled' OR v_status = 'cancelled' THEN
        v_status := 'cancelled';
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'This appointment visit was cancelled.';
    ELSIF v_status IN ('inside', 'in_consultation') THEN
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'Currently inside consultation cabin with doctor';
    ELSE
        v_wait_mins := v_ahead * (v_avg_seconds / 60);
        IF v_ahead = 0 THEN
            IF v_is_inside_anyone THEN
                v_notice := 'Doctor is consulting with a patient • You are up next';
            ELSE
                v_notice := 'You are next in line! Doctor cabin is ready. Please proceed near the door.';
            END IF;
        ELSIF v_ahead = 1 AND v_is_inside_anyone THEN
            v_notice := 'Doctor is consulting with a patient • You are up next';
        ELSE
            v_notice := v_ahead || ' patients ahead in live line. Approx wait: ~' || v_wait_mins || ' mins';
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        v_appt.tracking_code_10_digit::TEXT,
        v_appt.id,
        v_appt.clinic_id,
        COALESCE(v_clinic.name, '')::TEXT,
        v_appt.doctor_id,
        COALESCE(v_doctor.full_name, '')::TEXT,
        COALESCE(v_doctor.specialty, '')::TEXT,
        v_appt.appointment_date,
        v_appt.appointment_time,
        COALESCE(v_appt.checkin_status::TEXT, 'booked')::TEXT,
        v_status::TEXT,
        v_token::INT,
        v_token::INT,
        v_ahead::INT,
        COALESCE(v_serving_token, 0)::INT,
        v_doc_in_clinic,
        v_is_inside_anyone,
        v_wait_mins::INT,
        v_notice::TEXT,
        v_inside_at,
        v_avg_seconds::INT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_queue_status(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
