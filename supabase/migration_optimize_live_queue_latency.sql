-- ============================================================================
-- DACTOR PLATFORM: LIVE QUEUE LATENCY OPTIMIZATION MIGRATION
-- ============================================================================
-- 1. Moves queue_entries auto-enrollment & rogue purge out of read RPCs into
--    an event-driven trigger on public.appointments + daily rollover cron.
-- 2. Converts get_doctor_live_queue / get_clinic_live_queue to pure STABLE
--    read-only queries (zero DELETE/INSERT lock contention on every poll).
-- 3. Adds sync_clinic_live_queue (explicit on-open / manual sync RPC) and
--    reindex_active_queue (single set-based atomic reindex RPC).
-- 4. Optimizes get_live_queue_status into a STABLE single-pass queue scan
--    without redundant clinics re-queries.
-- 5. Adds covering composite indexes for sub-5ms queue lookups.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Covering Indexes for Active Queue Queries
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_doc_status_pos_inc
ON public.queue_entries (clinic_id, doctor_id, status, queue_position)
INCLUDE (appointment_id, inside_at, called_at);

CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_status_pos_inc
ON public.queue_entries (clinic_id, status, queue_position)
INCLUDE (appointment_id, doctor_id, inside_at, called_at);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date_status_time
ON public.appointments (clinic_id, appointment_date, status, appointment_time);

-- Ensure dactor_today() exists (Asia/Kathmandu local date)
CREATE OR REPLACE FUNCTION public.dactor_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;
$$;

-- Ensure diagnostic lab helper exists (self-contained)
CREATE OR REPLACE FUNCTION public.is_diagnostic_lab_clinic(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_name TEXT;
    v_specialties TEXT[];
BEGIN
    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT type::TEXT, name::TEXT, specialties INTO v_type, v_name, v_specialties
    FROM public.clinics
    WHERE id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF LOWER(COALESCE(v_type, '')) IN ('diagnostic_lab', 'lab', 'pathology_lab', 'imaging_center')
       OR LOWER(COALESCE(v_type, '')) ILIKE '%lab%'
       OR LOWER(COALESCE(v_type, '')) ILIKE '%diagnostic%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%lab%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%diagnostic%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%patholog%' THEN
        RETURN TRUE;
    END IF;

    IF v_specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(v_specialties) s
        WHERE LOWER(s) ILIKE '%lab%'
           OR LOWER(s) ILIKE '%patholog%'
           OR LOWER(s) ILIKE '%diagnostic%'
           OR LOWER(s) ILIKE '%radiolog%'
           OR LOWER(s) ILIKE '%scan%'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_diagnostic_lab_clinic(UUID) TO anon, authenticated, service_role;

-- Ensure optional clinic timing columns & queue_time_stats table exist
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS avg_consultation_time_minutes INT DEFAULT 10;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS manual_avg_consultation_time_minutes INT DEFAULT 10;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS avg_time_mode VARCHAR(20) DEFAULT 'auto';

CREATE TABLE IF NOT EXISTS public.queue_time_stats (
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    doctor_key UUID NOT NULL,
    today_date DATE,
    today_count INT NOT NULL DEFAULT 0,
    today_avg_seconds NUMERIC NOT NULL DEFAULT 0,
    alltime_count INT NOT NULL DEFAULT 0,
    alltime_avg_seconds NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, doctor_key)
);
ALTER TABLE public.queue_time_stats ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Event-Driven Trigger on public.appointments
--    Auto-enrolls today's newly approved appointments and purges cancelled/
--    unapproved entries on write instead of on every 5-10s read poll.
-- ----------------------------------------------------------------------------
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

    -- 2. Auto-enroll today's active approved appointments
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

