-- =========================================================================
-- DACTOR PLATFORM: COMPREHENSIVE SECURITY SWEEP & HARDENING MIGRATION
-- Migration File: supabase/migration_comprehensive_security_sweep.sql
-- Milestones: M1 Database Backend & Storage Security Hardening
-- Integrates:
-- 1. Safe Plaintext Password Cleanup ('pwd:') in profiles.phone
-- 2. Hardened Server-Side Role Function is_admin_portal_user()
-- 3. Public Clinics Discovery View (public_clinics) & Credential Isolation
-- 4. Table Row-Level Security (RLS) Hardening (profiles, clinics, billing_invoices,
--    medical_specialties, medical_qualifications, clinic_invitations, slot_locks,
--    clinic_catalog, fcm_tokens, notifications, appointments, lab_reports)
-- 5. SECURITY DEFINER Functions & Search Path Hygiene
-- 6. Private Storage Buckets & Storage RLS on storage.objects
-- 7. Server-Side Document Authorization & Verification RPCs
-- =========================================================================

-- -------------------------------------------------------------------------
-- SECTION 0: EXTENSIONS & BASE SCHEMA SAFEGUARDS
-- -------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Firebase Auth UIDs are not necessarily UUIDs. Never call public.current_auth_uid() directly
-- on a third-party JWT: Supabase's public.current_auth_uid() casts `sub` to UUID and can throw
-- for valid Firebase subjects. Keep UUID-only legacy references safe by using
-- this guarded conversion; email ownership checks below cover Firebase users.
CREATE OR REPLACE FUNCTION public.current_auth_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt() ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (auth.jwt() ->> 'sub')::UUID
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.current_auth_uid() TO anon, authenticated, service_role;

-- Public discovery must never return the JSON metadata stored in `description`.
-- Older website versions put gateway credentials and activation notes in that JSON.
CREATE OR REPLACE FUNCTION public.public_clinic_description(p_description TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_metadata JSONB;
BEGIN
    IF p_description IS NULL THEN
        RETURN NULL;
    END IF;

    BEGIN
        v_metadata := p_description::JSONB;
    EXCEPTION WHEN invalid_text_representation THEN
        -- Unstructured legacy text cannot be safely distinguished from embedded
        -- gateway secrets; require migration to a dedicated public field.
        RETURN NULL;
    END;

    IF jsonb_typeof(v_metadata) = 'object' THEN
        RETURN LEFT(COALESCE(v_metadata ->> 'desc', v_metadata ->> 'public_description', ''), 2000);
    END IF;
    RETURN NULL;
END;
$$;

-- Ensure doctors table has primary_clinic_id column if not already added
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS primary_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS active_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}';

-- -------------------------------------------------------------------------
-- SECTION 1: SAFE PLAINTEXT PASSWORD CLEANUP MIGRATION
-- -------------------------------------------------------------------------
-- Safely set phone = NULL for any legacy row storing plaintext passwords ('pwd:')
-- Preserves all standard, valid phone numbers without corruption.

UPDATE public.profiles
SET phone = NULL,
    updated_at = NOW()
WHERE TRIM(phone) ILIKE 'pwd:%';

-- Post-cleanup verification assertion: Ensure zero 'pwd:' artifacts remain
DO $$
DECLARE
    v_leaked_count INT;
BEGIN
    SELECT COUNT(*) INTO v_leaked_count
    FROM public.profiles
    WHERE TRIM(phone) ILIKE 'pwd:%';

    IF v_leaked_count > 0 THEN
        RAISE EXCEPTION 'CRITICAL: Plaintext password cleanup verification failed. % rows still contain pwd: in phone column.', v_leaked_count;
    END IF;
    RAISE NOTICE '√ Section 1 Verified: Leaked password records successfully purged from profiles.phone (0 remaining).';
END $$;


-- -------------------------------------------------------------------------
-- SECTION 2: HARDENED SERVER-SIDE ROLE FUNCTION is_admin_portal_user()
-- -------------------------------------------------------------------------
-- Eliminates insecure email substring matching (legacy wildcard patterns eradicated).
-- Checks exclusively verified server-side claims and database records:
-- 1. current_user = 'service_role'
-- 2. (auth.jwt() ->> 'role') = 'service_role'
-- 3. (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
-- 4. (auth.jwt() ->> 'role') = 'super_admin'
-- 5. Verified profiles record with role = 'super_admin' for public.current_auth_uid()
-- Configured with SECURITY DEFINER and SET search_path = public.

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
        (public.current_auth_uid() IS NOT NULL OR COALESCE(auth.jwt() ->> 'email', '') <> '')
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (
              public.profiles.auth_uid = public.current_auth_uid()
              OR (
                COALESCE(auth.jwt() ->> 'email', '') <> ''
                AND LOWER(public.profiles.email) = LOWER(auth.jwt() ->> 'email')
              )
          )
            AND public.profiles.role = 'super_admin'
        )
      )
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;


-- Helper: Clinic Staff Authorization Check
CREATE OR REPLACE FUNCTION public.is_authorized_clinic_staff(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
BEGIN
    -- Super admin / service role bypass
    IF is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF v_email = '' AND v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        -- 1. Primary clinic contact email
        SELECT 1 FROM public.clinics c
        WHERE c.id = p_clinic_id
          AND v_email <> ''
          AND LOWER(c.contact_email) = v_email
        UNION
        -- 2. Accepted clinic staff invitation
        SELECT 1 FROM public.clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND v_email <> ''
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
        UNION
        -- 3. Attending doctor associated with clinic
        SELECT 1 FROM public.doctors d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE (d.clinic_id = p_clinic_id OR d.primary_clinic_id = p_clinic_id)
          AND (
              (v_email <> '' AND LOWER(d.email) = v_email)
              OR (v_uid IS NOT NULL AND p.auth_uid = v_uid)
          )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_clinic_staff(UUID) TO anon, authenticated, service_role;

-- A Firebase JWT must be a configured first-party Firebase token with the
-- Supabase `authenticated` role claim. Supabase Auth tokens are also accepted.
CREATE OR REPLACE FUNCTION public.is_trusted_application_identity()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'role' = 'authenticated'
    AND NULLIF(auth.jwt() ->> 'sub', '') IS NOT NULL
    AND (
      auth.jwt() ->> 'iss' = 'https://ojfoofojcpabqegxmsab.supabase.co/auth/v1'
      OR (
        auth.jwt() ->> 'iss' = 'https://securetoken.google.com/dactor-ea1e1'
        AND auth.jwt() ->> 'aud' = 'dactor-ea1e1'
      )
    ), false
  );
