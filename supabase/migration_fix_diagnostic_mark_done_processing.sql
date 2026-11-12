-- ============================================================================
-- DACTOR PLATFORM: Diagnostic Mark Done -> Processing Transfer Fix
-- File: supabase/migration_fix_diagnostic_mark_done_processing.sql
-- Description:
--   1. Ensures `queue_status_enum`, `checkin_status_enum`, and `lab_stage_enum`
--      contain all diagnostic workflow values (`sample_collected`, `processing`,
--      `report_prepared`, `prepared`, etc.) so status updates never fail with 22P02.
--   2. Ensures optional timestamp columns (`updated_at`, `completed_at`,
--      `inside_at`, `called_at`) exist on `queue_entries` and `lab_reports`.
--   3. Adds authoritative `transition_diagnostic_to_processing` RPC that
--      atomically moves `appointments`, `queue_entries`, and `lab_reports`
--      into the Processing stage and reindexes the remaining live queue.
--   4. Backfills/heals any existing appointments already in `processing` or
--      `sample_collected` whose `queue_entries.status` remained `waiting`/`inside`.
-- ============================================================================

-- 1. Ensure queue_status_enum has all live & diagnostic workflow labels
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status_enum') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'waiting') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'waiting';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'inside') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'inside';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'done') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'done';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'no_show') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'no_show';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'sample_collected') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'sample_collected';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'processing') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'processing';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'queue_status_enum' AND e.enumlabel = 'report_prepared') THEN
            ALTER TYPE public.queue_status_enum ADD VALUE 'report_prepared';
        END IF;
    END IF;
END $$;

-- 2. Ensure checkin_status_enum has all workflow labels
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checkin_status_enum') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'in_consultation') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'in_consultation';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'completed') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'completed';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'done') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'done';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'no_show') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'no_show';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'sample_collected') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'sample_collected';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'processing') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'processing';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'report_prepared') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'report_prepared';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'cancelled') THEN
            ALTER TYPE public.checkin_status_enum ADD VALUE 'cancelled';
        END IF;
    END IF;
END $$;

-- 3. Ensure lab_stage_enum has all lab report stages
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lab_stage_enum') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'lab_stage_enum' AND e.enumlabel = 'sample_collected') THEN
            ALTER TYPE public.lab_stage_enum ADD VALUE 'sample_collected';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'lab_stage_enum' AND e.enumlabel = 'processing') THEN
            ALTER TYPE public.lab_stage_enum ADD VALUE 'processing';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'lab_stage_enum' AND e.enumlabel = 'prepared') THEN
            ALTER TYPE public.lab_stage_enum ADD VALUE 'prepared';
        END IF;
    END IF;
END $$;

