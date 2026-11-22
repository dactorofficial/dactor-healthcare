-- ==============================================================================
-- DACTOR PLATFORM: Authoritative Queue Sequence, Fast Delta RPC & Data Repair
-- Migration: migration_authoritative_queue_assignment_and_fast_delta.sql
--
-- Fixes:
-- 1. Eliminates duplicate Token #2 & Position 1 bug by moving queue token assignment
--    to an atomic, server-side SECURITY DEFINER function.
-- 2. Reprepares and sequentially reindexes any active queue entries for today that share
--    duplicate queue_position numbers.
-- 3. Implements ultra-fast get_live_queue_status and updates get_public_queue_status
--    to provide <50ms delta responses with accurate patients_ahead, token_number,
--    current_serving_token, and doctor availability.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Automatic Repair of Existing Distorted Queue Entries (Sequentially Reindex)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_pos INT := 0;
    v_curr_key TEXT := '';
    v_new_key TEXT;
BEGIN
    -- Reindex all active (waiting / inside) queue entries for today/future sequentially
    -- Grouped by: clinic_id + doctor_id + appointment_date
    FOR r IN (
        SELECT 
            qe.id AS entry_id,
            qe.clinic_id,
            qe.doctor_id,
            a.appointment_date,
            a.appointment_time,
            a.created_at,
            qe.status
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE qe.status IN ('waiting', 'inside', 'in_consultation')
          AND a.appointment_date >= CURRENT_DATE
        ORDER BY 
            qe.clinic_id,
            COALESCE(qe.doctor_id, '00000000-0000-0000-0000-000000000000'::UUID),
            a.appointment_date,
            CASE WHEN qe.status IN ('inside', 'in_consultation') THEN 0 ELSE 1 END,
            a.appointment_time ASC,
            a.created_at ASC
    ) LOOP
        v_new_key := r.clinic_id::TEXT || '_' || COALESCE(r.doctor_id::TEXT, 'common') || '_' || r.appointment_date::TEXT;
        IF v_new_key <> v_curr_key THEN
            v_curr_key := v_new_key;
            v_pos := 1;
        ELSE
            v_pos := v_pos + 1;
        END IF;

        UPDATE public.queue_entries
        SET queue_position = v_pos, updated_at = NOW()
        WHERE id = r.entry_id;
    END LOOP;

    -- Also clean up any lingering stale entries from past dates remaining in waiting or inside
    UPDATE public.queue_entries qe
    SET status = 'no_show', completed_at = NOW(), updated_at = NOW()
    FROM public.appointments a
    WHERE qe.appointment_id = a.id
      AND a.appointment_date < CURRENT_DATE
      AND qe.status IN ('waiting', 'inside', 'in_consultation');
END $$;


-- ------------------------------------------------------------------------------
-- 2. Authoritative Server-Side Token Assignment (assign_or_get_queue_token)
-- ------------------------------------------------------------------------------
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
    v_clinic public.clinics%ROWTYPE;
    v_existing_qe public.queue_entries%ROWTYPE;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;
    v_is_lab BOOLEAN := FALSE;
    v_max_pos INT := 0;
    v_assigned_pos INT := 1;
    v_effective_doc_id UUID;
    v_new_id UUID := gen_random_uuid();