-- ----------------------------------------------------------------------------
-- 3. Explicit On-Open Sync & Midnight Daily Rollover Enrollment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_daily_live_queue(
    p_clinic_id UUID DEFAULT NULL,
    p_date DATE DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_date DATE := COALESCE(p_date, public.dactor_today());
    v_inserted INT := 0;
BEGIN
    -- Remove rogue entries for cancelled or unapproved appointments in target scope
    DELETE FROM public.queue_entries qe
    USING public.appointments a
    WHERE qe.appointment_id = a.id
      AND (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
      AND a.appointment_date = v_date
      AND (
          UPPER(COALESCE(a.status, '')) NOT IN ('APPROVED', 'CONFIRMED')
          OR LOWER(COALESCE(a.checkin_status::TEXT, '')) = 'cancelled'
      );

    -- Batch-enroll missing active approved appointments for today
    IF v_date = public.dactor_today() THEN
        WITH missing AS (
            SELECT
                a.id AS appointment_id,
                a.clinic_id,
                CASE WHEN public.is_diagnostic_lab_clinic(a.clinic_id) THEN NULL ELSE a.doctor_id END AS effective_doctor_id,
                a.appointment_date,
                a.appointment_time,
                a.created_at
            FROM public.appointments a
            WHERE (p_clinic_id IS NULL OR a.clinic_id = p_clinic_id)
              AND a.appointment_date = v_date
              AND UPPER(COALESCE(a.status, '')) IN ('APPROVED', 'CONFIRMED')
              AND LOWER(COALESCE(a.checkin_status::TEXT, '')) NOT IN ('completed', 'done', 'cancelled', 'no_show', 'processing', 'sample_collected', 'report_prepared')
              AND NOT EXISTS (
                  SELECT 1 FROM public.queue_entries qe WHERE qe.appointment_id = a.id
              )
        ),
        base_pos AS (
            SELECT
                qe.clinic_id,
                qe.doctor_id,
                COALESCE(MAX(qe.queue_position), 0) AS max_pos
            FROM public.queue_entries qe
            JOIN public.appointments a ON a.id = qe.appointment_id
            WHERE (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
              AND a.appointment_date = v_date
            GROUP BY qe.clinic_id, qe.doctor_id
        ),
        numbered AS (
            SELECT
                m.appointment_id,
                m.clinic_id,
                m.effective_doctor_id,
                COALESCE(bp.max_pos, 0) + ROW_NUMBER() OVER (
                    PARTITION BY m.clinic_id, m.effective_doctor_id
                    ORDER BY m.appointment_time ASC NULLS LAST, m.created_at ASC NULLS LAST, m.appointment_id ASC
                ) AS next_pos
            FROM missing m
            LEFT JOIN base_pos bp
              ON bp.clinic_id = m.clinic_id
             AND bp.doctor_id IS NOT DISTINCT FROM m.effective_doctor_id
        )
        INSERT INTO public.queue_entries (
            id,
            appointment_id,
            clinic_id,
            doctor_id,
            queue_position,
            status,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            n.appointment_id,
            n.clinic_id,
            n.effective_doctor_id,
            n.next_pos::INT,
            'waiting',
            NOW(),
            NOW()
        FROM numbered n
        ON CONFLICT (appointment_id) DO NOTHING;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END IF;

    RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_clinic_live_queue(
    p_clinic_id UUID,
    p_date DATE DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_clinic_id IS NULL THEN
        RETURN 0;
    END IF;
    RETURN public.enroll_daily_live_queue(p_clinic_id, p_date);
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_daily_live_queue(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_daily_live_queue(UUID, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.sync_clinic_live_queue(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_clinic_live_queue(UUID, DATE) TO anon, authenticated, service_role;

-- Run initial enrollment for today immediately on migration
SELECT public.enroll_daily_live_queue(NULL, NULL);

-- Schedule daily 00:05 Asia/Kathmandu (18:20 UTC) rollover if pg_cron is enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dactor-daily-queue-enroll';
        PERFORM cron.schedule(
            'dactor-daily-queue-enroll',
            '20 18 * * *',
            'SELECT public.enroll_daily_live_queue(NULL, NULL)'
        );
    ELSE
        RAISE NOTICE 'pg_cron not enabled: daily rollover will rely on appointments trigger and sync_clinic_live_queue.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Pure Read-Only STABLE Live Queue RPCs (Zero DELETE/INSERT on polls)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_doctor_live_queue(UUID, UUID, DATE);
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(
    p_doctor_id UUID,
    p_clinic_id UUID,
    p_date DATE DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    appointment_id TEXT,
    clinic_id TEXT,
    doctor_id TEXT,
    doctor_name TEXT,
    queue_position INT,
    status TEXT,
    called_at TEXT,
    inside_at TEXT,
    completed_at TEXT,
    consultation_duration_seconds BIGINT,
    patient_name TEXT,
    patient_age INT,
    patient_gender TEXT,
    patient_mobile TEXT,
    tracking_code TEXT,
    appointment_date TEXT,
    appointment_time TEXT,
    payment_mode TEXT,
    payment_status TEXT,
    total_amount FLOAT8,
    user_id TEXT,
    is_walkin BOOLEAN,
    selected_lab_tests TEXT,
    opt_in_early_call BOOLEAN,
    created_at TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_date DATE := COALESCE(p_date, public.dactor_today());
    v_is_lab BOOLEAN := public.is_diagnostic_lab_clinic(p_clinic_id);
BEGIN
    RETURN QUERY
    SELECT
        qe.id::TEXT AS id,
        qe.appointment_id::TEXT AS appointment_id,
        qe.clinic_id::TEXT AS clinic_id,
        qe.doctor_id::TEXT AS doctor_id,
        COALESCE(d.full_name, '')::TEXT AS doctor_name,
        qe.queue_position::INT AS queue_position,
        CASE
            WHEN qe.status::TEXT IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status::TEXT, '')) IN ('completed', 'done') THEN 'done'
            WHEN qe.status::TEXT IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status::TEXT, '')) = 'processing' THEN 'processing'
            WHEN qe.status::TEXT IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status::TEXT, '')) = 'sample_collected' THEN 'sample_collected'
            WHEN qe.status::TEXT IN ('waiting', 'inside', 'processing') AND LOWER(COALESCE(a.checkin_status::TEXT, '')) = 'report_prepared' THEN 'report_prepared'
            ELSE qe.status::TEXT
        END AS status,
        to_char(qe.called_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS called_at,
        to_char(qe.inside_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS inside_at,
        to_char(qe.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
        qe.consultation_duration_seconds::BIGINT AS consultation_duration_seconds,
        a.patient_name::TEXT AS patient_name,
        COALESCE(a.patient_age, 0)::INT AS patient_age,
        COALESCE(a.patient_gender, '')::TEXT AS patient_gender,
        COALESCE(a.patient_mobile, '')::TEXT AS patient_mobile,
        COALESCE(a.tracking_code_10_digit, SUBSTRING(a.id::TEXT, 1, 8))::TEXT AS tracking_code,
        a.appointment_date::TEXT AS appointment_date,
        a.appointment_time::TEXT AS appointment_time,
        COALESCE(a.payment_mode, 'ONLINE')::TEXT AS payment_mode,
        COALESCE(a.payment_status::TEXT, 'pending')::TEXT AS payment_status,
        COALESCE(NULLIF(a.total_amount, 0.0), a.fee_amount, 0.0)::FLOAT8 AS total_amount,
        a.user_id::TEXT AS user_id,
        COALESCE(a.is_walkin, FALSE)::BOOLEAN AS is_walkin,
        a.selected_lab_tests::TEXT AS selected_lab_tests,
        COALESCE(a.opt_in_early_call, FALSE)::BOOLEAN AS opt_in_early_call,
        to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM public.queue_entries qe
    JOIN public.appointments a ON a.id = qe.appointment_id
    LEFT JOIN public.doctors d ON d.id = qe.doctor_id
    WHERE qe.clinic_id = p_clinic_id
      AND (v_is_lab OR p_doctor_id IS NULL OR qe.doctor_id = p_doctor_id)
      AND a.appointment_date = v_date
      AND UPPER(COALESCE(a.status, '')) IN ('APPROVED', 'CONFIRMED')
      AND LOWER(COALESCE(a.checkin_status::TEXT, '')) <> 'cancelled'
    ORDER BY
        CASE WHEN qe.status::TEXT = 'inside' THEN 0 ELSE 1 END,
        CASE WHEN qe.queue_position > 0 THEN qe.queue_position ELSE 9999 END,
        a.appointment_time,
        a.created_at,
        qe.id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_clinic_live_queue(UUID, DATE);
CREATE OR REPLACE FUNCTION public.get_clinic_live_queue(
    p_clinic_id UUID,
    p_date DATE DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    appointment_id TEXT,
    clinic_id TEXT,
    doctor_id TEXT,
    doctor_name TEXT,
    queue_position INT,
    status TEXT,
    called_at TEXT,
    inside_at TEXT,
    completed_at TEXT,
    consultation_duration_seconds BIGINT,
    patient_name TEXT,
    patient_age INT,
    patient_gender TEXT,
    patient_mobile TEXT,
    tracking_code TEXT,
    appointment_date TEXT,
    appointment_time TEXT,
    payment_mode TEXT,
    payment_status TEXT,
    total_amount FLOAT8,
    user_id TEXT,
    is_walkin BOOLEAN,
    selected_lab_tests TEXT,
    opt_in_early_call BOOLEAN,
    created_at TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.get_doctor_live_queue(
        p_doctor_id := NULL,
        p_clinic_id := p_clinic_id,
        p_date := p_date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_doctor_live_queue(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_live_queue(UUID, UUID, DATE) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_clinic_live_queue(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_live_queue(UUID, DATE) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Atomic Set-Based Queue Reindex RPC (Replaces 2N Sequential HTTP Loops)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reindex_active_queue(
    p_clinic_id UUID,
    p_doctor_id UUID DEFAULT NULL,
    p_sort_by_slot_time BOOLEAN DEFAULT TRUE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today DATE := public.dactor_today();
    v_now_time TIME := (NOW() AT TIME ZONE 'Asia/Kathmandu')::TIME;
    v_updated INT := 0;
BEGIN
    IF p_clinic_id IS NULL THEN
        RETURN 0;
    END IF;

    WITH ranked AS (
        SELECT
            qe.id,
            ROW_NUMBER() OVER (
                PARTITION BY qe.clinic_id, qe.doctor_id, a.appointment_date
                ORDER BY
                    CASE WHEN qe.status::TEXT = 'inside' THEN 0 ELSE 1 END,
                    CASE
                        WHEN p_sort_by_slot_time AND COALESCE(a.payment_mode, '') = 'PAY_AT_DESK'
                             AND a.appointment_date = v_today
                             AND a.appointment_time <= v_now_time
                        THEN 0
                        ELSE 1
                    END,
                    CASE WHEN p_sort_by_slot_time THEN a.appointment_time ELSE NULL END ASC NULLS LAST,
                    CASE WHEN NOT p_sort_by_slot_time THEN qe.queue_position ELSE NULL END ASC NULLS LAST,
                    a.created_at ASC NULLS LAST,
                    qe.id ASC
            )::INT AS new_pos
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE qe.clinic_id = p_clinic_id
          AND (p_doctor_id IS NULL OR qe.doctor_id = p_doctor_id)
          AND qe.status::TEXT IN ('waiting', 'inside')
    )
    UPDATE public.queue_entries qe
       SET queue_position = r.new_pos,
           updated_at = NOW()
      FROM ranked r
     WHERE qe.id = r.id
       AND qe.queue_position IS DISTINCT FROM r.new_pos;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.reindex_active_queue(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reindex_active_queue(UUID, UUID, BOOLEAN) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Optimized STABLE Single-Pass get_live_queue_status RPC
--    Eliminates duplicate clinics lookup and combines inside + ahead queries.
-- ----------------------------------------------------------------------------
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

        IF FOUND AND v_stats.today_date = v_today AND v_stats.today_count >= 3 THEN
            v_avg_seconds := GREATEST(ROUND(v_stats.today_avg_seconds)::INT, 60);
        ELSIF FOUND AND v_stats.alltime_count >= 3 THEN
            v_avg_seconds := GREATEST(ROUND(v_stats.alltime_avg_seconds)::INT, 60);
        END IF;
    END IF;

    -- Authoritative daily token number from appointment record
    v_token := COALESCE(v_appt.token_number, 1);

    -- This appointment's queue status (single unique-index lookup)
    SELECT qe.status::TEXT
      INTO v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;
    v_status := COALESCE(v_status, 'waiting');

    -- Single-pass scan for currently serving token/timestamp AND waiting patients ahead
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
       AND cur.status::TEXT IN ('waiting', 'inside', 'in_consultation');

    v_is_inside_anyone := (v_inside_at IS NOT NULL OR v_serving_token > 0);

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
            v_notice := 'You are next in line! Please proceed near the door.';
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
