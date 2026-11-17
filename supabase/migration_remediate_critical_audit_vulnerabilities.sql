-- =========================================================================
-- DACTOR PLATFORM: REMEDIATION OF CRITICAL AUDIT VULNERABILITIES
-- Migration: migration_remediate_critical_audit_vulnerabilities.sql
-- Addresses findings from Cloudflare Security Audit:
--   - VULN-01: Platform Payment Gateway Private Keys & Secrets Exposed (CWE-284/798)
--   - VULN-03: Clinic Gateway Credentials Serialized into Public Table (CWE-200/798)
--   - VULN-05: Public CRUD on Clinic Expenses Table (CWE-284/285)
--   - VULN-12: Direct Storage Bucket Insertion Permitted (CWE-284/732)
--   - VULN-14: Permissive Read/Insert on Invoice Transactions (CWE-284/285)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. VULN-01: SECURE platform_payment_settings RLS
-- Revoke anonymous access completely. Only authenticated super admins or service_role.
-- -------------------------------------------------------------------------
ALTER TABLE public.platform_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select platform_payment_settings" ON public.platform_payment_settings;
DROP POLICY IF EXISTS "Allow read platform_payment_settings" ON public.platform_payment_settings;
DROP POLICY IF EXISTS "Allow all for platform_payment_settings" ON public.platform_payment_settings;
DROP POLICY IF EXISTS "platform_payment_settings_select_admin" ON public.platform_payment_settings;
DROP POLICY IF EXISTS "platform_payment_settings_write_admin" ON public.platform_payment_settings;

CREATE POLICY "platform_payment_settings_select_admin" ON public.platform_payment_settings
    FOR SELECT TO authenticated, service_role
    USING (
        public.is_admin_portal_user()
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "platform_payment_settings_write_admin" ON public.platform_payment_settings
    FOR ALL TO authenticated, service_role
    USING (
        public.is_admin_portal_user()
        OR (auth.jwt() ->> 'role') = 'service_role'
    )
    WITH CHECK (
        public.is_admin_portal_user()
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

-- -------------------------------------------------------------------------
-- 2. VULN-05: SCOPED RLS FOR clinic_expenses
-- Revoke public USING (true) / WITH CHECK (true) policies.
-- Restrict to verified clinic staff or platform admins.
-- -------------------------------------------------------------------------
ALTER TABLE public.clinic_expenses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'clinic_expenses' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinic_expenses', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "clinic_expenses_select_rule" ON public.clinic_expenses
    FOR SELECT TO authenticated, service_role
    USING (
        public.is_admin_portal_user()
        OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "clinic_expenses_insert_rule" ON public.clinic_expenses
    FOR INSERT TO authenticated, service_role
    WITH CHECK (
        public.is_admin_portal_user()
        OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "clinic_expenses_update_rule" ON public.clinic_expenses
    FOR UPDATE TO authenticated, service_role
    USING (
        public.is_admin_portal_user()
        OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
        OR (auth.jwt() ->> 'role') = 'service_role'
    )
    WITH CHECK (
        public.is_admin_portal_user()
        OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "clinic_expenses_delete_rule" ON public.clinic_expenses
    FOR DELETE TO authenticated, service_role
    USING (
        public.is_admin_portal_user()
        OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
        OR (auth.jwt() ->> 'role') = 'service_role'
    );

-- -------------------------------------------------------------------------
-- 3. VULN-14: SCOPED RLS FOR invoice_transactions
-- Revoke permissive public read and insert. Restrict to authorized clinic staff,
-- invoice recipients, and platform admins.
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoice_transactions'
    ) THEN
        EXECUTE 'ALTER TABLE public.invoice_transactions ENABLE ROW LEVEL SECURITY;';
        EXECUTE 'DROP POLICY IF EXISTS "Public read invoice_transactions" ON public.invoice_transactions;';
        EXECUTE 'DROP POLICY IF EXISTS "Allow insert to invoice_transactions" ON public.invoice_transactions;';
        EXECUTE 'DROP POLICY IF EXISTS "invoice_transactions_select_rule" ON public.invoice_transactions;';
        EXECUTE 'DROP POLICY IF EXISTS "invoice_transactions_insert_rule" ON public.invoice_transactions;';
        
        EXECUTE 'CREATE POLICY "invoice_transactions_select_rule" ON public.invoice_transactions
            FOR SELECT TO authenticated, service_role
            USING (
                public.is_admin_portal_user()
                OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
                OR (auth.jwt() ->> ''role'') = ''service_role''
            );';
            
        EXECUTE 'CREATE POLICY "invoice_transactions_insert_rule" ON public.invoice_transactions
            FOR INSERT TO authenticated, service_role
            WITH CHECK (
                public.is_admin_portal_user()
                OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
                OR (auth.jwt() ->> ''role'') = ''service_role''
            );';
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 4. VULN-03: PURGE GATEWAY SECRETS FROM PUBLIC clinics TABLE
-- Zero out raw secret keys stored in clinics table columns.
-- -------------------------------------------------------------------------
UPDATE public.clinics
SET payment_secret_key = NULL
WHERE payment_secret_key IS NOT NULL;

-- -------------------------------------------------------------------------
-- 5. APPLICATION IDENTITY HELPER & VULN-12: STORAGE BUCKET HARDENING
-- Ensure verified identity helper exists and private buckets are secured.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_trusted_application_identity()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'role') = 'authenticated'
    AND NULLIF(auth.jwt() ->> 'sub', '') IS NOT NULL
    AND (
      (auth.jwt() ->> 'iss') LIKE '%ojfoofojcpabqegxmsab.supabase.co/auth%'
      OR (
        (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/dactor-ea1e1'
        AND (auth.jwt() ->> 'aud') = 'dactor-ea1e1'
      )
      OR (auth.jwt() ->> 'role') = 'service_role'
    ), false
  );
$$;

REVOKE ALL ON FUNCTION public.is_trusted_application_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_application_identity() TO authenticated, service_role;

UPDATE storage.buckets
SET public = false
WHERE id IN ('lab-reports-private', 'doctor-kyc-private', 'clinic-docs-private');

-- Drop overly broad insert policy on private buckets for random authenticated users
DROP POLICY IF EXISTS "Clinic Staff upload private docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor upload KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Authorized upload to private storage" ON storage.objects;

-- Re-create scoped storage insert policy requiring verified identity
CREATE POLICY "Authorized upload to private storage" ON storage.objects
FOR INSERT TO authenticated, service_role
WITH CHECK (
    public.is_admin_portal_user()
    OR (auth.jwt() ->> 'role') = 'service_role'
    OR (
        bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private')
        AND public.is_trusted_application_identity()
    )
);