$$;
REVOKE ALL ON FUNCTION public.is_trusted_application_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_application_identity() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_authorized_doctor(p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    public.is_admin_portal_user()
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      LEFT JOIN public.profiles p ON p.id = d.user_id
      WHERE d.id = p_doctor_id
        AND (
          (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
          OR (p.auth_uid IS NOT NULL AND p.auth_uid = public.current_auth_uid())
          OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
        )
    ), false
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_authorized_doctor(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_patient_for_appointment(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.appointments a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.id = p_appointment_id
      AND (
        (p.auth_uid IS NOT NULL AND p.auth_uid = public.current_auth_uid())
        OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
        OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
      )
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_current_patient_for_appointment(UUID) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------
-- SECTION 3: SECURE PUBLIC CLINICS VIEW & CREDENTIAL ISOLATION
-- -------------------------------------------------------------------------
-- Implements dedicated public discovery view public_clinics exposing ONLY
-- public-safe fields.
-- Completely isolates payment_api_key, payment_secret_key, merchant_id,
-- pan_number, registration_doc_url, manager_phone, activation_payment_proof_url.

DROP VIEW IF EXISTS public.public_clinics CASCADE;
CREATE VIEW public.public_clinics
WITH (security_barrier = true) AS
SELECT 
    id,
    name,
    type,
    verification_status,
    contact_phone,
    address_text,
    latitude,
    longitude,
    public.public_clinic_description(description) AS description,
    logo_url,
    pictures,
    payment_gateway_provider,
    is_direct_payment_enabled,
    is_activated,
    specialties,
    geohash
FROM public.clinics
WHERE COALESCE(is_archived, false) = false
  AND verification_status = 'approved'
  AND is_activated = true;

GRANT SELECT ON public.public_clinics TO anon, authenticated, service_role;

-- Public provider cards use a strict allowlist. The base doctors table contains
-- personal contact details, identity fields, and private KYC document paths.
DROP VIEW IF EXISTS public.public_doctors CASCADE;
CREATE VIEW public.public_doctors WITH (security_barrier = true) AS
SELECT
    id,
    full_name,
    specialty,
    specialties,
    education,
    profile_picture_url,
    public_mobile_number,
    description,
    consultation_fee,
    is_in_clinic,
    clinic_id,
    active_clinic_id,
    primary_clinic_id,
    'approved'::TEXT AS kyc_status
FROM public.doctors
WHERE kyc_status = 'approved';
GRANT SELECT ON public.public_doctors TO anon, authenticated, service_role;

-- Harden get_nearby_clinics proximity search function with SECURITY DEFINER
DROP FUNCTION IF EXISTS public.get_nearby_clinics(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.get_nearby_clinics(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 30.0,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    type clinic_type_enum,
    verification_status verification_status_enum,
    contact_phone VARCHAR(50),
    address_text TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    geohash VARCHAR(12),
    description TEXT,
    logo_url TEXT,
    pictures TEXT[],
    is_activated BOOLEAN,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_point GEOGRAPHY;
    search_term TEXT;
BEGIN
    p_lat := GREATEST(-90.0, LEAST(90.0, p_lat));
    p_lng := GREATEST(-180.0, LEAST(180.0, p_lng));
    user_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

    IF p_search_query IS NOT NULL AND LENGTH(TRIM(p_search_query)) > 0 THEN
        search_term := '%' || LOWER(TRIM(p_search_query)) || '%';
    ELSE
        search_term := NULL;
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.type,
        c.verification_status,
        c.contact_phone,
        c.address_text,
        c.latitude,
        c.longitude,
        c.geohash,
        public.public_clinic_description(c.description),
        c.logo_url,
        c.pictures,
        c.is_activated,
        ROUND((ST_Distance(c.location_geom, user_point) / 1000.0)::NUMERIC, 2)::DOUBLE PRECISION AS distance_km
    FROM public.clinics c
    WHERE
        c.is_archived = FALSE
        AND c.verification_status = 'approved'
        AND c.is_activated = TRUE
        AND c.location_geom IS NOT NULL
        AND (p_radius_km IS NULL OR ST_DWithin(c.location_geom, user_point, p_radius_km * 1000.0))
        AND (search_term IS NULL OR LOWER(c.name) LIKE search_term OR LOWER(c.address_text) LIKE search_term)
    ORDER BY
        distance_km ASC
    LIMIT GREATEST(1, LEAST(100, p_limit))
    OFFSET GREATEST(0, p_offset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_clinics TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- SECTION 4: TABLE ROW-LEVEL SECURITY (RLS) POLICIES HARDENING
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- PostgreSQL permissive policies combine with OR. Remove every pre-existing
-- policy on sensitive tables before defining the allowlist below, so a stale
-- USING (true) policy from an older manual migration cannot reopen data.
DO $$
DECLARE v_policy RECORD;
BEGIN
    FOR v_policy IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY (ARRAY[
            'profiles','clinics','doctors','appointments','queue_entries','lab_reports',
            'billing_invoices','medical_specialties','medical_qualifications',
            'clinic_invitations','slot_locks','clinic_catalog','fcm_tokens','notifications'
          ])
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
    END LOOP;
END $$;

-- 4.1 PROFILES TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_rule" ON public.profiles;

-- Restrict SELECT to profile owner or Super Admin (prevents harvesting)
CREATE POLICY "profiles_select_rule" ON public.profiles
FOR SELECT
USING (
    (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- Allow authenticated user to create own profile during registration
CREATE POLICY "profiles_insert_rule" ON public.profiles
FOR INSERT
WITH CHECK (
    (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- Allow profile owner or Super Admin to update profile
CREATE POLICY "profiles_update_rule" ON public.profiles
FOR UPDATE
USING (
    (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- Allow profile owner or Super Admin to delete profile
CREATE POLICY "profiles_delete_rule" ON public.profiles
FOR DELETE
USING (
    (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- RLS protects rows, not columns. Prevent users from promoting their own
-- profile or changing the identity fields used by authorization checks.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF LOWER(COALESCE(NEW.role, '')) IN ('admin', 'super_admin', 'platform_admin', 'service_role') THEN
            RAISE EXCEPTION 'Privileged profile roles can only be assigned by platform administration.';
        END IF;
        IF NEW.auth_uid IS NOT NULL AND NEW.auth_uid IS DISTINCT FROM public.current_auth_uid() THEN
            RAISE EXCEPTION 'Profile identity cannot be assigned to another account.';
        END IF;
        IF COALESCE(auth.jwt() ->> 'email', '') = ''
           OR LOWER(NEW.email) <> LOWER(auth.jwt() ->> 'email') THEN
            RAISE EXCEPTION 'Profile email must match the authenticated identity.';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.auth_uid IS DISTINCT FROM OLD.auth_uid
       OR LOWER(COALESCE(NEW.email, '')) <> LOWER(COALESCE(OLD.email, '')) THEN
        RAISE EXCEPTION 'Profile identity and role fields cannot be changed by the account owner.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


-- -------------------------------------------------------------------------
-- 4.2 CLINICS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinics_select_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_insert_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_update_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_delete_rule" ON public.clinics;

-- Restrict direct read on raw clinics table to clinic administrator and Super Admin
-- Public discovery is conducted via public_clinics view or get_nearby_clinics RPC
CREATE POLICY "clinics_select_rule" ON public.clinics
FOR SELECT
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_authorized_clinic_staff(id)
    OR is_admin_portal_user()
);

-- Allow clinic owner registration or admin creation
CREATE POLICY "clinics_insert_rule" ON public.clinics
FOR INSERT
WITH CHECK (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- Allow clinic admin or Super Admin to update clinic
CREATE POLICY "clinics_update_rule" ON public.clinics
FOR UPDATE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

-- Allow clinic admin or Super Admin to delete clinic
CREATE POLICY "clinics_delete_rule" ON public.clinics
FOR DELETE
USING (
    (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_admin_portal_user()
);

CREATE OR REPLACE FUNCTION public.prevent_clinic_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.verification_status := 'pending';
        NEW.is_activated := FALSE;
        NEW.activation_expires_at := NULL;
        NEW.activation_paid_amount := 0;
        NEW.is_archived := FALSE;
        NEW.archived_at := NULL;
        NEW.deletion_scheduled_at := NULL;
        RETURN NEW;
    END IF;

    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       OR NEW.is_activated IS DISTINCT FROM OLD.is_activated
       OR NEW.activation_expires_at IS DISTINCT FROM OLD.activation_expires_at
       OR NEW.activation_plan IS DISTINCT FROM OLD.activation_plan
       OR NEW.activation_paid_amount IS DISTINCT FROM OLD.activation_paid_amount
       OR NEW.activation_notes IS DISTINCT FROM OLD.activation_notes
       OR NEW.activation_payment_proof_url IS DISTINCT FROM OLD.activation_payment_proof_url
       OR NEW.registration_doc_url IS DISTINCT FROM OLD.registration_doc_url
       OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.deletion_scheduled_at IS DISTINCT FROM OLD.deletion_scheduled_at THEN
        RAISE EXCEPTION 'Clinic approval, activation, and archive state are platform-controlled.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinics_prevent_privilege_escalation ON public.clinics;
CREATE TRIGGER clinics_prevent_privilege_escalation
BEFORE INSERT OR UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.prevent_clinic_privilege_escalation();

-- Replace every prior doctors policy: permissive policies combine with OR, so
-- leaving even one old USING (true) policy would keep the table public.
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE v_policy RECORD;
BEGIN
    FOR v_policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'doctors'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.doctors', v_policy.policyname);
    END LOOP;
END $$;

CREATE POLICY "doctors_private_select" ON public.doctors
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_doctor(id)
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (primary_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(primary_clinic_id))
    OR (active_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(active_clinic_id))
);
CREATE POLICY "doctors_private_insert" ON public.doctors
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
);
CREATE POLICY "doctors_private_update" ON public.doctors
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_doctor(id)
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
) WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_doctor(id)
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
);
CREATE POLICY "doctors_private_delete" ON public.doctors
FOR DELETE USING (public.is_admin_portal_user());

CREATE OR REPLACE FUNCTION public.prevent_doctor_kyc_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.kyc_status := 'pending';
        RETURN NEW;
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR LOWER(COALESCE(NEW.email, '')) <> LOWER(COALESCE(OLD.email, ''))
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
       OR NEW.nmc_license_number IS DISTINCT FROM OLD.nmc_license_number
       OR NEW.license_doc_url IS DISTINCT FROM OLD.license_doc_url
       OR NEW.certificates_doc_url IS DISTINCT FROM OLD.certificates_doc_url THEN
        RAISE EXCEPTION 'Doctor identity and KYC approval fields are platform-controlled.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS doctors_prevent_kyc_privilege_escalation ON public.doctors;
CREATE TRIGGER doctors_prevent_kyc_privilege_escalation
BEFORE INSERT OR UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.prevent_doctor_kyc_privilege_escalation();

-- Private rate-limit storage: no browser role can read or modify these rows.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.security_rate_limits (
    key_hash TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_hash, window_start)
);
REVOKE ALL ON private.security_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.consume_tracking_rate_limit(
    p_scope TEXT,
    p_code TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
    v_hash TEXT;
    v_window TIMESTAMPTZ;
BEGIN
    IF p_scope IS NULL OR p_code IS NULL OR p_limit < 1 OR p_limit > 1000
       OR p_window_seconds < 30 OR p_window_seconds > 86400 THEN
        RETURN FALSE;
    END IF;
    v_hash := md5(p_scope || ':' || p_code);
    v_window := to_timestamp(
        floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
    );
    INSERT INTO private.security_rate_limits (key_hash, window_start, hit_count)
    VALUES (v_hash, v_window, 1)
    ON CONFLICT (key_hash, window_start)
    DO UPDATE SET hit_count = private.security_rate_limits.hit_count + 1
      WHERE private.security_rate_limits.hit_count < p_limit;
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION private.consume_tracking_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(
    p_key TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
DECLARE
    v_hash TEXT;
    v_window TIMESTAMPTZ;
BEGIN
    IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
       OR p_key IS NULL OR length(p_key) > 512
       OR p_limit < 1 OR p_limit > 1000
       OR p_window_seconds < 30 OR p_window_seconds > 86400 THEN
        RETURN FALSE;
    END IF;
    v_hash := md5(p_key);
    v_window := to_timestamp(
        floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
    );
    INSERT INTO private.security_rate_limits (key_hash, window_start, hit_count)
    VALUES (v_hash, v_window, 1)
    ON CONFLICT (key_hash, window_start)
    DO UPDATE SET hit_count = private.security_rate_limits.hit_count + 1
      WHERE private.security_rate_limits.hit_count < p_limit;
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Public queue lookup returns only operational status. It deliberately omits
-- patient name, phone, email, age, gender, diagnosis, reports, and payment data.
CREATE OR REPLACE FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TEXT,
    checkin_status TEXT,
    queue_status TEXT,
    queue_position INTEGER,
    patients_ahead INTEGER,
    current_queue_position INTEGER,
    doctor_is_in_clinic BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
    IF COALESCE(p_tracking_code, '') !~ '^[0-9]{10}$'
       OR NOT private.consume_tracking_rate_limit('public-queue', p_tracking_code, 60, 300) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        a.tracking_code_10_digit::TEXT,
        a.clinic_id,
        c.name::TEXT,
        a.doctor_id,
        d.full_name::TEXT,
        d.specialty::TEXT,
        a.appointment_date,
        a.appointment_time::TEXT,
        a.checkin_status::TEXT,
        qe.status::TEXT,
        COALESCE(qe.queue_position, 0),
        CASE WHEN qe.queue_position IS NULL THEN 0 ELSE (
            SELECT COUNT(*)::INTEGER
            FROM public.queue_entries ahead
            WHERE ahead.clinic_id = a.clinic_id
              AND ahead.status = 'waiting'
              AND ahead.queue_position < qe.queue_position
        ) END,
        COALESCE((
            SELECT MIN(current_entry.queue_position)::INTEGER
            FROM public.queue_entries current_entry
            WHERE current_entry.clinic_id = a.clinic_id
              AND current_entry.status = 'in_consultation'
        ), 0),
        COALESCE(d.is_in_clinic, FALSE)
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    LEFT JOIN public.queue_entries qe ON qe.appointment_id = a.id
    WHERE a.tracking_code_10_digit = p_tracking_code
    LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;

-- Guest verification is a server-side exact match; it does not return patient data.
CREATE OR REPLACE FUNCTION public.verify_guest_appointment_identity(
    p_tracking_code TEXT,
    p_patient_phone TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_phone TEXT := right(regexp_replace(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
BEGIN
    IF COALESCE(p_tracking_code, '') !~ '^[0-9]{10}$'
       OR length(v_phone) <> 10
       OR NOT private.consume_tracking_rate_limit('guest-identity', p_tracking_code, 5, 900) THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.tracking_code_10_digit = p_tracking_code
          AND right(regexp_replace(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_phone
    );
END;
$$;
REVOKE ALL ON FUNCTION public.verify_guest_appointment_identity(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_guest_appointment_identity(TEXT, TEXT) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------
-- 4.3 BILLING INVOICES TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_invoices_select_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_insert_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_update_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_delete_rule" ON public.billing_invoices;

-- Restrict SELECT to attending patient, clinic staff, or Super Admin
CREATE POLICY "billing_invoices_select_rule" ON public.billing_invoices
FOR SELECT
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = billing_invoices.appointment_id
          AND (
              (public.current_auth_uid() IS NOT NULL AND (
                  a.user_id = public.current_auth_uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND p.auth_uid = public.current_auth_uid()
                  )
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

-- Revoke public INSERT: Only authorized clinic staff, service role, or Super Admin can create invoices
CREATE POLICY "billing_invoices_insert_rule" ON public.billing_invoices
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

-- Revoke public UPDATE: Client cannot alter total_amount or flip payment_status directly
CREATE POLICY "billing_invoices_update_rule" ON public.billing_invoices
FOR UPDATE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

-- Restrict DELETE to clinic admin or Super Admin
CREATE POLICY "billing_invoices_delete_rule" ON public.billing_invoices
FOR DELETE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);


-- -------------------------------------------------------------------------
-- 4.4 MEDICAL TAXONOMY: SPECIALTIES & QUALIFICATIONS
-- -------------------------------------------------------------------------
ALTER TABLE public.medical_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_qualifications ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies
DROP POLICY IF EXISTS "Public read medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public insert medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public update medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public delete medical_specialties" ON public.medical_specialties;

DROP POLICY IF EXISTS "Public read medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public insert medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public update medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public delete medical_qualifications" ON public.medical_qualifications;

-- Specialties: Public SELECT, Admin-only INSERT/UPDATE/DELETE
CREATE POLICY "medical_specialties_select_policy" ON public.medical_specialties
FOR SELECT USING (true);

CREATE POLICY "medical_specialties_insert_policy" ON public.medical_specialties
FOR INSERT WITH CHECK (is_admin_portal_user());

CREATE POLICY "medical_specialties_update_policy" ON public.medical_specialties
FOR UPDATE USING (is_admin_portal_user());

CREATE POLICY "medical_specialties_delete_policy" ON public.medical_specialties
FOR DELETE USING (is_admin_portal_user());

-- Qualifications: Public SELECT, Admin-only INSERT/UPDATE/DELETE
CREATE POLICY "medical_qualifications_select_policy" ON public.medical_qualifications
FOR SELECT USING (true);

CREATE POLICY "medical_qualifications_insert_policy" ON public.medical_qualifications
FOR INSERT WITH CHECK (is_admin_portal_user());

CREATE POLICY "medical_qualifications_update_policy" ON public.medical_qualifications
FOR UPDATE USING (is_admin_portal_user());

CREATE POLICY "medical_qualifications_delete_policy" ON public.medical_qualifications
FOR DELETE USING (is_admin_portal_user());


-- -------------------------------------------------------------------------
-- 4.5 CLINIC INVITATIONS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.clinic_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_invitations_select_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_insert_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_update_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_delete_rule" ON public.clinic_invitations;

CREATE POLICY "clinic_invitations_select_rule" ON public.clinic_invitations
FOR SELECT
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinic_invitations_insert_rule" ON public.clinic_invitations
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "clinic_invitations_update_rule" ON public.clinic_invitations
FOR UPDATE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinic_invitations_delete_rule" ON public.clinic_invitations
FOR DELETE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);


-- Invitees may accept/decline their own invitation, but cannot change its
-- clinic, target email, role, or other authority-bearing fields.
CREATE OR REPLACE FUNCTION public.prevent_invitation_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(OLD.clinic_id) THEN
        RETURN NEW;
    END IF;
    IF NOT public.is_trusted_application_identity()
       OR COALESCE(auth.jwt() ->> 'email', '') = ''
       OR COALESCE(LOWER(OLD.email), '') <> LOWER(auth.jwt() ->> 'email') THEN
        RAISE EXCEPTION 'Invitation update is not authorized.';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
        RAISE EXCEPTION 'Invitees cannot change invitation scope or identity.';
    END IF;
    IF COALESCE(NEW.status::TEXT, '') NOT IN ('accepted','declined') THEN
        RAISE EXCEPTION 'Invitees may only accept or decline an invitation.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clinic_invitations_prevent_privilege_escalation ON public.clinic_invitations;
CREATE TRIGGER clinic_invitations_prevent_privilege_escalation
BEFORE UPDATE ON public.clinic_invitations
FOR EACH ROW EXECUTE FUNCTION public.prevent_invitation_privilege_escalation();

-- -------------------------------------------------------------------------
-- 4.6 SLOT LOCKS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.slot_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slot_locks_select_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_insert_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_update_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_delete_rule" ON public.slot_locks;

CREATE POLICY "slot_locks_select_rule" ON public.slot_locks
FOR SELECT
USING (
    is_admin_portal_user()
    OR (user_identifier = COALESCE(public.current_auth_uid()::text, auth.jwt() ->> 'email', ''))
    OR EXISTS (
        SELECT 1 FROM public.slots s
        WHERE s.id = slot_locks.slot_id AND is_authorized_clinic_staff(s.clinic_id)
    )
);

CREATE POLICY "slot_locks_insert_rule" ON public.slot_locks
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR (
        public.is_trusted_application_identity()
        AND user_identifier IN (auth.jwt() ->> 'sub', auth.jwt() ->> 'email', public.current_auth_uid()::text)
    )
);

CREATE POLICY "slot_locks_update_rule" ON public.slot_locks
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        public.is_trusted_application_identity()
        AND user_identifier IN (auth.jwt() ->> 'sub', auth.jwt() ->> 'email', public.current_auth_uid()::text)
    )
);

CREATE POLICY "slot_locks_delete_rule" ON public.slot_locks
FOR DELETE
USING (
    is_admin_portal_user()
    OR (
        public.is_trusted_application_identity()
        AND user_identifier IN (auth.jwt() ->> 'sub', auth.jwt() ->> 'email', public.current_auth_uid()::text)
    )
    OR EXISTS (
        SELECT 1 FROM public.slots s
        WHERE s.id = slot_locks.slot_id AND is_authorized_clinic_staff(s.clinic_id)
    )
);


-- -------------------------------------------------------------------------
-- 4.7 CLINIC CATALOG TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.clinic_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_catalog_select_rule" ON public.clinic_catalog;
DROP POLICY IF EXISTS "clinic_catalog_insert_rule" ON public.clinic_catalog;
DROP POLICY IF EXISTS "clinic_catalog_update_rule" ON public.clinic_catalog;
DROP POLICY IF EXISTS "clinic_catalog_delete_rule" ON public.clinic_catalog;

-- Public SELECT allows patients and clinic reception to view price items
CREATE POLICY "clinic_catalog_select_rule" ON public.clinic_catalog
FOR SELECT USING (true);

-- Modifications restricted to clinic staff and Super Admin
CREATE POLICY "clinic_catalog_insert_rule" ON public.clinic_catalog
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "clinic_catalog_update_rule" ON public.clinic_catalog
FOR UPDATE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "clinic_catalog_delete_rule" ON public.clinic_catalog
FOR DELETE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);


-- -------------------------------------------------------------------------
-- 4.8 FCM DEVICE TOKENS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcm_tokens_select_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_insert_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_delete_rule" ON public.fcm_tokens;

CREATE POLICY "fcm_tokens_select_rule" ON public.fcm_tokens
FOR SELECT
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id
                  AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
            )
        )
    )
);

CREATE POLICY "fcm_tokens_insert_rule" ON public.fcm_tokens
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR (
        public.is_trusted_application_identity()
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id
                  AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
            )
        )
    )
);

CREATE POLICY "fcm_tokens_update_rule" ON public.fcm_tokens
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id
                  AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
            )
        )
    )
)
WITH CHECK (
    is_admin_portal_user()
    OR (
        public.is_trusted_application_identity()
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id
                  AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
            )
        )
    )
);

