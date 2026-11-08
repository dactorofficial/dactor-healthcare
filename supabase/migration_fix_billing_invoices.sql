-- =========================================================================
-- DACTOR PLATFORM - BILLING INVOICES FIX & ENUM EXTENSION MIGRATION
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/ojfoofojcpabqegxmsab/sql)
-- =========================================================================

-- 1. Ensure 'partial' and 'unpaid' exist in payment_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'partial'
    ) THEN
        ALTER TYPE payment_status_enum ADD VALUE 'partial';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'unpaid'
    ) THEN
        ALTER TYPE payment_status_enum ADD VALUE 'unpaid';
    END IF;
END $$;

-- 2. Ensure RLS is active with full CRUD policies on billing_invoices
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_invoices_select_rule" ON billing_invoices;
CREATE POLICY "billing_invoices_select_rule" ON billing_invoices FOR SELECT USING (true);

DROP POLICY IF EXISTS "billing_invoices_insert_rule" ON billing_invoices;
CREATE POLICY "billing_invoices_insert_rule" ON billing_invoices FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "billing_invoices_update_rule" ON billing_invoices;
CREATE POLICY "billing_invoices_update_rule" ON billing_invoices FOR UPDATE USING (true);

DROP POLICY IF EXISTS "billing_invoices_delete_rule" ON billing_invoices;
CREATE POLICY "billing_invoices_delete_rule" ON billing_invoices FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM clinics c WHERE c.id = billing_invoices.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR is_admin_portal_user()
);

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
