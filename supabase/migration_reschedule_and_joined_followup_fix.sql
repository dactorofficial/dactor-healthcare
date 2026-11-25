-- =========================================================================
-- DACTOR PLATFORM: Bulletproof Reschedule & Joined Multi-Visit Follow-Up Migration
-- File: supabase/migration_reschedule_and_joined_followup_fix.sql
--
-- Solves:
-- 1. Preserves single 10-digit Appointment ID across follow-ups (attempt_number >= 1)
--    without overwriting initial visit records, notes, prescriptions, or bills.
-- 2. Server-authoritative trigger on queue_entries to update appointments.checkin_status
--    and consultation_completed_at, eliminating RLS permission blocks for clinic staff.
-- 3. Future-date queue retention: reschedule now maintains/upserts queue entries
--    for any future appointment date, preventing patient disappearance from queue boards.
-- 4. Authoritative book_follow_up_visit RPC for atomic, tamper-proof follow-up booking.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: Ensure checkin_status_enum has required values
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
END $$;

-- -------------------------------------------------------------------------
-- STEP 2: Drop standalone unique constraint on tracking_code_10_digit
--         and establish composite unique index (tracking_code_10_digit, attempt_number)
-- -------------------------------------------------------------------------
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
        RAISE NOTICE 'Dropped standalone unique constraint: %', r.conname;
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
        RAISE NOTICE 'Dropped standalone unique index: %', r.indexname;
    END LOOP;
END $$;

-- Ensure attempt_number column exists with check constraint >= 1
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS chk_appointments_attempt_number;

ALTER TABLE public.appointments 
ADD CONSTRAINT chk_appointments_attempt_number CHECK (attempt_number >= 1);

-- Re-sequence any accidental duplicates
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

-- Establish composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tracking_code_attempt 
ON public.appointments (tracking_code_10_digit, attempt_number);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date 
ON public.appointments (tracking_code_10_digit, appointment_date);

-- -------------------------------------------------------------------------
-- STEP 3: Server-authoritative trigger: synchronize queue_entries.status
--         directly into appointments.checkin_status & consultation_completed_at
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_queue_entry_status_to_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
        UPDATE public.appointments
        SET checkin_status = 'completed',
            consultation_completed_at = COALESCE(NEW.completed_at, NOW()),
            updated_at = NOW()
        WHERE id = NEW.appointment_id;
    ELSIF NEW.status = 'inside' AND (OLD.status IS DISTINCT FROM 'inside') THEN
        UPDATE public.appointments
        SET checkin_status = 'in_consultation',
            updated_at = NOW()
        WHERE id = NEW.appointment_id
          AND checkin_status IS DISTINCT FROM 'completed';
    ELSIF NEW.status = 'called' AND (OLD.status IS DISTINCT FROM 'called') THEN
        UPDATE public.appointments
        SET checkin_status = 'checked_in',
            updated_at = NOW()
        WHERE id = NEW.appointment_id
          AND checkin_status NOT IN ('completed', 'in_consultation');
    ELSIF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
        UPDATE public.appointments
        SET checkin_status = 'cancelled',
            updated_at = NOW()
        WHERE id = NEW.appointment_id
          AND checkin_status IS DISTINCT FROM 'completed';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_queue_status ON public.queue_entries;
CREATE TRIGGER trg_sync_queue_status
AFTER UPDATE OF status ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_queue_entry_status_to_appointment();

-- Also sync on initial INSERT if queue_entry inserted with 'done' status
DROP TRIGGER IF EXISTS trg_sync_queue_status_insert ON public.queue_entries;
CREATE TRIGGER trg_sync_queue_status_insert
AFTER INSERT ON public.queue_entries
FOR EACH ROW
WHEN (NEW.status IN ('done', 'inside', 'called'))
EXECUTE FUNCTION public.trg_sync_queue_entry_status_to_appointment();

