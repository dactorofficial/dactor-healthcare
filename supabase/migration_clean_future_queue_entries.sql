-- ==============================================================================
-- Migration: Clean up premature future appointments in live queue_entries
-- Description:
-- Previously, booking or approving an appointment for tomorrow or a future date
-- inadvertently inserted a row into public.queue_entries (which represents the
-- clinic's daily live active queue). This migration removes any rows in
-- queue_entries that belong to future appointments (appointment_date > CURRENT_DATE).
-- ==============================================================================

BEGIN;

-- 1. Identify and remove any queue entries for appointments scheduled after today
DELETE FROM public.queue_entries qe
USING public.appointments a
WHERE qe.appointment_id = a.id
  AND a.appointment_date::date > CURRENT_DATE;

-- 2. Log confirmation
DO $$
DECLARE
    v_cleaned_count INT;
BEGIN
    GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up premature queue_entries for future dates. Rows removed: %', v_cleaned_count;
END $$;

COMMIT;
