-- ============================================================================
-- DACTOR PLATFORM: Free-tier scaling - queue estimates, threshold alerts, no-show cron
-- See docs/scaling-plan.md
--
-- 1. queue_time_stats: running average consultation time per doctor queue
--    (count + average only, today and all-time), updated by trigger.
-- 2. get_public_queue_status: today-only "ahead" counts and an overrun-aware
--    estimate based on the running average. Same signature as before.
-- 3. Threshold alert: one FCM push when a waiting patient reaches the clinic's
--    auto_notify_threshold. Requires pg_net + Vault secrets (see bottom).
-- 4. pg_cron: run the existing no-show sweep every 6 hours.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Running average consultation time
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_time_stats (
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    -- doctor_id, or the nil UUID for queues without a doctor (diagnostic lab)
    doctor_key UUID NOT NULL,
    today_date DATE,
    today_count INT NOT NULL DEFAULT 0,
    today_avg_seconds NUMERIC NOT NULL DEFAULT 0,
    alltime_count INT NOT NULL DEFAULT 0,
    alltime_avg_seconds NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, doctor_key)
);
-- Only accessed through SECURITY DEFINER functions below.
ALTER TABLE public.queue_time_stats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.dactor_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;
$$;

-- Effective average consultation time (seconds) for one doctor queue.
-- Today's running average once 3+ consultations are done today, otherwise the
-- all-time running average (once 3+ recorded), otherwise the clinic's manual
-- setting (default 10 min).
-- avg_time_mode = 'manual' always uses the manual setting.
CREATE OR REPLACE FUNCTION public.queue_avg_seconds(p_clinic_id UUID, p_doctor_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manual NUMERIC;
    v_mode TEXT;
    v_stats public.queue_time_stats%ROWTYPE;
BEGIN
    SELECT COALESCE(c.manual_avg_consultation_time_minutes, c.avg_consultation_time_minutes, 10) * 60,
           COALESCE(c.avg_time_mode, 'auto')
      INTO v_manual, v_mode
      FROM public.clinics c
     WHERE c.id = p_clinic_id;

    v_manual := GREATEST(COALESCE(v_manual, 600), 60);
    IF v_mode = 'manual' THEN
        RETURN v_manual;
    END IF;

    SELECT * INTO v_stats
      FROM public.queue_time_stats s
     WHERE s.clinic_id = p_clinic_id
       AND s.doctor_key = COALESCE(p_doctor_id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF FOUND AND v_stats.today_date = public.dactor_today() AND v_stats.today_count >= 3 THEN
        RETURN GREATEST(v_stats.today_avg_seconds, 60);
    ELSIF FOUND AND v_stats.alltime_count >= 3 THEN
        RETURN GREATEST(v_stats.alltime_avg_seconds, 60);
    END IF;
    RETURN v_manual;
END;
$$;
GRANT EXECUTE ON FUNCTION public.queue_avg_seconds(UUID, UUID) TO anon, authenticated, service_role;

-- Trigger: when a consultation finishes, fold its duration into the averages.
CREATE OR REPLACE FUNCTION public.trg_queue_time_stats_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_finished TEXT[] := ARRAY['done', 'processing', 'sample_collected', 'report_prepared'];
    v_key UUID := COALESCE(NEW.doctor_id, '00000000-0000-0000-0000-000000000000'::UUID);
    v_today DATE := public.dactor_today();
    v_duration NUMERIC;
    v_reference NUMERIC;
    v_stats public.queue_time_stats%ROWTYPE;
BEGIN
    IF NOT (NEW.status::TEXT = ANY (v_finished)) OR (OLD.status::TEXT = ANY (v_finished)) THEN
        RETURN NEW;
    END IF;

    v_duration := COALESCE(
        NULLIF(NEW.consultation_duration_seconds, 0),
        EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, NOW()) - COALESCE(NEW.inside_at, NEW.called_at)))
    );
    -- Ignore missing or implausible durations (under 30 s or over 3 h).
    IF v_duration IS NULL OR v_duration < 30 OR v_duration > 10800 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.queue_time_stats (clinic_id, doctor_key)
    VALUES (NEW.clinic_id, v_key)
    ON CONFLICT (clinic_id, doctor_key) DO NOTHING;

    SELECT * INTO v_stats
      FROM public.queue_time_stats
     WHERE clinic_id = NEW.clinic_id AND doctor_key = v_key
     FOR UPDATE;

    IF v_stats.today_date IS DISTINCT FROM v_today THEN
        v_stats.today_date := v_today;
        v_stats.today_count := 0;
        v_stats.today_avg_seconds := 0;
    END IF;

    -- Outlier rule: skip consultations longer than 2x the current average.
    v_reference := CASE
        WHEN v_stats.today_count >= 3 THEN v_stats.today_avg_seconds
        WHEN v_stats.alltime_count >= 3 THEN v_stats.alltime_avg_seconds
        ELSE NULL
    END;
    IF v_reference IS NOT NULL AND v_duration > 2 * v_reference THEN
        RETURN NEW;
    END IF;

    UPDATE public.queue_time_stats
       SET today_date = v_today,
           today_avg_seconds = (v_stats.today_avg_seconds * v_stats.today_count + v_duration) / (v_stats.today_count + 1),
           today_count = v_stats.today_count + 1,
           alltime_avg_seconds = (v_stats.alltime_avg_seconds * v_stats.alltime_count + v_duration) / (v_stats.alltime_count + 1),
           alltime_count = v_stats.alltime_count + 1,
           updated_at = NOW()
     WHERE clinic_id = NEW.clinic_id AND doctor_key = v_key;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_time_stats_on_finish ON public.queue_entries;
