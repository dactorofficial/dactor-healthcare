-- ==============================================================================
-- Migration: Fix Clinic Type & Diagnostic Lab Classification in Live Queue RPCs
-- File: supabase/migration_fix_queue_clinic_type_detection.sql
--
-- Context:
--   Multi-visit clinics (type = 'multi_visit') and single-visit OPD clinics
--   (type = 'single_visit') that also list Pathology/Radiology departments in
--   their specialties must NEVER be treated as standalone diagnostic labs when
--   tracking doctor OPD consultations.
--   Additionally, anonymous/guest queue RPCs (get_live_queue_status and
--   get_public_queue_status) now return clinic_type and is_lab_appointment so
--   client apps always know the true facility type without exposing patient PII.
-- ==============================================================================

-- 1. Fix public.is_diagnostic_lab_clinic(UUID)
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
    v_type_lower TEXT;
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

    v_type_lower := LOWER(TRIM(COALESCE(v_type, '')));

    IF v_type_lower IN ('diagnostic_lab', 'lab', 'pathology_lab', 'imaging_center')
       OR v_type_lower LIKE '%lab%'
       OR v_type_lower LIKE '%diagnostic%'
       OR v_type_lower LIKE '%patholog%' THEN
        RETURN TRUE;
    END IF;

    -- Explicit OPD / Polyclinic facility types are NOT standalone diagnostic labs
    IF v_type_lower IN ('multi_visit', 'single_visit', 'single_doctor', 'polyclinic', 'opd_clinic', 'opd', 'general_clinic') THEN
        RETURN FALSE;
    END IF;

    -- Fallback heuristic only when clinic.type is unspecified
    IF LOWER(COALESCE(v_name, '')) LIKE '%lab%'
       OR LOWER(COALESCE(v_name, '')) LIKE '%diagnostic%'
       OR LOWER(COALESCE(v_name, '')) LIKE '%patholog%' THEN
        RETURN TRUE;
    END IF;

    IF v_specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(v_specialties) s
        WHERE LOWER(s) LIKE '%lab%'
           OR LOWER(s) LIKE '%patholog%'
           OR LOWER(s) LIKE '%diagnostic%'
           OR LOWER(s) LIKE '%radiolog%'
           OR LOWER(s) LIKE '%scan%'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_diagnostic_lab_clinic(UUID) TO anon, authenticated, service_role;


