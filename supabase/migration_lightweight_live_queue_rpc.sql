-- ====================================================================
-- DACTOR PLATFORM: LIGHTWEIGHT HIGH-SPEED LIVE QUEUE RPC
-- ====================================================================
-- Replaces client-side scatter-gather multi-table joins (6-7 queries per tick)
-- with a single indexed atomic SQL function returning pre-joined live queue items.
-- Eliminates client-side auto-enrollment loops, sequential inserts, and rogue sweeps.
-- ====================================================================

-- 1. Create Indexes on queue_entries and appointments for fast lookups
CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_doctor_date
ON public.queue_entries (clinic_id, doctor_id, status, queue_position);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_doc_date_status
ON public.appointments (clinic_id, doctor_id, appointment_date, status, checkin_status);

-- 2. Fast Doctor Live Queue RPC
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(
    p_doctor_id UUID,
    p_clinic_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
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
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Purge rogue/cancelled/rescheduled queue entries directly in DB (sub-2ms)
    DELETE FROM public.queue_entries qe
    USING public.appointments a
    WHERE qe.appointment_id = a.id
      AND qe.clinic_id = p_clinic_id
      AND (p_doctor_id IS NULL OR qe.doctor_id = p_doctor_id)
      AND (
          a.status != 'APPROVED'
          OR a.checkin_status = 'cancelled'
          OR (a.appointment_date IS NOT NULL AND a.appointment_date != p_date)
      );

    -- 2. Fast server-side auto-enrollment for today's newly approved appointments
    IF p_date = CURRENT_DATE THEN
        INSERT INTO public.queue_entries (id, appointment_id, clinic_id, doctor_id, queue_position, status)
        SELECT
            gen_random_uuid(),
            a.id,
            a.clinic_id,
            a.doctor_id,
            (COALESCE((
                SELECT MAX(qe_sub.queue_position)
                FROM public.queue_entries qe_sub
                WHERE qe_sub.clinic_id = a.clinic_id
                  AND (qe_sub.doctor_id = a.doctor_id OR (a.doctor_id IS NULL AND qe_sub.doctor_id IS NULL))
            ), 0) + ROW_NUMBER() OVER (ORDER BY a.appointment_time, a.created_at, a.id))::INT,
            'waiting'
        FROM public.appointments a
        WHERE a.clinic_id = p_clinic_id
          AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
          AND a.appointment_date = p_date
          AND a.status = 'APPROVED'
          AND a.checkin_status NOT IN ('completed', 'done', 'cancelled', 'no_show', 'processing', 'sample_collected', 'report_prepared')
          AND NOT EXISTS (
              SELECT 1 FROM public.queue_entries qe WHERE qe.appointment_id = a.id
          );
    END IF;

    -- 3. Return unified pre-joined queue entries
    RETURN QUERY
    SELECT
        qe.id::TEXT AS id,
        qe.appointment_id::TEXT AS appointment_id,
        qe.clinic_id::TEXT AS clinic_id,
        qe.doctor_id::TEXT AS doctor_id,
        COALESCE(d.full_name, '')::TEXT AS doctor_name,
        qe.queue_position::INT AS queue_position,
        CASE
            WHEN qe.status IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status, '')) IN ('completed', 'done') THEN 'done'
            WHEN qe.status IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status, '')) = 'processing' THEN 'processing'
            WHEN qe.status IN ('waiting', 'inside') AND LOWER(COALESCE(a.checkin_status, '')) = 'sample_collected' THEN 'sample_collected'
            WHEN qe.status IN ('waiting', 'inside', 'processing') AND LOWER(COALESCE(a.checkin_status, '')) = 'report_prepared' THEN 'report_prepared'
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
        COALESCE(a.payment_status, 'pending')::TEXT AS payment_status,
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
      AND (p_doctor_id IS NULL OR qe.doctor_id = p_doctor_id)
      AND a.appointment_date = p_date
      AND a.status = 'APPROVED'
      AND a.checkin_status != 'cancelled'
    ORDER BY
        CASE WHEN qe.status = 'inside' THEN 0 ELSE 1 END,
        CASE WHEN qe.queue_position > 0 THEN qe.queue_position ELSE 9999 END,
        a.appointment_time,
        a.created_at,
        qe.id;
END;
$$;

-- 3. Fast Clinic Live Queue RPC (Facility-wide or Diagnostic Lab)
CREATE OR REPLACE FUNCTION public.get_clinic_live_queue(
    p_clinic_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
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
VOLATILE
SECURITY DEFINER
SET search_path = public
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