CREATE TRIGGER queue_time_stats_on_finish
    AFTER UPDATE OF status ON public.queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_queue_time_stats_on_finish();

-- ----------------------------------------------------------------------------
-- 2. Public queue status: today-only, overrun-aware estimate
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TIME,
    checkin_status TEXT,
    queue_status TEXT,
    queue_position INT,
    patients_ahead INT,
    current_queue_position INT,
    doctor_is_in_clinic BOOLEAN,
    estimated_wait_minutes INT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt RECORD;
    v_ahead INT := 0;
    v_serving INT := 0;
    v_inside_at TIMESTAMPTZ;
    v_avg NUMERIC;
    v_wait_seconds NUMERIC := 0;
BEGIN
    IF COALESCE(p_tracking_code, '') !~ '^[0-9]{10}$' THEN
        RETURN;
    END IF;

    SELECT a.id, a.tracking_code_10_digit, a.clinic_id, c.name AS clinic_name,
           a.doctor_id, d.full_name, d.specialty, a.appointment_date, a.appointment_time,
           a.checkin_status, qe.status AS qe_status, qe.queue_position,
           COALESCE(d.is_in_clinic, FALSE) AS doctor_in
      INTO v_appt
      FROM public.appointments a
      JOIN public.clinics c ON c.id = a.clinic_id
      LEFT JOIN public.doctors d ON d.id = a.doctor_id
      LEFT JOIN public.queue_entries qe ON qe.appointment_id = a.id
     WHERE a.tracking_code_10_digit = p_tracking_code
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_appt.queue_position IS NOT NULL THEN
        -- Waiting patients ahead in the same doctor queue on the same day
        SELECT COUNT(*)::INT INTO v_ahead
          FROM public.queue_entries ahead
          JOIN public.appointments aa ON aa.id = ahead.appointment_id
         WHERE ahead.clinic_id = v_appt.clinic_id
           AND ahead.doctor_id IS NOT DISTINCT FROM v_appt.doctor_id
           AND aa.appointment_date = v_appt.appointment_date
           AND ahead.status = 'waiting'
           AND ahead.queue_position < v_appt.queue_position;
    END IF;

    -- Patient currently inside the same doctor cabin today
    SELECT cur.queue_position, COALESCE(cur.inside_at, cur.called_at)
      INTO v_serving, v_inside_at
      FROM public.queue_entries cur
      JOIN public.appointments ca ON ca.id = cur.appointment_id
     WHERE cur.clinic_id = v_appt.clinic_id
       AND cur.doctor_id IS NOT DISTINCT FROM v_appt.doctor_id
       AND ca.appointment_date = v_appt.appointment_date
       AND cur.status = 'inside'
     ORDER BY cur.queue_position
     LIMIT 1;

    IF COALESCE(v_appt.qe_status::TEXT, 'waiting') = 'waiting' AND v_appt.queue_position IS NOT NULL THEN
        v_avg := public.queue_avg_seconds(v_appt.clinic_id, v_appt.doctor_id);
        v_wait_seconds := v_ahead * v_avg;
        IF v_inside_at IS NOT NULL THEN
            -- Remaining time of the current consultation; an overrun pushes everyone later.
            v_wait_seconds := v_wait_seconds
                + GREATEST(EXTRACT(EPOCH FROM (v_inside_at - NOW())) + v_avg, 60);
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_appt.tracking_code_10_digit::TEXT,
        v_appt.clinic_id,
        v_appt.clinic_name::TEXT,
        v_appt.doctor_id,
        v_appt.full_name::TEXT,
        v_appt.specialty::TEXT,
        v_appt.appointment_date,
        v_appt.appointment_time,
        v_appt.checkin_status::TEXT,
        COALESCE(v_appt.qe_status::TEXT, 'waiting')::TEXT,
        COALESCE(v_appt.queue_position, 0)::INT,
        v_ahead,
        COALESCE(v_serving, 0)::INT,
        v_appt.doctor_in,
        ROUND(v_wait_seconds / 60.0)::INT;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. "X patients left" FCM alert (clinics.auto_notify_threshold)
