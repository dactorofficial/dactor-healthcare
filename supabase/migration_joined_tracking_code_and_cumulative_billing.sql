-- =========================================================================
-- DACTOR PLATFORM: BULLETPROOF JOINED TRACKING CODE & CUMULATIVE BILLING MIGRATION
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: Dynamically drop ANY unique constraint or unique index on
-- appointments(tracking_code_10_digit) alone so follow-ups can share codes
-- -------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1.1 Drop table unique constraints on tracking_code_10_digit alone
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.appointments'::regclass 
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%(tracking_code_10_digit)%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE';
        RAISE NOTICE 'Dropped unique constraint: %', r.conname;
    END LOOP;

    -- 1.2 Drop standalone unique indexes on tracking_code_10_digit alone
    FOR r IN (
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'appointments' 
          AND indexdef ILIKE '%UNIQUE%' 
          AND indexdef ILIKE '%(tracking_code_10_digit)%'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.indexname) || ' CASCADE';
        RAISE NOTICE 'Dropped standalone unique index: %', r.indexname;
    END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- STEP 2: Ensure attempt_number exists, remove legacy <= 3 limit, and backfill
-- -------------------------------------------------------------------------
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

-- Remove legacy <= 3 limit from pay-at-desk migration so multi-visit follow-ups are unlimited
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS chk_appointments_attempt_number;

ALTER TABLE public.appointments 
ADD CONSTRAINT chk_appointments_attempt_number CHECK (attempt_number >= 1);

-- Backfill any NULL attempt numbers to 1
UPDATE public.appointments 
SET attempt_number = 1 
WHERE attempt_number IS NULL;

-- Automatically re-sequence any duplicate attempt_number for the same tracking code
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY tracking_code_10_digit 
        ORDER BY created_at ASC NULLS LAST, appointment_date ASC NULLS LAST, id ASC
    ) AS seq
    FROM public.appointments
    WHERE tracking_code_10_digit IS NOT NULL
)
UPDATE public.appointments a
SET attempt_number = ranked.seq
FROM ranked
WHERE a.id = ranked.id AND (a.attempt_number IS NULL OR a.attempt_number <> ranked.seq);

-- -------------------------------------------------------------------------
-- STEP 3: Create composite index for joined journeys
-- -------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_tracking_code_attempt 
ON public.appointments (tracking_code_10_digit, attempt_number);

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_code_date 
ON public.appointments (tracking_code_10_digit, appointment_date);

-- -------------------------------------------------------------------------
-- STEP 4: Upgrade billing_invoices with tracking_code_10_digit
-- -------------------------------------------------------------------------
ALTER TABLE public.billing_invoices 
ADD COLUMN IF NOT EXISTS tracking_code_10_digit VARCHAR(10);

-- Backfill tracking_code_10_digit from appointments
UPDATE public.billing_invoices bi
SET tracking_code_10_digit = a.tracking_code_10_digit
FROM public.appointments a
WHERE bi.appointment_id = a.id 
  AND bi.tracking_code_10_digit IS NULL;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tracking_code 
ON public.billing_invoices (tracking_code_10_digit);

-- -------------------------------------------------------------------------
-- STEP 5: Notify PostgREST to refresh schema cache
-- -------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
