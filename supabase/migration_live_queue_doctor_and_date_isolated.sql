-- Migration: Live Queue Doctor and Date Isolated Status
-- Ensures get_public_queue_status RPC calculates patients ahead strictly for the specific doctor and specific date only.

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
SET search_path = public, private
AS $$
BEGIN
    IF COALESCE(p_tracking_code, '') !~ '^[0-9]{10}$' THEN
        RETURN;
    END IF;

    -- Apply rate limit if private schema rate limiter exists
    BEGIN
        IF NOT private.consume_tracking_rate_limit('public-queue', p_tracking_code, 60, 300) THEN
            RETURN;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Continue if rate limiting helper is unavailable in local/test environments
    END;

    RETURN QUERY
    SELECT
        a.tracking_code_10_digit::TEXT,
        a.clinic_id,
        c.name::TEXT,
        a.doctor_id,
        d.full_name::TEXT,
        d.specialty::TEXT,
        a.appointment_date,
        a.appointment_time,
        a.checkin_status::TEXT,
        COALESCE(qe.status::TEXT, 'waiting')::TEXT,
        COALESCE(qe.queue_position, 0)::INT,
        -- Patients ahead strictly for this specific doctor and specific date only
        CASE 
            WHEN qe.queue_position IS NOT NULL THEN (
                SELECT COUNT(*)::INT
                FROM public.queue_entries ahead
                JOIN public.appointments ahead_appt ON ahead_appt.id = ahead.appointment_id
                WHERE ahead.clinic_id = a.clinic_id
                  AND (
                    (a.doctor_id IS NOT NULL AND ahead.doctor_id = a.doctor_id)
                    OR (a.doctor_id IS NULL AND ahead.doctor_id IS NULL)
                  )
                  AND ahead_appt.appointment_date = a.appointment_date
                  AND ahead.status = 'waiting'
                  AND ahead.queue_position < qe.queue_position
            )
            ELSE (
                SELECT COUNT(*)::INT
                FROM public.appointments prior_appt
                WHERE prior_appt.clinic_id = a.clinic_id
                  AND (
                    (a.doctor_id IS NOT NULL AND prior_appt.doctor_id = a.doctor_id)
                    OR (a.doctor_id IS NULL AND prior_appt.doctor_id IS NULL)
                  )
                  AND prior_appt.appointment_date = a.appointment_date
                  AND prior_appt.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
                  AND prior_appt.status IN ('APPROVED', 'confirmed')
                  AND prior_appt.id != a.id
                  AND (
                    prior_appt.appointment_time < a.appointment_time
                    OR (prior_appt.appointment_time = a.appointment_time AND prior_appt.created_at < a.created_at)
                  )
            )
        END,
        -- Currently serving token strictly for this doctor cabin and specific date
        COALESCE((
            SELECT MIN(current_entry.queue_position)::INT
            FROM public.queue_entries current_entry
            JOIN public.appointments current_appt ON current_appt.id = current_entry.appointment_id
            WHERE current_entry.clinic_id = a.clinic_id
              AND (
                (a.doctor_id IS NOT NULL AND current_entry.doctor_id = a.doctor_id)
                OR (a.doctor_id IS NULL AND current_entry.doctor_id IS NULL)
              )
              AND current_appt.appointment_date = a.appointment_date
              AND current_entry.status IN ('inside', 'in_consultation')
        ), 0)::INT,
        COALESCE(d.is_in_clinic, FALSE),
        (
            CASE 
                WHEN qe.queue_position IS NOT NULL THEN (
                    SELECT COUNT(*)::INT
                    FROM public.queue_entries ahead
                    JOIN public.appointments ahead_appt ON ahead_appt.id = ahead.appointment_id
                    WHERE ahead.clinic_id = a.clinic_id
                      AND (
                        (a.doctor_id IS NOT NULL AND ahead.doctor_id = a.doctor_id)
                        OR (a.doctor_id IS NULL AND ahead.doctor_id IS NULL)
                      )
                      AND ahead_appt.appointment_date = a.appointment_date
                      AND ahead.status = 'waiting'
                      AND ahead.queue_position < qe.queue_position
                )
                ELSE (
                    SELECT COUNT(*)::INT
                    FROM public.appointments prior_appt
                    WHERE prior_appt.clinic_id = a.clinic_id
                      AND (
                        (a.doctor_id IS NOT NULL AND prior_appt.doctor_id = a.doctor_id)
                        OR (a.doctor_id IS NULL AND prior_appt.doctor_id IS NULL)
                      )
                      AND prior_appt.appointment_date = a.appointment_date
                      AND prior_appt.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
                      AND prior_appt.status IN ('APPROVED', 'confirmed')
                      AND prior_appt.id != a.id
                      AND (
                        prior_appt.appointment_time < a.appointment_time
                        OR (prior_appt.appointment_time = a.appointment_time AND prior_appt.created_at < a.created_at)
                      )
                )
            END
        ) * COALESCE(c.avg_consultation_time_minutes, 10)::INT
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    LEFT JOIN public.queue_entries qe ON qe.appointment_id = a.id
    WHERE a.tracking_code_10_digit = p_tracking_code
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;
