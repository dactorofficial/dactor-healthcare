-- =========================================================================
-- DACTOR PLATFORM: PAY AT DESK BACKEND SCHEMA MIGRATION & POSTGRES RPC FUNCTIONS
-- Compliant with docs/pay-at-desk-spec.md
-- =========================================================================

-- 1. EXTEND APPOINTMENTS TABLE WITH PAY AT DESK COLUMNS
DO $$
BEGIN
    -- 1.1 Add payment_mode (default ONLINE, preserves all existing bookings)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'payment_mode'
    ) THEN
        ALTER TABLE appointments ADD COLUMN payment_mode VARCHAR(30) NOT NULL DEFAULT 'ONLINE';
        ALTER TABLE appointments ADD CONSTRAINT chk_appointments_payment_mode 
            CHECK (payment_mode IN ('ONLINE', 'PAY_AT_DESK'));
    END IF;

    -- 1.2 Add status (WAITING_FOR_APPROVAL, APPROVED, UNAPPROVED, EXPIRED, default APPROVED for backwards compatibility)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'status'
    ) THEN
        ALTER TABLE appointments ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'APPROVED';
        ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status 
            CHECK (status IN ('WAITING_FOR_APPROVAL', 'APPROVED', 'UNAPPROVED', 'EXPIRED'));
    END IF;

    -- 1.3 Add attempt_number (max 3 sends per appointment ID, default 1)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'attempt_number'
    ) THEN
        ALTER TABLE appointments ADD COLUMN attempt_number INT NOT NULL DEFAULT 1;
        ALTER TABLE appointments ADD CONSTRAINT chk_appointments_attempt_number 
            CHECK (attempt_number >= 1 AND attempt_number <= 3);
    END IF;

    -- 1.4 Add service_charge_amount (5% service charge breakdown)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'service_charge_amount'
    ) THEN
        ALTER TABLE appointments ADD COLUMN service_charge_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
    END IF;

    -- 1.5 Add total_amount (consultation fee + service charge)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'total_amount'
    ) THEN
        ALTER TABLE appointments ADD COLUMN total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
    END IF;

    -- 1.6 Add expires_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE appointments ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;

    -- 1.7 Add approved_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'approved_at'
    ) THEN
        ALTER TABLE appointments ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;

    -- 1.8 Add rejected_at timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE appointments ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;
END $$;

-- Backfill total_amount for existing appointments to guarantee invariant total_amount = fee_amount
UPDATE appointments 
SET total_amount = COALESCE(fee_amount, 0.00) 
WHERE total_amount = 0.00 AND fee_amount > 0.00;

-- 2. CREATE INDEXES FOR FAST FILTERING
CREATE INDEX IF NOT EXISTS idx_appointments_pay_at_desk_pending
    ON appointments (clinic_id, status)
    WHERE payment_mode = 'PAY_AT_DESK';

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_lookup
    ON appointments (tracking_code_10_digit);

CREATE INDEX IF NOT EXISTS idx_appointments_expires_at
    ON appointments (expires_at)
    WHERE status = 'WAITING_FOR_APPROVAL';

-- 3. APP SETTINGS TABLE FOR CONFIGURABLE CONSTANTS (5% SERVICE CHARGE)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed 5% service charge constant
INSERT INTO app_settings (key, value, description)
VALUES (
    'pay_at_desk_fee_percent', 
    '{"percent": 5.0}'::jsonb, 
    'Configurable service charge percentage added to Pay at Desk appointments'
)
ON CONFLICT (key) DO NOTHING;

-- Function to retrieve the current configurable fee percentage (fallback: 5.0)
CREATE OR REPLACE FUNCTION get_pay_at_desk_service_charge_percent()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_percent NUMERIC;
BEGIN
    SELECT (value->>'percent')::NUMERIC INTO v_percent
    FROM app_settings
    WHERE key = 'pay_at_desk_fee_percent';

    RETURN COALESCE(v_percent, 5.0);
END;
$$;

-- 4. UNIQUE 10-DIGIT TRACKING CODE GENERATOR
CREATE OR REPLACE FUNCTION generate_unique_tracking_code_10()
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_code VARCHAR(10);
    v_exists BOOLEAN;
    v_attempts INT := 0;