-- 2. Update public.get_live_queue_status(TEXT) to return clinic_type & is_lab_appointment
DROP FUNCTION IF EXISTS public.get_live_queue_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_live_queue_status(p_code_or_id TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    appointment_id UUID,
    clinic_id UUID,
    clinic_name TEXT,
    clinic_type TEXT,
    is_lab_appointment BOOLEAN,
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
    v_type_lower TEXT := '';
    v_is_lab BOOLEAN := FALSE;
    v_is_lab_appt BOOLEAN := FALSE;
    v_effective_doc_id UUID;
    v_notice TEXT := '';
BEGIN
    IF v_clean = '' THEN
        RETURN;
    END IF;

    -- Lookup appointment by 10-digit tracking code or UUID (prioritize active today, then future, then latest)
    IF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_appt FROM public.appointments a WHERE a.id = v_clean::UUID LIMIT 1;
    ELSE
        SELECT * INTO v_appt
          FROM public.appointments a
         WHERE a.tracking_code_10_digit = v_clean
            OR UPPER(a.tracking_code_10_digit) = UPPER(v_clean)
         ORDER BY
            CASE
                WHEN a.appointment_date = (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE
                     AND COALESCE(a.checkin_status::TEXT, '') NOT IN ('cancelled', 'completed', 'done')
                     AND UPPER(COALESCE(a.status::TEXT, '')) <> 'CANCELLED' THEN 0
                WHEN a.appointment_date > (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE
                     AND COALESCE(a.checkin_status::TEXT, '') <> 'cancelled'
                     AND UPPER(COALESCE(a.status::TEXT, '')) <> 'CANCELLED' THEN 1
                ELSE 2
            END,
            a.appointment_date DESC,
            a.attempt_number DESC NULLS LAST
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

    v_type_lower := LOWER(TRIM(COALESCE(v_clinic.type::TEXT, '')));
    v_is_lab := (
        v_type_lower IN ('diagnostic_lab', 'lab', 'pathology_lab', 'imaging_center')
        OR v_type_lower LIKE '%lab%'
        OR v_type_lower LIKE '%diagnostic%'
        OR v_type_lower LIKE '%patholog%'
        OR (
            v_type_lower NOT IN ('multi_visit', 'single_visit', 'single_doctor', 'polyclinic', 'opd_clinic', 'opd', 'general_clinic')
            AND COALESCE(v_clinic.name, '') ILIKE '%lab%'
        )
    );
    v_is_lab_appt := (
        v_is_lab
        OR NULLIF(TRIM(COALESCE(v_appt.selected_lab_tests, '')), '') IS NOT NULL
        OR LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) IN ('sample_collected', 'processing', 'in_lab', 'prepared', 'report_prepared', 'delivered')
    );
    v_effective_doc_id := CASE WHEN v_is_lab_appt THEN NULL ELSE v_appt.doctor_id END;

    v_avg_mins := 10;
    BEGIN
        IF v_clinic.avg_consultation_time_minutes IS NOT NULL AND v_clinic.avg_consultation_time_minutes > 0 THEN
            v_avg_mins := v_clinic.avg_consultation_time_minutes;
        ELSIF v_clinic.description IS NOT NULL AND v_clinic.description ~ '^\s*\{' THEN
            v_avg_mins := COALESCE(NULLIF((v_clinic.description::jsonb ->> 'avg_consultation_time_minutes'), '')::INT, 10);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_avg_mins := 10;
    END;
    IF v_avg_mins <= 0 THEN v_avg_mins := 10; END IF;
    v_avg_seconds := v_avg_mins * 60;

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
           (v_is_lab_appt = TRUE AND cur.doctor_id IS NULL)
           OR (v_is_lab_appt = FALSE AND ((v_effective_doc_id IS NOT NULL AND cur.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND cur.doctor_id IS NULL)))
       )
       AND ca.appointment_date = v_appt.appointment_date
       AND cur.status::TEXT IN ('inside', 'in_consultation')
     ORDER BY cur.queue_position
     LIMIT 1;

    IF v_inside_at IS NOT NULL THEN
        v_is_inside_anyone := TRUE;
    END IF;

    -- Queue position and status
    SELECT COALESCE(qe.queue_position, 0), COALESCE(qe.status::TEXT, 'waiting')
      INTO v_token, v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;

    -- Re-evaluate lab workflow status from queue_entries if present
    IF LOWER(COALESCE(v_status, '')) IN ('sample_collected', 'processing', 'in_lab', 'prepared', 'report_prepared', 'delivered') THEN
        v_is_lab_appt := TRUE;
    END IF;

    IF v_token > 0 THEN
        SELECT COUNT(*)::INT INTO v_ahead
          FROM public.queue_entries ahead
          JOIN public.appointments aa ON aa.id = ahead.appointment_id
         WHERE ahead.clinic_id = v_appt.clinic_id
           AND (
               (v_is_lab_appt = TRUE AND ahead.doctor_id IS NULL)
               OR (v_is_lab_appt = FALSE AND ((v_effective_doc_id IS NOT NULL AND ahead.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND ahead.doctor_id IS NULL)))
           )
           AND aa.appointment_date = v_appt.appointment_date
           AND ahead.status::TEXT = 'waiting'
           AND ahead.queue_position < v_token;
    END IF;

    v_wait_mins := v_ahead * (v_avg_seconds / 60);

    IF LOWER(COALESCE(v_appt.status::TEXT, '')) = 'cancelled' OR LOWER(COALESCE(v_status, '')) = 'cancelled' THEN
        v_notice := 'This appointment visit was cancelled.';
    ELSIF LOWER(COALESCE(v_status, '')) IN ('done', 'completed') THEN
        v_notice := 'Consultation completed. Download your digital prescription & bill.';
    ELSIF v_ahead = 0 THEN
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
        COALESCE(NULLIF(TRIM(v_clinic.type::TEXT), ''), 'single_visit')::TEXT,
        v_is_lab_appt,
        v_appt.doctor_id,
        COALESCE(v_doctor.full_name, '')::TEXT,
        COALESCE(v_doctor.specialty, '')::TEXT,
        v_appt.appointment_date,
        v_appt.appointment_time,
        COALESCE(v_appt.checkin_status::TEXT, 'waiting')::TEXT,
        COALESCE(v_status, 'waiting')::TEXT,
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


-- 3. Update public.get_public_queue_status(TEXT) to also return clinic_type & is_lab_appointment (zero PII)
DROP FUNCTION IF EXISTS public.get_public_queue_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    clinic_type TEXT,
    is_lab_appointment BOOLEAN,
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
        s.clinic_type,
        s.is_lab_appointment,
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