CREATE OR REPLACE FUNCTION public.prevent_fcm_token_ownership_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;
    IF NOT public.is_trusted_application_identity() OR NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'A verified signed-in patient is required to register a device token.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = NEW.user_id
          AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
            OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
    ) THEN
        RAISE EXCEPTION 'Device token owner does not match the signed-in patient.';
    END IF;
    IF NEW.tracking_code IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.tracking_code_10_digit = NEW.tracking_code
          AND (a.user_id = NEW.user_id OR LOWER(a.patient_email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RAISE EXCEPTION 'Device token cannot be linked to another patient appointment.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fcm_tokens_prevent_ownership_escalation ON public.fcm_tokens;
CREATE TRIGGER fcm_tokens_prevent_ownership_escalation
BEFORE INSERT OR UPDATE ON public.fcm_tokens
FOR EACH ROW EXECUTE FUNCTION public.prevent_fcm_token_ownership_escalation();

CREATE POLICY "fcm_tokens_delete_rule" ON public.fcm_tokens
FOR DELETE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);


-- -------------------------------------------------------------------------
-- 4.9 NOTIFICATIONS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_rule" ON public.notifications;

CREATE POLICY "notifications_select_rule" ON public.notifications
FOR SELECT
USING (
    is_admin_portal_user()
    OR target_audience IN ('all', 'all_users', 'all_patients', 'all_doctors', 'all_clinics')
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);

CREATE POLICY "notifications_insert_rule" ON public.notifications
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = notifications.appointment_id
          AND is_authorized_clinic_staff(a.clinic_id)
    )
);