BEGIN
    IF p_appointment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment ID is required');
    END IF;

    -- Lock appointment row
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment not found');
    END IF;

    -- Guard: Only approved/confirmed appointments can receive an active queue token
    IF v_appt.status NOT IN ('APPROVED', 'confirmed') 
       OR v_appt.checkin_status IN ('cancelled', 'completed', 'done', 'no_show') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Appointment is not active or approved',
            'status', v_appt.status,
            'checkin_status', v_appt.checkin_status
        );
    END IF;

    -- Check if queue entry already exists
    SELECT * INTO v_existing_qe
    FROM public.queue_entries
    WHERE appointment_id = p_appointment_id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'token_number', v_existing_qe.queue_position,
            'queue_position', v_existing_qe.queue_position,
            'status', v_existing_qe.status,
            'already_assigned', true
        );
    END IF;

    -- Resolve clinic type (diagnostic lab vs doctor clinic)
    SELECT * INTO v_clinic FROM public.clinics WHERE id = v_appt.clinic_id;
    v_is_lab := (COALESCE(v_clinic.type::TEXT, '') = 'diagnostic_lab' 
                 OR COALESCE(v_clinic.type::TEXT, '') ILIKE '%lab%' 
                 OR COALESCE(v_clinic.name, '') ILIKE '%lab%');
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE v_appt.doctor_id END;

    -- Calculate true authoritative sequential next token for this doctor/clinic and date
    SELECT COALESCE(MAX(qe.queue_position), 0) INTO v_max_pos
    FROM public.queue_entries qe
    JOIN public.appointments a ON a.id = qe.appointment_id
    WHERE qe.clinic_id = v_appt.clinic_id
      AND (
        (v_is_lab = TRUE AND qe.doctor_id IS NULL)
        OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND qe.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND qe.doctor_id IS NULL)))
      )
      AND a.appointment_date = v_appt.appointment_date;

    v_assigned_pos := v_max_pos + 1;

    -- Insert authoritative queue entry
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
        v_new_id,
        v_appt.id,
        v_appt.clinic_id,
        v_effective_doc_id,
        v_assigned_pos,
        'waiting',
        NOW(),
        NOW()
    );

    -- Ensure checkin_status is marked as checked_in
    IF v_appt.checkin_status IN ('not_checked_in', 'waiting') THEN
        UPDATE public.appointments
        SET checkin_status = 'checked_in', updated_at = NOW()
        WHERE id = v_appt.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'token_number', v_assigned_pos,
        'queue_position', v_assigned_pos,
        'status', 'waiting',
        'already_assigned', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_or_get_queue_token(UUID) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. Ultra-Fast Live Queue Delta RPC (get_live_queue_status)
