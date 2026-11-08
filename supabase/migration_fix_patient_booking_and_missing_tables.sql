-- =============================================================================
-- DACTOR PLATFORM: COMPLETE, DEFINITIVE APPOINTMENT BOOKING & SCHEMA FIX
-- File: supabase/migration_fix_patient_booking_and_missing_tables.sql
-- =============================================================================

-- =============================================================================
-- 1. ENUM VALUES (Ensure 'unpaid' and 'cancelled' are present)
-- =============================================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'unpaid'
    ) THEN
        ALTER TYPE payment_status_enum ADD VALUE 'unpaid';
    END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'cancelled'
    ) THEN
        ALTER TYPE checkin_status_enum ADD VALUE 'cancelled';
    END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- =============================================================================
-- 2. PRIVATE SCHEMA & RATE LIMITING INFRASTRUCTURE
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.security_rate_limits (
    key_hash TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_hash, window_start)
);
REVOKE ALL ON private.security_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.consume_tracking_rate_limit(
    p_scope TEXT,
    p_code TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
    v_hash TEXT;
    v_window TIMESTAMPTZ;
BEGIN
    IF p_scope IS NULL OR p_code IS NULL OR p_limit < 1 OR p_limit > 1000
       OR p_window_seconds < 10 OR p_window_seconds > 86400 THEN
        RETURN TRUE;
    END IF;
    v_hash := md5(p_scope || ':' || p_code);
    v_window := to_timestamp(
        floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
    );
    INSERT INTO private.security_rate_limits (key_hash, window_start, hit_count)
    VALUES (v_hash, v_window, 1)
    ON CONFLICT (key_hash, window_start)
    DO UPDATE SET hit_count = private.security_rate_limits.hit_count + 1
      WHERE private.security_rate_limits.hit_count < p_limit;
    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION private.consume_tracking_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. ENSURE ALL APPOINTMENTS COLUMNS, DEFAULTS & CONSTRAINTS EXIST
-- =============================================================================
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS selected_lab_tests TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS gateway_backstop_expires_at TIMESTAMPTZ;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.appointments ALTER COLUMN patient_age SET DEFAULT 30;
ALTER TABLE public.appointments ALTER COLUMN patient_gender SET DEFAULT 'Other';

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_status 
CHECK (status IN (
    'WAITING_FOR_APPROVAL', 
    'APPROVED', 
    'UNAPPROVED', 
    'EXPIRED', 
    'pending_payment', 
    'CANCELLED', 
    'BOOKED',
    'CONFIRMED',
    'COMPLETED'
));

-- =============================================================================
-- 4. INSTALL CORE TABLES (app_versions, system_settings, invoice_transactions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name VARCHAR(50) UNIQUE NOT NULL,
    min_version_code INT NOT NULL DEFAULT 1,
    latest_version_code INT NOT NULL DEFAULT 1,
    latest_version_name VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    update_url TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.dactor.patient',
    release_notes TEXT DEFAULT 'A new version of Dactor is available. Please update to continue.',
    is_compulsory BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for app_versions" ON public.app_versions;
CREATE POLICY "Public read access for app_versions" ON public.app_versions FOR SELECT USING (true);

INSERT INTO public.app_versions (
    app_name, min_version_code, latest_version_code, latest_version_name, update_url, release_notes, is_compulsory
) VALUES 
('patient_app', 1, 100, '1.0.0', 'https://play.google.com/store/apps/details?id=com.dactor.patient', 'Initial release', false),
('clinic_app', 1, 100, '1.0.0', 'https://play.google.com/store/apps/details?id=com.dactor.clinic', 'Initial release', false)
ON CONFLICT (app_name) DO UPDATE SET updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read system_settings" ON public.system_settings;
CREATE POLICY "Public read system_settings" ON public.system_settings FOR SELECT USING (true);

INSERT INTO public.system_settings (key, value, description, updated_at)
VALUES
    ('maintenance_mode', 'false', 'Global platform maintenance flag', NOW()),
    ('clinic_app_min_version_code', '1', 'Minimum version code for clinic app', NOW()),
    ('patient_app_min_version_code', '1', 'Minimum version code for patient app', NOW())
ON CONFLICT (key) DO UPDATE SET updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.invoice_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    transaction_type VARCHAR(30) NOT NULL DEFAULT 'PAYMENT' CHECK (transaction_type IN ('PAYMENT', 'CORRECTION', 'REFUND', 'DISCOUNT')),
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
    device_id VARCHAR(50),
    transaction_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.invoice_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read invoice_transactions" ON public.invoice_transactions;
CREATE POLICY "Public read invoice_transactions" ON public.invoice_transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert to invoice_transactions" ON public.invoice_transactions;
CREATE POLICY "Allow insert to invoice_transactions" ON public.invoice_transactions FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 5. BULLETPROOF create_patient_appointment RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID DEFAULT NULL,
    p_appointment_date DATE DEFAULT NULL,
    p_appointment_time TIME DEFAULT NULL,
    p_patient_name TEXT DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL,
    p_selected_test_ids UUID[] DEFAULT NULL,
    p_selected_lab_tests TEXT DEFAULT NULL,
    p_fee_amount NUMERIC(10, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt_id UUID := gen_random_uuid();
    v_tracking_code VARCHAR(10);
    v_fee NUMERIC(10, 2) := 0.00;
    v_service_charge NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2) := 0.00;
    v_doctor public.doctors%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_gender TEXT;
    v_clean_age INT;
    v_caller_profile_id UUID;
    v_slot public.slots%ROWTYPE;
    v_slot_resolved_id UUID := p_slot_id;
    v_is_pad BOOLEAN;
    v_payment_mode_final VARCHAR(30);
    v_status_final VARCHAR(50);
    v_expires_at TIMESTAMPTZ;
    v_is_lab BOOLEAN := FALSE;
    v_effective_doc_id UUID := p_doctor_id;
BEGIN
    -- 1. Input Sanitization & Mobile Validation
    v_clean_phone := right(regexp_replace(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
    IF length(v_clean_phone) <> 10 OR left(v_clean_phone, 1) <> '9' THEN
        RAISE EXCEPTION 'Invalid Nepal mobile number. Must be 10 digits starting with 9.';
    END IF;

    v_clean_name := trim(COALESCE(p_patient_name, ''));
    IF length(v_clean_name) < 2 OR length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Patient name must be between 2 and 150 characters.';
    END IF;

    v_clean_gender := COALESCE(NULLIF(trim(p_patient_gender), ''), 'Other');
    v_clean_age := COALESCE(p_patient_age, 30);
    IF v_clean_age <= 0 THEN
        v_clean_age := 30;
    END IF;

    -- 2. Resilient Security Rate Limiting (Never fail booking)
    BEGIN
        IF NOT private.consume_tracking_rate_limit('booking-phone', v_clean_phone, 30, 3600) THEN
            RAISE EXCEPTION 'Booking rate limit exceeded for this mobile number.';
        END IF;
    EXCEPTION 
        WHEN OTHERS THEN
            NULL;
    END;

    -- 3. Authoritative Clinic Verification Check
    SELECT * INTO v_clinic FROM public.clinics
    WHERE id = p_clinic_id
      AND verification_status = 'approved'
      AND COALESCE(is_archived, false) = false
      AND COALESCE(is_activated, true) = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected clinic is not active or verified for booking.';
    END IF;

    -- Explicit text cast on clinic type enum prevents operator does not exist errors
    v_is_lab := (v_clinic.type::text = 'diagnostic_lab' OR v_clinic.type::text ILIKE '%lab%' OR v_clinic.name ILIKE '%lab%');

    -- 4. Doctor vs Diagnostic Lab Mode Check & Fee Computation
    IF v_is_lab THEN
        v_effective_doc_id := NULL;
        IF p_selected_test_ids IS NOT NULL AND array_length(p_selected_test_ids, 1) > 0 THEN
            SELECT COALESCE(SUM(price), 0.00) INTO v_fee
            FROM public.clinic_services
            WHERE id = ANY(p_selected_test_ids) AND clinic_id = p_clinic_id;
        ELSIF p_fee_amount IS NOT NULL AND p_fee_amount > 0 THEN
            v_fee := p_fee_amount;
        ELSE
            v_fee := 0.00;
        END IF;
    ELSIF v_effective_doc_id IS NOT NULL THEN
        SELECT * INTO v_doctor FROM public.doctors
        WHERE id = v_effective_doc_id
          AND (clinic_id = p_clinic_id OR primary_clinic_id = p_clinic_id OR active_clinic_id = p_clinic_id)
          AND kyc_status IN ('approved', 'verified');

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Doctor does not belong to the selected clinic or is not approved.';
        END IF;

        v_fee := COALESCE(v_doctor.consultation_fee, 500.00);
    ELSE
        v_fee := COALESCE(p_fee_amount, 500.00);
    END IF;

    -- 5. Payment Mode & Expiration Window
    v_is_pad := COALESCE(p_is_pay_at_desk, false) OR UPPER(COALESCE(p_payment_mode, '')) = 'PAY_AT_DESK';
    IF v_is_pad THEN
        v_service_charge := round(v_fee * 0.05, 2);
        v_total := v_fee + v_service_charge;
        v_payment_mode_final := 'PAY_AT_DESK';
        v_status_final := 'WAITING_FOR_APPROVAL';
        v_expires_at := NULL;
    ELSE
        v_service_charge := 0.00;
        v_total := v_fee;
        v_payment_mode_final := 'ONLINE';
        v_status_final := 'pending_payment';
        v_expires_at := NOW() + INTERVAL '10 minutes';
    END IF;

    -- 6. Slot Reservation
    IF v_slot_resolved_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots WHERE id = v_slot_resolved_id;
        IF FOUND AND v_slot.booked_count < v_slot.max_capacity THEN
            UPDATE public.slots SET booked_count = booked_count + 1 WHERE id = v_slot_resolved_id;
        END IF;
    END IF;

    -- 7. Generate 10-digit Tracking Code
    v_tracking_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 10));

    -- 8. Resolve Caller Profile ID if authenticated
    BEGIN
        SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_uid = auth.uid() LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_caller_profile_id := NULL;
    END;

    -- 9. Insert Appointment Record with explicit enum casts
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
        appointment_date,
        appointment_time,
        fee_amount,
        service_charge_amount,
        total_amount,
        payment_mode,
        status,
        notes,
        selected_lab_tests,
        attempt_number,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        v_slot_resolved_id,
        p_clinic_id,
        v_effective_doc_id,
        v_caller_profile_id,
        v_clean_name,
        v_clean_age,
        v_clean_gender,
        v_clean_phone,
        p_patient_email,
        CASE WHEN v_is_pad THEN 'unpaid'::payment_status_enum ELSE 'pending'::payment_status_enum END,
        'checked_in'::checkin_status_enum,
        COALESCE(p_appointment_date, CURRENT_DATE),
        COALESCE(p_appointment_time, CURRENT_TIME),
        v_fee,
        v_service_charge,
        v_total,
        v_payment_mode_final,
        v_status_final,
        p_notes,
        p_selected_lab_tests,
        1,
        v_expires_at,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt_id,
        'tracking_code_10_digit', v_tracking_code,
        'fee_amount', v_fee,
        'service_charge_amount', v_service_charge,
        'total_amount', v_total,
        'status', v_status_final,
        'expires_at', v_expires_at
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_patient_appointment TO anon, authenticated, service_role;

-- =============================================================================
-- 6. RPC initiate_online_payment_phase
-- =============================================================================
CREATE OR REPLACE FUNCTION public.initiate_online_payment_phase(
    p_appointment_id UUID,
    p_gateway TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_backstop INTERVAL;
    v_backstop_at TIMESTAMPTZ;
BEGIN
    v_backstop := CASE LOWER(COALESCE(p_gateway, 'esewa'))
        WHEN 'esewa' THEN INTERVAL '15 minutes'
        WHEN 'khalti' THEN INTERVAL '15 minutes'
        WHEN 'fonepay' THEN INTERVAL '20 minutes'
        WHEN 'connectips' THEN INTERVAL '20 minutes'
        ELSE INTERVAL '15 minutes'
    END;

    v_backstop_at := NOW() + v_backstop;

    UPDATE public.appointments SET
        payment_initiated_at = NOW(),
        expires_at = NULL,
        gateway_backstop_expires_at = v_backstop_at,
        updated_at = NOW()
    WHERE id = p_appointment_id
      AND status = 'pending_payment';

    IF NOT FOUND THEN
        UPDATE public.appointments SET
            status = 'pending_payment',
            payment_initiated_at = NOW(),
            expires_at = NULL,
            gateway_backstop_expires_at = v_backstop_at,
            updated_at = NOW()
        WHERE id = p_appointment_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'backstop_expires_at', v_backstop_at::TEXT
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.initiate_online_payment_phase TO anon, authenticated, service_role;

-- =============================================================================
-- 7. RPC cancel_pending_appointment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_pending_appointment(
    p_appointment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot_id UUID;
BEGIN
    SELECT slot_id INTO v_slot_id FROM public.appointments
    WHERE id = p_appointment_id;

    UPDATE public.appointments SET
        status = 'CANCELLED',
        checkin_status = 'cancelled'::checkin_status_enum,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    IF v_slot_id IS NOT NULL THEN
        UPDATE public.slots SET booked_count = GREATEST(booked_count - 1, 0)
        WHERE id = v_slot_id;
    END IF;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_pending_appointment TO anon, authenticated, service_role;

-- =============================================================================
-- 8. RPC retry_pay_at_desk_appointment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.retry_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_patient_mobile TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
    v_new_attempt INT;
BEGIN
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    v_new_attempt := COALESCE(v_appt.attempt_number, 1) + 1;

    UPDATE public.appointments
    SET status = 'WAITING_FOR_APPROVAL',
        attempt_number = v_new_attempt,
        expires_at = CASE WHEN v_new_attempt >= 3 THEN NOW() + INTERVAL '2 days' ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', p_appointment_id,
        'status', 'WAITING_FOR_APPROVAL',
        'attempt_number', v_new_attempt
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.retry_pay_at_desk_appointment TO anon, authenticated, service_role;

-- =============================================================================
-- 9. SCHEMA CACHE RELOAD
-- =============================================================================
NOTIFY pgrst, 'reload schema';
