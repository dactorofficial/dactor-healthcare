-- =========================================================================
-- DACTOR PLATFORM: Master Reschedule Appointment Authoritative RPC & Fixes
-- File: supabase/migration_reschedule_appointment_rpc.sql
-- =========================================================================

-- 1. Ensure 'checkin_status_enum' has all required labels safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'not_checked_in'
    ) THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'not_checked_in';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'checked_in'
    ) THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'checked_in';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'cancelled'
    ) THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'cancelled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'no_show'
    ) THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'no_show';
    END IF;
END $$;

-- 2. Update trigger to allow doctor_id, cancelled_at, cancellation_reason, consultation_completed_at in patient updates
CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Bypass check for authoritative backend RPCs
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow staff and super admin
    IF public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(OLD.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Allow direct appointment cancellation by patient
    IF NEW.checkin_status::TEXT = 'cancelled' OR NEW.status IN ('CANCELLED', 'cancelled') THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_current_patient_for_appointment(OLD.id) THEN
        -- Allow if token clinic matches appointment clinic
        IF (auth.jwt() ->> 'clinic_id') IS NOT NULL AND (auth.jwt() ->> 'clinic_id')::text = OLD.clinic_id::text THEN
            RETURN NEW;
        END IF;
        -- Allow guest verification if tracking code matches
        IF OLD.tracking_code_10_digit IS NOT NULL AND (auth.jwt() ->> 'tracking_code' = OLD.tracking_code_10_digit) THEN
            -- Allow
        ELSE
            -- Don't throw fatal exception if tracking code is valid in session
        END IF;
    END IF;

    -- Allow rescheduling fields: appointment_date, appointment_time, slot_id, doctor_id, checkin_status, status, cancelled_at, cancellation_reason, consultation_completed_at, updated_at
    IF (to_jsonb(NEW) - ARRAY['appointment_date','appointment_time','slot_id','doctor_id','checkin_status','status','cancelled_at','cancellation_reason','consultation_completed_at','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['appointment_date','appointment_time','slot_id','doctor_id','checkin_status','status','cancelled_at','cancellation_reason','consultation_completed_at','updated_at']) THEN
        RAISE EXCEPTION 'Patients cannot update appointment identity, financial, ownership, or queue fields.';
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Authoritative SECURITY DEFINER RPC: reschedule_patient_appointment
CREATE OR REPLACE FUNCTION public.reschedule_patient_appointment(
    p_appointment_id UUID,
    p_new_date DATE,
    p_new_time VARCHAR,
    p_slot_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_old_slot_id UUID;
    v_target_doctor_id UUID;
    v_next_pos INT;
    v_clean_time VARCHAR;
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
        RETURN jsonb_build_object('success', false, 'error', 'Appointment not found');
    END IF;

    IF v_appt.checkin_status::TEXT IN ('completed', 'done', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Completed appointments cannot be rescheduled');
    END IF;

    IF p_tracking_code IS NOT NULL AND TRIM(p_tracking_code) <> '' THEN
        IF v_appt.tracking_code_10_digit <> TRIM(p_tracking_code) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Tracking code verification failed');
        END IF;
    END IF;

    v_old_slot_id := v_appt.slot_id;
    v_target_doctor_id := COALESCE(p_doctor_id, v_appt.doctor_id);
    v_clean_time := TRIM(p_new_time);

    -- Update appointment record
    UPDATE public.appointments
    SET appointment_date = p_new_date,
        appointment_time = v_clean_time,
        slot_id = COALESCE(p_slot_id, v_appt.slot_id),
        doctor_id = v_target_doctor_id,
        status = 'APPROVED',
        checkin_status = 'not_checked_in',
        cancelled_at = NULL,
        cancellation_reason = NULL,
        consultation_completed_at = NULL,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Clean up prior queue entries
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- If rescheduled to TODAY, re-inject into live queue
    IF p_new_date = CURRENT_DATE THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_pos
        FROM public.queue_entries
        WHERE clinic_id = v_appt.clinic_id
          AND (v_target_doctor_id IS NULL OR doctor_id = v_target_doctor_id OR doctor_id IS NULL);

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
            gen_random_uuid(),
            p_appointment_id,
            v_appt.clinic_id,
            v_target_doctor_id,
            v_next_pos,
            'waiting',
            NOW(),
            NOW()
        );
    END IF;

    -- Reconcile old slot capacity
    IF v_old_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_old_slot_id;
    END IF;

    -- Reconcile new slot capacity
    IF p_slot_id IS NOT NULL AND p_slot_id <> v_old_slot_id THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = p_slot_id;
    END IF;

    -- Clinic Alert
    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'Appointment Rescheduled',
            'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' rescheduled appointment #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' to ' || p_new_date || ' at ' || v_clean_time || '.',
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
        'time', v_clean_time
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_patient_appointment(UUID, DATE, VARCHAR, UUID, UUID, TEXT) TO anon, authenticated, service_role;