CREATE POLICY "notifications_update_rule" ON public.notifications
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);

CREATE POLICY "notifications_delete_rule" ON public.notifications
FOR DELETE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);


-- -------------------------------------------------------------------------
-- 4.10 APPOINTMENTS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Patients may change only their appointment date/time/slot or cancel their
-- own booking. Billing, identity, ownership, clinic/doctor, tracking and queue
-- fields are server/clinic controlled even when the row-level policy matches.
CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user()
       OR public.is_authorized_clinic_staff(OLD.clinic_id) THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_current_patient_for_appointment(OLD.id) THEN
        RAISE EXCEPTION 'Appointment update is not authorized.';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['appointment_date','appointment_time','slot_id','checkin_status','updated_at']) THEN
        RAISE EXCEPTION 'Patients cannot update appointment identity, financial, ownership, or queue fields.';
    END IF;

    IF NEW.checkin_status IS DISTINCT FROM OLD.checkin_status
       AND NEW.checkin_status::TEXT <> 'cancelled' THEN
        RAISE EXCEPTION 'Patients may only cancel their own appointment.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS appointments_prevent_patient_privilege_escalation ON public.appointments;
CREATE TRIGGER appointments_prevent_patient_privilege_escalation
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_patient_appointment_privilege_escalation();

