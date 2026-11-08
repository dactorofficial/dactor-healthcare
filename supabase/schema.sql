-- ========================================================
-- DACTOR CLINIC MANAGEMENT PLATFORM - COMPLETE POSTGRESQL SCHEMA
-- Integrated with Supabase Auth, Storage & FCM Push Notifications
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
    CREATE TYPE clinic_type_enum AS ENUM ('single_visit', 'multi_visit', 'diagnostic_lab');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('pending', 'paid', 'refunded', 'not_required', 'partial', 'unpaid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE checkin_status_enum AS ENUM ('not_checked_in', 'checked_in');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE queue_status_enum AS ENUM ('waiting', 'inside', 'done', 'no_show', 'sample_collected', 'processing', 'report_prepared');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lab_stage_enum AS ENUM ('sample_collected', 'processing', 'prepared');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invitation_status_enum AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('patient', 'clinic_admin', 'doctor', 'lab_technician', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE target_audience_enum AS ENUM ('all_users', 'all_doctors', 'all_clinics', 'specific');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Profiles Table (Mirrored with Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_uid UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role user_role_enum DEFAULT 'patient',
    phone VARCHAR(30),
    gender VARCHAR(20),
    age INT,
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    deletion_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Clinics Table
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type clinic_type_enum DEFAULT 'single_visit',
    verification_status verification_status_enum DEFAULT 'pending',
    contact_phone VARCHAR(50) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    address_text TEXT NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL DEFAULT 27.7172,
    longitude DECIMAL(10, 7) NOT NULL DEFAULT 85.3240,
    auto_notify_threshold INT DEFAULT 2, -- Auto-alert when N patients away
    description TEXT,
    logo_url TEXT,
    registration_doc_url TEXT,
    pan_number VARCHAR(20),
    manager_phone VARCHAR(50),
    pictures TEXT[] DEFAULT '{}',
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    deletion_scheduled_at TIMESTAMPTZ,
    payment_gateway_provider VARCHAR(50) DEFAULT 'esewa',
    payment_api_key TEXT,
    payment_secret_key TEXT,
    merchant_id VARCHAR(100),
    is_direct_payment_enabled BOOLEAN DEFAULT FALSE,
    is_activated BOOLEAN DEFAULT TRUE,
    activation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    activation_plan VARCHAR(50) DEFAULT '1_month',
    activation_paid_amount DECIMAL(10, 2) DEFAULT 0.00,
    activation_notes TEXT,
    activation_payment_proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Clinic Services Table (Multiple services per clinic with pricing)
CREATE TABLE IF NOT EXISTS clinic_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    service_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Doctors Table
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    gender VARCHAR(20),
    age INT,
    starting_practicing_year INT,
    profile_picture_url TEXT,
    specialty VARCHAR(150) NOT NULL,
    education VARCHAR(255),
    nmc_license_number VARCHAR(100) NOT NULL,
    personal_mobile_number VARCHAR(50),
    public_mobile_number VARCHAR(50),
    description TEXT,
    license_doc_url TEXT,
    certificates_doc_url TEXT,
    kyc_status kyc_status_enum DEFAULT 'pending',
    is_in_clinic BOOLEAN DEFAULT FALSE, -- Doctor Presence Indicator
    consultation_fee DECIMAL(10, 2) DEFAULT 500.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Clinic Staff Invitations
CREATE TABLE IF NOT EXISTS clinic_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'doctor',
    status invitation_status_enum DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Time Slots Table
CREATE TABLE IF NOT EXISTS slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INT NOT NULL DEFAULT 5,
    booked_count INT NOT NULL DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_capacity CHECK (booked_count >= 0)
);

-- 7. Slot Reservation Locks (5-Minute Hold Concurrency Engine)
CREATE TABLE IF NOT EXISTS slot_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    user_identifier VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Appointments Table (With 10-Digit Unique Tracking Code)
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_code_10_digit VARCHAR(10) UNIQUE NOT NULL,
    slot_id UUID REFERENCES slots(id) ON DELETE SET NULL,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Nullable for unauthenticated guests
    patient_name VARCHAR(255) NOT NULL,
    patient_age INT NOT NULL,
    patient_gender VARCHAR(20) NOT NULL,
    patient_mobile VARCHAR(30) NOT NULL,
    patient_email VARCHAR(255),
    payment_status payment_status_enum DEFAULT 'pending',
    checkin_status checkin_status_enum DEFAULT 'not_checked_in',
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    fee_amount DECIMAL(10, 2) DEFAULT 0.00,
    is_walkin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Live Queue Entries Table
CREATE TABLE IF NOT EXISTS queue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
    queue_position INT NOT NULL,
    status queue_status_enum DEFAULT 'waiting',
    called_at TIMESTAMPTZ,
    inside_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Clinic Catalog Items (Quick Line Items)