-- 4. Ensure timestamp columns used by web & mobile clients exist
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS inside_at TIMESTAMPTZ;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.lab_reports ADD COLUMN IF NOT EXISTS sample_collected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.lab_reports ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;
ALTER TABLE public.lab_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Atomic RPC to move a diagnostic appointment from Live Queue into Processing
CREATE OR REPLACE FUNCTION public.transition_diagnostic_to_processing(
    p_appointment_id UUID,
    p_queue_entry_id UUID DEFAULT NULL,
    p_test_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_appt public.appointments%ROWTYPE;
    v_qe public.queue_entries%ROWTYPE;
    v_report public.lab_reports%ROWTYPE;
    v_resolved_appt_id UUID;
    v_test_name TEXT;
    v_duration_seconds BIGINT := NULL;
    v_start_ts TIMESTAMPTZ;
BEGIN
    IF p_appointment_id IS NULL AND p_queue_entry_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID or Queue Entry ID is required';
    END IF;

    v_resolved_appt_id := p_appointment_id;
    IF v_resolved_appt_id IS NULL AND p_queue_entry_id IS NOT NULL THEN
        SELECT appointment_id INTO v_resolved_appt_id
        FROM public.queue_entries
        WHERE id = p_queue_entry_id
        LIMIT 1;
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = v_resolved_appt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', COALESCE(v_resolved_appt_id::TEXT, p_queue_entry_id::TEXT);
    END IF;

    -- Authorization: clinic staff, assigned doctor, or admin portal user
    IF NOT (
        public.is_admin_portal_user()
        OR public.is_authorized_clinic_staff(v_appt.clinic_id)
        OR (v_appt.doctor_id IS NOT NULL AND public.is_authorized_doctor(v_appt.doctor_id))
    ) THEN
        RAISE EXCEPTION 'Not authorized to transition appointment % to processing', v_appt.id;
    END IF;

    PERFORM set_config('dactor.authoritative_context', 'true', true);

    -- 1. Update appointment checkin_status -> 'processing'
    UPDATE public.appointments
    SET checkin_status = 'processing'::public.checkin_status_enum,
        updated_at = v_now
    WHERE id = v_appt.id;

    -- 2. Find or create queue_entries row and update status -> 'processing'
    SELECT * INTO v_qe
    FROM public.queue_entries
    WHERE appointment_id = v_appt.id
       OR (p_queue_entry_id IS NOT NULL AND id = p_queue_entry_id)
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_start_ts := COALESCE(v_qe.inside_at, v_qe.called_at);
        IF v_start_ts IS NOT NULL THEN
            v_duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_start_ts))::BIGINT);
        END IF;

        UPDATE public.queue_entries
        SET status = 'processing'::public.queue_status_enum,
            completed_at = COALESCE(completed_at, v_now),
            consultation_duration_seconds = COALESCE(v_duration_seconds, consultation_duration_seconds),
            updated_at = v_now
        WHERE id = v_qe.id
        RETURNING * INTO v_qe;
    ELSE
        IF UPPER(COALESCE(v_appt.status, '')) = 'APPROVED'
           AND COALESCE(v_appt.checkin_status::TEXT, '') <> 'cancelled' THEN
            INSERT INTO public.queue_entries (
                id,
                appointment_id,
                clinic_id,
                doctor_id,
                queue_position,
                status,
                completed_at,
                updated_at
            ) VALUES (
                COALESCE(p_queue_entry_id, gen_random_uuid()),
                v_appt.id,
                v_appt.clinic_id,
                v_appt.doctor_id,
                1,
                'processing'::public.queue_status_enum,
                v_now,
                v_now
            )
            RETURNING * INTO v_qe;
        END IF;
    END IF;

    -- 3. Upsert lab_reports row into 'processing' (without downgrading an already prepared report)
    v_test_name := COALESCE(
        NULLIF(BTRIM(p_test_name), ''),
        NULLIF(BTRIM(v_appt.selected_lab_tests), ''),
        'Diagnostic Lab Analysis'
    );

    SELECT * INTO v_report
    FROM public.lab_reports
    WHERE appointment_id = v_appt.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_report.stage::TEXT <> 'prepared' THEN
            UPDATE public.lab_reports
            SET stage = 'processing'::public.lab_stage_enum,
                test_name = COALESCE(NULLIF(BTRIM(v_test_name), ''), test_name),
                sample_collected_at = COALESCE(sample_collected_at, v_now),
                updated_at = v_now
            WHERE id = v_report.id
            RETURNING * INTO v_report;
        END IF;
    ELSE
        INSERT INTO public.lab_reports (
            id,
            appointment_id,
            clinic_id,
            test_name,
            stage,
            patient_name_verification,
            sample_collected_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.id,
            v_appt.clinic_id,
            v_test_name,
            'processing'::public.lab_stage_enum,
            COALESCE(NULLIF(BTRIM(v_appt.patient_name), ''), 'Patient'),
            v_now,
            v_now
        )
        RETURNING * INTO v_report;
    END IF;

    -- 4. Reindex remaining active (waiting / inside) queue entries for this clinic
    WITH numbered AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY clinic_id, doctor_id
                ORDER BY
                    CASE WHEN status = 'inside' THEN 0 ELSE 1 END,
                    queue_position ASC,
                    created_at ASC
            ) AS new_pos
        FROM public.queue_entries
        WHERE clinic_id = v_appt.clinic_id
          AND status IN ('waiting', 'inside')
    )
    UPDATE public.queue_entries q
    SET queue_position = numbered.new_pos
    FROM numbered
    WHERE q.id = numbered.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'appointment_id', v_appt.id,
        'queue_entry_id', v_qe.id,
        'lab_report_id', v_report.id,
        'status', 'processing',
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_diagnostic_to_processing(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_diagnostic_to_processing(UUID, UUID, TEXT) TO authenticated, service_role;

-- 6. Heal any existing records where appointment or lab_report is already processing/prepared
--    while queue_entries remained in 'waiting' or 'inside'
UPDATE public.queue_entries qe
SET status = 'processing'::public.queue_status_enum,
    completed_at = COALESCE(qe.completed_at, NOW()),
    updated_at = NOW()
FROM public.appointments a
LEFT JOIN public.lab_reports lr ON lr.appointment_id = a.id
WHERE qe.appointment_id = a.id
  AND qe.status IN ('waiting', 'inside')
  AND (
      a.checkin_status::TEXT IN ('processing', 'sample_collected')
      OR lr.stage::TEXT IN ('processing', 'sample_collected')
  );

UPDATE public.queue_entries qe
SET status = 'report_prepared'::public.queue_status_enum,
    completed_at = COALESCE(qe.completed_at, NOW()),
    updated_at = NOW()
FROM public.appointments a
LEFT JOIN public.lab_reports lr ON lr.appointment_id = a.id
WHERE qe.appointment_id = a.id
  AND qe.status IN ('waiting', 'inside', 'processing', 'sample_collected')
  AND (
      a.checkin_status::TEXT = 'report_prepared'
      OR lr.stage::TEXT = 'prepared'
  );
