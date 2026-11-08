-- =========================================================================
-- DACTOR PLATFORM: ROW-LEVEL SECURITY (RLS) & DELETE PERMISSION RULES
-- Integrated with Real Firebase/Supabase Authentication & Admin Portal Permissions
-- =========================================================================

-- Enable RLS on core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is an Admin Portal Super Admin (Hardened)
CREATE OR REPLACE FUNCTION public.is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      current_user = 'service_role'
      OR (auth.jwt() ->> 'role') = 'service_role'
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
      OR (auth.jwt() ->> 'role') = 'super_admin'
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE public.profiles.auth_uid = auth.uid()
            AND public.profiles.role = 'super_admin'
        )
      )
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1. PROFILES TABLE RLS RULES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_delete_rule" ON public.profiles;
CREATE POLICY "profiles_delete_rule" ON public.profiles
FOR DELETE
USING (
    (auth.uid() IS NOT NULL AND auth_uid = auth.uid()) OR
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "profiles_select_rule" ON public.profiles;
CREATE POLICY "profiles_select_rule" ON public.profiles
FOR SELECT
USING (
    (auth.uid() IS NOT NULL AND auth_uid = auth.uid()) OR
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "profiles_insert_rule" ON public.profiles;
CREATE POLICY "profiles_insert_rule" ON public.profiles
FOR INSERT
WITH CHECK (
    (auth.uid() IS NOT NULL AND auth_uid = auth.uid()) OR
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "profiles_update_rule" ON public.profiles;
CREATE POLICY "profiles_update_rule" ON public.profiles
FOR UPDATE
USING (
    (auth.uid() IS NOT NULL AND auth_uid = auth.uid()) OR
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

-- -------------------------------------------------------------------------
-- 2. CLINICS TABLE RLS RULES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "clinics_delete_rule" ON public.clinics;
CREATE POLICY "clinics_delete_rule" ON public.clinics
FOR DELETE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "clinics_select_rule" ON public.clinics;
CREATE POLICY "clinics_select_rule" ON public.clinics
FOR SELECT
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "clinics_insert_rule" ON public.clinics;
CREATE POLICY "clinics_insert_rule" ON public.clinics
FOR INSERT
WITH CHECK (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "clinics_update_rule" ON public.clinics;
CREATE POLICY "clinics_update_rule" ON public.clinics
FOR UPDATE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email')) OR
    is_admin_portal_user()
);

-- -------------------------------------------------------------------------
-- 3. DOCTORS TABLE RLS RULES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "doctors_delete_rule" ON public.doctors;
CREATE POLICY "doctors_delete_rule" ON public.doctors
FOR DELETE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    EXISTS (
        SELECT 1 FROM public.clinics c
        WHERE (c.id = doctors.clinic_id OR c.id = doctors.primary_clinic_id)
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "doctors_select_rule" ON public.doctors;
CREATE POLICY "doctors_select_rule" ON public.doctors FOR SELECT USING (true);

DROP POLICY IF EXISTS "doctors_insert_rule" ON public.doctors;
CREATE POLICY "doctors_insert_rule" ON public.doctors
FOR INSERT
WITH CHECK (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    EXISTS (
        SELECT 1 FROM public.clinics c
        WHERE (c.id = doctors.clinic_id OR c.id = doctors.primary_clinic_id)
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "doctors_update_rule" ON public.doctors;
CREATE POLICY "doctors_update_rule" ON public.doctors
FOR UPDATE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email')) OR
    EXISTS (
        SELECT 1 FROM public.clinics c
        WHERE (c.id = doctors.clinic_id OR c.id = doctors.primary_clinic_id)
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

-- -------------------------------------------------------------------------
-- 4. APPOINTMENTS, SLOTS & SERVICES DELETE RULES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "appointments_delete_rule" ON public.appointments;
CREATE POLICY "appointments_delete_rule" ON public.appointments
FOR DELETE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email')) OR
    EXISTS (
        SELECT 1 FROM public.clinics c WHERE c.id = appointments.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "slots_delete_rule" ON public.slots;
CREATE POLICY "slots_delete_rule" ON slots
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM clinics c WHERE c.id = slots.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

DROP POLICY IF EXISTS "clinic_services_delete_rule" ON public.clinic_services;
CREATE POLICY "clinic_services_delete_rule" ON public.clinic_services
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM clinics c WHERE c.id = clinic_services.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    ) OR
    is_admin_portal_user()
);

-- -------------------------------------------------------------------------
-- 4b. BILLING INVOICES RLS POLICIES (Hardened)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "billing_invoices_select_rule" ON public.billing_invoices;
CREATE POLICY "billing_invoices_select_rule" ON public.billing_invoices
FOR SELECT
USING (
    is_admin_portal_user()
    OR EXISTS (
        SELECT 1 FROM public.clinics c WHERE c.id = billing_invoices.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    )
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = billing_invoices.appointment_id
          AND (
              (auth.uid() IS NOT NULL AND a.user_id = auth.uid())
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

DROP POLICY IF EXISTS "billing_invoices_insert_rule" ON public.billing_invoices;
CREATE POLICY "billing_invoices_insert_rule" ON public.billing_invoices
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR EXISTS (
        SELECT 1 FROM public.clinics c WHERE c.id = billing_invoices.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    )
);

DROP POLICY IF EXISTS "billing_invoices_update_rule" ON public.billing_invoices;
CREATE POLICY "billing_invoices_update_rule" ON public.billing_invoices
FOR UPDATE
USING (
    is_admin_portal_user()
    OR EXISTS (
        SELECT 1 FROM public.clinics c WHERE c.id = billing_invoices.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    )
);

DROP POLICY IF EXISTS "billing_invoices_delete_rule" ON public.billing_invoices;
CREATE POLICY "billing_invoices_delete_rule" ON public.billing_invoices
FOR DELETE
USING (
    is_admin_portal_user()
    OR EXISTS (
        SELECT 1 FROM public.clinics c WHERE c.id = billing_invoices.clinic_id
        AND c.contact_email = (auth.jwt() ->> 'email')
    )
);

-- -------------------------------------------------------------------------
-- 5. FUNCTION TO PURGE EXPIRED CLINIC DATA (Admin Portal & Background Worker)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_archived_clinic_data(p_clinic_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT := 0;
    v_subcount INT;
BEGIN
    -- Strict authorization check: Only service_role or verified Super Admin can purge clinic data
    IF NOT (current_user = 'service_role' OR (auth.jwt() ->> 'role') = 'service_role' OR is_admin_portal_user()) THEN
        RAISE EXCEPTION 'Access denied: Only Super Admin or service_role can execute clinic archive purge.';
    END IF;

    DELETE FROM public.queue_entries WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.lab_reports WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.billing_invoices WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.appointments WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.slots WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.clinic_services WHERE clinic_id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    DELETE FROM public.clinics WHERE id = p_clinic_id;
    GET DIAGNOSTICS v_subcount = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_subcount;

    RETURN v_deleted_count;
END;
$$;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION public.purge_expired_archived_clinic_data(UUID) TO authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
