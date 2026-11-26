-- ============================================================================
-- Migration: Dynamic First Patient Queue Timing & Past-Slot Forward Clamp
-- Description:
-- 1. If now < slot_start: expected_time = max(slot_start, dynamic_queue_time).
--    (Floor at slot start; e.g., 8:30 AM for 9:00 AM slot remains >= 9:00 AM).
-- 2. If now >= slot_start: expected_time = max(now + lead, dynamic_queue_time).
--    (Never shows a past time; e.g., at 7:00 PM for 6:00 PM slot, shows >= 7:02 PM).
-- 3. Lead buffer:
--    - When doctor is free/idle: +2 minutes (Up next preparation buffer).
--    - When doctor is away / on break overrun: +5 minutes.
--    - When doctor has an active patient inside: inside_patient_end_time.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_live_queue_status(
    p_appointment_id UUID,
    p_patient_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_appt RECORD;
    v_active_token RECORD;
    v_patients_ahead INT := 0;
    v_avg_consult_minutes INT := 10;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lead_minutes INT := 2;
    v_doctor_away BOOLEAN := false;
    v_inside_end TIMESTAMPTZ := NULL;
    v_baseline_start TIMESTAMPTZ;
    v_dynamic_expected TIMESTAMPTZ;
    v_slot_start TIMESTAMPTZ := NULL;
    v_slot_end TIMESTAMPTZ := NULL;
    v_display_time_str TEXT;
    v_display_wait_str TEXT;
    v_result JSONB;
BEGIN
    -- 1. Fetch appointment details
    SELECT
        a.id,
        a.token_number,
        a.doctor_id,
        a.clinic_id,
        a.appointment_date,
        a.appointment_time,
        a.slot_type,
        a.status,
        a.source,
        a.created_at,
        d.avg_consult_time_mins,
        d.is_available,
        d.current_status AS doctor_status
    INTO v_appt
    FROM public.appointments a
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.id = p_appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Appointment not found');
    END IF;

    -- Doctor average consultation time
    IF v_appt.avg_consult_time_mins IS NOT NULL AND v_appt.avg_consult_time_mins > 0 THEN
        v_avg_consult_minutes := v_appt.avg_consult_time_mins;
    END IF;

    -- Check if doctor is away or on break
    IF v_appt.is_available = false OR v_appt.doctor_status IN ('away', 'on_break', 'break') THEN
        v_doctor_away := true;
        v_lead_minutes := 5;
    END IF;

    -- 2. Find currently inside (in-consultation) patient for this doctor
    SELECT
        a.id,
        a.token_number,
        COALESCE(a.consultation_started_at, a.updated_at, v_now) AS started_at
    INTO v_active_token
    FROM public.appointments a
    WHERE a.doctor_id = v_appt.doctor_id
      AND a.appointment_date = v_appt.appointment_date
      AND a.status IN ('in_consultation', 'in_progress', 'serving')
    ORDER BY a.consultation_started_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
        v_inside_end := v_active_token.started_at + (v_avg_consult_minutes || ' minutes')::INTERVAL;
        IF v_inside_end < v_now THEN
            v_inside_end := v_now + INTERVAL '2 minutes';
        END IF;
    END IF;

    -- 3. Calculate patients ahead
    -- For active appointment, count how many waiting appointments have earlier token / slot
    SELECT COUNT(*)
    INTO v_patients_ahead
    FROM public.appointments a
    WHERE a.doctor_id = v_appt.doctor_id
      AND a.appointment_date = v_appt.appointment_date
      AND a.status IN ('confirmed', 'waiting', 'checked_in')
      AND (
          a.token_number < v_appt.token_number
          OR (a.token_number = v_appt.token_number AND a.created_at < v_appt.created_at)
      );

    -- 4. Parse appointment slot start if present
    -- e.g. '06:00 PM - 07:00 PM' or '09:00 AM'
    BEGIN
        IF v_appt.appointment_time IS NOT NULL AND v_appt.appointment_time <> '' THEN
            -- Extract first time portion
            DECLARE
                v_first_time TEXT := split_part(v_appt.appointment_time, '-', 1);
                v_time_clean TEXT := trim(v_first_time);
            BEGIN
                IF v_time_clean ~* '^[0-9]{1,2}:[0-9]{2}\s*(AM|PM)?$' THEN
                    v_slot_start := (v_appt.appointment_date::TEXT || ' ' || v_time_clean)::TIMESTAMPTZ;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_slot_start := NULL;
            END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_slot_start := NULL;
    END;

    -- 5. Baseline dynamic queue time calculation
    IF v_inside_end IS NOT NULL THEN
        v_baseline_start := v_inside_end;
    ELSE
        v_baseline_start := v_now + (v_lead_minutes || ' minutes')::INTERVAL;
    END IF;

    -- Compute raw dynamic queue expected time
    v_dynamic_expected := v_baseline_start + ((v_patients_ahead * v_avg_consult_minutes) || ' minutes')::INTERVAL;

    -- 6. Apply Invariant Timing Rules:
    -- Rule A: Future Slot Floor: If now < slot_start, expected cannot be earlier than slot_start
    IF v_slot_start IS NOT NULL AND v_now < v_slot_start THEN
        IF v_dynamic_expected < v_slot_start THEN
            v_dynamic_expected := v_slot_start;
        END IF;
    -- Rule B: Active/Past Slot Forward Clamp: If now >= slot_start, expected cannot be in the past!
    -- Strictly clamp >= now + lead_minutes (or v_inside_end if an active patient is inside)
    ELSE
        IF v_dynamic_expected < (v_now + (v_lead_minutes || ' minutes')::INTERVAL) THEN
            v_dynamic_expected := v_now + (v_lead_minutes || ' minutes')::INTERVAL;
        END IF;
    END IF;

    -- Format display wait string
    IF v_patients_ahead = 0 THEN
        IF v_doctor_away THEN
            v_display_wait_str := 'Doctor is briefly away (~5 mins)';
        ELSIF v_inside_end IS NOT NULL THEN
            v_display_wait_str := 'Patient inside (~' || GREATEST(1, EXTRACT(EPOCH FROM (v_inside_end - v_now))::INT / 60) || ' mins left)';
        ELSE
            v_display_wait_str := 'Your turn up next (~2 mins)';
        END IF;
    ELSE
        v_display_wait_str := '~' || (v_patients_ahead * v_avg_consult_minutes) || ' mins (' || v_patients_ahead || ' ahead)';
    END IF;

    -- Format display time string in Kathmandu time
    v_display_time_str := to_char(v_dynamic_expected AT TIME ZONE 'Asia/Kathmandu', 'HH12:MI AM');

    v_result := jsonb_build_object(
        'appointment_id', v_appt.id,
        'token_number', v_appt.token_number,
        'status', v_appt.status,
        'patients_ahead', v_patients_ahead,
        'doctor_away', v_doctor_away,
        'active_token', CASE WHEN v_active_token.token_number IS NOT NULL THEN v_active_token.token_number ELSE NULL END,
        'expected_time', v_dynamic_expected,
        'expected_time_str', v_display_time_str,
        'display_wait', v_display_wait_str,
        'slot_start', v_slot_start,
        'is_first_position', (v_patients_ahead = 0),
        'server_time', v_now
    );

    RETURN v_result;
END;
$$;

-- Grant execution to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_live_queue_status(UUID, UUID) TO authenticated, anon;