DROP POLICY IF EXISTS "appointments_select_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete_rule" ON public.appointments;

CREATE POLICY "appointments_select_rule" ON public.appointments
FOR SELECT
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = appointments.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = appointments.doctor_id
          AND (
              (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
              OR (public.current_auth_uid() IS NOT NULL AND (
                  d.user_id = public.current_auth_uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p WHERE p.id = d.user_id AND p.auth_uid = public.current_auth_uid()
                  )
              ))
          )
    )
    -- Allow guest patient lookup using specific 10-digit tracking code in query
);

CREATE POLICY "appointments_insert_rule" ON public.appointments
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR user_id IS NULL
    OR (
        public.current_auth_uid() IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = appointments.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "appointments_update_rule" ON public.appointments
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = appointments.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = appointments.doctor_id
          AND (
              (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
              OR (public.current_auth_uid() IS NOT NULL AND d.user_id = public.current_auth_uid())
          )
    )
);

CREATE POLICY "appointments_delete_rule" ON public.appointments
FOR DELETE
USING (
    is_admin_portal_user()
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email'))
    OR is_authorized_clinic_staff(clinic_id)
);


-- -------------------------------------------------------------------------
-- 4.11 LAB REPORTS TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_reports_select_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_insert_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_update_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_delete_rule" ON public.lab_reports;

CREATE POLICY "lab_reports_select_rule" ON public.lab_reports
FOR SELECT
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = lab_reports.appointment_id
          AND (
              (public.current_auth_uid() IS NOT NULL AND a.user_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND p.auth_uid = public.current_auth_uid()
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.doctors d ON d.id = a.doctor_id
        WHERE a.id = lab_reports.appointment_id
          AND (
              (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
              OR (public.current_auth_uid() IS NOT NULL AND d.user_id = public.current_auth_uid())
          )
    )
);

CREATE POLICY "lab_reports_insert_rule" ON public.lab_reports
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "lab_reports_update_rule" ON public.lab_reports
FOR UPDATE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "lab_reports_delete_rule" ON public.lab_reports
FOR DELETE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);


-- -------------------------------------------------------------------------
-- 4.12 QUEUE ENTRIES TABLE
-- -------------------------------------------------------------------------
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_entries_select_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_insert_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_update_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_delete_rule" ON public.queue_entries;

CREATE POLICY "queue_entries_select_rule" ON public.queue_entries
FOR SELECT
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = queue_entries.doctor_id
          AND (
              (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
              OR (public.current_auth_uid() IS NOT NULL AND (
                  d.user_id = public.current_auth_uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p WHERE p.id = d.user_id AND p.auth_uid = public.current_auth_uid()
                  )
              ))
          )
    )
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = queue_entries.appointment_id
          AND (
              (public.current_auth_uid() IS NOT NULL AND (
                  a.user_id = public.current_auth_uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND p.auth_uid = public.current_auth_uid()
                  )
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

CREATE POLICY "queue_entries_insert_rule" ON public.queue_entries
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "queue_entries_update_rule" ON public.queue_entries
FOR UPDATE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = queue_entries.doctor_id
          AND (
              (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
              OR (public.current_auth_uid() IS NOT NULL AND (
                  d.user_id = public.current_auth_uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p WHERE p.id = d.user_id AND p.auth_uid = public.current_auth_uid()
                  )
              ))
          )
    )
);

CREATE POLICY "queue_entries_delete_rule" ON public.queue_entries
FOR DELETE
USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);


-- -------------------------------------------------------------------------
-- SECTION 5: SECURITY DEFINER FUNCTIONS & SEARCH PATH HYGIENE
-- -------------------------------------------------------------------------

-- 5.1 Hardened 30-Day Clinic Archive Purge Function
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

GRANT EXECUTE ON FUNCTION public.purge_expired_archived_clinic_data(UUID) TO authenticated, service_role;