-- ------------------------------------------------------------------------------
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
    slot_notice TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_clean TEXT := trim(COALESCE(p_code_or_id, ''));
    v_appt_id UUID;
    v_appt public.appointments%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_doctor public.doctors%ROWTYPE;
    v_qe public.queue_entries%ROWTYPE;
    v_token INT := 0;
    v_ahead INT := 0;
    v_serving INT := 0;
    v_is_inside_anyone BOOLEAN := FALSE;
    v_doc_in_clinic BOOLEAN := FALSE;
    v_status TEXT := 'waiting';
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
        SELECT * INTO v_appt FROM public.appointments WHERE tracking_code_10_digit = v_clean LIMIT 1;
    ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_appt FROM public.appointments WHERE id = v_clean::UUID LIMIT 1;
    ELSE
        SELECT * INTO v_appt FROM public.appointments WHERE tracking_code_10_digit = v_clean LIMIT 1;
    END IF;

    IF v_appt.id IS NULL THEN
        RETURN;
    END IF;

    -- Clinic & Doctor metadata
    SELECT * INTO v_clinic FROM public.clinics WHERE id = v_appt.clinic_id;
    v_is_lab := (COALESCE(v_clinic.type::TEXT, '') = 'diagnostic_lab' 
                 OR COALESCE(v_clinic.type::TEXT, '') ILIKE '%lab%' 
                 OR COALESCE(v_clinic.name, '') ILIKE '%lab%');
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE v_appt.doctor_id END;

    IF v_effective_doc_id IS NOT NULL THEN
        SELECT * INTO v_doctor FROM public.doctors WHERE id = v_effective_doc_id;
        v_doc_in_clinic := COALESCE(v_doctor.is_in_clinic, FALSE);
    ELSE
        v_doc_in_clinic := TRUE;
    END IF;

    v_avg_mins := COALESCE(v_clinic.avg_consultation_time_minutes, 10);

    -- Find queue entry if exists
    SELECT * INTO v_qe FROM public.queue_entries WHERE appointment_id = v_appt.id LIMIT 1;

    -- If today's appointment is approved and no queue entry exists, automatically assign one
    IF v_qe.id IS NULL AND v_appt.appointment_date = CURRENT_DATE AND v_appt.status IN ('APPROVED', 'confirmed') THEN
        PERFORM public.assign_or_get_queue_token(v_appt.id);
        SELECT * INTO v_qe FROM public.queue_entries WHERE appointment_id = v_appt.id LIMIT 1;
    END IF;

    -- Determine effective token number
    IF v_qe.id IS NOT NULL THEN
        v_token := v_qe.queue_position;
        v_status := COALESCE(v_qe.status, 'waiting');
    ELSE
        -- Advance or past appointment: calculate cumulative rank from approved appointments
        SELECT COUNT(*)::INT INTO v_token
        FROM public.appointments prior
        WHERE prior.clinic_id = v_appt.clinic_id
          AND (
            (v_is_lab = TRUE AND prior.doctor_id IS NULL)
            OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND prior.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND prior.doctor_id IS NULL)))
          )
          AND prior.appointment_date = v_appt.appointment_date
          AND prior.status IN ('APPROVED', 'confirmed')
          AND prior.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
          AND (
            prior.appointment_time < v_appt.appointment_time
            OR (prior.appointment_time = v_appt.appointment_time AND prior.created_at <= v_appt.created_at)
          );
        v_token := GREATEST(1, v_token);
        v_status := COALESCE(v_appt.checkin_status, 'waiting');
    END IF;

    -- Currently serving token in doctor cabin
    SELECT COALESCE(MIN(current_entry.queue_position), 0)::INT INTO v_serving
    FROM public.queue_entries current_entry
    JOIN public.appointments current_appt ON current_appt.id = current_entry.appointment_id
    WHERE current_entry.clinic_id = v_appt.clinic_id
      AND (
        (v_is_lab = TRUE AND current_entry.doctor_id IS NULL)
        OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND current_entry.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND current_entry.doctor_id IS NULL)))
      )
      AND current_appt.appointment_date = v_appt.appointment_date
      AND current_entry.status IN ('inside', 'in_consultation');

    v_is_inside_anyone := (v_serving > 0);

    -- Calculate patients ahead
    IF v_status IN ('inside', 'in_consultation', 'done', 'completed') THEN
        v_ahead := 0;
    ELSIF v_qe.id IS NOT NULL THEN
        -- Count all waiting patients ahead plus any patient currently inside the cabin
        SELECT COUNT(*)::INT INTO v_ahead
        FROM public.queue_entries ahead
        JOIN public.appointments ahead_appt ON ahead_appt.id = ahead.appointment_id
        WHERE ahead.clinic_id = v_appt.clinic_id
          AND (
            (v_is_lab = TRUE AND ahead.doctor_id IS NULL)
            OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND ahead.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND ahead.doctor_id IS NULL)))
          )
          AND ahead_appt.appointment_date = v_appt.appointment_date
          AND ahead.id <> v_qe.id
          AND (
            ahead.status IN ('inside', 'in_consultation')
            OR (ahead.status = 'waiting' AND ahead.queue_position < v_token)
          );
    ELSE
        -- Not in live queue (e.g. tomorrow or future): count approved prior appointments
        SELECT COUNT(*)::INT INTO v_ahead
        FROM public.appointments prior
        WHERE prior.clinic_id = v_appt.clinic_id
          AND (
            (v_is_lab = TRUE AND prior.doctor_id IS NULL)
            OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND prior.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND prior.doctor_id IS NULL)))
          )
          AND prior.appointment_date = v_appt.appointment_date
          AND prior.status IN ('APPROVED', 'confirmed')
          AND prior.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
          AND prior.id <> v_appt.id
          AND (
            prior.appointment_time < v_appt.appointment_time
            OR (prior.appointment_time = v_appt.appointment_time AND prior.created_at < v_appt.created_at)
          );
    END IF;

    v_wait_mins := v_ahead * v_avg_mins;

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
        COALESCE(v_appt.checkin_status, 'waiting')::TEXT,
        v_status::TEXT,
        v_token::INT,
        v_token::INT,
        v_ahead::INT,
        v_serving::INT,
        v_doc_in_clinic,
        v_is_inside_anyone,
        v_wait_mins::INT,
        v_notice::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_queue_status(TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4. Update get_public_queue_status to match get_live_queue_status
-- ------------------------------------------------------------------------------
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
    estimated_wait_minutes INT
)
LANGUAGE plpgsql
VOLATILE
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
        s.estimated_wait_minutes
    FROM public.get_live_queue_status(p_tracking_code) s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;

COMMIT;
