-- =============================================================================
-- Migration: Optimized Patient Consultation & Notification Query Pipeline
-- Purpose:
-- 1. Create public.get_patient_consultation_query RPC function that consolidates
--    appointment status, doctor consultation update (in-clinic / cabin), queue status,
--    estimated wait time, and unread notification alerts into one atomic call.
-- 2. Dynamically return query_interval_seconds:
--    - 10 seconds: When a patient has an ongoing appointment on the day of appointment
--    - 7200 seconds (2 hours): When no appointment is scheduled on that day
-- 3. Eliminate unnecessary query requests from Doctor and Clinic portals.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_patient_consultation_query(
    p_patient_id UUID DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_phone TEXT;
    v_appt RECORD;
    v_doctor RECORD;
    v_clinic RECORD;
    v_queue RECORD;
    v_patients_ahead INT := 0;
    v_current_token INT := 0;
    v_est_wait_minutes INT := 0;
    v_est_time_text TEXT := '';
    v_notifs JSONB := '[]'::jsonb;
BEGIN
    v_clean_code := NULLIF(TRIM(COALESCE(p_tracking_code, '')), '');
    v_clean_phone := NULLIF(REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g'), '');
    IF v_clean_phone IS NOT NULL AND LENGTH(v_clean_phone) > 10 THEN
        v_clean_phone := RIGHT(v_clean_phone, 10);
    END IF;

    -- If no patient ID or tracking identifiers provided, return idle 2-hour interval
    IF p_patient_id IS NULL AND v_clean_code IS NULL AND v_clean_phone IS NULL THEN
        RETURN jsonb_build_object(
            'has_patient_id', false,
            'has_active_appointment_today', false,
            'query_interval_seconds', 7200,
            'appointment', NULL,
            'notifications', '[]'::jsonb
        );
    END IF;

    -- 1. Find ongoing appointment scheduled for TODAY (CURRENT_DATE)
    SELECT a.*
    INTO v_appt
    FROM public.appointments a
    WHERE a.appointment_date = CURRENT_DATE
      AND (
          (p_patient_id IS NOT NULL AND a.user_id = p_patient_id)
          OR (v_clean_code IS NOT NULL AND a.tracking_code_10_digit = v_clean_code)
          OR (v_clean_phone IS NOT NULL AND RIGHT(REGEXP_REPLACE(a.patient_mobile, '\D', '', 'g'), 10) = v_clean_phone)
      )
      AND LOWER(COALESCE(a.checkin_status::TEXT, '')) NOT IN ('completed', 'done', 'cancelled', 'rejected', 'noshow', 'no_show')
    ORDER BY a.appointment_time ASC
    LIMIT 1;

    -- If an ongoing appointment exists for today:
    IF v_appt.id IS NOT NULL THEN
        -- Doctor consultation details
        SELECT d.id, d.full_name, d.specialty, COALESCE(d.is_in_clinic, false) AS is_in_clinic
        INTO v_doctor
        FROM public.doctors d
        WHERE d.id = v_appt.doctor_id;

        -- Clinic details
        SELECT c.id, c.name, COALESCE(c.is_open, true) AS is_open, COALESCE(c.break_active, false) AS break_active
        INTO v_clinic
        FROM public.clinics c
        WHERE c.id = v_appt.clinic_id;

        -- Queue Entry details
        SELECT qe.*
        INTO v_queue
        FROM public.queue_entries qe
        WHERE qe.appointment_id = v_appt.id;

        -- Calculate patients ahead in line (status = 'waiting' and queue_position < patient's position)
        IF v_queue.queue_position IS NOT NULL THEN
            SELECT COUNT(*)::INT
            INTO v_patients_ahead
            FROM public.queue_entries qe
            WHERE qe.clinic_id = v_appt.clinic_id
              AND qe.status = 'waiting'
              AND qe.queue_position < v_queue.queue_position;

            -- Current token inside cabin or currently being served
            SELECT COALESCE(
                (SELECT MIN(qe.queue_position)::INT FROM public.queue_entries qe WHERE qe.clinic_id = v_appt.clinic_id AND qe.status = 'inside'),
                (SELECT MIN(qe.queue_position)::INT FROM public.queue_entries qe WHERE qe.clinic_id = v_appt.clinic_id AND qe.status = 'waiting'),
                0
            ) INTO v_current_token;
        END IF;

        -- Estimated wait time calculation (approx 10 minutes per patient ahead)
        IF v_patients_ahead <= 0 THEN
            v_est_wait_minutes := 0;
            v_est_time_text := 'Next in Line / Ready';
        ELSIF v_patients_ahead = 1 THEN
            v_est_wait_minutes := 10;
            v_est_time_text := '~10 mins (1 patient ahead)';
        ELSE
            v_est_wait_minutes := v_patients_ahead * 10;
            v_est_time_text := format('~%s mins (%s patients ahead)', v_est_wait_minutes, v_patients_ahead);
        END IF;

        -- Fetch unread notifications for this user / appointment
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', n.id,
                'user_id', n.user_id,
                'appointment_id', n.appointment_id,
                'title', n.title,
                'message', n.message,
                'type', n.type,
                'target_audience', n.target_audience,
                'is_read', n.is_read,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC
        ), '[]'::jsonb)
        INTO v_notifs
        FROM (
            SELECT *
            FROM public.notifications n
            WHERE (
                (p_patient_id IS NOT NULL AND n.user_id = p_patient_id)
                OR n.appointment_id = v_appt.id
                OR (v_clean_code IS NOT NULL AND (n.message ILIKE '%' || v_clean_code || '%' OR n.title ILIKE '%' || v_clean_code || '%'))
                OR n.target_audience IN ('all', 'all_users', 'public')
            )
            ORDER BY n.created_at DESC
            LIMIT 20
        ) n;

        -- Return 10-second interval response with active consultation updates
        RETURN jsonb_build_object(
            'has_patient_id', p_patient_id IS NOT NULL,
            'has_active_appointment_today', true,
            'query_interval_seconds', 10,
            'appointment', jsonb_build_object(
                'id', v_appt.id,
                'tracking_code', v_appt.tracking_code_10_digit,
                'clinic_id', v_appt.clinic_id,
                'clinic_name', COALESCE(v_clinic.name, ''),
                'clinic_is_open', COALESCE(v_clinic.is_open, true),
                'clinic_break_active', COALESCE(v_clinic.break_active, false),
                'doctor_id', v_appt.doctor_id,
                'doctor_name', COALESCE(v_doctor.full_name, 'Doctor'),
                'doctor_specialty', COALESCE(v_doctor.specialty, ''),
                'doctor_is_in_clinic', COALESCE(v_doctor.is_in_clinic, false),
                'appointment_date', v_appt.appointment_date,
                'appointment_time', v_appt.appointment_time,
                'checkin_status', v_appt.checkin_status,
                'queue_status', COALESCE(v_queue.status::TEXT, 'waiting'),
                'queue_position', COALESCE(v_queue.queue_position, 0),
                'patients_ahead', v_patients_ahead,
                'current_queue_token', v_current_token,
                'estimated_wait_minutes', v_est_wait_minutes,
                'estimated_time_text', v_est_time_text
            ),
            'notifications', v_notifs
        );
    END IF;

    -- 2. Otherwise (No ongoing appointment today):
    -- Fetch general broadcast notifications / announcements
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', n.id,
            'user_id', n.user_id,
            'appointment_id', n.appointment_id,
            'title', n.title,
            'message', n.message,
            'type', n.type,
            'target_audience', n.target_audience,
            'is_read', n.is_read,
            'created_at', n.created_at
        ) ORDER BY n.created_at DESC
    ), '[]'::jsonb)
    INTO v_notifs
    FROM (
        SELECT *
        FROM public.notifications n
        WHERE (
            (p_patient_id IS NOT NULL AND n.user_id = p_patient_id)
            OR n.target_audience IN ('all', 'all_users', 'public')
        )
        ORDER BY n.created_at DESC
        LIMIT 10
    ) n;

    -- Return 2-hour interval response (7200 seconds)
    RETURN jsonb_build_object(
        'has_patient_id', p_patient_id IS NOT NULL,
        'has_active_appointment_today', false,
        'query_interval_seconds', 7200,
        'appointment', NULL,
        'notifications', v_notifs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_patient_consultation_query(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