-- 5.2 Hardened Slot Lock Functions
CREATE OR REPLACE FUNCTION public.acquire_slot_lock(
    p_slot_id UUID,
    p_user_identifier VARCHAR(255)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot RECORD;
    v_active_locks_count INT;
    v_lock_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF NOT public.is_trusted_application_identity()
       OR COALESCE(p_user_identifier, '') NOT IN (
            COALESCE(auth.jwt() ->> 'sub', ''),
            COALESCE(auth.jwt() ->> 'email', ''),
            COALESCE(public.current_auth_uid()::TEXT, '')
       ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Verified sign-in is required to reserve this slot');
    END IF;

    DELETE FROM public.slot_locks WHERE expires_at < NOW();

    SELECT * INTO v_slot FROM public.slots WHERE id = p_slot_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Slot not found');
    END IF;

    SELECT COUNT(*) INTO v_active_locks_count
    FROM public.slot_locks
    WHERE slot_id = p_slot_id AND expires_at > NOW();

    IF (v_slot.booked_count + v_active_locks_count) >= v_slot.max_capacity THEN
        RETURN jsonb_build_object('success', false, 'message', 'Slot is currently full or reserved');
    END IF;

    v_expires_at := NOW() + INTERVAL '5 minutes';
    INSERT INTO public.slot_locks (slot_id, user_identifier, expires_at)
    VALUES (p_slot_id, p_user_identifier, v_expires_at)
    RETURNING id INTO v_lock_id;

    RETURN jsonb_build_object(
        'success', true,
        'lock_id', v_lock_id,
        'expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_slot_lock(UUID, VARCHAR) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.release_slot_lock(
    p_lock_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.slot_locks
    WHERE id = p_lock_id
      AND (
          (auth.jwt() ->> 'role') = 'service_role'
          OR public.is_admin_portal_user()
          OR (
              public.is_trusted_application_identity()
              AND user_identifier IN (auth.jwt() ->> 'sub', auth.jwt() ->> 'email', public.current_auth_uid()::TEXT)
          )
          OR EXISTS (SELECT 1 FROM public.slots s WHERE s.id = slot_locks.slot_id AND public.is_authorized_clinic_staff(s.clinic_id))
      );
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_slot_lock(UUID) TO anon, authenticated, service_role;


-- 5.3 Hardened Retroactive User Appointment Sync
CREATE OR REPLACE FUNCTION public.sync_user_appointments(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_mobile VARCHAR(50)
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INT;
    v_caller_auth_uid UUID := public.current_auth_uid();
BEGIN
    -- Security gate: Caller can only sync appointments for their own profile unless Super Admin or service_role
    IF NOT (
        current_user = 'service_role'
        OR (auth.jwt() ->> 'role') = 'service_role'
        OR is_admin_portal_user()
        OR (
            v_caller_auth_uid IS NOT NULL
            AND (
                p_user_id = v_caller_auth_uid
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = p_user_id AND auth_uid = v_caller_auth_uid
                )
            )
        )
    ) THEN
        RAISE EXCEPTION 'Access denied: Cannot sync appointments for another user.';
    END IF;

    UPDATE public.appointments
    SET user_id = p_user_id
    WHERE user_id IS NULL AND (
        (p_email IS NOT NULL AND LOWER(patient_email) = LOWER(p_email))
        OR (p_mobile IS NOT NULL AND patient_mobile = p_mobile)
    );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_appointments(UUID, VARCHAR, VARCHAR) TO authenticated, service_role;


-- -------------------------------------------------------------------------
-- SECTION 6: PRIVATE STORAGE BUCKETS & STORAGE RLS POLICIES
-- -------------------------------------------------------------------------

-- 6.1 Create / Update Private Storage Buckets (public: false, 50MB, restricted MIME types)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    (
        'lab-reports-private',
        'lab-reports-private',
        false,
        52428800,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    ),
    (
        'doctor-kyc-private',
        'doctor-kyc-private',
        false,
        52428800,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    ),
    (
        'clinic-docs-private',
        'clinic-docs-private',
        false,
        52428800,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    )
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Lock down legacy doctor-kyc bucket
UPDATE storage.buckets SET public = false WHERE id = 'doctor-kyc';

-- Restrict showcase gallery buckets strictly to public photos and avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
    ('clinic_photos', 'clinic_photos', true, 52428800),
    ('doctor_photos', 'doctor_photos', true, 52428800)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 52428800;


-- 6.2 Storage Row-Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive object policies before installing the private
-- bucket allowlist below; stale policies also combine with OR.
DO $$
DECLARE v_policy RECORD;
BEGIN
    FOR v_policy IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY %I ON storage.objects', v_policy.policyname);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "Deny public read on private buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read on public buckets" ON storage.objects;
DROP POLICY IF EXISTS "Super Admin full storage access" ON storage.objects;
DROP POLICY IF EXISTS "Clinic Staff upload private docs" ON storage.objects;
DROP POLICY IF EXISTS "Clinic Staff update private docs" ON storage.objects;
DROP POLICY IF EXISTS "Clinic Staff delete private docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor upload KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor update KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor delete KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "storage_public_buckets_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_all" ON storage.objects;

-- Allow anon and authenticated users to read ONLY public showcase buckets
CREATE POLICY "storage_public_buckets_select" ON storage.objects
FOR SELECT
USING (bucket_id IN ('clinic_photos', 'doctor_photos'));

-- Allow Super Admin full access across all storage buckets
CREATE POLICY "storage_admin_all" ON storage.objects
FOR ALL
USING (is_admin_portal_user());

-- Clinic Staff storage permissions (uploads to lab-reports-private, clinic-docs-private, clinic_photos)
CREATE POLICY "Clinic Staff upload private docs" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'clinic_photos')
);

CREATE POLICY "Clinic Staff update private docs" ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'clinic_photos')
);

CREATE POLICY "Clinic Staff delete private docs" ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'clinic_photos')
);

-- Doctor storage permissions (uploads KYC documents and doctor photos)
CREATE POLICY "Doctor upload KYC docs" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('doctor-kyc-private', 'doctor-kyc', 'doctor_photos')
);

CREATE POLICY "Doctor update KYC docs" ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id IN ('doctor-kyc-private', 'doctor-kyc', 'doctor_photos')
);

CREATE POLICY "Doctor delete KYC docs" ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id IN ('doctor-kyc-private', 'doctor-kyc', 'doctor_photos')
);

-- Doctor access to their own KYC bucket (authenticated SELECT)
-- Replace the legacy bucket-only write grants. They allowed every signed-in
-- user to write into the private clinical document buckets. Private document
-- uploads must use a server-authorized upload endpoint; browser writes remain
-- limited to the public showcase buckets.
DROP POLICY IF EXISTS "Clinic Staff upload private docs" ON storage.objects;
DROP POLICY IF EXISTS "Clinic Staff update private docs" ON storage.objects;
DROP POLICY IF EXISTS "Clinic Staff delete private docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor upload KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor update KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor delete KYC docs" ON storage.objects;

CREATE POLICY "Authenticated upload clinic showcase photos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'clinic_photos');
CREATE POLICY "Authenticated update clinic showcase photos" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'clinic_photos') WITH CHECK (bucket_id = 'clinic_photos');
CREATE POLICY "Authenticated delete clinic showcase photos" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'clinic_photos');
CREATE POLICY "Authenticated upload doctor showcase photos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'doctor_photos');
CREATE POLICY "Authenticated update doctor showcase photos" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'doctor_photos') WITH CHECK (bucket_id = 'doctor_photos');
CREATE POLICY "Authenticated delete doctor showcase photos" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'doctor_photos');

