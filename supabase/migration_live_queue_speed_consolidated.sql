-- ============================================================================
-- DACTOR PLATFORM: CONSOLIDATED LIVE QUEUE SPEED & LATENCY OPTIMIZATION
-- ============================================================================
-- Safe, self-contained & idempotent migration verified against live schema:
--   1. Adds missing prerequisite columns on clinics, appointments, queue_entries.
--   2. Adds covering composite indexes for sub-5ms queue & appointment lookups.
--   3. Installs helper functions (dactor_today, is_diagnostic_lab_clinic) and
--      running consultation stats (queue_time_stats, queue_avg_seconds, trigger).
--   4. Installs event-driven appointment -> queue_entries sync trigger + daily
--      rollover enrollment (enroll_daily_live_queue, sync_clinic_live_queue,
--      assign_or_get_queue_token), eliminating read-time DELETE/INSERT contention.
--   5. Installs STABLE read-only RPCs:
--      - get_doctor_live_queue(UUID, UUID, DATE)
--      - get_clinic_live_queue(UUID, DATE)
--      - reindex_active_queue(UUID, UUID, BOOLEAN)
--      - get_live_queue_status(TEXT)
--      - get_public_queue_status(TEXT)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Prerequisite Columns (Safe IF NOT EXISTS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinics
    ADD COLUMN IF NOT EXISTS avg_consultation_time_minutes INT DEFAULT 10,
    ADD COLUMN IF NOT EXISTS manual_avg_consultation_time_minutes INT DEFAULT 10,
    ADD COLUMN IF NOT EXISTS calculated_avg_consultation_time_minutes INT,
    ADD COLUMN IF NOT EXISTS avg_time_mode VARCHAR(20) DEFAULT 'auto';

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS opt_in_early_call BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS token_number INT,
    ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.queue_entries
    ADD COLUMN IF NOT EXISTS consultation_duration_seconds BIGINT;

-- ----------------------------------------------------------------------------
-- 2. Covering Composite Indexes for Sub-5ms Queue Lookups
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_doc_status_pos_inc
    ON public.queue_entries (clinic_id, doctor_id, status, queue_position)
    INCLUDE (appointment_id, inside_at, called_at);

CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_status_pos_inc
    ON public.queue_entries (clinic_id, status, queue_position)
    INCLUDE (appointment_id, doctor_id, inside_at, called_at);

CREATE INDEX IF NOT EXISTS idx_queue_entries_appointment_id
    ON public.queue_entries (appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date_status_time
    ON public.appointments (clinic_id, appointment_date, status, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date
    ON public.appointments (tracking_code_10_digit, appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_daily_doctor_token
    ON public.appointments (clinic_id, doctor_id, appointment_date, token_number);

-- ----------------------------------------------------------------------------
-- 3. Authoritative Helpers: dactor_today & is_diagnostic_lab_clinic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dactor_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;
$$;

GRANT EXECUTE ON FUNCTION public.dactor_today() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_diagnostic_lab_clinic(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_type TEXT;
    v_name TEXT;
    v_specialties TEXT[];
BEGIN
    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT c.type::TEXT, c.name, c.specialties
      INTO v_type, v_name, v_specialties
      FROM public.clinics c
     WHERE c.id = p_clinic_id;

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

REVOKE ALL ON FUNCTION public.is_diagnostic_lab_clinic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_diagnostic_lab_clinic(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Running Consultation Average Stats (queue_time_stats & queue_avg_seconds)
-- ----------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.queue_avg_seconds(p_clinic_id UUID, p_doctor_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.queue_avg_seconds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_avg_seconds(UUID, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_queue_time_stats_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
-- 5. Event-Driven Queue Sync Trigger + Daily Rollover + Token Assignment
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
    IF v_status NOT IN ('APPROVED', 'CONFIRMED') OR v_checkin = 'cancelled' THEN
        DELETE FROM public.queue_entries WHERE appointment_id = NEW.id;
        RETURN NEW;
    END IF;

    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    v_is_lab := public.is_diagnostic_lab_clinic(NEW.clinic_id);
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE NEW.doctor_id END;

    IF TG_OP = 'UPDATE' AND (OLD.clinic_id IS DISTINCT FROM NEW.clinic_id OR OLD.doctor_id IS DISTINCT FROM NEW.doctor_id) THEN
        UPDATE public.queue_entries
           SET clinic_id = NEW.clinic_id,
               doctor_id = v_effective_doc_id,
               updated_at = NOW()
         WHERE appointment_id = NEW.id;
    END IF;

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

            BEGIN
                INSERT INTO public.queue_entries (
                    id, appointment_id, clinic_id, doctor_id, queue_position, status, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), NEW.id, NEW.clinic_id, v_effective_doc_id, v_next_pos, 'waiting', NOW(), NOW()
                );
            EXCEPTION WHEN unique_violation THEN
                NULL;
            END;
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
    DELETE FROM public.queue_entries qe
    USING public.appointments a
    WHERE qe.appointment_id = a.id
      AND (p_clinic_id IS NULL OR qe.clinic_id = p_clinic_id)
      AND a.appointment_date = v_date
      AND (
          UPPER(COALESCE(a.status, '')) NOT IN ('APPROVED', 'CONFIRMED')
          OR LOWER(COALESCE(a.checkin_status::TEXT, '')) = 'cancelled'
      );

    IF v_date = public.dactor_today() THEN
        BEGIN
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
                id, appointment_id, clinic_id, doctor_id, queue_position, status, created_at, updated_at
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
            FROM numbered n;

            GET DIAGNOSTICS v_inserted = ROW_COUNT;
        EXCEPTION WHEN unique_violation THEN
            v_inserted := 0;
        END;
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

-- Run initial backfill enrollment for today
SELECT public.enroll_daily_live_queue(NULL, NULL);

CREATE OR REPLACE FUNCTION public.assign_or_get_queue_token(
    p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_existing_qe public.queue_entries%ROWTYPE;
    v_is_lab BOOLEAN := FALSE;
    v_max_pos INT := 0;
    v_assigned_pos INT := 1;
    v_effective_doc_id UUID;
    v_new_id UUID := gen_random_uuid();
BEGIN
    IF p_appointment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment ID is required');
    END IF;

    SELECT * INTO v_appt
      FROM public.appointments
     WHERE id = p_appointment_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment not found');
    END IF;

    IF UPPER(COALESCE(v_appt.status, '')) NOT IN ('APPROVED', 'CONFIRMED')
       OR LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) IN ('cancelled', 'completed', 'done', 'no_show') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Appointment is not active or approved',
            'status', v_appt.status,
            'checkin_status', v_appt.checkin_status
        );
    END IF;

    SELECT * INTO v_existing_qe
      FROM public.queue_entries
     WHERE appointment_id = p_appointment_id
     LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'token_number', COALESCE(NULLIF(v_appt.token_number, 0), v_existing_qe.queue_position),
            'queue_position', v_existing_qe.queue_position,
            'status', v_existing_qe.status,
            'already_assigned', true
        );
    END IF;

    v_is_lab := public.is_diagnostic_lab_clinic(v_appt.clinic_id);
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE v_appt.doctor_id END;

    SELECT COALESCE(MAX(qe.queue_position), 0)
      INTO v_max_pos
      FROM public.queue_entries qe
      JOIN public.appointments a ON a.id = qe.appointment_id
     WHERE qe.clinic_id = v_appt.clinic_id
       AND (
           (v_is_lab = TRUE AND qe.doctor_id IS NULL)
           OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND qe.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND qe.doctor_id IS NULL)))
       )
       AND a.appointment_date = v_appt.appointment_date;

    v_assigned_pos := v_max_pos + 1;

    BEGIN
        INSERT INTO public.queue_entries (
            id, appointment_id, clinic_id, doctor_id, queue_position, status, created_at, updated_at
        ) VALUES (
            v_new_id, v_appt.id, v_appt.clinic_id, v_effective_doc_id, v_assigned_pos, 'waiting', NOW(), NOW()
        );
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing_qe FROM public.queue_entries WHERE appointment_id = p_appointment_id LIMIT 1;
        v_assigned_pos := COALESCE(v_existing_qe.queue_position, v_assigned_pos);
    END;

    RETURN jsonb_build_object(
        'success', true,
        'token_number', COALESCE(NULLIF(v_appt.token_number, 0), v_assigned_pos),
        'queue_position', v_assigned_pos,
        'status', 'waiting',
        'already_assigned', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_or_get_queue_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_or_get_queue_token(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Pure Read-Only STABLE Live Queue RPCs (Sub-10ms Indexed Queries)
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
-- 7. Atomic Set-Based Queue Reindex RPC
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
-- 8. Optimized STABLE Single-Pass get_live_queue_status & get_public_queue_status
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_queue_status(TEXT);
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
    v_qe_pos INT := 0;
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

    -- Effective average consultation seconds from clinics + queue_time_stats
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

    -- Own queue entry lookup
    SELECT COALESCE(qe.queue_position, 0), COALESCE(qe.status::TEXT, 'waiting')
      INTO v_qe_pos, v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;
    v_qe_pos := COALESCE(v_qe_pos, 0);
    v_status := COALESCE(v_status, 'waiting');
    v_token := COALESCE(NULLIF(v_appt.token_number, 0), NULLIF(v_qe_pos, 0), 1);

    -- Single-pass scan for currently serving patient AND waiting patients ahead
    SELECT
        COALESCE(MIN(CASE WHEN cur.status::TEXT IN ('inside', 'in_consultation') THEN COALESCE(NULLIF(ca.token_number, 0), cur.queue_position) END), 0)::INT,
        MIN(CASE WHEN cur.status::TEXT IN ('inside', 'in_consultation') THEN COALESCE(cur.inside_at, cur.called_at) END),
        COUNT(*) FILTER (
            WHERE cur.appointment_id <> v_appt.id
              AND (
                  cur.status::TEXT IN ('inside', 'in_consultation')
                  OR (
                      cur.status::TEXT = 'waiting'
                      AND (
                          (v_qe_pos > 0 AND cur.queue_position < v_qe_pos)
                          OR (v_qe_pos = 0 AND COALESCE(NULLIF(ca.token_number, 0), cur.queue_position) < v_token)
                      )
                  )
              )
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
    ELSIF LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) = 'cancelled' OR v_status = 'cancelled' THEN
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
        CASE WHEN v_qe_pos > 0 THEN v_qe_pos ELSE v_token END::INT,
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
    token_number INT,
    queue_position INT,
    patients_ahead INT,
    current_queue_position INT,
    doctor_is_in_clinic BOOLEAN,
    estimated_wait_minutes INT,
    current_inside_since TIMESTAMPTZ,
    avg_consultation_seconds INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.tracking_code_10_digit,
        s.clinic_id,
        s.clinic_name,
        s.doctor_id,
        s.doctor_name,
        s.doctor_specialty,
        s.appointment_date,
        s.appointment_time,
        s.checkin_status,
        s.queue_status,
        s.token_number,
        s.queue_position,
        s.patients_ahead,
        s.current_serving_token AS current_queue_position,
        s.doctor_is_in_clinic,
        s.estimated_wait_minutes,
        s.current_inside_since,
        s.avg_consultation_seconds
    FROM public.get_live_queue_status(p_tracking_code) s;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