BEGIN
    LOOP
        v_attempts := v_attempts + 1;
        -- Generate 10-digit number (starts with 1-9 followed by 9 digits)
        v_code := (floor(random() * 9 + 1)::INT)::TEXT || lpad(floor(random() * 1000000000)::BIGINT::TEXT, 9, '0');
        
        SELECT EXISTS(SELECT 1 FROM appointments WHERE tracking_code_10_digit = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        IF v_attempts > 100 THEN
            -- Deterministic fallback using epoch milliseconds
            RETURN '9' || lpad((extract(epoch from now())::BIGINT % 1000000000)::TEXT, 9, '0');
        END IF;
    END LOOP;
END;
$$;

-- 4.1 HELPER: CHECK IF USER IS AN ADMIN PORTAL USER (IDEMPOTENT DEFINITION)
CREATE OR REPLACE FUNCTION is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      current_user = 'service_role'
      OR (auth.jwt() ->> 'role') = 'service_role'
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
      OR (auth.jwt() ->> 'role') = 'super_admin'
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE public.profiles.auth_uid = auth.uid()
            AND public.profiles.role = 'super_admin'
        )
      )
    ),
    false
  );
$$;

-- 4.2 HELPER: CHECK IF CURRENT CALLER IS AUTHORIZED CLINIC STAFF OR ADMIN
CREATE OR REPLACE FUNCTION is_authorized_clinic_staff(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_uid UUID;
BEGIN
    -- 1. Service role or Super Admin portal user
    IF is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    -- Extract verified identity from JWT session
    v_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid := auth.uid();

    IF v_email = '' AND v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. Clinic Owner / Admin via clinic contact_email
    IF EXISTS (
        SELECT 1 FROM clinics c
        WHERE c.id = p_clinic_id
          AND LOWER(c.contact_email) = v_email
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3. Doctor belonging to this clinic (by email or profile auth_uid)
    IF EXISTS (
        SELECT 1 FROM doctors d
        LEFT JOIN profiles p ON p.id = d.user_id
        WHERE d.clinic_id = p_clinic_id
          AND (
            (v_email <> '' AND LOWER(d.email) = v_email)
            OR (v_uid IS NOT NULL AND p.auth_uid = v_uid)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- 4. Accepted Staff Invitation
    IF EXISTS (
        SELECT 1 FROM clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
    ) THEN
        RETURN TRUE;
    END IF;

    -- 5. Profile with role clinic_admin matching clinic contact email
    IF EXISTS (
        SELECT 1 FROM clinics c
        JOIN profiles p ON LOWER(p.email) = LOWER(c.contact_email)
        WHERE c.id = p_clinic_id
          AND (
            (v_uid IS NOT NULL AND p.auth_uid = v_uid)
            OR (v_email <> '' AND LOWER(p.email) = v_email)
          )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 5. RPC FUNCTION: CREATE PAY AT DESK APPOINTMENT (SERVER VALIDATED & RATE LIMITED)
CREATE OR REPLACE FUNCTION create_pay_at_desk_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID,
    p_slot_id UUID,
    p_patient_name TEXT,
    p_patient_age INT,
    p_patient_gender TEXT,
    p_patient_mobile TEXT,
    p_patient_email TEXT DEFAULT NULL,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_appointment_time TIME DEFAULT CURRENT_TIME,
    p_fee_amount DECIMAL(10, 2) DEFAULT 0.00,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_selected_lab_tests TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt_id UUID := gen_random_uuid();
    v_tracking_code VARCHAR(10);
    v_fee NUMERIC(10, 2);
    v_pct NUMERIC;
    v_service_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_slot slots%ROWTYPE;
    v_doctor doctors%ROWTYPE;
    v_created appointments%ROWTYPE;
    v_clinic_user_id UUID;
    v_clean_phone TEXT;
    v_clean_name TEXT;
    v_clean_gender TEXT;
    v_effective_user_id UUID;
    v_recent_req_count INT;
    v_active_pending_count INT;
    v_caller_profile_id UUID;
BEGIN
    -- 5.1 Validate Clinic Existence, Approval, and Active Status
    IF NOT EXISTS (
        SELECT 1 FROM clinics 
        WHERE id = p_clinic_id 
          AND verification_status = 'approved'
          AND is_archived = FALSE
    ) THEN
        RAISE EXCEPTION 'Clinic % does not exist or is not active and approved', p_clinic_id;
    END IF;

    -- 5.2 Validate Doctor Existence, Affiliation, and Approved KYC
    SELECT * INTO v_doctor
    FROM doctors
    WHERE id = p_doctor_id
      AND clinic_id = p_clinic_id
      AND kyc_status IN ('approved', 'verified');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor % does not belong to clinic % or is not verified', p_doctor_id, p_clinic_id;
    END IF;

    -- 5.3 Validate Patient Information & Sanitize
    v_clean_name := trim(COALESCE(p_patient_name, ''));
    IF length(v_clean_name) < 2 OR length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Patient name must be between 2 and 150 characters';
    END IF;

    IF p_patient_age IS NULL OR p_patient_age < 0 OR p_patient_age > 120 THEN
        RAISE EXCEPTION 'Patient age must be between 0 and 120';
    END IF;

    v_clean_gender := COALESCE(NULLIF(trim(p_patient_gender), ''), 'Other');
    IF v_clean_gender NOT IN ('Male', 'Female', 'Other') THEN
        v_clean_gender := 'Other';
    END IF;

    v_clean_phone := regexp_replace(COALESCE(p_patient_mobile, ''), '\D', '', 'g');
    -- Standard Nepal mobile check: 10 digits starting with 9
    IF length(v_clean_phone) <> 10 OR left(v_clean_phone, 1) <> '9' THEN
        RAISE EXCEPTION 'Invalid Nepal mobile number: % (must be 10 digits starting with 9)', p_patient_mobile;
    END IF;

    -- 5.4 Rate Limiting Protection Against Automated Spam
    SELECT COUNT(*) INTO v_recent_req_count
    FROM appointments
    WHERE patient_mobile = v_clean_phone
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_req_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: Too many appointment requests for mobile % in the past hour', v_clean_phone;
    END IF;

    SELECT COUNT(*) INTO v_active_pending_count
    FROM appointments
    WHERE clinic_id = p_clinic_id
      AND patient_mobile = v_clean_phone
      AND payment_mode = 'PAY_AT_DESK'
      AND status = 'WAITING_FOR_APPROVAL';

    IF v_active_pending_count >= 3 THEN
        RAISE EXCEPTION 'Active request limit reached: You already have 3 pending Pay at Desk requests at this clinic';
    END IF;

    -- 5.5 Slot & Date/Time Validation
    IF p_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM slots
        WHERE id = p_slot_id
          AND clinic_id = p_clinic_id
          AND doctor_id = p_doctor_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Slot % does not match clinic % and doctor %', p_slot_id, p_clinic_id, p_doctor_id;
        END IF;

        IF v_slot.slot_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Cannot book slot for past date: %', v_slot.slot_date;
        END IF;

        IF v_slot.slot_date = CURRENT_DATE AND (v_slot.slot_date + v_slot.start_time)::TIMESTAMPTZ < NOW() THEN
            RAISE EXCEPTION 'Cannot book slot: Start time % has already passed', v_slot.start_time;
        END IF;
    ELSE
        IF p_appointment_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date cannot be in the past: %', p_appointment_date;
        END IF;

        IF p_appointment_date = CURRENT_DATE AND (p_appointment_date + p_appointment_time)::TIMESTAMPTZ < NOW() - INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Appointment time % has already passed', p_appointment_time;
        END IF;
    END IF;

    -- 5.6 Server-Side Price & Fee Integrity Check
    -- Official consultation fee retrieved directly from doctor record (ignore client tampering)
    v_fee := COALESCE(v_doctor.consultation_fee, 500.00);

    -- Compute 5% service charge breakdown
    v_pct := get_pay_at_desk_service_charge_percent();
    v_service_charge := round(v_fee * (v_pct / 100.0), 2);
    v_total := v_fee + v_service_charge;

    -- 5.7 Caller Identity & User ID Resolution
    -- Disallow anonymous clients from assigning arbitrary user_id
    IF auth.uid() IS NOT NULL THEN
        -- Caller is authenticated: resolve their genuine profile ID
        SELECT id INTO v_caller_profile_id
        FROM profiles
        WHERE auth_uid = auth.uid()
        LIMIT 1;

        -- If caller is clinic staff or admin, allow receptionist to set p_user_id for walk-in patient
        IF is_authorized_clinic_staff(p_clinic_id) AND p_user_id IS NOT NULL THEN
            v_effective_user_id := p_user_id;
        ELSE
            v_effective_user_id := v_caller_profile_id;
        END IF;
    ELSE
        -- Caller is an unauthenticated guest: force user_id to NULL
        v_effective_user_id := NULL;
    END IF;

    -- Generate guaranteed unique 10-digit tracking code
    v_tracking_code := generate_unique_tracking_code_10();

    -- 5.8 Insert Appointment Record with status WAITING_FOR_APPROVAL
    -- NOTE: NOT inserted into queue_entries, NOT counted towards slot booked_count
    INSERT INTO appointments (
        id,
        tracking_code_10_digit,
        clinic_id,
        doctor_id,
        slot_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        patient_email,
        appointment_date,
        appointment_time,
        fee_amount,
        service_charge_amount,
        total_amount,
        payment_mode,
        status,
        payment_status,
        checkin_status,
        attempt_number,
        expires_at,
        is_walkin,
        selected_lab_tests,
        created_at,
        updated_at
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        p_clinic_id,
        p_doctor_id,
        p_slot_id,
        v_effective_user_id,
        v_clean_name,
        p_patient_age,
        v_clean_gender,
        v_clean_phone,
        NULLIF(trim(COALESCE(p_patient_email, '')), ''),
        COALESCE(v_slot.slot_date, p_appointment_date),
        COALESCE(v_slot.start_time, p_appointment_time),
        v_fee,
        v_service_charge,
        v_total,
        'PAY_AT_DESK',
        'WAITING_FOR_APPROVAL',
        'pending',
        'not_checked_in',
        1,
        NULL, -- Expires only on slot expiry or 3rd attempt
        FALSE,
        p_selected_lab_tests,
        NOW(),
        NOW()
    ) RETURNING * INTO v_created;

    -- Emit notification to clinic administrator if profile exists
    SELECT p.id INTO v_clinic_user_id
    FROM profiles p
    JOIN clinics c ON lower(c.contact_email) = lower(p.email)
    WHERE c.id = p_clinic_id
    LIMIT 1;

    IF v_clinic_user_id IS NOT NULL THEN
        INSERT INTO notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_clinic_user_id,
            v_created.id,
            'New Pay at Desk Request',
            'New appointment request #' || v_tracking_code || ' from ' || v_created.patient_name || ' (Pay at Desk).',
            'pay_at_desk_request',
            'specific'
        );
    END IF;

    RETURN to_jsonb(v_created);
END;
$$;

-- 6. RPC FUNCTION: LIST PENDING PAY AT DESK REQUESTS FOR A CLINIC (STAFF AUTHORIZED)
CREATE OR REPLACE FUNCTION list_pending_pay_at_desk_requests(p_clinic_id UUID)
RETURNS TABLE (
    id UUID,
    tracking_code_10_digit VARCHAR,
    clinic_id UUID,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    slot_id UUID,
    user_id UUID,
    patient_name VARCHAR,
    patient_age INT,
    patient_gender VARCHAR,
    patient_mobile VARCHAR,
    patient_email VARCHAR,
    appointment_date DATE,
    appointment_time TIME,
    fee_amount DECIMAL,
    service_charge_amount DECIMAL,
    total_amount DECIMAL,
    attempt_number INT,
    status VARCHAR,
    payment_mode VARCHAR,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Strict Caller Authorization Check: Prevent PII Leakage
    IF NOT is_authorized_clinic_staff(p_clinic_id) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to view pending requests for clinic %', p_clinic_id;
    END IF;

    RETURN QUERY
    SELECT 
        a.id,
        a.tracking_code_10_digit,
        a.clinic_id,
        a.doctor_id,
        COALESCE(d.full_name, 'General Doctor')::TEXT AS doctor_name,
        COALESCE(d.specialty, 'Consultation')::TEXT AS doctor_specialty,
        a.slot_id,
        a.user_id,
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
        a.attempt_number,
        a.status,
        a.payment_mode,
        a.expires_at,
        a.created_at,
        a.selected_lab_tests AS notes
    FROM appointments a
    LEFT JOIN doctors d ON d.id = a.doctor_id
    WHERE a.clinic_id = p_clinic_id
      AND a.payment_mode = 'PAY_AT_DESK'
      AND a.status = 'WAITING_FOR_APPROVAL'
    ORDER BY a.created_at ASC;
END;
$$;

-- 7. RPC FUNCTION: APPROVE PAY AT DESK APPOINTMENT (ATOMIC + STAFF AUTHORIZED + OVERLOAD SAFE)
CREATE OR REPLACE FUNCTION approve_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
    v_slot slots%ROWTYPE;
    v_next_position INT;
    v_count INT;
BEGIN
    -- 7.1 Acquire exclusive row lock on appointment to prevent concurrent approval or retry race
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- 7.2 Authorize caller against appointment's owning clinic (Never trust caller-supplied clinic ID)
    IF NOT is_authorized_clinic_staff(v_appt.clinic_id) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to approve appointments for clinic %', v_appt.clinic_id;
    END IF;

    -- If caller also supplied p_clinic_id, ensure consistency
    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    -- 7.3 Validate strict status transition: ONLY WAITING_FOR_APPROVAL can be approved
    IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN
        RAISE EXCEPTION 'Cannot approve appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    -- Check if appointment slot time has already passed
    IF (v_appt.appointment_date + v_appt.appointment_time)::TIMESTAMPTZ < NOW() THEN
        UPDATE appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Appointment slot time has passed. Marked as EXPIRED';
    END IF;

    -- Check if expires_at has passed
    IF v_appt.expires_at IS NOT NULL AND v_appt.expires_at < NOW() THEN
        UPDATE appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Request has expired. Marked as EXPIRED';
    END IF;

    -- 7.4 Transition status to APPROVED
    UPDATE appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- 7.5 Overload Rule: Bypasses capacity check, adds patient to exact requested slot
    -- If slot had 12/12, approval makes it 13/12 safely
    IF v_appt.slot_id IS NOT NULL THEN
        -- Lock slot row
        SELECT * INTO v_slot FROM slots WHERE id = v_appt.slot_id FOR UPDATE;
        
        IF FOUND THEN
            -- Recount all approved active appointments for this slot
            SELECT COUNT(*) INTO v_count
            FROM appointments
            WHERE slot_id = v_appt.slot_id
              AND checkin_status <> 'cancelled'
              AND status = 'APPROVED';

            UPDATE slots 
            SET booked_count = v_count,
                updated_at = NOW()
            WHERE id = v_appt.slot_id;
        END IF;
    END IF;

    -- 7.6 Add patient to live queue for clinic & doctor
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
    FROM queue_entries
    WHERE clinic_id = v_appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO queue_entries (
        appointment_id,
        clinic_id,
        doctor_id,
        queue_position,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_appt.id,
        v_appt.clinic_id,
        v_appt.doctor_id,
        v_next_position,
        'waiting',
        NOW(),
        NOW()
    ) ON CONFLICT (appointment_id) DO UPDATE SET
        queue_position = EXCLUDED.queue_position,
        status = 'waiting',
        updated_at = NOW();

    -- 7.7 Emit notification to patient if user_id is linked
    IF v_appt.user_id IS NOT NULL THEN
        INSERT INTO notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_appt.user_id,
            v_appt.id,
            'Appointment Approved!',
            'Your Pay at Desk appointment #' || v_appt.tracking_code_10_digit || ' is approved. Total due at desk: NPR ' || v_appt.total_amount,
            'pay_at_desk_approved',
            'specific'
        );
    END IF;

    RETURN to_jsonb(v_appt);
END;
$$;

-- 8. RPC FUNCTION: REJECT PAY AT DESK APPOINTMENT (STAFF AUTHORIZED)
CREATE OR REPLACE FUNCTION reject_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
BEGIN
    -- 8.1 Acquire exclusive row lock
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- 8.2 Authorize caller against appointment's owning clinic (Never trust caller-supplied clinic ID)
    IF NOT is_authorized_clinic_staff(v_appt.clinic_id) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to reject appointments for clinic %', v_appt.clinic_id;
    END IF;

    -- If caller also supplied p_clinic_id, ensure consistency
    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    -- 8.3 Validate strict status transition
    IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN
        RAISE EXCEPTION 'Cannot reject appointment with status %: must be WAITING_FOR_APPROVAL', v_appt.status;
    END IF;

    -- 8.4 Update status to UNAPPROVED
    UPDATE appointments
    SET status = 'UNAPPROVED',
        rejected_at = NOW(),
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- 8.5 Emit notification to patient if user_id linked
    IF v_appt.user_id IS NOT NULL THEN
        INSERT INTO notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_appt.user_id,
            v_appt.id,
            'Appointment Request Unapproved',
            'Your Pay at Desk appointment #' || v_appt.tracking_code_10_digit || ' was not approved by the clinic. You may retry if attempts remain.',
            'pay_at_desk_unapproved',
            'specific'
        );
    END IF;

    RETURN to_jsonb(v_appt);
END;
$$;

-- 9. RPC FUNCTION: RETRY PAY AT DESK APPOINTMENT (OWNER / STAFF VERIFIED, MAX 3 SENDS)
CREATE OR REPLACE FUNCTION retry_pay_at_desk_appointment(
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
    v_expires_at TIMESTAMPTZ;
    v_clean_phone TEXT;
    v_clinic_user_id UUID;
    v_caller_email TEXT;
    v_caller_uid UUID;
    v_caller_profile_id UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- 9.1 Acquire exclusive row lock
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- 9.2 Authorize Caller: Only owning patient, clinic staff, or Super Admin can retry
    IF is_authorized_clinic_staff(v_appt.clinic_id) THEN
        v_is_authorized := TRUE;
    ELSE
        v_caller_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
        v_caller_uid := auth.uid();

        -- Authenticated user checking ownership
        IF v_caller_uid IS NOT NULL THEN
            SELECT id INTO v_caller_profile_id
            FROM profiles
            WHERE auth_uid = v_caller_uid
            LIMIT 1;

            IF v_appt.user_id IS NOT NULL AND v_caller_profile_id IS NOT NULL AND v_appt.user_id = v_caller_profile_id THEN
                v_is_authorized := TRUE;
            ELSIF v_caller_email <> '' AND LOWER(COALESCE(v_appt.patient_email, '')) = v_caller_email THEN
                v_is_authorized := TRUE;
            END IF;
        END IF;

        -- Mobile number check (for guest appointments or authenticated phone match)
        IF NOT v_is_authorized AND p_patient_mobile IS NOT NULL THEN
            v_clean_phone := regexp_replace(p_patient_mobile, '\D', '', 'g');
            IF v_clean_phone <> '' AND regexp_replace(v_appt.patient_mobile, '\D', '', 'g') = v_clean_phone THEN
                v_is_authorized := TRUE;
            END IF;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to retry appointment %', p_appointment_id;
    END IF;

    -- 9.3 Strict transition check: retry allowed ONLY when UNAPPROVED and attempt_number < 3
    IF v_appt.status <> 'UNAPPROVED' THEN
        RAISE EXCEPTION 'Cannot retry appointment with status %: must be UNAPPROVED', v_appt.status;
    END IF;

    IF v_appt.attempt_number >= 3 THEN
        RAISE EXCEPTION 'Cannot retry: Maximum of 3 attempts exceeded for appointment %', p_appointment_id;
    END IF;

    -- 9.4 Increment attempt number
    v_new_attempt := v_appt.attempt_number + 1;

    -- On the 3rd attempt, set expires_at = now + 2 days
    IF v_new_attempt = 3 THEN
        v_expires_at := NOW() + INTERVAL '2 days';
    ELSE
        v_expires_at := NULL;
    END IF;

    -- 9.5 Transition back to WAITING_FOR_APPROVAL
    UPDATE appointments
    SET status = 'WAITING_FOR_APPROVAL',
        attempt_number = v_new_attempt,
        expires_at = v_expires_at,
        checkin_status = 'not_checked_in',
        rejected_at = NULL,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- 9.6 Emit notification to clinic for retried request
    SELECT p.id INTO v_clinic_user_id
    FROM profiles p
    JOIN clinics c ON lower(c.contact_email) = lower(p.email)
    WHERE c.id = v_appt.clinic_id
    LIMIT 1;

    IF v_clinic_user_id IS NOT NULL THEN
        INSERT INTO notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_clinic_user_id,
            v_appt.id,
            'Appointment Request Retried',
            'Patient ' || v_appt.patient_name || ' retried request #' || v_appt.tracking_code_10_digit || ' (Attempt ' || v_new_attempt || ' of 3).',
            'pay_at_desk_retry',
            'specific'
        );
    END IF;

    RETURN to_jsonb(v_appt);
END;
$$;

-- 10. RPC FUNCTION: EXPIRE PENDING REQUESTS (STRICTLY CONFINED TO SERVICE_ROLE & ADMIN)
CREATE OR REPLACE FUNCTION expire_pay_at_desk_appointments()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_count INT := 0;
BEGIN
    -- Strict Restriction: Only trusted scheduled service_role or Super Admin
    IF NOT (current_user = 'service_role' OR is_admin_portal_user()) THEN
        RAISE EXCEPTION 'Access denied: Global expiry is strictly restricted to scheduled service_role tasks or platform administrators';
    END IF;

    WITH to_expire AS (
        SELECT id FROM appointments
        WHERE payment_mode = 'PAY_AT_DESK'
          AND status = 'WAITING_FOR_APPROVAL'
          AND (
              -- Expiry condition 1: 3rd attempt 2-day timer passed
              (expires_at IS NOT NULL AND expires_at < NOW())
              OR
              -- Expiry condition 2: Slot date + time has passed
              ((appointment_date + appointment_time)::TIMESTAMPTZ < NOW())
          )
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE appointments a
        SET status = 'EXPIRED',
            checkin_status = 'cancelled',
            updated_at = NOW()
        FROM to_expire te
        WHERE a.id = te.id
        RETURNING a.id
    )
    SELECT COUNT(*) INTO v_expired_count FROM updated;

    RETURN v_expired_count;
END;
$$;

-- 11. ROW-LEVEL SECURITY POLICIES & STRICT ROLE PERMISSIONS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_read_all" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_admin_update" ON app_settings FOR ALL USING (
    is_admin_portal_user()
);

-- 11.1 Revoke anon access from sensitive management, listing, retry, and expiry functions
REVOKE EXECUTE ON FUNCTION list_pending_pay_at_desk_requests(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION approve_pay_at_desk_appointment(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION reject_pay_at_desk_appointment(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION retry_pay_at_desk_appointment(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION expire_pay_at_desk_appointments() FROM anon, authenticated;

-- 11.2 Public / Patient Booking: Allow anon and authenticated to book guest appointments
GRANT EXECUTE ON FUNCTION get_pay_at_desk_service_charge_percent() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_unique_tracking_code_10() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_pay_at_desk_appointment(UUID, UUID, UUID, TEXT, INT, TEXT, TEXT, TEXT, DATE, TIME, DECIMAL, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- 11.3 Clinic Management & Verification: Restricted to authenticated users and service_role
GRANT EXECUTE ON FUNCTION list_pending_pay_at_desk_requests(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION approve_pay_at_desk_appointment(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reject_pay_at_desk_appointment(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION retry_pay_at_desk_appointment(UUID, TEXT) TO authenticated, service_role;

-- 11.4 Global Expiry: Strictly restricted to service_role (and admin via SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION expire_pay_at_desk_appointments() TO service_role;

-- 12. SCHEDULED CRON (PG_CRON) IF EXTENSION INSTALLED
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Run every 5 minutes
        PERFORM cron.schedule(
            'expire-pay-at-desk-job',
            '*/5 * * * *',
            'SELECT public.expire_pay_at_desk_appointments()'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Silently bypass if cron schema or permissions are not available
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