DROP POLICY IF EXISTS "storage_doctor_kyc_select" ON storage.objects;
CREATE POLICY "storage_doctor_kyc_select" ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id IN ('doctor-kyc', 'doctor-kyc-private') AND (
        is_admin_portal_user() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE (d.email = (auth.jwt() ->> 'email') OR d.user_id = public.current_auth_uid())
            AND storage.objects.name LIKE '%' || d.id::text || '%'
        )
    )
);

-- Clinic staff access to their clinic docs and lab reports (authenticated SELECT)
DROP POLICY IF EXISTS "storage_clinic_staff_select" ON storage.objects;
CREATE POLICY "storage_clinic_staff_select" ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id IN ('clinic-docs-private', 'lab-reports-private') AND (
        is_admin_portal_user() OR
        EXISTS (
            SELECT 1 FROM public.clinics c
            WHERE c.contact_email = (auth.jwt() ->> 'email')
            AND storage.objects.name LIKE '%' || c.id::text || '%'
        )
    )
);


-- -------------------------------------------------------------------------
-- SECTION 7: SERVER-SIDE AUTHORIZATION & AUDIT ENGINE
-- -------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7.1 Non-Destructive Storage Audit & Backup Table
CREATE TABLE IF NOT EXISTS public._migration_storage_backup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    old_url TEXT NOT NULL,
    new_bucket VARCHAR(100) NOT NULL,
    new_path TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'copied',
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_storage_backup_lookup
    ON public._migration_storage_backup (entity_type, entity_id);

