-- =========================================================================
-- MIGRATION: FIX CLINIC EXPENSES SCHEMA ALIGNMENT & DUAL-COLUMN COMPATIBILITY
-- Ensures public.clinic_expenses supports both modern and legacy column names:
-- (expense_time, voucher_number, remarks) <-> (receipt_no, notes, payee_name)
-- =========================================================================

-- 1. Ensure all columns exist idempotently
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS expense_time VARCHAR(20);
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS voucher_number VARCHAR(100);
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS payee_name VARCHAR(255);
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS receipt_no VARCHAR(100);
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.clinic_expenses ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Synchronize existing historical data
UPDATE public.clinic_expenses
SET voucher_number = receipt_no
WHERE voucher_number IS NULL AND receipt_no IS NOT NULL;

UPDATE public.clinic_expenses
SET receipt_no = voucher_number
WHERE receipt_no IS NULL AND voucher_number IS NOT NULL;

UPDATE public.clinic_expenses
SET remarks = notes
WHERE remarks IS NULL AND notes IS NOT NULL;

UPDATE public.clinic_expenses
SET notes = remarks
WHERE notes IS NULL AND remarks IS NOT NULL;

-- 3. Automatic bidirectional synchronization trigger
CREATE OR REPLACE FUNCTION public.sync_clinic_expenses_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Sync voucher / receipt
    IF NEW.voucher_number IS NOT NULL AND NEW.receipt_no IS NULL THEN
        NEW.receipt_no := NEW.voucher_number;
    ELSIF NEW.receipt_no IS NOT NULL AND NEW.voucher_number IS NULL THEN
        NEW.voucher_number := NEW.receipt_no;
    END IF;

    -- Sync remarks / notes
    IF NEW.remarks IS NOT NULL AND NEW.notes IS NULL THEN
        NEW.notes := NEW.remarks;
    ELSIF NEW.notes IS NOT NULL AND NEW.remarks IS NULL THEN
        NEW.remarks := NEW.notes;
    END IF;

    -- Ensure updated_at is refreshed
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clinic_expenses_columns ON public.clinic_expenses;
CREATE TRIGGER trg_sync_clinic_expenses_columns
BEFORE INSERT OR UPDATE ON public.clinic_expenses
FOR EACH ROW
EXECUTE FUNCTION public.sync_clinic_expenses_columns();

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