-- ----------------------------------------------------------------------------
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS threshold_alert_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.trg_queue_threshold_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_threshold INT;
    v_clinic_name TEXT;
    v_date DATE;
    v_url TEXT;
    v_key TEXT;
    v_rec RECORD;
BEGIN
    SELECT a.appointment_date INTO v_date
      FROM public.appointments a WHERE a.id = NEW.appointment_id;
    IF v_date IS DISTINCT FROM public.dactor_today() THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(c.auto_notify_threshold, 2), c.name
      INTO v_threshold, v_clinic_name
      FROM public.clinics c WHERE c.id = NEW.clinic_id;

    FOR v_rec IN
        SELECT w.id, w.appointment_id, w.ahead
          FROM (
              SELECT qe.id, qe.appointment_id, qe.threshold_alert_sent_at,
                     (ROW_NUMBER() OVER (ORDER BY qe.queue_position) - 1)::INT AS ahead
                FROM public.queue_entries qe
                JOIN public.appointments a ON a.id = qe.appointment_id
               WHERE qe.clinic_id = NEW.clinic_id
                 AND qe.doctor_id IS NOT DISTINCT FROM NEW.doctor_id
                 AND a.appointment_date = v_date
                 AND qe.status = 'waiting'
          ) w
         WHERE w.ahead <= v_threshold
           AND w.threshold_alert_sent_at IS NULL
    LOOP
        -- Mark first so the alert is never sent twice.
        UPDATE public.queue_entries SET threshold_alert_sent_at = NOW() WHERE id = v_rec.id;

        BEGIN
            IF v_url IS NULL THEN
                SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'dactor_project_url';
                SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'dactor_service_role_key';
            END IF;
            IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
                PERFORM net.http_post(
                    url := rtrim(v_url, '/') || '/functions/v1/send-fcm-alert',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || v_key
                    ),
                    body := jsonb_build_object(
                        'appointmentId', v_rec.appointment_id,
                        'type', 'queue_alert',
                        'title', 'Your turn is near',
                        'message', CASE WHEN v_rec.ahead = 0
                            THEN 'You are next at ' || COALESCE(v_clinic_name, 'the clinic') || '. Please be ready.'
                            ELSE v_rec.ahead || ' patient(s) ahead of you at ' || COALESCE(v_clinic_name, 'the clinic') || '. Please arrive now.'
                        END
                    )
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- pg_net / Vault not configured: never block queue updates.
            NULL;
        END;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_threshold_alert ON public.queue_entries;
CREATE TRIGGER queue_threshold_alert
    AFTER UPDATE OF status, queue_position ON public.queue_entries
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.queue_position IS DISTINCT FROM NEW.queue_position)
    EXECUTE FUNCTION public.trg_queue_threshold_alert();

-- ----------------------------------------------------------------------------
-- 4. No-show sweep every 6 hours (previous days' unfinished appointments)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dactor-noshow-sweep';
        PERFORM cron.schedule(
            'dactor-noshow-sweep',
            '15 */6 * * *',
            'SELECT public.auto_transfer_uncompleted_queue_to_noshow()'
        );
    ELSE
        RAISE NOTICE 'pg_cron not enabled: enable it and re-run this block to schedule the no-show sweep.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Manual setup (Supabase dashboard):
--   Database -> Extensions: enable pg_net and pg_cron (then re-run block 4).
--   Vault: add secrets 'dactor_project_url' and 'dactor_service_role_key'.
-- ----------------------------------------------------------------------------