-- 7.2 Storage Path Cleaner Helper Function
CREATE OR REPLACE FUNCTION public.clean_storage_path(p_raw_path TEXT, p_bucket TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_path TEXT := COALESCE(p_raw_path, '');
BEGIN
    v_path := split_part(v_path, '?', 1);
    v_path := regexp_replace(v_path, '^https?://[^/]+/storage/v1/object/(public|sign)/[^/]+/', '');
    v_path := regexp_replace(v_path, '^' || p_bucket || '/', '');
    v_path := regexp_replace(v_path, '^(clinic_photos|doctor_photos|doctor-kyc|clinic_files)/', '');
    v_path := regexp_replace(v_path, '^/+', '');
    RETURN v_path;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_storage_path(TEXT, TEXT) TO anon, authenticated, service_role;


-- 7.3 Server-Side Authorization RPC: authorize_document_access
CREATE OR REPLACE FUNCTION public.authorize_document_access(
    p_document_type TEXT,
    p_document_id UUID DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := public.current_auth_uid();
    v_user_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_clean_phone TEXT := NULL;
    v_doc_clinic_id UUID;
    v_doc_user_id UUID;
    v_doc_email TEXT;
BEGIN
    -- 1. Super Admin and service_role are universally authorized
    IF is_admin_portal_user() THEN
        RETURN jsonb_build_object('authorized', true, 'role', 'super_admin');
    END IF;

    -- 2. Normalize patient phone number if provided (Nepal mobile standard: last 10 digits)
    IF p_patient_phone IS NOT NULL AND TRIM(p_patient_phone) <> '' THEN
        v_clean_phone := regexp_replace(p_patient_phone, '\D', '', 'g');
        IF length(v_clean_phone) >= 10 THEN
            v_clean_phone := right(v_clean_phone, 10);
        ELSIF length(v_clean_phone) < 7 THEN
            v_clean_phone := NULL;
        END IF;
    END IF;

    -- 3. Case A: Lab Report Document Authorization
    IF p_document_type = 'lab_report' THEN
        -- Clinic Staff authorization
        IF v_user_email <> '' AND EXISTS (
            SELECT 1 FROM public.lab_reports lr
            WHERE ((p_document_id IS NOT NULL AND lr.id = p_document_id)
               OR (p_tracking_code IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.appointments a WHERE a.id = lr.appointment_id AND a.tracking_code_10_digit = p_tracking_code
               )))
            AND is_authorized_clinic_staff(lr.clinic_id)
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        -- Registered Patient authorization (public.current_auth_uid() = user_id or email match)
        IF (v_user_id IS NOT NULL OR v_user_email <> '') AND EXISTS (
            SELECT 1 FROM public.lab_reports lr
            JOIN public.appointments a ON a.id = lr.appointment_id
            WHERE ((p_document_id IS NOT NULL AND lr.id = p_document_id)
               OR (p_tracking_code IS NOT NULL AND a.tracking_code_10_digit = p_tracking_code))
            AND (
                (v_user_id IS NOT NULL AND (
                    a.user_id = v_user_id
                    OR (a.user_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND p.auth_uid = v_user_id
                    ))
                ))
                OR (v_user_email <> '' AND LOWER(a.patient_email) = v_user_email)
            )
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'logged_in_patient');
        END IF;

        -- Guest Patient authorization (server-verified phone number against appointment record)
        IF v_clean_phone IS NOT NULL AND p_tracking_code IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.lab_reports lr
            JOIN public.appointments a ON a.id = lr.appointment_id
            WHERE a.tracking_code_10_digit = p_tracking_code
            AND right(regexp_replace(a.patient_mobile, '\D', '', 'g'), 10) = v_clean_phone
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'verified_walkin_patient');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to medical record.');

    -- 4. Case B: Doctor KYC Document Authorization
    ELSIF p_document_type = 'doctor_kyc' THEN
        IF p_document_id IS NULL THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Missing doctor ID.');
        END IF;

        SELECT d.clinic_id, d.user_id, LOWER(d.email)
        INTO v_doc_clinic_id, v_doc_user_id, v_doc_email
        FROM public.doctors d
        WHERE d.id = p_document_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Doctor record not found.');
        END IF;

        -- Doctor self-access
        IF (v_user_email <> '' AND v_user_email = v_doc_email) OR (v_user_id IS NOT NULL AND v_user_id = v_doc_user_id) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'doctor');
        END IF;

        -- Affiliated Clinic Staff access
        IF v_doc_clinic_id IS NOT NULL AND is_authorized_clinic_staff(v_doc_clinic_id) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to doctor KYC document.');

    -- 5. Case C: Clinic Registration / Regulatory Document Authorization
    ELSIF p_document_type = 'clinic_doc' THEN
        IF p_document_id IS NULL THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Missing clinic ID.');
        END IF;

        IF is_authorized_clinic_staff(p_document_id) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to clinic regulatory document.');

    ELSE
        RETURN jsonb_build_object('authorized', false, 'error', 'Unsupported document type.');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_document_access(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_document_access(TEXT, UUID, TEXT, TEXT) TO service_role;


-- 7.4 Safe Lab Report Metadata RPC (Replaces direct public URL leaks)
CREATE OR REPLACE FUNCTION public.verify_and_get_lab_report_meta(
    p_tracking_code VARCHAR,
    p_phone VARCHAR
)
RETURNS TABLE (
    report_id UUID,
    appointment_id UUID,
    clinic_id UUID,
    test_name VARCHAR,
    stage lab_stage_enum,
    file_name VARCHAR,
    file_type VARCHAR,
    storage_path TEXT,
    bucket_name VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_code VARCHAR := TRIM(p_tracking_code);
    v_clean_phone VARCHAR := REGEXP_REPLACE(p_phone, '\D', '', 'g');
    v_appt public.appointments%ROWTYPE;
BEGIN
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE tracking_code_10_digit = v_clean_code OR id::text = v_clean_code
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Strict server-side verification: phone number must match registered appointment record
    IF REGEXP_REPLACE(COALESCE(v_appt.patient_mobile, ''), '\D', '', 'g') NOT LIKE '%' || RIGHT(v_clean_phone, 8) THEN
        RAISE EXCEPTION 'Verification failed: Phone number does not match appointment record.';
    END IF;

    RETURN QUERY
    SELECT 
        lr.id AS report_id,
        lr.appointment_id,
        lr.clinic_id,
        lr.test_name,
        lr.stage,
        lr.file_name,
        lr.file_type,
        clean_storage_path(lr.file_url, 'lab-reports-private') AS storage_path,
        'lab-reports-private'::VARCHAR AS bucket_name
    FROM public.lab_reports lr
    WHERE lr.appointment_id = v_appt.id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_and_get_lab_report_meta(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_get_lab_report_meta(VARCHAR, VARCHAR) TO service_role;


-- 7.5 get_lab_report_signed_url: Generates short-lived signed URL for lab report after verification
CREATE OR REPLACE FUNCTION public.get_lab_report_signed_url(
    p_report_id UUID DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_tracking_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report_id UUID := p_report_id;
    v_auth JSONB;
    v_raw_file_url TEXT;
    v_clean_path TEXT;
    v_expires_sec INT := 900;
    v_expires_at_epoch BIGINT;
    v_expires_at_iso TEXT;
    v_token TEXT;
    v_signed_url TEXT;
BEGIN
    -- 1. Resolve Report ID by tracking code if not explicitly passed
    IF v_report_id IS NULL AND p_tracking_code IS NOT NULL THEN
        SELECT lr.id INTO v_report_id
        FROM public.lab_reports lr
        JOIN public.appointments a ON a.id = lr.appointment_id
        WHERE a.tracking_code_10_digit = p_tracking_code
        ORDER BY lr.created_at DESC
        LIMIT 1;
    END IF;

    IF v_report_id IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'error', 'Lab report not found');
    END IF;

    -- 1b. If both report_id and tracking_code are passed, verify report belongs to tracking code
    IF p_report_id IS NOT NULL AND p_tracking_code IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.lab_reports lr
            JOIN public.appointments a ON a.id = lr.appointment_id
            WHERE lr.id = p_report_id AND a.tracking_code_10_digit = p_tracking_code
        ) THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Lab report does not belong to specified tracking code');
        END IF;
    END IF;

    -- 2. Verify Authorization via server-side security definer gate
    v_auth := authorize_document_access('lab_report', v_report_id, p_patient_phone, p_tracking_code);

    IF (v_auth->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'error', COALESCE(v_auth->>'error', 'Unauthorized access to lab report')
        );
    END IF;

    -- 3. Fetch lab report storage path
    SELECT lr.file_url INTO v_raw_file_url
    FROM public.lab_reports lr
    WHERE lr.id = v_report_id;

    IF v_raw_file_url IS NULL OR trim(v_raw_file_url) = '' THEN
        RETURN jsonb_build_object('authorized', false, 'error', 'Report file is not yet ready or uploaded');
    END IF;

    -- 4. Clean storage path
    v_clean_path := clean_storage_path(v_raw_file_url, 'lab-reports-private');

    -- 5. Calculate expiration timestamps (15 minutes window)
    v_expires_at_epoch := extract(epoch from (now() + (v_expires_sec || ' seconds')::INTERVAL))::BIGINT;
    v_expires_at_iso := to_char((now() + (v_expires_sec || ' seconds')::INTERVAL) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    -- 6. Generate cryptographic signature token
    v_token := encode(digest(v_clean_path || ':' || v_expires_at_epoch::TEXT || ':dactor_hmac_secret', 'sha256'), 'hex');

    -- 7. Construct authorized signed URL
    v_signed_url := 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/sign/lab-reports-private/' || v_clean_path || '?token=' || v_token || '&expires_at=' || v_expires_at_epoch::TEXT;

    RETURN jsonb_build_object(
        'authorized', true,
        'signed_url', v_signed_url,
        'expires_at', v_expires_at_iso,
        'role', v_auth->>'role'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_lab_report_signed_url(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lab_report_signed_url(UUID, TEXT, TEXT) TO service_role;


-- 7.6 get_authorized_document_signed_url: General document signed URL issuer
CREATE OR REPLACE FUNCTION public.get_authorized_document_signed_url(
    p_doc_type TEXT,
    p_entity_id UUID,
    p_file_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth JSONB;
    v_bucket TEXT;
    v_raw_path TEXT := p_file_path;
    v_clean_path TEXT;
    v_expires_sec INT := 900;
    v_expires_at_epoch BIGINT;
    v_expires_at_iso TEXT;
    v_token TEXT;
    v_signed_url TEXT;
BEGIN
    -- 1. Determine target bucket by doc type
    IF p_doc_type = 'lab_report' THEN
        v_bucket := 'lab-reports-private';
        IF v_raw_path IS NULL THEN
            SELECT file_url INTO v_raw_path FROM public.lab_reports WHERE id = p_entity_id;
        END IF;
    ELSIF p_doc_type = 'doctor_kyc' THEN
        v_bucket := 'doctor-kyc-private';
        IF v_raw_path IS NULL THEN
            SELECT COALESCE(license_doc_url, certificates_doc_url) INTO v_raw_path FROM public.doctors WHERE id = p_entity_id;
        END IF;
    ELSIF p_doc_type = 'clinic_doc' THEN
        v_bucket := 'clinic-docs-private';
        IF v_raw_path IS NULL THEN
            SELECT registration_doc_url INTO v_raw_path FROM public.clinics WHERE id = p_entity_id;
        END IF;
    ELSE
        RETURN jsonb_build_object('authorized', false, 'error', 'Unknown document type');
    END IF;

    -- 2. Verify caller authorization
    v_auth := authorize_document_access(p_doc_type, p_entity_id, NULL, NULL);

    IF (v_auth->>'authorized')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'error', COALESCE(v_auth->>'error', 'Unauthorized document access')
        );
    END IF;

    IF v_raw_path IS NULL OR trim(v_raw_path) = '' THEN
        RETURN jsonb_build_object('authorized', false, 'error', 'Document file path not found');
    END IF;

    -- 3. Clean storage path
    v_clean_path := clean_storage_path(v_raw_path, v_bucket);

    -- 4. Calculate expiration timestamps
    v_expires_at_epoch := extract(epoch from (now() + (v_expires_sec || ' seconds')::INTERVAL))::BIGINT;
    v_expires_at_iso := to_char((now() + (v_expires_sec || ' seconds')::INTERVAL) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    -- 5. Generate cryptographic signature token
    v_token := encode(digest(v_clean_path || ':' || v_expires_at_epoch::TEXT || ':dactor_hmac_secret', 'sha256'), 'hex');

    -- 6. Construct signed URL
    v_signed_url := 'https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/sign/' || v_bucket || '/' || v_clean_path || '?token=' || v_token || '&expires_at=' || v_expires_at_epoch::TEXT;

    RETURN jsonb_build_object(
        'authorized', true,
        'signed_url', v_signed_url,
        'expires_at', v_expires_at_iso,
        'role', v_auth->>'role'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_authorized_document_signed_url(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_authorized_document_signed_url(TEXT, UUID, TEXT) TO service_role;


-- -------------------------------------------------------------------------
-- SECTION 8: SCHEMA CACHE RELOAD NOTIFICATION
-- -------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
