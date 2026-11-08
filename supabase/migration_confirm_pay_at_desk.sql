-- =========================================================================
-- DACTOR PLATFORM: SERVER-AUTHORITATIVE PAY AT DESK CONFIRMATION RPC
-- Migration: migration_confirm_pay_at_desk.sql
-- Milestone 1: Server-Authoritative Pay at Desk Confirmation & Trigger Update
-- =========================================================================

-- 1. Ensure configurable 5% service charge function exists
CREATE OR REPLACE FUNCTION public.get_pay_at_desk_service_charge_percent()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_percent NUMERIC;
BEGIN
    SELECT (value->>'percent')::NUMERIC INTO v_percent
    FROM public.app_settings
    WHERE key = 'pay_at_desk_fee_percent';

    RETURN COALESCE(v_percent, 5.0);
EXCEPTION WHEN OTHERS THEN
    RETURN 5.0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pay_at_desk_service_charge_percent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pay_at_desk_service_charge_percent() TO anon, authenticated, service_role;

-- 2. Update Anti-Tampering Trigger to Honor Authoritative Context
CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Allow service_role, admin portal users, or authorized clinic staff
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(OLD.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Allow authoritative server RPCs (scoped transaction-locally via set_config)
    IF current_setting('dactor.authoritative_context', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_current_patient_for_appointment(OLD.id) THEN
        RAISE EXCEPTION 'Appointment update is not authorized.';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at']) THEN
        RAISE EXCEPTION 'Patients cannot update appointment identity, financial, ownership, or queue fields.';
    END IF;

    IF NEW.checkin_status IS DISTINCT FROM OLD.checkin_status
       AND NEW.checkin_status::TEXT <> 'cancelled' THEN
        RAISE EXCEPTION 'Patients may only cancel their own appointment.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_patient_privilege_escalation ON public.appointments;
CREATE TRIGGER appointments_prevent_patient_privilege_escalation
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_patient_appointment_privilege_escalation();

-- 3. Create Server-Authoritative RPC confirm_pay_at_desk_booking
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
    v_pct NUMERIC;
    v_service_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_clinic_user_id UUID;
BEGIN
    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    -- 3.1 Acquire exclusive row lock
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- 3.2 Validate appointment state
    IF v_appt.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Cannot switch paid appointment to Pay at Desk';
    END IF;

    IF v_appt.checkin_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot confirm cancelled appointment';
    END IF;

    IF v_appt.status = 'APPROVED' AND v_appt.payment_mode = 'PAY_AT_DESK' THEN
        RAISE EXCEPTION 'Appointment is already approved at desk';
    END IF;

    IF v_appt.status IN ('UNAPPROVED', 'EXPIRED', 'COMPLETED') THEN
        RAISE EXCEPTION 'Cannot confirm Pay at Desk for appointment with status %: must use retry_pay_at_desk_appointment if unapproved', v_appt.status;
    END IF;

    IF v_appt.expires_at IS NOT NULL AND v_appt.expires_at < NOW() THEN
        RAISE EXCEPTION 'Cannot confirm Pay at Desk: Appointment request has expired';
    END IF;

    -- Check if appointment slot time has already passed (> 5 minutes buffer)
    IF (v_appt.appointment_date + v_appt.appointment_time)::TIMESTAMPTZ < NOW() - INTERVAL '5 minutes' THEN
        RAISE EXCEPTION 'Cannot confirm Pay at Desk: Appointment time has already passed';
    END IF;

    -- 3.3 Authoritative Fee Determination: doctor catalog fee takes precedence
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

    -- 3.4 Authoritative 5% Service Charge Computation
    BEGIN
        v_pct := public.get_pay_at_desk_service_charge_percent();
    EXCEPTION WHEN OTHERS THEN
        v_pct := 5.0;
    END;
    IF v_pct IS NULL OR v_pct <= 0 THEN
        v_pct := 5.0;
    END IF;

    v_service_charge := round(v_fee * (v_pct / 100.0), 2);
    v_total := v_fee + v_service_charge;

    -- 3.5 Set transaction-local authoritative bypass flag
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    -- 3.6 Atomically update appointment to Pay at Desk WAITING_FOR_APPROVAL
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

    -- 3.7 Ensure queue isolation: remove from queue_entries if present
    DELETE FROM public.queue_entries WHERE appointment_id = v_appt.id;

    -- 3.8 If slot_id is present, update slot booked_count (only approved appointments count)
    IF v_appt.slot_id IS NOT NULL THEN
        UPDATE public.slots s
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments a
            WHERE a.slot_id = s.id
              AND a.checkin_status <> 'cancelled'
              AND a.status = 'APPROVED'
        )
        WHERE s.id = v_appt.slot_id;
    END IF;

    -- 3.9 Emit notification to clinic staff
    SELECT p.id INTO v_clinic_user_id
    FROM public.profiles p
    JOIN public.clinics c ON LOWER(c.contact_email) = LOWER(p.email)
    WHERE c.id = v_appt.clinic_id
    LIMIT 1;

    IF v_clinic_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_clinic_user_id,
            v_appt.id,
            'New Pay at Desk Request',
            'New appointment request #' || COALESCE(v_appt.tracking_code_10_digit, v_appt.tracking_code, v_appt.id::TEXT) || ' from ' || v_appt.patient_name || ' (Pay at Desk).',
            'pay_at_desk_request',
            'specific'
        );
    END IF;

    -- 3.10 Return structured JSON result
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

-- 4. Permissions & Grants
REVOKE ALL ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pay_at_desk_booking(UUID, NUMERIC) TO anon, authenticated, service_role;
