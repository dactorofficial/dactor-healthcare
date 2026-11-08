-- =========================================================================
-- DACTOR PLATFORM - DATABASE MIGRATION SCRIPT
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql)
-- This ensures all newly added columns and features exist natively in PostgreSQL.
-- =========================================================================

-- 1. Profiles Table Extended Columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- 2. Clinics Table Extended Columns
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS manager_phone VARCHAR(50);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS registration_doc_url TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pictures TEXT[] DEFAULT '{}';
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

-- 3. Doctors Table Extended Columns
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS starting_practicing_year INT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS education VARCHAR(255);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS personal_mobile_number VARCHAR(50);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS public_mobile_number VARCHAR(50);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Queue Entries & Clinic Consultation Duration Columns
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS consultation_duration_seconds BIGINT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS avg_consultation_time_minutes INT DEFAULT 10;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS manual_avg_consultation_time_minutes INT DEFAULT 10;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS calculated_avg_consultation_time_minutes INT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS avg_time_mode VARCHAR(20) DEFAULT 'auto';

-- 5. Appointments Selected Lab Tests
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS selected_lab_tests TEXT;

-- 6. FCM Device Tokens Table Extended Columns & Indexes
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(50);
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS patient_mobile VARCHAR(30);
ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tracking_code ON fcm_tokens(tracking_code);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_patient_mobile ON fcm_tokens(patient_mobile);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON fcm_tokens(token);

-- 7. Instant Realtime WebSocket Publication for Notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


