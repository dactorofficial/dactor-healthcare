-- =========================================================================
-- DACTOR PLATFORM: JOINED TRACKING CODE & CUMULATIVE BILLING LEDGER MIGRATION
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql
-- =========================================================================

-- 1. Allow appointments to share tracking_code_10_digit across follow-up attempts
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_tracking_code_10_digit_key;

-- Ensure composite uniqueness per journey attempt
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tracking_code_attempt 
ON public.appointments (tracking_code_10_digit, attempt_number);

-- Index for speedy timeline lookups
CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date 
ON public.appointments (tracking_code_10_digit, appointment_date);

-- 2. Add tracking_code_10_digit to billing_invoices for unified cumulative billing
ALTER TABLE public.billing_invoices 
ADD COLUMN IF NOT EXISTS tracking_code_10_digit VARCHAR(10);

-- Backfill tracking_code_10_digit on existing invoices from appointments
UPDATE public.billing_invoices bi
SET tracking_code_10_digit = a.tracking_code_10_digit
FROM public.appointments a
WHERE bi.appointment_id = a.id 
  AND bi.tracking_code_10_digit IS NULL;

-- Index billing_invoices by tracking_code_10_digit
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tracking_code 
ON public.billing_invoices (tracking_code_10_digit);

-- 3. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