-- -------------------------------------------------------------------------
-- STEP 4: Authoritative reschedule_patient_appointment RPC
--         Maintains queue entries for future dates (no disappearing patients)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_patient_appointment(
    p_appointment_id UUID,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_new_slot_id UUID DEFAULT NULL,
    p_new_doctor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
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
    v_today_ktm DATE;
    v_next_pos INT;
    v_clean_time VARCHAR;
    v_time_first_part TEXT;
    v_parsed_time TIME;
    v_slot_active_count INT;
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

    -- Block rescheduling completed visits: follow-ups must be booked via book_follow_up_visit
    IF LOWER(COALESCE(v_appt.checkin_status::TEXT, '')) IN ('completed', 'done', 'finished')
       OR v_appt.consultation_completed_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Completed appointments cannot be rescheduled. Book a follow-up visit instead.');
    END IF;

    v_old_slot_id := v_appt.slot_id;
    v_target_slot_id := COALESCE(p_new_slot_id, v_appt.slot_id);
    v_target_doctor_id := COALESCE(p_new_doctor_id, v_appt.doctor_id);
    v_today_ktm := (NOW() AT TIME ZONE 'Asia/Kathmandu')::DATE;

    v_target_status := CASE
        WHEN UPPER(COALESCE(v_appt.status, '')) = 'WAITING_FOR_APPROVAL' THEN 'WAITING_FOR_APPROVAL'
        ELSE 'APPROVED'
    END;

    -- Parse appointment time safely
    v_clean_time := TRIM(COALESCE(p_new_time, ''));
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

    -- Validate target slot capacity
    IF p_new_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM public.slots
        WHERE id = p_new_slot_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_parsed_time IS NULL AND v_slot.start_time IS NOT NULL THEN
                v_parsed_time := v_slot.start_time;
            END IF;

            IF v_old_slot_id IS DISTINCT FROM p_new_slot_id THEN
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

    -- Update appointment record
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

    -- Calculate queue position for target date
    IF v_target_status <> 'WAITING_FOR_APPROVAL' THEN
        SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO v_next_pos
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE qe.clinic_id = v_appt.clinic_id
          AND a.appointment_date = p_new_date
          AND qe.status IN ('waiting', 'inside')
          AND (v_target_doctor_id IS NULL OR qe.doctor_id = v_target_doctor_id OR qe.doctor_id IS NULL);

        -- Upsert queue entry (whether date is today OR in the future!)
        INSERT INTO public.queue_entries (
            id,
            appointment_id,
            clinic_id,
            doctor_id,
            queue_position,
            estimated_wait_minutes,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            p_appointment_id,
            v_appt.clinic_id,
            v_target_doctor_id,
            v_next_pos,
            GREATEST(0, (v_next_pos - 1) * 15),
            'waiting',
            NOW(),
            NOW()
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
        -- If waiting for approval, remove active queue entry until approved
        DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;
    END IF;

    -- Reconcile slot capacities
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

    -- Notify clinic
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

GRANT EXECUTE ON FUNCTION public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- STEP 5: Authoritative book_follow_up_visit RPC
--         Joins both visits under the exact same 10-digit Appointment ID
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_follow_up_visit(
    p_source_tracking_code VARCHAR,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_new_slot_id UUID DEFAULT NULL,
    p_new_doctor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_source public.appointments%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_new_id UUID := gen_random_uuid();
    v_next_attempt INT;
    v_clean_time VARCHAR;
    v_parsed_time TIME;
    v_target_doctor_id UUID;
    v_target_slot_id UUID;
    v_next_pos INT;
    v_new_appt public.appointments%ROWTYPE;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_source_tracking_code IS NULL OR TRIM(p_source_tracking_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source tracking code / Appointment ID cannot be empty');
    END IF;

    -- Find latest visit for this tracking code
    SELECT * INTO v_source
    FROM public.appointments
    WHERE tracking_code_10_digit = TRIM(p_source_tracking_code)
    ORDER BY COALESCE(attempt_number, 1) DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Previous appointment not found for ID ' || p_source_tracking_code);
    END IF;

    v_target_doctor_id := COALESCE(p_new_doctor_id, v_source.doctor_id);
    v_target_slot_id := COALESCE(p_new_slot_id, v_source.slot_id);
    v_next_attempt := COALESCE(v_source.attempt_number, 1) + 1;

    -- Normalize time
    v_clean_time := TRIM(COALESCE(p_new_time, ''));
    BEGIN
        IF v_clean_time <> '' THEN
            v_parsed_time := TRIM(SPLIT_PART(v_clean_time, '-', 1))::TIME;
        ELSE
            v_parsed_time := v_source.appointment_time;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_parsed_time := COALESCE(v_source.appointment_time, '09:00:00'::TIME);
    END;

    -- Validate slot
    IF p_new_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM public.slots
        WHERE id = p_new_slot_id
        FOR UPDATE;

        IF FOUND AND v_parsed_time IS NULL AND v_slot.start_time IS NOT NULL THEN
            v_parsed_time := v_slot.start_time;
        END IF;
    END IF;

    -- Insert new follow-up appointment sharing the exact same tracking_code_10_digit!
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
        'paid',
        'not_checked_in',
        'APPROVED',
        0.00,
        0.00,
        0.00,
        'ONLINE',
        false,
        p_new_date,
        v_parsed_time,
        v_next_attempt,
        COALESCE(p_reason, 'Follow-Up Visit #' || v_next_attempt || ' (Ref: #' || v_source.tracking_code_10_digit || ')'),
        NOW(),
        NOW()
    ) RETURNING * INTO v_new_appt;

    -- Queue position calculation for target date
    SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO v_next_pos
    FROM public.queue_entries qe
    JOIN public.appointments a ON a.id = qe.appointment_id
    WHERE qe.clinic_id = v_source.clinic_id
      AND a.appointment_date = p_new_date
      AND qe.status IN ('waiting', 'inside')
      AND (v_target_doctor_id IS NULL OR qe.doctor_id = v_target_doctor_id OR qe.doctor_id IS NULL);

    -- Insert queue entry for the follow-up visit
    INSERT INTO public.queue_entries (
        id,
        appointment_id,
        clinic_id,
        doctor_id,
        queue_position,
        estimated_wait_minutes,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_new_id,
        v_source.clinic_id,
        v_target_doctor_id,
        v_next_pos,
        GREATEST(0, (v_next_pos - 1) * 15),
        'waiting',
        NOW(),
        NOW()
    ) ON CONFLICT (appointment_id) DO UPDATE
    SET queue_position = EXCLUDED.queue_position,
        status = 'waiting',
        updated_at = NOW();

    -- Update slot booked_count
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

    -- Notify clinic
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

GRANT EXECUTE ON FUNCTION public.book_follow_up_visit(VARCHAR, DATE, VARCHAR, UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- STEP 6: One-Time Repair for Recent Broken Test Appointments
-- -------------------------------------------------------------------------
DO $$
BEGIN
    -- Repair appointment '54215d1e-c69f-46bf-9864-b4ea841a33cb' (which was generated as code 7529651238):
    -- Re-link it to original tracking code '6813281190' as attempt 2
    UPDATE public.appointments
    SET tracking_code_10_digit = '6813281190',
        attempt_number = 2,
        checkin_status = 'completed'
    WHERE id = '54215d1e-c69f-46bf-9864-b4ea841a33cb'
      AND notes LIKE '%#6813281190%';

    -- Ensure initial appointment '0725206a-0d7d-4f34-bc63-64728cf09186' is marked completed
    UPDATE public.appointments
    SET checkin_status = 'completed'
    WHERE id = '0725206a-0d7d-4f34-bc63-64728cf09186'
      AND checkin_status <> 'completed';
END $$;

NOTIFY pgrst, 'reload schema';
