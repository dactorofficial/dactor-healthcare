-- =========================================================================
-- DACTOR PLATFORM: Joined Follow-Up, No-Show Reschedule & Combined Billing Fix
-- File: supabase/migration_joined_followup_noshow_combined_billing_fix.sql
--
-- Fixes:
-- 1. Ensures queue_entries(appointment_id) has a unique index so ON CONFLICT
--    in reschedule_patient_appointment & book_follow_up_visit never fails (42P10).
-- 2. Updates prevent_appointment_tampering() to honor dactor.authoritative_context
--    and permit free follow-ups (attempt_number > 1, fee = 0, mode = 'FREE').
-- 3. Upgrades reschedule_patient_appointment to support no_show rescheduling,
--    en-dash/12h time normalization, and clinic-staff p_allow_overbook.
-- 4. Upgrades book_follow_up_visit to support both Patient App & Clinic App
--    (walk-in/directory/chart), sharing tracking_code_10_digit, setting
--    payment_mode = 'FREE' & payment_status = 'pending' (never auto-200-paid).
-- 5. Adds billing_invoices.tracking_code_10_digit auto-sync trigger and
--    get_combined_billing_by_tracking_code RPC for unified multi-visit billing.
-- 6. Repairs untouched historical follow-ups incorrectly marked paid.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: Enums, Columns, Unique Indexes & billing_invoices Sync Trigger
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'completed') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'completed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'in_consultation') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'in_consultation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'done') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'done';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'not_checked_in') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'not_checked_in';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'checked_in') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'checked_in';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'cancelled') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'cancelled';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'no_show') THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'no_show';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'pending') THEN
        ALTER TYPE public.payment_status_enum ADD VALUE 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'paid') THEN
        ALTER TYPE public.payment_status_enum ADD VALUE 'paid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'partial') THEN
        ALTER TYPE public.payment_status_enum ADD VALUE 'partial';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'unpaid') THEN
        ALTER TYPE public.payment_status_enum ADD VALUE 'unpaid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'not_required') THEN
        ALTER TYPE public.payment_status_enum ADD VALUE 'not_required';
    END IF;
END $$;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS visit_type TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_of_appointment_id UUID,
    ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

-- Drop any standalone unique constraint/index on tracking_code_10_digit alone
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
    END LOOP;

    FOR r IN (
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'appointments'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(tracking_code_10_digit)%'
          AND indexdef NOT ILIKE '%attempt_number%'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.indexname) || ' CASCADE';
    END LOOP;
END $$;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_attempt_number;
ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_attempt_number CHECK (attempt_number >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tracking_code_attempt
    ON public.appointments (tracking_code_10_digit, attempt_number);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date
    ON public.appointments (tracking_code_10_digit, appointment_date);

-- Deduplicate queue_entries before ensuring UNIQUE index on (appointment_id)
WITH dup_q AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY appointment_id
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.queue_entries
    WHERE appointment_id IS NOT NULL
)
DELETE FROM public.queue_entries q
USING dup_q
WHERE q.id = dup_q.id AND dup_q.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_appointment_id_unique
    ON public.queue_entries (appointment_id);

-- Ensure billing_invoices.tracking_code_10_digit exists and stays synced
ALTER TABLE public.billing_invoices
    ADD COLUMN IF NOT EXISTS tracking_code_10_digit VARCHAR(10);

UPDATE public.billing_invoices bi
SET tracking_code_10_digit = a.tracking_code_10_digit
FROM public.appointments a
WHERE bi.appointment_id = a.id
  AND (bi.tracking_code_10_digit IS NULL OR TRIM(bi.tracking_code_10_digit) = '');

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tracking_code
    ON public.billing_invoices (tracking_code_10_digit);

CREATE OR REPLACE FUNCTION public.trg_sync_billing_invoice_tracking_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (NEW.tracking_code_10_digit IS NULL OR TRIM(NEW.tracking_code_10_digit) = '')
       AND NEW.appointment_id IS NOT NULL THEN
        SELECT a.tracking_code_10_digit INTO NEW.tracking_code_10_digit
        FROM public.appointments a
        WHERE a.id = NEW.appointment_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_invoices_a_sync_tracking_code ON public.billing_invoices;
CREATE TRIGGER billing_invoices_a_sync_tracking_code
    BEFORE INSERT OR UPDATE ON public.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_billing_invoice_tracking_code();

