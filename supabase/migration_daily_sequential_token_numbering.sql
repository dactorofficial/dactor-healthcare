-- ============================================================================
-- DACTOR HEALTHCARE: DAILY SEQUENTIAL TOKEN NUMBERING & FOLLOW-UP ISOLATION
-- Migration: Daily Sequential Token Allocation & Queue Synchronization
-- Version: 2026-11-25
-- ============================================================================

-- 1. ADD TOKEN_NUMBER COLUMN TO APPOINTMENTS
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS token_number INT;

-- Add comment explaining token lifecycle
COMMENT ON COLUMN public.appointments.token_number IS 
'Authoritative daily sequential token number (1, 2, 3...) partitioned by doctor (or clinic for diagnostic labs) and appointment date. Monotonically increases and never resets mid-day. Follow-up visits receive a distinct new token number for their respective visit date.';

-- 2. CREATE PERFORMANCE INDEXES FOR TOKEN QUERIES
CREATE INDEX IF NOT EXISTS idx_appointments_daily_doctor_token 
ON public.appointments (clinic_id, doctor_id, appointment_date, token_number);

CREATE INDEX IF NOT EXISTS idx_appointments_daily_clinic_token 
ON public.appointments (clinic_id, appointment_date, token_number);

-- 3. TRIGGER FUNCTION: ATOMIC DAILY SEQUENTIAL TOKEN ASSIGNMENT
CREATE OR REPLACE FUNCTION public.assign_daily_appointment_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_lab BOOLEAN := FALSE;
    v_max_token INT := 0;
BEGIN
    -- Only assign if token_number is not explicitly provided (> 0)
    IF NEW.token_number IS NULL OR NEW.token_number <= 0 THEN
        -- Check if clinic is a standalone diagnostic lab
        SELECT (
            COALESCE(c.type::TEXT, '') = 'diagnostic_lab' 
            OR COALESCE(c.type::TEXT, '') ILIKE '%lab%'
            OR COALESCE(c.name, '') ILIKE '%lab%'
        )
        INTO v_is_lab
        FROM public.clinics c 
        WHERE c.id = NEW.clinic_id;

        IF v_is_lab THEN
            -- Standalone diagnostic labs have a shared sampling queue per clinic per day
            SELECT COALESCE(MAX(token_number), 0) INTO v_max_token
            FROM public.appointments
            WHERE clinic_id = NEW.clinic_id
              AND appointment_date = NEW.appointment_date;
        ELSE
            -- Doctor clinics / polyclinics sequence tokens per doctor per clinic per day
            -- Note: Follow-up visits (same tracking code, higher attempt_number) automatically
            -- receive a brand new sequential daily token for this visit's date!
            SELECT COALESCE(MAX(token_number), 0) INTO v_max_token
            FROM public.appointments
            WHERE clinic_id = NEW.clinic_id
              AND (
                  (NEW.doctor_id IS NOT NULL AND doctor_id = NEW.doctor_id)
                  OR (NEW.doctor_id IS NULL AND doctor_id IS NULL)
              )
              AND appointment_date = NEW.appointment_date;
        END IF;

        NEW.token_number := v_max_token + 1;
    END IF;

    RETURN NEW;
END;
$$;

-- Attach trigger BEFORE INSERT on public.appointments
DROP TRIGGER IF EXISTS trg_assign_daily_appointment_token ON public.appointments;
CREATE TRIGGER trg_assign_daily_appointment_token
BEFORE INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.assign_daily_appointment_token();

-- 4. HISTORICAL BACKFILL: RE-SEQUENCE ALL PAST APPOINTMENTS
-- Chronologically re-assigns sequential tokens (1, 2, 3...) per doctor/clinic and date
DO $$
DECLARE
    v_count INT := 0;
BEGIN
    WITH ranked AS (
        SELECT 
            a.id,
            ROW_NUMBER() OVER (
                PARTITION BY 
                    a.clinic_id,
                    CASE 
                        WHEN (
                            COALESCE(c.type::TEXT, '') = 'diagnostic_lab' 
                            OR COALESCE(c.type::TEXT, '') ILIKE '%lab%'
                            OR COALESCE(c.name, '') ILIKE '%lab%'
                        ) THEN '00000000-0000-0000-0000-000000000000'::UUID
                        ELSE COALESCE(a.doctor_id, '00000000-0000-0000-0000-000000000000'::UUID)
                    END,
                    a.appointment_date
                ORDER BY 
                    a.appointment_time ASC NULLS LAST,
                    a.created_at ASC NULLS LAST,
                    a.id ASC
            ) AS new_token
        FROM public.appointments a
        LEFT JOIN public.clinics c ON c.id = a.clinic_id
    )
    UPDATE public.appointments appt
    SET token_number = ranked.new_token
    FROM ranked
    WHERE appt.id = ranked.id
      AND (appt.token_number IS NULL OR appt.token_number <= 0);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % historical appointment rows with daily sequential token numbers.', v_count;
