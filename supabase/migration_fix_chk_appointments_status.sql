-- =========================================================================
-- DACTOR PLATFORM: FIX APPOINTMENTS STATUS CHECK CONSTRAINT
-- Migration: migration_fix_chk_appointments_status.sql
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql)
-- =========================================================================

-- Ensure appointments status check constraint allows 'pending_payment'
DO $$
BEGIN
    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_status 
        CHECK (status IN ('WAITING_FOR_APPROVAL', 'APPROVED', 'UNAPPROVED', 'EXPIRED', 'pending_payment'));
END $$;
