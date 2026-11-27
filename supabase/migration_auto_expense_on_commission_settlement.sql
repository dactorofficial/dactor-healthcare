-- =========================================================================
-- MIGRATION: AUTO-RECORD CLINIC EXPENSE ON DACTOR 5% COMMISSION SETTLEMENT
-- File: supabase/migration_auto_expense_on_commission_settlement.sql
--
-- Behavior:
-- 1. Adds settlement_id (UNIQUE FK -> platform_commission_settlements) on
--    public.clinic_expenses so each settlement maps 1:1 to a clinic expense.
-- 2. Installs AFTER INSERT/UPDATE/DELETE trigger on
--    public.platform_commission_settlements to automatically upsert or
--    remove the corresponding clinic_expenses row when status = 'settled'.
-- 3. Backfills any existing settled commission rows that do not yet have a
--    linked clinic_expenses record.
-- =========================================================================

-- 1. Link column on clinic_expenses
ALTER TABLE public.clinic_expenses
    ADD COLUMN IF NOT EXISTS settlement_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clinic_expenses_settlement_id_fkey'
          AND conrelid = 'public.clinic_expenses'::regclass
    ) THEN
        ALTER TABLE public.clinic_expenses
            ADD CONSTRAINT clinic_expenses_settlement_id_fkey
            FOREIGN KEY (settlement_id)
            REFERENCES public.platform_commission_settlements(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_expenses_settlement_id_unique
    ON public.clinic_expenses (settlement_id)
    WHERE settlement_id IS NOT NULL;

-- 2. Trigger function to sync settled 5% commission -> clinic_expenses
CREATE OR REPLACE FUNCTION public.sync_platform_settlement_to_clinic_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_settled_nepal TIMESTAMP;
    v_expense_date DATE;
    v_expense_time VARCHAR(20);
    v_title VARCHAR(255);
    v_remarks TEXT;
    v_method VARCHAR(50);
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.clinic_expenses WHERE settlement_id = OLD.id;
        RETURN OLD;
    END IF;

    -- Only mark as expense when settlement is actually settled and amount > 0
    IF LOWER(COALESCE(NEW.status, '')) = 'settled' AND COALESCE(NEW.commission_amount_npr, 0) > 0 THEN
        v_settled_nepal := COALESCE(NEW.settled_at, NOW()) AT TIME ZONE 'Asia/Kathmandu';
        v_expense_date := v_settled_nepal::date;
        v_expense_time := to_char(v_settled_nepal, 'HH24:MI');
        v_title := 'Dactor 5% Commission (' || to_char(NEW.period_start, 'YYYY-MM-DD') || ' to ' || to_char(NEW.period_end, 'YYYY-MM-DD') || ')';
        v_method := COALESCE(NULLIF(TRIM(NEW.payment_method), ''), 'BANK_TRANSFER');
        v_remarks := COALESCE(
            NULLIF(TRIM(NEW.notes), ''),
            'Auto-recorded 5% Pay-at-Desk commission settlement (' || COALESCE(NEW.appointments_count, 0) || ' bookings, Gross NPR ' || COALESCE(NEW.gross_desk_amount_npr, 0) || ')'
        );

        INSERT INTO public.clinic_expenses (
            clinic_id,
            title,
            category,
            amount,
            payment_method,
            expense_date,
            expense_time,
            voucher_number,
            receipt_no,
            payee_name,
            remarks,
            notes,
            settlement_id,
            created_at,
            updated_at
        ) VALUES (
            NEW.clinic_id,
            v_title,
            'PLATFORM_COMMISSION',
            NEW.commission_amount_npr,
            v_method,
            v_expense_date,
            v_expense_time,
            NULLIF(TRIM(NEW.transaction_reference), ''),
            NULLIF(TRIM(NEW.transaction_reference), ''),
            'Dactor Platform',
            v_remarks,
            '[' || v_expense_time || '] ' || v_remarks,
            NEW.id,
            COALESCE(NEW.settled_at, NOW()),
            NOW()
        )
        ON CONFLICT (settlement_id) WHERE settlement_id IS NOT NULL
        DO UPDATE SET
            clinic_id = EXCLUDED.clinic_id,
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            payment_method = EXCLUDED.payment_method,
            expense_date = EXCLUDED.expense_date,
            expense_time = EXCLUDED.expense_time,
            voucher_number = EXCLUDED.voucher_number,
            receipt_no = EXCLUDED.receipt_no,
            payee_name = EXCLUDED.payee_name,
            remarks = EXCLUDED.remarks,
            notes = EXCLUDED.notes,
            updated_at = NOW();
    ELSE
        -- Remove linked expense if status changed to waived / pending or amount <= 0
        DELETE FROM public.clinic_expenses WHERE settlement_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_platform_settlement_to_clinic_expense ON public.platform_commission_settlements;
CREATE TRIGGER trg_sync_platform_settlement_to_clinic_expense
AFTER INSERT OR UPDATE OR DELETE ON public.platform_commission_settlements
FOR EACH ROW
EXECUTE FUNCTION public.sync_platform_settlement_to_clinic_expense();

-- 3. One-time backfill for existing settled commission settlements
INSERT INTO public.clinic_expenses (
    clinic_id,
    title,
    category,
    amount,
    payment_method,
    expense_date,
    expense_time,
    voucher_number,
    receipt_no,
    payee_name,
    remarks,
    notes,
    settlement_id,
    created_at,
    updated_at
)
SELECT
    s.clinic_id,
    'Dactor 5% Commission (' || to_char(s.period_start, 'YYYY-MM-DD') || ' to ' || to_char(s.period_end, 'YYYY-MM-DD') || ')',
    'PLATFORM_COMMISSION',
    s.commission_amount_npr,
    COALESCE(NULLIF(TRIM(s.payment_method), ''), 'BANK_TRANSFER'),
    (COALESCE(s.settled_at, s.created_at, NOW()) AT TIME ZONE 'Asia/Kathmandu')::date,
    to_char(COALESCE(s.settled_at, s.created_at, NOW()) AT TIME ZONE 'Asia/Kathmandu', 'HH24:MI'),
    NULLIF(TRIM(s.transaction_reference), ''),
    NULLIF(TRIM(s.transaction_reference), ''),
    'Dactor Platform',
    COALESCE(
        NULLIF(TRIM(s.notes), ''),
        'Auto-recorded 5% Pay-at-Desk commission settlement (' || COALESCE(s.appointments_count, 0) || ' bookings, Gross NPR ' || COALESCE(s.gross_desk_amount_npr, 0) || ')'
    ),
    '[' || to_char(COALESCE(s.settled_at, s.created_at, NOW()) AT TIME ZONE 'Asia/Kathmandu', 'HH24:MI') || '] ' || COALESCE(
        NULLIF(TRIM(s.notes), ''),
        'Auto-recorded 5% Pay-at-Desk commission settlement (' || COALESCE(s.appointments_count, 0) || ' bookings, Gross NPR ' || COALESCE(s.gross_desk_amount_npr, 0) || ')'
    ),
    s.id,
    COALESCE(s.settled_at, s.created_at, NOW()),
    NOW()
FROM public.platform_commission_settlements s
WHERE LOWER(COALESCE(s.status, '')) = 'settled'
  AND COALESCE(s.commission_amount_npr, 0) > 0
ON CONFLICT (settlement_id) WHERE settlement_id IS NOT NULL DO NOTHING;