-- -------------------------------------------------------------------------
-- STEP 2: Fix prevent_appointment_tampering() Trigger
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_appointment_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_doc_fee NUMERIC(10, 2);
BEGIN
    -- Authoritative SECURITY DEFINER RPCs are already validated
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow service_role, administrative portal users, or authorized clinic staff
    IF (auth.jwt() ->> 'role') = 'service_role'
       OR public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(NEW.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Allow free follow-up appointments joined onto an existing tracking code
    IF COALESCE(NEW.attempt_number, 1) > 1
       AND COALESCE(NEW.fee_amount, 0.00) = 0.00
       AND UPPER(COALESCE(NEW.payment_mode, '')) = 'FREE'
       AND COALESCE(NEW.checkin_status::TEXT, 'not_checked_in') <> 'completed' THEN
        NEW.total_amount := 0.00;
        NEW.service_charge_amount := 0.00;
        RETURN NEW;
    END IF;

    IF NEW.payment_status IS NOT NULL AND NEW.payment_status::TEXT = 'paid' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign paid payment_status. Use create_patient_appointment RPC.';
    END IF;

    IF NEW.checkin_status IS NOT NULL AND NEW.checkin_status::TEXT = 'checked_in' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign checked_in status. Use create_patient_appointment RPC.';
    END IF;

    SELECT consultation_fee INTO v_doc_fee
    FROM public.doctors WHERE id = NEW.doctor_id;
    IF v_doc_fee IS NULL THEN
        v_doc_fee := 0.00;
    END IF;

    IF v_doc_fee > 0.00 AND NEW.fee_amount IS NOT NULL AND NEW.fee_amount <> v_doc_fee THEN
        RAISE EXCEPTION 'Appointment tampering detected: client fee_amount (%) does not match doctor consultation fee (%). Use create_patient_appointment RPC.', NEW.fee_amount, v_doc_fee;
    END IF;

    NEW.payment_status := 'pending';
    NEW.checkin_status := 'not_checked_in';
    NEW.is_walkin := FALSE;
    IF v_doc_fee > 0.00 THEN
        NEW.fee_amount := v_doc_fee;
    END IF;

    IF NEW.payment_mode = 'PAY_AT_DESK' THEN
        NEW.service_charge_amount := round(COALESCE(NEW.fee_amount, 0.00) * 0.05, 2);
        NEW.total_amount := COALESCE(NEW.fee_amount, 0.00) + NEW.service_charge_amount;
        NEW.status := 'WAITING_FOR_APPROVAL';
    ELSE
        NEW.service_charge_amount := 0.00;
        NEW.total_amount := COALESCE(NEW.fee_amount, 0.00);
        NEW.status := 'pending_payment';
    END IF;

    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- STEP 3: Upgrade reschedule_patient_appointment (Supports no_show & overbook)
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.reschedule_patient_appointment(
    p_appointment_id UUID,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_new_slot_id UUID DEFAULT NULL,
    p_new_doctor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_allow_overbook BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_old_slot_id UUID;
    v_target_slot_id UUID;
    v_target_doctor_id UUID;
    v_target_status TEXT;
    v_next_pos INT;
    v_clean_time VARCHAR;
    v_time_first_part TEXT;
    v_parsed_time TIME;
    v_slot_active_count INT;
    v_checkin_lower TEXT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment ID cannot be null');
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Appointment ' || p_appointment_id || ' not found');
    END IF;

    v_checkin_lower := LOWER(COALESCE(v_appt.checkin_status::TEXT, ''));
    -- Only completed/done/finished consultations are locked; no_show, cancelled, waiting, etc. can be rescheduled
    IF v_checkin_lower IN ('completed', 'done', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Completed appointments cannot be rescheduled. Book a follow-up visit instead.');
    END IF;

    v_old_slot_id := v_appt.slot_id;
    v_target_slot_id := COALESCE(p_new_slot_id, v_appt.slot_id);
    v_target_doctor_id := COALESCE(p_new_doctor_id, v_appt.doctor_id);

    v_target_status := CASE
        WHEN UPPER(COALESCE(v_appt.status, '')) = 'WAITING_FOR_APPROVAL' THEN 'WAITING_FOR_APPROVAL'
        ELSE 'APPROVED'
    END;

    -- Normalize hyphen, en-dash, em-dash, and 12h/24h formats safely
    v_clean_time := REPLACE(REPLACE(TRIM(COALESCE(p_new_time, '')), '–', '-'), '—', '-');
    v_time_first_part := TRIM(SPLIT_PART(v_clean_time, '-', 1));
    BEGIN
        IF v_time_first_part <> '' THEN
            v_parsed_time := v_time_first_part::TIME;
        ELSE
            v_parsed_time := v_appt.appointment_time;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_parsed_time := COALESCE(v_appt.appointment_time, '09:00:00'::TIME);
    END;

    -- Validate target slot capacity unless clinic explicitly allows overbooking
    IF p_new_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM public.slots
        WHERE id = p_new_slot_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_parsed_time IS NULL AND v_slot.start_time IS NOT NULL THEN
                v_parsed_time := v_slot.start_time;
            END IF;

            IF NOT COALESCE(p_allow_overbook, FALSE) AND v_old_slot_id IS DISTINCT FROM p_new_slot_id THEN
                SELECT COUNT(*) INTO v_slot_active_count
                FROM public.appointments a
                WHERE a.slot_id = p_new_slot_id
                  AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
                  AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED');

                IF v_slot_active_count >= COALESCE(v_slot.max_capacity, 10) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Selected slot is already full');
                END IF;
            END IF;
        END IF;
    END IF;

    -- Reschedule in-place while strictly preserving existing fees, payment_status, and billing_invoices
    UPDATE public.appointments
    SET appointment_date = p_new_date,
        appointment_time = COALESCE(v_parsed_time, appointment_time),
        slot_id = v_target_slot_id,
        doctor_id = v_target_doctor_id,
        status = v_target_status,
        checkin_status = 'not_checked_in',
        cancelled_at = NULL,
        cancellation_reason = NULL,
        consultation_completed_at = NULL,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Re-enroll into queue_entries for approved appointments (both today & upcoming dates)
    IF v_target_status <> 'WAITING_FOR_APPROVAL' THEN
        SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO v_next_pos
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE qe.clinic_id = v_appt.clinic_id
          AND a.appointment_date = p_new_date
          AND qe.status IN ('waiting', 'inside')
          AND (v_target_doctor_id IS NULL OR qe.doctor_id = v_target_doctor_id OR qe.doctor_id IS NULL);

        INSERT INTO public.queue_entries (
            id, appointment_id, clinic_id, doctor_id,
            queue_position, estimated_wait_minutes, status,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_appointment_id, v_appt.clinic_id, v_target_doctor_id,
            v_next_pos, GREATEST(0, (v_next_pos - 1) * 15), 'waiting',
            NOW(), NOW()
        )
        ON CONFLICT (appointment_id) DO UPDATE
        SET clinic_id = EXCLUDED.clinic_id,
            doctor_id = EXCLUDED.doctor_id,
            queue_position = EXCLUDED.queue_position,
            estimated_wait_minutes = EXCLUDED.estimated_wait_minutes,
            status = 'waiting',
            called_at = NULL,
            inside_at = NULL,
            completed_at = NULL,
            updated_at = NOW();
    ELSE
        DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;
    END IF;

    IF v_old_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
              AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED')
        )
        WHERE s.id = v_old_slot_id;
    END IF;

    IF v_target_slot_id IS NOT NULL AND v_target_slot_id IS DISTINCT FROM v_old_slot_id THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
              AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED')
        )
        WHERE s.id = v_target_slot_id;
    END IF;

    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'Appointment Rescheduled',
            'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' rescheduled appointment #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' to ' || p_new_date || ' at ' || COALESCE(v_parsed_time::TEXT, v_clean_time) ||
                CASE WHEN NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NOT NULL THEN ' (' || TRIM(p_reason) || ')' ELSE '' END || '.',
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Appointment rescheduled successfully',
        'appointment_id', p_appointment_id,
        'date', p_new_date,
        'time', COALESCE(v_parsed_time::TEXT, v_clean_time),
        'status', v_target_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- STEP 4: Upgrade book_follow_up_visit (Supports Patient App + Clinic App/Walk-In)
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.book_follow_up_visit(VARCHAR, DATE, VARCHAR, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.book_follow_up_visit(VARCHAR, DATE, VARCHAR, UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.book_follow_up_visit(
    p_source_tracking_code VARCHAR,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_new_slot_id UUID DEFAULT NULL,
    p_new_doctor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_is_walkin BOOLEAN DEFAULT FALSE,
    p_checkin_status TEXT DEFAULT 'not_checked_in',
    p_payment_mode TEXT DEFAULT 'FREE',
    p_allow_overbook BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_source public.appointments%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_new_id UUID := gen_random_uuid();
    v_next_attempt INT;
    v_clean_time VARCHAR;
    v_time_first_part TEXT;
    v_parsed_time TIME;
    v_target_doctor_id UUID;
    v_target_slot_id UUID;
    v_next_pos INT;
    v_slot_active_count INT;
    v_target_checkin checkin_status_enum;
    v_new_appt public.appointments%ROWTYPE;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_source_tracking_code IS NULL OR TRIM(p_source_tracking_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source tracking code / Appointment ID cannot be empty');
    END IF;

    SELECT * INTO v_source
    FROM public.appointments
    WHERE tracking_code_10_digit = TRIM(p_source_tracking_code)
    ORDER BY COALESCE(attempt_number, 1) DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Previous appointment not found for ID ' || p_source_tracking_code);
    END IF;

    SELECT * INTO v_clinic FROM public.clinics WHERE id = v_source.clinic_id LIMIT 1;
    IF LOWER(COALESCE(v_clinic.type, '')) IN ('diagnostic_lab', 'lab', 'pathology', 'diagnostic')
       OR (v_source.selected_lab_tests IS NOT NULL AND TRIM(v_source.selected_lab_tests) <> '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Diagnostic lab tests are one-time visits and do not support follow-ups.');
    END IF;

    v_target_doctor_id := COALESCE(p_new_doctor_id, v_source.doctor_id);
    v_target_slot_id := COALESCE(p_new_slot_id, v_source.slot_id);

    SELECT COALESCE(MAX(attempt_number), 1) + 1 INTO v_next_attempt
    FROM public.appointments
    WHERE tracking_code_10_digit = v_source.tracking_code_10_digit;

    v_clean_time := REPLACE(REPLACE(TRIM(COALESCE(p_new_time, '')), '–', '-'), '—', '-');
    v_time_first_part := TRIM(SPLIT_PART(v_clean_time, '-', 1));
    BEGIN
        IF v_time_first_part <> '' THEN
            v_parsed_time := v_time_first_part::TIME;
        ELSE
            v_parsed_time := v_source.appointment_time;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_parsed_time := COALESCE(v_source.appointment_time, '09:00:00'::TIME);
    END;

    IF p_new_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM public.slots
        WHERE id = p_new_slot_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_parsed_time IS NULL AND v_slot.start_time IS NOT NULL THEN
                v_parsed_time := v_slot.start_time;
            END IF;

            IF NOT COALESCE(p_allow_overbook, FALSE) THEN
                SELECT COUNT(*) INTO v_slot_active_count
                FROM public.appointments a
                WHERE a.slot_id = p_new_slot_id
                  AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
                  AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED');

                IF v_slot_active_count >= COALESCE(v_slot.max_capacity, 10) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Selected slot is already full');
                END IF;
            END IF;
        END IF;
    END IF;

    v_target_checkin := CASE
        WHEN LOWER(COALESCE(p_checkin_status, '')) = 'checked_in' THEN 'checked_in'::checkin_status_enum
        ELSE 'not_checked_in'::checkin_status_enum
    END;

    -- Insert follow-up visit sharing exact same tracking_code_10_digit.
    -- IMPORTANT: Untouched free follow-ups start with payment_status = 'pending',
    -- payment_mode = 'FREE', fee_amount = 0, total_amount = 0 so they are NEVER
    -- auto-marked as '200 paid' when no clinic bill/payment was recorded.
    INSERT INTO public.appointments (
        id,
        tracking_code_10_digit,
        slot_id,
        clinic_id,
        doctor_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        patient_email,
        payment_status,
        checkin_status,
        status,
        fee_amount,
        total_amount,
        service_charge_amount,
        payment_mode,
        is_walkin,
        visit_type,
        follow_up_of_appointment_id,
        appointment_date,
        appointment_time,
        attempt_number,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        v_source.tracking_code_10_digit,
        v_target_slot_id,
        v_source.clinic_id,
        v_target_doctor_id,
        v_source.user_id,
        v_source.patient_name,
        v_source.patient_age,
        v_source.patient_gender,
        v_source.patient_mobile,
        v_source.patient_email,
        'pending',
        v_target_checkin,
        'APPROVED',
        0.00,
        0.00,
        0.00,
        COALESCE(NULLIF(TRIM(p_payment_mode), ''), 'FREE'),
        COALESCE(p_is_walkin, FALSE),
        'follow_up',
        v_source.id,
        p_new_date,
        v_parsed_time,
        v_next_attempt,
        COALESCE(NULLIF(TRIM(p_reason), ''), 'Follow-Up Visit #' || v_next_attempt || ' (Ref: #' || v_source.tracking_code_10_digit || ')'),
        NOW(),
        NOW()
    ) RETURNING * INTO v_new_appt;

    SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO v_next_pos
    FROM public.queue_entries qe
    JOIN public.appointments a ON a.id = qe.appointment_id
    WHERE qe.clinic_id = v_source.clinic_id
      AND a.appointment_date = p_new_date
      AND qe.status IN ('waiting', 'inside')
      AND (v_target_doctor_id IS NULL OR qe.doctor_id = v_target_doctor_id OR qe.doctor_id IS NULL);

    INSERT INTO public.queue_entries (
        id, appointment_id, clinic_id, doctor_id,
        queue_position, estimated_wait_minutes, status,
        created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_new_id, v_source.clinic_id, v_target_doctor_id,
        v_next_pos, GREATEST(0, (v_next_pos - 1) * 15), 'waiting',
        NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET queue_position = EXCLUDED.queue_position,
        status = 'waiting',
        updated_at = NOW();

    IF v_target_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND COALESCE(a.checkin_status::TEXT, 'not_checked_in') NOT IN ('cancelled', 'no_show')
              AND COALESCE(a.status, 'APPROVED') NOT IN ('CANCELLED', 'REJECTED')
        )
        WHERE s.id = v_target_slot_id;
    END IF;

    INSERT INTO public.notifications (
        id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
    ) VALUES (
        gen_random_uuid(),
        v_source.clinic_id,
        v_new_id,
        'Follow-Up Consultation Booked',
        'Patient ' || v_source.patient_name || ' booked Follow-Up Visit #' || v_next_attempt || ' (Appointment ID #' || v_source.tracking_code_10_digit || ') for ' || p_new_date || ' at ' || v_parsed_time::TEXT || '.',
        'queue_alert',
        'specific',
        false,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_new_id,
        'tracking_code_10_digit', v_source.tracking_code_10_digit,
        'attempt_number', v_next_attempt,
        'appointment_date', p_new_date,
        'appointment_time', v_parsed_time::TEXT,
        'status', 'APPROVED',
        'patient_name', v_source.patient_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_follow_up_visit(VARCHAR, DATE, VARCHAR, UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- STEP 5: Combined Billing Read RPC by 10-Digit Appointment ID
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_combined_billing_by_tracking_code(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_combined_billing_by_tracking_code(
    p_tracking_code VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_code TEXT := TRIM(COALESCE(p_tracking_code, ''));
    v_visits JSONB;
    v_invoices JSONB;
    v_transactions JSONB;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tracking code is required');
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(v) ORDER BY COALESCE(v.attempt_number, 1) ASC, v.appointment_date ASC, v.created_at ASC), '[]'::jsonb)
    INTO v_visits
    FROM public.appointments v
    WHERE v.tracking_code_10_digit = v_code;

    SELECT COALESCE(jsonb_agg(row_to_json(bi) ORDER BY bi.created_at ASC), '[]'::jsonb)
    INTO v_invoices
    FROM public.billing_invoices bi
    WHERE bi.tracking_code_10_digit = v_code
       OR bi.appointment_id IN (
           SELECT id FROM public.appointments WHERE tracking_code_10_digit = v_code
       );

    SELECT COALESCE(jsonb_agg(row_to_json(tx) ORDER BY tx.created_at ASC), '[]'::jsonb)
    INTO v_transactions
    FROM public.invoice_transactions tx
    WHERE tx.appointment_id IN (
        SELECT id FROM public.appointments WHERE tracking_code_10_digit = v_code
    );

    RETURN jsonb_build_object(
        'success', true,
        'tracking_code_10_digit', v_code,
        'visits', v_visits,
        'invoices', v_invoices,
        'transactions', v_transactions
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_combined_billing_by_tracking_code(VARCHAR) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- STEP 6: Repair Historical Unbilled Free Follow-Ups Marked as 'paid'
-- -------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    UPDATE public.appointments a
    SET payment_status = 'pending',
        payment_mode = 'FREE',
        updated_at = NOW()
    WHERE (
        COALESCE(a.attempt_number, 1) > 1
        OR LOWER(COALESCE(a.visit_type, '')) LIKE '%follow%'
        OR LOWER(COALESCE(a.notes, '')) LIKE '%follow-up%'
        OR LOWER(COALESCE(a.notes, '')) LIKE '%follow up%'
    )
      AND COALESCE(a.fee_amount, 0.00) = 0.00
      AND COALESCE(a.total_amount, 0.00) = 0.00
      AND LOWER(COALESCE(a.payment_status::TEXT, '')) = 'paid'
      AND NOT EXISTS (
          SELECT 1 FROM public.billing_invoices bi
          WHERE bi.appointment_id = a.id
            AND (COALESCE(bi.total_amount, 0.00) > 0.00 OR COALESCE(bi.paid_amount, 0.00) > 0.00)
      );
END $$;

NOTIFY pgrst, 'reload schema';