CREATE TABLE IF NOT EXISTS clinic_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Billing Invoices Table
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    items JSONB DEFAULT '[]'::jsonb,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_status payment_status_enum DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Diagnostic Lab Reports Table
CREATE TABLE IF NOT EXISTS lab_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    test_name VARCHAR(255) NOT NULL,
    stage lab_stage_enum DEFAULT 'sample_collected',
    file_url TEXT,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    patient_name_verification VARCHAR(255) NOT NULL,
    sample_collected_at TIMESTAMPTZ DEFAULT NOW(),
    prepared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. FCM Device Tokens Table (Supports Registered Users & Guest Tracking Codes)
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    tracking_code VARCHAR(50),
    patient_mobile VARCHAR(30),
    device_info TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration alters to ensure columns exist on existing databases
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(50);
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS patient_mobile VARCHAR(30);
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Indexes for ultra-fast token lookups by user, tracking code, or mobile
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tracking_code ON fcm_tokens(tracking_code);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_patient_mobile ON fcm_tokens(patient_mobile);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);

-- 14. Notifications Table (Supports Super Admin Broadcasts)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'queue_alert',
    target_audience target_audience_enum DEFAULT 'specific',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------
-- FCM DEVICE TOKENS TABLE (Supports users, guest tracking codes, and mobile)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL,
    user_id UUID,
    clinic_id UUID,
    doctor_id UUID,
    tracking_code VARCHAR(50),
    patient_mobile VARCHAR(30),
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fcm_tokens_token_tracking_unique UNIQUE (token, tracking_code)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_clinic_id ON fcm_tokens(clinic_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_doctor_id ON fcm_tokens(doctor_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tracking_code ON fcm_tokens(tracking_code);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_patient_mobile ON fcm_tokens(patient_mobile);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);

-- --------------------------------------------------------
-- STORED FUNCTIONS: 5-MINUTE ATOMIC SLOT LOCK & RETROACTIVE SYNC
-- --------------------------------------------------------

-- Acquire 5-Minute Atomic Slot Lock
CREATE OR REPLACE FUNCTION acquire_slot_lock(
    p_slot_id UUID,
    p_user_identifier VARCHAR(255)
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_slot RECORD;
    v_active_locks_count INT;
    v_lock_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    DELETE FROM slot_locks WHERE expires_at < NOW();

    SELECT * INTO v_slot FROM slots WHERE id = p_slot_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Slot not found');
    END IF;

    SELECT COUNT(*) INTO v_active_locks_count
    FROM slot_locks
    WHERE slot_id = p_slot_id AND expires_at > NOW();

    IF (v_slot.booked_count + v_active_locks_count) >= v_slot.max_capacity THEN
        RETURN jsonb_build_object('success', false, 'message', 'Slot is currently full or reserved');
    END IF;

    v_expires_at := NOW() + INTERVAL '5 minutes';
    INSERT INTO slot_locks (slot_id, user_identifier, expires_at)
    VALUES (p_slot_id, p_user_identifier, v_expires_at)
    RETURNING id INTO v_lock_id;

    RETURN jsonb_build_object(
        'success', true,
        'lock_id', v_lock_id,
        'expires_at', v_expires_at
    );
END;
$$;

-- Release a Slot Lock Explicitly
CREATE OR REPLACE FUNCTION release_slot_lock(
    p_lock_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM slot_locks WHERE id = p_lock_id;
    RETURN TRUE;
END;
$$;

-- Retroactive User Appointment Sync
CREATE OR REPLACE FUNCTION sync_user_appointments(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_mobile VARCHAR(50)
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    UPDATE appointments
    SET user_id = p_user_id
    WHERE user_id IS NULL AND (patient_email = p_email OR patient_mobile = p_mobile);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

-- Migration alters for profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- Migration alters for clinics table
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_gateway_provider VARCHAR(50) DEFAULT 'esewa';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_api_key TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS payment_secret_key TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(100);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_direct_payment_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_activated BOOLEAN DEFAULT TRUE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_plan VARCHAR(50) DEFAULT '1_month';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_paid_amount DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_notes TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS activation_payment_proof_url TEXT;

-- Function to purge all patient appointments, queue entries, and clinical records when clinic archive period expires
CREATE OR REPLACE FUNCTION purge_expired_archived_clinic_data(p_clinic_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INT := 0;
    v_subcount INT;
BEGIN
    DELETE FROM queue_entries WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM lab_reports WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM billing_invoices WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM appointments WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM slots WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM clinic_services WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    RETURN v_deleted_count;
END;
$$;

-- Enable Realtime publication for instant notifications delivery
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


