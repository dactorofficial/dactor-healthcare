-- =========================================================================
-- DACTOR PLATFORM: Missing Pay at Desk Cancel & List RPCs
-- File: supabase/migration_pay_at_desk_cancel_and_list_rpcs.sql
-- =========================================================================

-- 1. RPC to allow patients/guests to cancel their unapproved Pay at Desk request
CREATE OR REPLACE FUNCTION public.cancel_pending_pay_at_desk_appointment(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.appointments
    SET checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_appointment_id
      AND status = 'WAITING_FOR_APPROVAL';
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pending_pay_at_desk_appointment(UUID) TO anon, authenticated, service_role;

-- 2. RPC to list unapproved Pay at Desk requests for clinic staff
CREATE OR REPLACE FUNCTION public.list_pending_pay_at_desk_requests(p_clinic_id UUID)
RETURNS TABLE (
    id UUID,
    tracking_code_10_digit TEXT,
    user_id UUID,
    clinic_id UUID,
    doctor_id UUID,
    slot_id UUID,
    patient_name TEXT,
    patient_age INTEGER,
    patient_gender TEXT,
    patient_mobile TEXT,
    patient_email TEXT,
    appointment_date DATE,
    appointment_time TIME,
    fee_amount NUMERIC,
    service_charge_amount NUMERIC,
    total_amount NUMERIC,
    payment_mode TEXT,
    status TEXT,
    attempt_number INTEGER,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    notes TEXT,
    doctor_name TEXT,
    doctor_specialty TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.tracking_code_10_digit,
        a.user_id,
        a.clinic_id,
        a.doctor_id,
        a.slot_id,
        a.patient_name,
        a.patient_age,
        a.patient_gender,
        a.patient_mobile,
        a.patient_email,
        a.appointment_date,
        a.appointment_time,
        a.fee_amount,
        a.service_charge_amount,
        a.total_amount,
        a.payment_mode,
        a.status,
        a.attempt_number,
        a.expires_at,
        a.created_at,
        a.notes,
        d.full_name AS doctor_name,
        d.specialty AS doctor_specialty
    FROM public.appointments a
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.clinic_id = p_clinic_id
      AND a.payment_mode = 'PAY_AT_DESK'
      AND a.status = 'WAITING_FOR_APPROVAL'
      AND a.checkin_status <> 'cancelled'
    ORDER BY a.created_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_pending_pay_at_desk_requests(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_pay_at_desk_requests(UUID) TO anon, authenticated, service_role;
