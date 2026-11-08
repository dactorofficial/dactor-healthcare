-- =========================================================================
-- DACTOR PLATFORM: CONSOLIDATED PAY AT DESK, CONFIRMATION & CANCELLATION REPAIR
-- File: supabase/migration_complete_pad_repair.sql
-- =========================================================================

-- 1. Extend checkin_status_enum with all valid workflow statuses
DO $$
BEGIN
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
END $$;


-- 2. Fix CHECK constraints on appointments table (CRITICAL: ALLOW 'CANCELLED')
DO $$
BEGIN
    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_status 
        CHECK (status IN (
            'WAITING_FOR_APPROVAL', 
            'APPROVED', 
            'UNAPPROVED', 
            'EXPIRED', 
            'pending_payment', 
            'CANCELLED', 
            'cancelled',
            'BOOKED',
            'CONFIRMED',
            'COMPLETED',
            'REJECTED',
            'pending'
        ));

    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_mode;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_payment_mode 
        CHECK (UPPER(payment_mode) IN ('ONLINE', 'PAY_AT_DESK', 'DESK', 'CASH'));
END $$;


-- 3. Ensure Auth Helper Functions Exist and Never Crash
CREATE OR REPLACE FUNCTION public.is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
        RETURN TRUE;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE (auth.uid() IS NOT NULL AND (id = auth.uid() OR auth_uid = auth.uid()))
       OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    LIMIT 1;

    RETURN COALESCE(v_role IN ('admin', 'super_admin', 'platform_admin'), FALSE);
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.is_authorized_clinic_staff(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := auth.uid();
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF (auth.jwt() ->> 'clinic_id') IS NOT NULL AND (auth.jwt() ->> 'clinic_id')::text = p_clinic_id::text THEN
        RETURN TRUE;
    END IF;

    IF v_email = '' AND v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.clinics c
        WHERE c.id = p_clinic_id
          AND v_email <> ''
          AND LOWER(c.contact_email) = v_email
        UNION
        SELECT 1 FROM public.clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND v_email <> ''
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
        UNION
        SELECT 1 FROM public.doctors d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE (d.clinic_id = p_clinic_id OR d.primary_clinic_id = p_clinic_id OR d.active_clinic_id = p_clinic_id)
          AND (
              (v_email <> '' AND LOWER(d.email) = v_email)
              OR (v_uid IS NOT NULL AND (p.id = v_uid OR p.auth_uid = v_uid))
          )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_authorized_clinic_staff(UUID) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.is_current_patient_for_appointment(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := auth.uid();
    v_phone TEXT := RIGHT(REGEXP_REPLACE(COALESCE(auth.jwt() ->> 'phone_number', ''), '\D', '', 'g'), 10);
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.appointments a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.id = p_appointment_id
          AND (
              (v_uid IS NOT NULL AND (a.user_id = v_uid OR p.id = v_uid OR p.auth_uid = v_uid))
              OR (v_email <> '' AND (LOWER(a.patient_email) = v_email OR LOWER(p.email) = v_email))
              OR (v_phone <> '' AND LENGTH(v_phone) = 10 AND RIGHT(REGEXP_REPLACE(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_phone)
          )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_current_patient_for_appointment(UUID) TO anon, authenticated, service_role;


-- 4. Anti-Tampering Trigger Function (Honors Authoritative Bypass & Direct Cancellations)
CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Allow authoritative server RPCs (scoped transaction-locally via set_config)
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow service_role, admin portal users, or authorized clinic staff
    IF (auth.jwt() ->> 'role') = 'service_role' 
       OR public.is_admin_portal_user()
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
        RAISE EXCEPTION 'Appointment update is not authorized.';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','status','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','status','updated_at']) THEN
        RAISE EXCEPTION 'Patients cannot update appointment identity, financial, ownership, or queue fields.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_patient_privilege_escalation ON public.appointments;
CREATE TRIGGER appointments_prevent_patient_privilege_escalation
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_patient_appointment_privilege_escalation();


-- 5. Authoritative RPC: confirm_pay_at_desk_booking
CREATE OR REPLACE FUNCTION public.confirm_pay_at_desk_booking(
    p_appointment_id UUID,
    p_fee_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_doc_fee NUMERIC(10, 2);
    v_fee NUMERIC(10, 2);
    v_service_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_clinic_owner_id UUID;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    IF v_appt.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Cannot switch paid appointment to Pay at Desk';
    END IF;

    IF v_appt.checkin_status::TEXT = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot confirm cancelled appointment';
    END IF;

    IF v_appt.status = 'APPROVED' AND UPPER(COALESCE(v_appt.payment_mode, '')) = 'PAY_AT_DESK' THEN
        RAISE EXCEPTION 'Appointment is already approved at desk';
    END IF;

    IF v_appt.status IN ('UNAPPROVED', 'EXPIRED', 'COMPLETED') THEN
        RAISE EXCEPTION 'Cannot confirm Pay at Desk for appointment with status %: must use retry_pay_at_desk_appointment if unapproved', v_appt.status;
    END IF;

    -- Authoritative Fee Determination: doctor catalog fee takes precedence
    IF v_appt.doctor_id IS NOT NULL THEN
        SELECT consultation_fee INTO v_doc_fee
        FROM public.doctors
        WHERE id = v_appt.doctor_id;

        v_fee := COALESCE(v_doc_fee, v_appt.fee_amount, p_fee_amount, 500.00);
    ELSE
        v_fee := COALESCE(v_appt.fee_amount, p_fee_amount, 500.00);
    END IF;

    IF v_fee <= 0 THEN
        v_fee := 500.00;
    END IF;

    v_service_charge := ROUND(v_fee * 0.05, 2);
    v_total := v_fee + v_service_charge;

    UPDATE public.appointments
    SET payment_mode = 'PAY_AT_DESK',
        status = 'WAITING_FOR_APPROVAL',
        payment_status = 'pending',
        checkin_status = 'not_checked_in',
        attempt_number = 1,
        fee_amount = v_fee,
        service_charge_amount = v_service_charge,
        total_amount = v_total,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Queue isolation: pending Pay at Desk must not be in live queue
    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    -- Reconcile slot booked count (only approved appointments count towards slot capacity)
    IF v_appt.slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_appt.slot_id;
    END IF;

    -- Notification to clinic
    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'New Pay at Desk Request',
            'New appointment request #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' from ' || v_appt.patient_name || ' (NPR ' || v_total || ' due at desk).',
            'pay_at_desk_request',
            'specific',
            false,
            NOW()
        );

        -- Also notify clinic owner profile if separate
        SELECT p.id INTO v_clinic_owner_id
        FROM public.clinics c
        JOIN public.profiles p ON LOWER(p.email) = LOWER(c.contact_email)
        WHERE c.id = v_appt.clinic_id
        LIMIT 1;

        IF v_clinic_owner_id IS NOT NULL AND v_clinic_owner_id <> v_appt.clinic_id THEN
            INSERT INTO public.notifications (
                id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
            ) VALUES (
                gen_random_uuid(),
                v_clinic_owner_id,
                v_appt.id,
                'New Pay at Desk Request',
                'New appointment request #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ' from ' || v_appt.patient_name || ' (NPR ' || v_total || ' due at desk).',
                'pay_at_desk_request',
                'specific',
                false,
                NOW()
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'tracking_code', COALESCE(v_appt.tracking_code_10_digit, v_appt.tracking_code),
        'tracking_code_10_digit', COALESCE(v_appt.tracking_code_10_digit, v_appt.tracking_code),
        'status', v_appt.status,
        'payment_mode', v_appt.payment_mode,
        'payment_status', v_appt.payment_status,
        'checkin_status', v_appt.checkin_status,
        'attempt_number', v_appt.attempt_number,
        'fee_amount', v_appt.fee_amount,
        'service_charge_amount', v_appt.service_charge_amount,
        'total_amount', v_appt.total_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role;


-- 6. Authoritative RPC: cancel_pending_pay_at_desk_appointment
CREATE OR REPLACE FUNCTION public.cancel_pending_pay_at_desk_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot_id UUID;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_appt.checkin_status::TEXT IN ('completed', 'done', 'finished') THEN
        RETURN FALSE;
    END IF;

    v_slot_id := v_appt.slot_id;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Delete from live queue
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Reconcile slot capacity
    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    -- Notify clinic that the patient cancelled their request
    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'Booking Request Cancelled',
            'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' cancelled their Pay at Desk request (#' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || ').',
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;


-- 7. Authoritative RPC: cancel_patient_appointment
CREATE OR REPLACE FUNCTION public.cancel_patient_appointment(
    p_appointment_id UUID,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_appt.checkin_status::TEXT IN ('completed', 'done', 'finished') THEN
        RETURN FALSE;
    END IF;

    IF p_tracking_code IS NOT NULL AND v_appt.tracking_code_10_digit <> p_tracking_code THEN
        RETURN FALSE;
    END IF;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    -- Clean up live queue
    DELETE FROM public.queue_entries WHERE appointment_id = p_appointment_id;

    -- Reconcile slot capacity
    IF v_appt.slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_appt.slot_id;
    END IF;

    -- Notify clinic
    IF v_appt.clinic_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.clinic_id,
            v_appt.id,
            'Appointment Cancelled',
            'Patient ' || COALESCE(v_appt.patient_name, 'Patient') || ' cancelled appointment #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT) || '.',
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_patient_appointment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_patient_appointment(UUID, TEXT) TO anon, authenticated, service_role;


-- 8. Authoritative RPC: approve_pay_at_desk_appointment
CREATE OR REPLACE FUNCTION public.approve_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot public.slots%ROWTYPE;
    v_next_position INT;
    v_count INT;
    v_clinic_name TEXT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- Dual authorization check: authorized JWT staff OR mobile clinic caller with matching clinic_id
    IF NOT (
        (auth.jwt() ->> 'role') = 'service_role'
        OR public.is_admin_portal_user()
        OR public.is_authorized_clinic_staff(v_appt.clinic_id)
        OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to approve appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    -- Idempotent check: if already approved, return success
    IF v_appt.status = 'APPROVED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'appointment_id', v_appt.id,
            'status', 'APPROVED',
            'already_approved', true
        );
    END IF;

    IF v_appt.status NOT IN ('WAITING_FOR_APPROVAL', 'pending_payment', 'pending') THEN
        RAISE EXCEPTION 'Cannot approve appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    -- Transition status to APPROVED
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Overload Rule: Update slot booked count
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_appt.slot_id FOR UPDATE;
        IF FOUND THEN
            SELECT COUNT(*) INTO v_count
            FROM public.appointments
            WHERE slot_id = v_appt.slot_id
              AND checkin_status::TEXT <> 'cancelled'
              AND status = 'APPROVED';

            UPDATE public.slots 
            SET booked_count = v_count,
                updated_at = NOW()
            WHERE id = v_appt.slot_id;
        END IF;
    END IF;

    -- Enqueue in live clinic queue
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
    FROM public.queue_entries
    WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO public.queue_entries (
        appointment_id, clinic_id, doctor_id, queue_position, status, estimated_wait_minutes, created_at, updated_at
    ) VALUES (
        v_appt.id, v_appt.clinic_id, v_appt.doctor_id, v_next_position, 'waiting', 0, NOW(), NOW()
    )
    ON CONFLICT (appointment_id) DO UPDATE
    SET status = 'waiting',
        updated_at = NOW();

    -- Notify patient about approval
    SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_appt.clinic_id;
    IF v_appt.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.user_id,
            v_appt.id,
            'Pay at Desk Approved • Token #' || v_next_position,
            'Your appointment at ' || COALESCE(v_clinic_name, 'Clinic') || ' is approved! You are Token #' || v_next_position || '. Total due at desk: NPR ' || COALESCE(v_appt.total_amount, v_appt.fee_amount) || '.',
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'APPROVED',
        'queue_position', v_next_position
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pay_at_desk_appointment(UUID, UUID) TO anon, authenticated, service_role;


-- 9. Authoritative RPC: reject_pay_at_desk_appointment
CREATE OR REPLACE FUNCTION public.reject_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_slot_id UUID;
    v_clinic_name TEXT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    IF NOT (
        (auth.jwt() ->> 'role') = 'service_role'
        OR public.is_admin_portal_user()
        OR public.is_authorized_clinic_staff(v_appt.clinic_id)
        OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to cancel appointments for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    v_slot_id := v_appt.slot_id;

    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        rejected_at = NOW(),
        notes = CASE 
            WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 
            THEN COALESCE(notes || E'\n', '') || 'Cancellation reason: ' || trim(p_reason)
            ELSE notes
        END,
        updated_at = NOW()
    WHERE id = v_appt.id;

    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status::TEXT <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_slot_id;
    END IF;

    -- Notify patient
    SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_appt.clinic_id;
    IF v_appt.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            id, user_id, appointment_id, title, message, type, target_audience, is_read, created_at
        ) VALUES (
            gen_random_uuid(),
            v_appt.user_id,
            v_appt.id,
            'Booking Request Cancelled',
            'Your Pay at Desk request at ' || COALESCE(v_clinic_name, 'Clinic') || ' could not be approved.' || CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN ' Reason: ' || trim(p_reason) ELSE '' END,
            'queue_alert',
            'specific',
            false,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'status', 'CANCELLED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_pay_at_desk_appointment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_pay_at_desk_appointment(UUID, UUID, TEXT) TO anon, authenticated, service_role;
