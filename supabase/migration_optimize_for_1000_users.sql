-- =========================================================================
-- DACTOR HEALTHCARE PLATFORM: SUPABASE FREE TIER OPTIMIZATION FOR 1,000 USERS
-- Migration: migration_optimize_for_1000_users.sql
-- Goal: Eliminate sequential table scans, minimize CPU spikes on shared micro-compute,
-- and ensure query execution times remain under 10ms at scale.
-- =========================================================================

-- 1. APPOINTMENTS TABLE INDEXES
-- Critical for appointment search, live queue syncing, and portal filtering
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date_status 
    ON public.appointments (clinic_id, appointment_date, checkin_status);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_mobile 
    ON public.appointments (patient_mobile);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code 
    ON public.appointments (tracking_code_10_digit);

CREATE INDEX IF NOT EXISTS idx_appointments_user_date 
    ON public.appointments (user_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date 
    ON public.appointments (doctor_id, appointment_date);

-- 2. QUEUE ENTRIES TABLE INDEXES
-- Critical for LiveQueue real-time calculations and DoctorPortal displays
CREATE INDEX IF NOT EXISTS idx_queue_entries_clinic_status_pos 
    ON public.queue_entries (clinic_id, status, queue_position);

CREATE INDEX IF NOT EXISTS idx_queue_entries_doctor_status_pos 
    ON public.queue_entries (doctor_id, status, queue_position);

CREATE INDEX IF NOT EXISTS idx_queue_entries_appointment_id 
    ON public.queue_entries (appointment_id);

-- 3. CLINICS AND DOCTORS DIRECTORY INDEXES
-- Speeds up public directory searches and prevents heavy scans on Home/FindClinics
CREATE INDEX IF NOT EXISTS idx_clinics_activated_verification 
    ON public.clinics (is_activated, verification_status);

CREATE INDEX IF NOT EXISTS idx_doctors_clinic_kyc 
    ON public.doctors (clinic_id, kyc_status);

-- 4. BILLING INVOICES AND FINANCIAL LEDGER INDEXES
-- Speeds up clinic billing views and financial summaries
CREATE INDEX IF NOT EXISTS idx_billing_invoices_clinic_status 
    ON public.billing_invoices (clinic_id, payment_status, created_at DESC);

-- 5. NOTIFICATIONS TABLE INDEXES
-- Keeps unread notification counter queries instant
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
    ON public.notifications (user_id, is_read, created_at DESC);

-- 6. HEALTH CHECK FUNCTION (Inactivity Auto-Pause Prevention)
-- Lightweight function that external cron or ping services can call to prevent 7-day auto-pause
CREATE OR REPLACE FUNCTION public.dactor_health_ping()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'status', 'ok',
        'timestamp', now(),
        'platform', 'Dactor Healthcare Platform'
    );
$$;

GRANT EXECUTE ON FUNCTION public.dactor_health_ping() TO anon, authenticated, service_role;
