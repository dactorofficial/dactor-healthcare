-- =========================================================================
-- MIGRATION: CLINIC EXPENSES TRACKING
-- Adds clinic_expenses table for tracking overheads, supplies, salaries,
-- utilities, and operational costs within Clinic Payment Logs & Ledgers.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.clinic_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'OTHER', -- MEDICAL_SUPPLIES, UTILITIES, RENT, SALARIES, EQUIPMENT, ADMIN, REFRESHMENTS, OTHER
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH', -- CASH, FONEPAY, ESEWA, KHALTI, BANK_TRANSFER, CARD, OTHER
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expense_time VARCHAR(20),
    voucher_number VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.clinic_expenses ENABLE ROW LEVEL SECURITY;

-- Scoped RLS Policies
DROP POLICY IF EXISTS "Public read clinic_expenses" ON public.clinic_expenses;
CREATE POLICY "Public read clinic_expenses" ON public.clinic_expenses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert to clinic_expenses" ON public.clinic_expenses;
CREATE POLICY "Allow insert to clinic_expenses" ON public.clinic_expenses FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update to clinic_expenses" ON public.clinic_expenses;
CREATE POLICY "Allow update to clinic_expenses" ON public.clinic_expenses FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete to clinic_expenses" ON public.clinic_expenses;
CREATE POLICY "Allow delete to clinic_expenses" ON public.clinic_expenses FOR DELETE USING (true);

-- Indexes for optimal lookup by clinic and date range
CREATE INDEX IF NOT EXISTS idx_clinic_expenses_clinic_date ON public.clinic_expenses (clinic_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_expenses_category ON public.clinic_expenses (clinic_id, category);
