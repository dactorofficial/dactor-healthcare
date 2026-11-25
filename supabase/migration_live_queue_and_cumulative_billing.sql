-- =========================================================================
-- DACTOR PLATFORM: CONSOLIDATED QUEUE ENGINE & CUMULATIVE BILLING MIGRATION
-- Run in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql/new
-- =========================================================================

-- -------------------------------------------------------------------------
-- PART 1: Cumulative Multi-Visit Tracking & Billing Upgrades
-- -------------------------------------------------------------------------

-- 1.1 Dynamically drop ANY unique constraint or unique index on
-- appointments(tracking_code_10_digit) alone so follow-ups can share codes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.appointments'::regclass 
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%(tracking_code_10_digit)%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE';
        RAISE NOTICE 'Dropped unique constraint: %', r.conname;
    END LOOP;

    FOR r IN (
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'appointments' 
          AND indexdef ILIKE '%UNIQUE%' 
          AND indexdef ILIKE '%(tracking_code_10_digit)%'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.indexname) || ' CASCADE';
        RAISE NOTICE 'Dropped standalone unique index: %', r.indexname;
    END LOOP;
END $$;

-- 1.2 Ensure attempt_number exists, remove legacy <= 3 limit, and backfill
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS chk_appointments_attempt_number;

ALTER TABLE public.appointments 
ADD CONSTRAINT chk_appointments_attempt_number CHECK (attempt_number >= 1);

UPDATE public.appointments 
SET attempt_number = 1 
WHERE attempt_number IS NULL;

WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY tracking_code_10_digit 
        ORDER BY created_at ASC NULLS LAST, appointment_date ASC NULLS LAST, id ASC
    ) AS seq
    FROM public.appointments
    WHERE tracking_code_10_digit IS NOT NULL
)
UPDATE public.appointments a
SET attempt_number = ranked.seq
FROM ranked
WHERE a.id = ranked.id AND (a.attempt_number IS NULL OR a.attempt_number <> ranked.seq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tracking_code_attempt 
ON public.appointments (tracking_code_10_digit, attempt_number);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date 
ON public.appointments (tracking_code_10_digit, appointment_date);

-- 1.3 Upgrade billing_invoices with tracking_code_10_digit
ALTER TABLE public.billing_invoices 
ADD COLUMN IF NOT EXISTS tracking_code_10_digit VARCHAR(10);

UPDATE public.billing_invoices bi
SET tracking_code_10_digit = a.tracking_code_10_digit
FROM public.appointments a
WHERE bi.appointment_id = a.id 
  AND bi.tracking_code_10_digit IS NULL;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tracking_code 
ON public.billing_invoices (tracking_code_10_digit);

-- -------------------------------------------------------------------------
-- PART 2: Live Queue Engine Hardening & Countdown RPC
-- -------------------------------------------------------------------------

-- 2.1 Ensure avg_consultation_time_minutes column exists on clinics
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS avg_consultation_time_minutes INT DEFAULT 10;

-- 2.2 Drop and recreate get_live_queue_status RPC
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
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_clean TEXT := trim(COALESCE(p_code_or_id, ''));
    v_appt public.appointments%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_doctor public.doctors%ROWTYPE;
    v_token INT := 0;
    v_ahead INT := 0;
    v_serving INT := 0;
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

    -- Lookup appointment by 10-digit tracking code or UUID
    IF v_clean ~ '^[0-9]{10}$' THEN
        SELECT * INTO v_appt FROM public.appointments a WHERE a.tracking_code_10_digit = v_clean LIMIT 1;
    ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_appt FROM public.appointments a WHERE a.id = v_clean::UUID LIMIT 1;
    ELSE
        SELECT * INTO v_appt FROM public.appointments a WHERE a.tracking_code_10_digit = v_clean LIMIT 1;
    END IF;

    IF v_appt.id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_clinic FROM public.clinics c WHERE c.id = v_appt.clinic_id LIMIT 1;
    IF v_appt.doctor_id IS NOT NULL THEN
        SELECT * INTO v_doctor FROM public.doctors d WHERE d.id = v_appt.doctor_id LIMIT 1;
        v_doc_in_clinic := COALESCE(v_doctor.is_in_clinic, FALSE);
    END IF;

    v_is_lab := (COALESCE(v_clinic.type::TEXT, '') = 'diagnostic_lab' 
                 OR COALESCE(v_clinic.type::TEXT, '') ILIKE '%lab%' 
                 OR COALESCE(v_clinic.name, '') ILIKE '%lab%');
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE v_appt.doctor_id END;
    v_avg_mins := 10;
    BEGIN
        IF v_clinic.description IS NOT NULL AND v_clinic.description ~ '^\s*\{' THEN
            v_avg_mins := COALESCE(NULLIF((v_clinic.description::jsonb ->> 'avg_consultation_time_minutes'), '')::INT, 10);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_avg_mins := 10;
    END;
    IF v_avg_mins <= 0 THEN v_avg_mins := 10; END IF;
    v_avg_seconds := v_avg_mins * 60;

    -- Try running doctor consultation average function if available
    BEGIN
        v_avg_seconds := ROUND(public.queue_avg_seconds(v_appt.clinic_id, v_effective_doc_id))::INT;
        IF v_avg_seconds <= 0 THEN v_avg_seconds := v_avg_mins * 60; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_avg_seconds := v_avg_mins * 60;
    END;

    -- Current patient inside doctor cabin
    SELECT cur.queue_position, COALESCE(cur.inside_at, cur.called_at)
      INTO v_serving, v_inside_at
      FROM public.queue_entries cur
      JOIN public.appointments ca ON ca.id = cur.appointment_id
     WHERE cur.clinic_id = v_appt.clinic_id
       AND (
           (v_is_lab = TRUE AND cur.doctor_id IS NULL)
           OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND cur.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND cur.doctor_id IS NULL)))
       )
       AND ca.appointment_date = v_appt.appointment_date
       AND cur.status::TEXT IN ('inside', 'in_consultation')
     ORDER BY cur.queue_position
     LIMIT 1;

    IF v_inside_at IS NOT NULL THEN
        v_is_inside_anyone := TRUE;
    END IF;

    -- Queue position and ahead count
    SELECT COALESCE(qe.queue_position, 0), COALESCE(qe.status::TEXT, 'waiting')
      INTO v_token, v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;

    IF v_token > 0 THEN
        SELECT COUNT(*)::INT INTO v_ahead
          FROM public.queue_entries ahead
          JOIN public.appointments aa ON aa.id = ahead.appointment_id
         WHERE ahead.clinic_id = v_appt.clinic_id
           AND (
               (v_is_lab = TRUE AND ahead.doctor_id IS NULL)
               OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND ahead.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND ahead.doctor_id IS NULL)))
           )
           AND aa.appointment_date = v_appt.appointment_date
           AND ahead.status::TEXT = 'waiting'
           AND ahead.queue_position < v_token;
    END IF;

    v_wait_mins := v_ahead * (v_avg_seconds / 60);

    -- Formulate human-readable slot notice
    IF v_ahead = 0 THEN
        IF v_status IN ('inside', 'in_consultation') THEN
            v_notice := 'Currently inside consultation cabin';
        ELSE
            v_notice := 'You are next in line! Please proceed near the door.';
        END IF;
    ELSIF v_ahead = 1 AND v_is_inside_anyone THEN
        v_notice := 'Doctor is consulting with a patient • You are up next';
    ELSE
        v_notice := v_ahead || ' patients ahead in live line. Approx wait: ~' || v_wait_mins || ' mins';
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
        COALESCE(v_appt.checkin_status::TEXT, 'waiting')::TEXT,
        v_status::TEXT,
        v_token::INT,
        v_token::INT,
        v_ahead::INT,
        v_serving::INT,
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

-- -------------------------------------------------------------------------
-- PART 3: Invalidate PostgREST Schema Cache
-- -------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