END;
$$;

-- 5. UPDATE get_live_queue_status RPC TO RETURN AUTHORITATIVE DAILY TOKEN & SERVING TOKEN
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

    -- Lookup appointment with multi-appointment priority:
    -- 1. Active queue entry today (waiting/inside)
    -- 2. Today's appointment
    -- 3. Upcoming future appointment
    -- 4. Latest past or completed appointment
    IF v_clean ~ '^[0-9]{10}$' THEN
        SELECT * INTO v_appt 
        FROM public.appointments a 
        WHERE a.tracking_code_10_digit = v_clean 
        ORDER BY 
            EXISTS (
                SELECT 1 FROM public.queue_entries qe 
                WHERE qe.appointment_id = a.id AND qe.status IN ('waiting', 'inside')
            ) DESC,
            (a.appointment_date = (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE) DESC,
            (a.appointment_date > (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE) DESC,
            COALESCE(a.attempt_number, 1) DESC,
            a.appointment_date DESC,
            a.created_at DESC
        LIMIT 1;
    ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT * INTO v_appt FROM public.appointments a WHERE a.id = v_clean::UUID LIMIT 1;
    ELSE
        SELECT * INTO v_appt 
        FROM public.appointments a 
        WHERE a.tracking_code_10_digit = v_clean 
        ORDER BY 
            EXISTS (
                SELECT 1 FROM public.queue_entries qe 
                WHERE qe.appointment_id = a.id AND qe.status IN ('waiting', 'inside')
            ) DESC,
            (a.appointment_date = (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE) DESC,
            (a.appointment_date > (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE) DESC,
            COALESCE(a.attempt_number, 1) DESC,
            a.appointment_date DESC,
            a.created_at DESC
        LIMIT 1;
    END IF;

    IF v_appt.id IS NULL THEN
        RETURN;
    END IF;

    -- Clinic details
    SELECT * INTO v_clinic FROM public.clinics c WHERE c.id = v_appt.clinic_id LIMIT 1;
    
    -- Doctor details
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

    -- Average consultation time
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

    BEGIN
        v_avg_seconds := ROUND(public.queue_avg_seconds(v_appt.clinic_id, v_effective_doc_id))::INT;
        IF v_avg_seconds <= 0 THEN v_avg_seconds := v_avg_mins * 60; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_avg_seconds := v_avg_mins * 60;
    END;

    -- Authoritative token number from appointment record
    v_token := COALESCE(v_appt.token_number, 1);

    -- Currently serving patient inside cabin: get their token_number
    SELECT COALESCE(ca.token_number, cur.queue_position), COALESCE(cur.inside_at, cur.called_at)
      INTO v_serving_token, v_inside_at
      FROM public.queue_entries cur
      JOIN public.appointments ca ON ca.id = cur.appointment_id
     WHERE cur.clinic_id = v_appt.clinic_id
       AND (
           (v_is_lab = TRUE AND cur.doctor_id IS NULL)
           OR (v_is_lab = FALSE AND ((v_effective_doc_id IS NOT NULL AND cur.doctor_id = v_effective_doc_id) OR (v_effective_doc_id IS NULL AND cur.doctor_id IS NULL)))
       )
       AND ca.appointment_date = v_appt.appointment_date
       AND cur.status::TEXT IN ('inside', 'in_consultation')
     ORDER BY cur.queue_position ASC
     LIMIT 1;

    IF v_inside_at IS NOT NULL THEN
        v_is_inside_anyone := TRUE;
    END IF;

    -- Queue status & ahead count for this appointment
    SELECT COALESCE(qe.status::TEXT, 'waiting')
      INTO v_status
      FROM public.queue_entries qe
     WHERE qe.appointment_id = v_appt.id
     LIMIT 1;

    -- If appointment or queue entry is done/completed
    IF v_appt.checkin_status = 'completed' OR v_status = 'done' THEN
        v_status := 'completed';
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'Consultation completed. Download your digital prescription & bill.';
    ELSIF v_appt.checkin_status = 'cancelled' OR v_status = 'cancelled' THEN
        v_status := 'cancelled';
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'This appointment visit was cancelled.';
    ELSIF v_status IN ('inside', 'in_consultation') THEN
        v_ahead := 0;
        v_wait_mins := 0;
        v_notice := 'Currently inside consultation cabin with doctor';
    ELSE
        -- Patient is waiting: calculate how many active waiting patients are ahead
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
           AND COALESCE(aa.token_number, ahead.queue_position) < v_token;

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
        COALESCE(v_appt.checkin_status, 'booked')::TEXT,
        v_status::TEXT,
        v_token::INT,
        v_token::INT,
        v_ahead::INT,
        COALESCE(v_serving_token, 0)::INT,
        v_doc_in_clinic,
        v_is_inside_anyone,
        v_wait_mins,
        v_notice,
        v_inside_at,
        v_avg_seconds;
END;
$$;
