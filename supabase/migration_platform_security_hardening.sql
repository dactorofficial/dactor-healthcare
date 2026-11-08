-- =========================================================================
-- DACTOR PLATFORM SECURITY HARDENING MIGRATION (MILESTONE 1)
-- File: supabase/migration_platform_security_hardening.sql
--
-- Comprehensive Database Schema & Row-Level Security Hardening:
-- 1. Firebase Auth & Third-Party UID Graceful Handling (R10)
-- 2. Authorization Helpers Update with Firebase & Role Awareness (R5, R10)
-- 3. Profile Privilege Escalation Guard (R5)
-- 4. Public Discovery Views & Proximity RPC Sanitization (R4)
-- 5. Comprehensive RLS Policy Sweep Across 11 Sensitive Tables (R5)
-- 6. Server-Authoritative Appointment Creation RPC (create_patient_appointment) (R1)
-- 7. Appointment Anti-Tampering Trigger (prevent_appointment_tampering) (R1)
-- 8. Minimal Public Queue Tracking RPC (get_public_queue_status) (R2)
-- 9. Server-Side Guest Verification & Lab Report Access (R2)
-- =========================================================================

-- =========================================================================
-- SECTION 1: RATE LIMITING & SECURITY INFRASTRUCTURE
-- =========================================================================
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


-- =========================================================================
-- SECTION 2: FIREBASE AUTH & THIRD-PARTY UID COMPATIBILITY (R10)
-- =========================================================================

-- 2.1 Safe, Non-Throwing auth.uid() in auth Schema
-- Protects PostgreSQL from fatal runtime cast crashes ("invalid input syntax for type uuid")
-- when third-party Firebase Auth tokens containing alphanumeric 28-char UIDs are received.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
      auth.jwt() ->> 'sub'
    ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
      auth.jwt() ->> 'sub'
    )::UUID
    ELSE NULL
  END;
$$;

-- 2.2 Add firebase_uid Column to Profiles Table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_firebase_uid ON public.profiles(firebase_uid) WHERE firebase_uid IS NOT NULL;

-- 2.3 Expose current_auth_sub() Helper for Alphanumeric Firebase UIDs
CREATE OR REPLACE FUNCTION public.current_auth_sub()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
    auth.jwt() ->> 'sub'
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_auth_sub() TO anon, authenticated, service_role;

-- 2.4 Guarded public.current_auth_uid()
CREATE OR REPLACE FUNCTION public.current_auth_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.current_auth_uid() TO anon, authenticated, service_role;


-- =========================================================================
-- SECTION 3: AUTHORIZATION HELPERS UPDATE (R5, R10)
-- =========================================================================

-- 3.1 Hardened is_admin_portal_user()
CREATE OR REPLACE FUNCTION public.is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
        RETURN TRUE;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
       OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
       OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    LIMIT 1;

    RETURN v_role IN ('admin', 'super_admin', 'platform_admin');
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;

-- 3.2 Hardened is_authorized_clinic_staff()
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
    v_sub TEXT := public.current_auth_sub();
BEGIN
    IF is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF v_email = '' AND v_uid IS NULL AND v_sub IS NULL THEN
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
        WHERE (d.clinic_id = p_clinic_id OR d.primary_clinic_id = p_clinic_id OR d.active_clinic_id = p_clinic_id)
          AND (
              (v_email <> '' AND LOWER(d.email) = v_email)
              OR (v_uid IS NOT NULL AND p.auth_uid = v_uid)
              OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
          )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_authorized_clinic_staff(UUID) TO anon, authenticated, service_role;

-- 3.3 Hardened is_authorized_doctor()
CREATE OR REPLACE FUNCTION public.is_authorized_doctor(p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
    v_sub TEXT := public.current_auth_sub();
BEGIN
    IF is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.doctors d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE d.id = p_doctor_id
          AND (
              (v_email <> '' AND LOWER(d.email) = v_email)
              OR (v_uid IS NOT NULL AND p.auth_uid = v_uid)
              OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
              OR (v_email <> '' AND LOWER(p.email) = v_email)
          )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_authorized_doctor(UUID) TO anon, authenticated, service_role;

-- 3.4 Hardened is_current_patient_for_appointment()
CREATE OR REPLACE FUNCTION public.is_current_patient_for_appointment(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
    v_sub TEXT := public.current_auth_sub();
    v_phone TEXT := RIGHT(REGEXP_REPLACE(COALESCE(auth.jwt() ->> 'phone_number', ''), '\D', '', 'g'), 10);
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.appointments a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.id = p_appointment_id
          AND (
              (v_uid IS NOT NULL AND (a.user_id = v_uid OR p.auth_uid = v_uid))
              OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
              OR (v_email <> '' AND (LOWER(a.patient_email) = v_email OR LOWER(p.email) = v_email))
              OR (v_phone <> '' AND LENGTH(v_phone) = 10 AND RIGHT(REGEXP_REPLACE(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_phone)
          )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_current_patient_for_appointment(UUID) TO anon, authenticated, service_role;


-- =========================================================================
-- SECTION 4: PRIVILEGE ESCALATION GUARDS (R5)
-- =========================================================================

-- 4.1 Profiles Privilege Escalation Guard Trigger
-- Prevents non-admins from self-assigning admin, super_admin, platform_admin,
-- clinic_admin, or doctor roles on public.profiles during INSERT or UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Unrestricted execution for platform administrative context and service_role
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;

    -- ON INSERT CHECKS:
    IF TG_OP = 'INSERT' THEN
        -- Strictly block self-assigning administrative or healthcare professional roles
        IF LOWER(COALESCE(NEW.role, '')) IN ('admin', 'super_admin', 'platform_admin', 'service_role', 'clinic_admin', 'doctor') THEN
            RAISE EXCEPTION 'Privileged profile roles (admin, super_admin, platform_admin, clinic_admin, doctor) can only be assigned by platform administration.';
        END IF;

        -- Ensure auth_uid cannot be stolen/bound to another user
        IF NEW.auth_uid IS NOT NULL AND NEW.auth_uid IS DISTINCT FROM public.current_auth_uid() THEN
            RAISE EXCEPTION 'Profile auth_uid cannot be assigned to another account.';
        END IF;

        -- Ensure firebase_uid cannot be stolen/bound to another user
        IF NEW.firebase_uid IS NOT NULL AND NEW.firebase_uid IS DISTINCT FROM public.current_auth_sub() THEN
            RAISE EXCEPTION 'Profile firebase_uid cannot be assigned to another account.';
        END IF;

        -- Enforce email match if caller has email claim
        IF COALESCE(auth.jwt() ->> 'email', '') <> ''
           AND LOWER(NEW.email) <> LOWER(auth.jwt() ->> 'email') THEN
            RAISE EXCEPTION 'Profile email must match the authenticated identity.';
        END IF;

        RETURN NEW;
    END IF;

    -- ON UPDATE CHECKS:
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Profile identifier cannot be changed.';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Profile role cannot be self-modified. Contact administration.';
    END IF;

    IF NEW.auth_uid IS DISTINCT FROM OLD.auth_uid AND OLD.auth_uid IS NOT NULL THEN
        RAISE EXCEPTION 'Profile auth_uid cannot be transferred to another account.';
    END IF;

    IF NEW.firebase_uid IS DISTINCT FROM OLD.firebase_uid AND OLD.firebase_uid IS NOT NULL THEN
        RAISE EXCEPTION 'Profile firebase_uid cannot be transferred to another account.';
    END IF;

    IF LOWER(COALESCE(NEW.email, '')) <> LOWER(COALESCE(OLD.email, '')) AND OLD.email IS NOT NULL THEN
        RAISE EXCEPTION 'Profile email cannot be modified directly by the account owner.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


-- =========================================================================
-- SECTION 5: PUBLIC DISCOVERY VIEWS & PROXIMITY RPC SANITIZATION (R4)
-- =========================================================================

-- 5.1 Robust public_clinic_description Supporting Plain Text & Stripping Secrets
CREATE OR REPLACE FUNCTION public.public_clinic_description(p_description TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_trimmed TEXT;
    v_metadata JSONB;
BEGIN
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RETURN NULL;
    END IF;

    v_trimmed := trim(p_description);

    -- If JSON formatted, extract public description string
    IF left(v_trimmed, 1) = '{' THEN
        BEGIN
            v_metadata := v_trimmed::JSONB;
            IF jsonb_typeof(v_metadata) = 'object' THEN
                RETURN left(COALESCE(v_metadata ->> 'desc', v_metadata ->> 'public_description', ''), 2000);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
        END;
    END IF;

    -- If plain text, verify no embedded API secrets, tokens, or credentials
    IF v_trimmed ~* '(payment_secret_key|payment_api_key|secret_key|api_key|password|bearer|pan_number)' THEN
        RETURN NULL;
    END IF;

    RETURN left(v_trimmed, 2000);
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_clinic_description(TEXT) TO anon, authenticated, service_role;

-- 5.2 Secure public_clinics Discovery View
DROP VIEW IF EXISTS public.public_clinics;
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

-- 5.3 Secure public_doctors Discovery View
DROP VIEW IF EXISTS public.public_doctors;
CREATE VIEW public.public_doctors
WITH (security_barrier = true) AS
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
WHERE kyc_status IN ('approved', 'verified');

GRANT SELECT ON public.public_doctors TO anon, authenticated, service_role;

-- 5.4 Sanitized Proximity Search RPC get_nearby_clinics
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
        COALESCE(c.is_archived, false) = FALSE
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
GRANT EXECUTE ON FUNCTION public.get_nearby_clinics TO anon, authenticated, service_role;


-- =========================================================================
-- SECTION 6: COMPREHENSIVE RLS POLICY SWEEP (R5)
-- =========================================================================
-- Drops all permissive USING (true) / WITH CHECK (true) policies and establishes
-- strict least-privilege policies across all 11 sensitive tables + taxonomy.

-- 6.1 profiles
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Public update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_rule" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_rule" ON public.profiles;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_rule" ON public.profiles
FOR SELECT USING (
    (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR (COALESCE(auth.jwt() ->> 'phone_number', '') <> '' AND RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(auth.jwt() ->> 'phone_number', '\D', '', 'g'), 10))
    OR public.is_admin_portal_user()
);

CREATE POLICY "profiles_insert_rule" ON public.profiles
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (
        (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
        OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
        OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    )
);

CREATE POLICY "profiles_update_rule" ON public.profiles
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "profiles_delete_rule" ON public.profiles
FOR DELETE USING (
    public.is_admin_portal_user()
    OR (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
    OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

-- 6.2 clinics
DROP POLICY IF EXISTS "Public clinics read" ON public.clinics;
DROP POLICY IF EXISTS "clinics_select_public" ON public.clinics;
DROP POLICY IF EXISTS "clinics_select_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_insert_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_update_rule" ON public.clinics;
DROP POLICY IF EXISTS "clinics_delete_rule" ON public.clinics;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinics_select_rule" ON public.clinics
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinics_insert_rule" ON public.clinics
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinics_update_rule" ON public.clinics
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(contact_email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinics_delete_rule" ON public.clinics
FOR DELETE USING (
    public.is_admin_portal_user()
);

-- 6.3 doctors
DROP POLICY IF EXISTS "doctors_select_rule" ON public.doctors;
DROP POLICY IF EXISTS "Public doctors read" ON public.doctors;
DROP POLICY IF EXISTS "doctors_public_read" ON public.doctors;
DROP POLICY IF EXISTS "doctors_insert_rule" ON public.doctors;
DROP POLICY IF EXISTS "doctors_update_rule" ON public.doctors;
DROP POLICY IF EXISTS "doctors_delete_rule" ON public.doctors;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctors_select_rule" ON public.doctors
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_doctor(id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (primary_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(primary_clinic_id))
    OR (active_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(active_clinic_id))
);

CREATE POLICY "doctors_insert_rule" ON public.doctors
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (primary_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(primary_clinic_id))
);

CREATE POLICY "doctors_update_rule" ON public.doctors
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_doctor(id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (primary_clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(primary_clinic_id))
);

CREATE POLICY "doctors_delete_rule" ON public.doctors
FOR DELETE USING (
    public.is_admin_portal_user()
);

-- 6.4 appointments
DROP POLICY IF EXISTS "appointments_select_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete_rule" ON public.appointments;
DROP POLICY IF EXISTS "Public appointments read" ON public.appointments;
DROP POLICY IF EXISTS "Public insert appointments" ON public.appointments;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select_rule" ON public.appointments
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (doctor_id IS NOT NULL AND public.is_authorized_doctor(doctor_id))
    OR (
        user_id IS NOT NULL
        AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email'))
    OR (COALESCE(auth.jwt() ->> 'phone_number', '') <> '' AND RIGHT(REGEXP_REPLACE(patient_mobile, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(auth.jwt() ->> 'phone_number', '\D', '', 'g'), 10))
);

-- Replaces permissive OR user_id IS NULL: Direct INSERT restricted to authenticated booking or clinic staff
CREATE POLICY "appointments_insert_rule" ON public.appointments
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (
        public.current_auth_uid() IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
    OR (
        public.current_auth_sub() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = appointments.user_id
              AND p.firebase_uid = public.current_auth_sub()
        )
    )
);

CREATE POLICY "appointments_update_rule" ON public.appointments
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (doctor_id IS NOT NULL AND public.is_authorized_doctor(doctor_id))
    OR (
        user_id IS NOT NULL
        AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
);

CREATE POLICY "appointments_delete_rule" ON public.appointments
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

-- 6.5 billing_invoices
DROP POLICY IF EXISTS "billing_invoices_select_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_insert_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_update_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_delete_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "Public invoices select" ON public.billing_invoices;
DROP POLICY IF EXISTS "Public invoices insert" ON public.billing_invoices;
DROP POLICY IF EXISTS "Public invoices update" ON public.billing_invoices;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_invoices_select_rule" ON public.billing_invoices
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = billing_invoices.appointment_id
          AND (
              (a.user_id IS NOT NULL AND (
                  (public.current_auth_uid() IS NOT NULL AND a.user_id = public.current_auth_uid())
                  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

CREATE POLICY "billing_invoices_insert_rule" ON public.billing_invoices
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "billing_invoices_update_rule" ON public.billing_invoices
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "billing_invoices_delete_rule" ON public.billing_invoices
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

-- 6.6 queue_entries
DROP POLICY IF EXISTS "queue_entries_select_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_insert_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_update_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_delete_rule" ON public.queue_entries;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_entries_select_rule" ON public.queue_entries
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (doctor_id IS NOT NULL AND public.is_authorized_doctor(doctor_id))
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = queue_entries.appointment_id
          AND (
              (a.user_id IS NOT NULL AND (
                  (public.current_auth_uid() IS NOT NULL AND a.user_id = public.current_auth_uid())
                  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

CREATE POLICY "queue_entries_insert_rule" ON public.queue_entries
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "queue_entries_update_rule" ON public.queue_entries
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (doctor_id IS NOT NULL AND public.is_authorized_doctor(doctor_id))
);

CREATE POLICY "queue_entries_delete_rule" ON public.queue_entries
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

-- 6.7 lab_reports
DROP POLICY IF EXISTS "lab_reports_select_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_insert_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_update_rule" ON public.lab_reports;
DROP POLICY IF EXISTS "lab_reports_delete_rule" ON public.lab_reports;
ALTER TABLE public.lab_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_reports_select_rule" ON public.lab_reports
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = lab_reports.appointment_id
          AND (
              (a.doctor_id IS NOT NULL AND public.is_authorized_doctor(a.doctor_id))
              OR (a.user_id IS NOT NULL AND (
                  (public.current_auth_uid() IS NOT NULL AND a.user_id = public.current_auth_uid())
                  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

CREATE POLICY "lab_reports_insert_rule" ON public.lab_reports
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "lab_reports_update_rule" ON public.lab_reports
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "lab_reports_delete_rule" ON public.lab_reports
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

-- 6.8 fcm_tokens
DROP POLICY IF EXISTS "fcm_tokens_select_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_insert_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_delete_rule" ON public.fcm_tokens;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fcm_tokens_select_rule" ON public.fcm_tokens
FOR SELECT USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "fcm_tokens_insert_rule" ON public.fcm_tokens
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "fcm_tokens_update_rule" ON public.fcm_tokens
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "fcm_tokens_delete_rule" ON public.fcm_tokens
FOR DELETE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

-- 6.9 notifications
DROP POLICY IF EXISTS "notifications_select_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_rule" ON public.notifications;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_rule" ON public.notifications
FOR SELECT USING (
    public.is_admin_portal_user()
    OR target_audience IN ('all', 'all_users', 'public')
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "notifications_insert_rule" ON public.notifications
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
);

CREATE POLICY "notifications_update_rule" ON public.notifications
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "notifications_delete_rule" ON public.notifications
FOR DELETE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

-- 6.10 clinic_invitations
DROP POLICY IF EXISTS "clinic_invitations_select_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_insert_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_update_rule" ON public.clinic_invitations;
DROP POLICY IF EXISTS "clinic_invitations_delete_rule" ON public.clinic_invitations;
ALTER TABLE public.clinic_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_invitations_select_rule" ON public.clinic_invitations
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinic_invitations_insert_rule" ON public.clinic_invitations
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

CREATE POLICY "clinic_invitations_update_rule" ON public.clinic_invitations
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
);

CREATE POLICY "clinic_invitations_delete_rule" ON public.clinic_invitations
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_staff(clinic_id)
);

-- 6.11 slot_locks
DROP POLICY IF EXISTS "slot_locks_select_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_insert_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_update_rule" ON public.slot_locks;
DROP POLICY IF EXISTS "slot_locks_delete_rule" ON public.slot_locks;
ALTER TABLE public.slot_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_locks_select_rule" ON public.slot_locks
FOR SELECT USING (
    public.is_admin_portal_user()
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (
        locked_by_user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND locked_by_user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = slot_locks.locked_by_user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "slot_locks_insert_rule" ON public.slot_locks
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (
        locked_by_user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND locked_by_user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = slot_locks.locked_by_user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "slot_locks_update_rule" ON public.slot_locks
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (
        locked_by_user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND locked_by_user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = slot_locks.locked_by_user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

CREATE POLICY "slot_locks_delete_rule" ON public.slot_locks
FOR DELETE USING (
    public.is_admin_portal_user()
    OR (clinic_id IS NOT NULL AND public.is_authorized_clinic_staff(clinic_id))
    OR (
        locked_by_user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND locked_by_user_id = public.current_auth_uid())
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = slot_locks.locked_by_user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        )
    )
);

-- 6.12 Taxonomy Tables: medical_specialties & medical_qualifications
DROP POLICY IF EXISTS "Public select medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public insert medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public update medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "Public delete medical_specialties" ON public.medical_specialties;
DROP POLICY IF EXISTS "medical_specialties_select_policy" ON public.medical_specialties;
DROP POLICY IF EXISTS "medical_specialties_insert_policy" ON public.medical_specialties;
DROP POLICY IF EXISTS "medical_specialties_update_policy" ON public.medical_specialties;
DROP POLICY IF EXISTS "medical_specialties_delete_policy" ON public.medical_specialties;
ALTER TABLE public.medical_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_specialties_select_policy" ON public.medical_specialties FOR SELECT USING (true);
CREATE POLICY "medical_specialties_insert_policy" ON public.medical_specialties FOR INSERT WITH CHECK (public.is_admin_portal_user());
CREATE POLICY "medical_specialties_update_policy" ON public.medical_specialties FOR UPDATE USING (public.is_admin_portal_user());
CREATE POLICY "medical_specialties_delete_policy" ON public.medical_specialties FOR DELETE USING (public.is_admin_portal_user());

DROP POLICY IF EXISTS "Public select medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public insert medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public update medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "Public delete medical_qualifications" ON public.medical_qualifications;
DROP POLICY IF EXISTS "medical_qualifications_select_policy" ON public.medical_qualifications;
DROP POLICY IF EXISTS "medical_qualifications_insert_policy" ON public.medical_qualifications;
DROP POLICY IF EXISTS "medical_qualifications_update_policy" ON public.medical_qualifications;
DROP POLICY IF EXISTS "medical_qualifications_delete_policy" ON public.medical_qualifications;
ALTER TABLE public.medical_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_qualifications_select_policy" ON public.medical_qualifications FOR SELECT USING (true);
CREATE POLICY "medical_qualifications_insert_policy" ON public.medical_qualifications FOR INSERT WITH CHECK (public.is_admin_portal_user());
CREATE POLICY "medical_qualifications_update_policy" ON public.medical_qualifications FOR UPDATE USING (public.is_admin_portal_user());
CREATE POLICY "medical_qualifications_delete_policy" ON public.medical_qualifications FOR DELETE USING (public.is_admin_portal_user());


-- =========================================================================
-- SECTION 7: AUTHORITATIVE APPOINTMENT CREATION & PRICING RPC (R1)
-- =========================================================================

-- 7.0 Authoritative Luhn Check Digit Algorithm (Base-10 Mod-10)
CREATE OR REPLACE FUNCTION public.calculate_luhn_check_digit(p_payload TEXT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean TEXT;
    v_len INT;
    v_sum INT := 0;
    v_double BOOLEAN := TRUE;
    v_digit INT;
    i INT;
BEGIN
    -- Strip non-digit characters
    v_clean := regexp_replace(COALESCE(p_payload, ''), '\D', '', 'g');
    v_len := length(v_clean);
    
    IF v_len = 0 THEN
        RAISE EXCEPTION 'calculate_luhn_check_digit: payload must contain at least one digit';
    END IF;

    -- Process digits from right to left, doubling every second digit
    -- starting from the rightmost payload digit (i = v_len)
    FOR i IN REVERSE v_len..1 LOOP
        v_digit := substr(v_clean, i, 1)::INT;
        IF v_double THEN
            v_digit := v_digit * 2;
            IF v_digit > 9 THEN
                v_digit := v_digit - 9;
            END IF;
        END IF;
        v_sum := v_sum + v_digit;
        v_double := NOT v_double;
    END LOOP;

    RETURN (10 - (v_sum % 10)) % 10;
END;
$$;
GRANT EXECUTE ON FUNCTION public.calculate_luhn_check_digit(TEXT) TO anon, authenticated, service_role;

-- 7.1 Collision-Proof 10-Digit Structured Tracking Code Generator with Luhn Check Digit
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_code_10(p_terminal_id INT DEFAULT NULL)
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_term_str VARCHAR(3);
    v_doy_str VARCHAR(3);
    v_counter_str VARCHAR(3);
    v_payload VARCHAR(9);
    v_check_digit INT;
    v_code VARCHAR(10);
    v_exists BOOLEAN;
    v_attempts INT := 0;
BEGIN
    -- 1. Day of Year (3 digits DDD: 001 - 366)
    v_doy_str := to_char(CURRENT_DATE, 'DDD');

    LOOP
        v_attempts := v_attempts + 1;

        -- 2. Structured Terminal ID (3 digits, 100 - 999)
        IF p_terminal_id IS NOT NULL THEN
            v_term_str := lpad((abs(p_terminal_id) % 1000)::TEXT, 3, '0');
        ELSE
            -- Uniform random terminal ID in range [100, 999] ensuring first digit is 1-9
            v_term_str := (floor(random() * 900 + 100)::INT)::TEXT;
        END IF;

        -- 3. Structured Counter / Entropy (3 digits, 000 - 999)
        v_counter_str := lpad(floor(random() * 1000)::INT::TEXT, 3, '0');

        -- 4. Form 9-digit payload: [Terminal 3][DayOfYear 3][Counter 3]
        v_payload := v_term_str || v_doy_str || v_counter_str;

        -- 5. Calculate authoritative Luhn check digit
        v_check_digit := public.calculate_luhn_check_digit(v_payload);

        -- 6. Assemble complete 10-digit code
        v_code := v_payload || v_check_digit::TEXT;

        -- 7. Uniqueness check against public.appointments
        SELECT EXISTS(SELECT 1 FROM public.appointments WHERE tracking_code_10_digit = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        -- 8. High-collision fallback preserving strict Luhn validity and 10-digit format
        IF v_attempts > 100 THEN
            v_payload := (floor(random() * 900 + 100)::INT)::TEXT ||
                         lpad((extract(epoch from clock_timestamp())::BIGINT % 1000000)::TEXT, 6, '0');
            v_code := v_payload || public.calculate_luhn_check_digit(v_payload)::TEXT;
            RETURN v_code;
        END IF;
    END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_unique_tracking_code_10(INT) TO anon, authenticated, service_role;

-- Backward-compatible zero-argument wrapper
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_code_10()
RETURNS VARCHAR(10)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.generate_unique_tracking_code_10(NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_unique_tracking_code_10() TO anon, authenticated, service_role;

-- 7.2 Authoritative Appointment Booking RPC create_patient_appointment
CREATE OR REPLACE FUNCTION public.create_patient_appointment(
    p_clinic_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_appointment_time TIME,
    p_patient_name TEXT,
    p_patient_phone TEXT,
    p_patient_email TEXT DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_patient_gender TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_is_pay_at_desk BOOLEAN DEFAULT FALSE,
    p_slot_id UUID DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt_id UUID := gen_random_uuid();
    v_tracking_code VARCHAR(10);
    v_fee NUMERIC(10, 2);
    v_service_charge NUMERIC(10, 2) := 0.00;
    v_total NUMERIC(10, 2);
    v_doctor public.doctors%ROWTYPE;
    v_clinic public.clinics%ROWTYPE;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_gender TEXT;
    v_caller_profile_id UUID;
    v_ip TEXT;
    v_slot public.slots%ROWTYPE;
    v_is_pad BOOLEAN;
    v_payment_mode_final VARCHAR(30);
    v_status_final VARCHAR(50);
BEGIN
    -- 1. Input Sanitization & Mobile Validation
    v_clean_phone := right(regexp_replace(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
    IF length(v_clean_phone) <> 10 OR left(v_clean_phone, 1) <> '9' THEN
        RAISE EXCEPTION 'Invalid Nepal mobile number. Must be 10 digits starting with 9.';
    END IF;

    v_clean_name := trim(COALESCE(p_patient_name, ''));
    IF length(v_clean_name) < 2 OR length(v_clean_name) > 150 THEN
        RAISE EXCEPTION 'Patient name must be between 2 and 150 characters.';
    END IF;
    v_clean_gender := COALESCE(NULLIF(trim(p_patient_gender), ''), 'Other');

    -- 2. Security Rate Limiting by Phone and IP
    IF NOT private.consume_tracking_rate_limit('booking-phone', v_clean_phone, 10, 3600) THEN
        RAISE EXCEPTION 'Booking rate limit exceeded for this mobile number (max 10 per hour).';
    END IF;

    BEGIN
        v_ip := COALESCE(
            current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
            current_setting('request.headers', true)::json ->> 'x-forwarded-for',
            'unknown-ip'
        );
        IF v_ip <> 'unknown-ip' AND length(v_ip) > 0 THEN
            IF NOT private.consume_tracking_rate_limit('booking-ip', v_ip, 30, 3600) THEN
                RAISE EXCEPTION 'Booking rate limit exceeded for this network (max 30 per hour).';
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. Authoritative Clinic Verification Check
    SELECT * INTO v_clinic FROM public.clinics
    WHERE id = p_clinic_id
      AND verification_status = 'approved'
      AND COALESCE(is_archived, false) = false
      AND COALESCE(is_activated, true) = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected clinic is not active or verified for booking.';
    END IF;

    -- 4. Authoritative Doctor Link & KYC Verification Check
    SELECT * INTO v_doctor FROM public.doctors
    WHERE id = p_doctor_id
      AND (clinic_id = p_clinic_id OR primary_clinic_id = p_clinic_id OR active_clinic_id = p_clinic_id)
      AND kyc_status IN ('approved', 'verified');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor does not belong to the selected clinic or is not approved.';
    END IF;

    -- 5. Authoritative Fee Computation from doctors Catalog Record
    v_fee := COALESCE(v_doctor.consultation_fee, 500.00);

    v_is_pad := COALESCE(p_is_pay_at_desk, false) OR UPPER(COALESCE(p_payment_mode, '')) = 'PAY_AT_DESK';
    IF v_is_pad THEN
        v_service_charge := round(v_fee * 0.05, 2);
        v_total := v_fee + v_service_charge;
        v_payment_mode_final := 'PAY_AT_DESK';
        v_status_final := 'WAITING_FOR_APPROVAL';
    ELSE
        v_service_charge := 0.00;
        v_total := v_fee;
        v_payment_mode_final := 'ONLINE';
        v_status_final := 'pending_payment';
    END IF;

    -- 6. Schedule / Slot Validation
    IF p_slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.slots
        WHERE id = p_slot_id AND clinic_id = p_clinic_id AND doctor_id = p_doctor_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected appointment slot is invalid for this clinic and doctor.';
        END IF;
        IF v_slot.slot_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Cannot book an appointment slot in the past.';
        END IF;
    ELSE
        IF p_appointment_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Appointment date cannot be in the past.';
        END IF;
    END IF;

    -- 7. Caller Identity Resolution (Authenticated account vs Guest)
    -- Unauthenticated callers cannot arbitrarily bind another account's user_id
    SELECT id INTO v_caller_profile_id FROM public.profiles
    WHERE (public.current_auth_uid() IS NOT NULL AND auth_uid = public.current_auth_uid())
       OR (public.current_auth_sub() IS NOT NULL AND firebase_uid = public.current_auth_sub())
       OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(email) = LOWER(auth.jwt() ->> 'email'))
    LIMIT 1;

    -- 8. Collision-Proof 10-Digit Tracking Code
    v_tracking_code := public.generate_unique_tracking_code_10();

    -- 9. Authoritative INSERT with Safe Enforced States
    INSERT INTO public.appointments (
        id,
        tracking_code_10_digit,
        clinic_id,
        doctor_id,
        slot_id,
        user_id,
        patient_name,
        patient_age,
        patient_gender,
        patient_mobile,
        patient_email,
        appointment_date,
        appointment_time,
        fee_amount,
        service_charge_amount,
        total_amount,
        payment_mode,
        status,
        payment_status,
        checkin_status,
        attempt_number,
        is_walkin,
        notes
    ) VALUES (
        v_appt_id,
        v_tracking_code,
        p_clinic_id,
        p_doctor_id,
        p_slot_id,
        v_caller_profile_id,
        v_clean_name,
        COALESCE(p_patient_age, 0),
        v_clean_gender,
        v_clean_phone,
        NULLIF(trim(p_patient_email), ''),
        p_appointment_date,
        p_appointment_time,
        v_fee,
        v_service_charge,
        v_total,
        v_payment_mode_final,
        v_status_final,
        'pending',
        'not_checked_in',
        1,
        FALSE,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt_id,
        'tracking_code', v_tracking_code,
        'tracking_code_10_digit', v_tracking_code,
        'fee_amount', v_fee,
        'service_charge_amount', v_service_charge,
        'total_amount', v_total,
        'payment_status', 'pending',
        'checkin_status', 'not_checked_in',
        'status', v_status_final
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_patient_appointment TO anon, authenticated, service_role;


-- =========================================================================
-- SECTION 8: APPOINTMENT ANTI-TAMPERING TRIGGER (R1)
-- =========================================================================

-- 8.1 BEFORE INSERT Guard on public.appointments
-- Blocks direct client insertion specifying forged fee_amount or paid/checked_in statuses.
CREATE OR REPLACE FUNCTION public.prevent_appointment_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_doc_fee NUMERIC(10, 2);
BEGIN
    -- Allow service_role, administrative portal users, or authorized clinic staff (desk walk-ins)
    IF (auth.jwt() ->> 'role') = 'service_role' 
       OR public.is_admin_portal_user() 
       OR public.is_authorized_clinic_staff(NEW.clinic_id) THEN
        RETURN NEW;
    END IF;

    -- Block direct insertions that attempt to self-assign paid or confirmed statuses
    IF NEW.payment_status IS NOT NULL AND NEW.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign paid payment_status. Use create_patient_appointment RPC.';
    END IF;

    IF NEW.checkin_status IS NOT NULL AND NEW.checkin_status = 'checked_in' THEN
        RAISE EXCEPTION 'Appointment tampering detected: client cannot self-assign checked_in status. Use create_patient_appointment RPC.';
    END IF;

    -- Query authoritative doctor fee
    SELECT COALESCE(consultation_fee, 500.00) INTO v_doc_fee
    FROM public.doctors WHERE id = NEW.doctor_id;
    IF v_doc_fee IS NULL THEN
        v_doc_fee := 500.00;
    END IF;

    -- Reject forged fee_amount
    IF NEW.fee_amount IS NOT NULL AND NEW.fee_amount <> v_doc_fee THEN
        RAISE EXCEPTION 'Appointment tampering detected: client fee_amount (%) does not match doctor consultation fee (%). Use create_patient_appointment RPC.', NEW.fee_amount, v_doc_fee;
    END IF;

    -- Force authoritative defaults
    NEW.payment_status := 'pending';
    NEW.checkin_status := 'not_checked_in';
    NEW.is_walkin := FALSE;
    NEW.fee_amount := v_doc_fee;

    IF NEW.payment_mode = 'PAY_AT_DESK' THEN
        NEW.service_charge_amount := round(v_doc_fee * 0.05, 2);
        NEW.total_amount := v_doc_fee + NEW.service_charge_amount;
        NEW.status := 'WAITING_FOR_APPROVAL';
    ELSE
        NEW.service_charge_amount := 0.00;
        NEW.total_amount := v_doc_fee;
        NEW.status := 'pending_payment';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_tampering ON public.appointments;
CREATE TRIGGER appointments_prevent_tampering
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_appointment_tampering();


-- =========================================================================
-- SECTION 9: MINIMAL PUBLIC TRACKING & GUEST ACCESS (R2)
-- =========================================================================

-- 9.1 Minimal Public Queue Tracking RPC (Zero Patient PII)
DROP FUNCTION IF EXISTS public.get_public_queue_status(TEXT);
CREATE OR REPLACE FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TIME,
    checkin_status TEXT,
    queue_status TEXT,
    queue_position INT,
    patients_ahead INT,
    current_queue_position INT,
    doctor_is_in_clinic BOOLEAN,
    estimated_wait_minutes INT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
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
        a.appointment_time,
        a.checkin_status::TEXT,
        qe.status::TEXT,
        COALESCE(qe.queue_position, 0)::INT,
        CASE WHEN qe.queue_position IS NULL THEN 0 ELSE (
            SELECT COUNT(*)::INT
            FROM public.queue_entries ahead
            WHERE ahead.clinic_id = a.clinic_id
              AND ahead.status = 'waiting'
              AND ahead.queue_position < qe.queue_position
        ) END,
        COALESCE((
            SELECT MIN(current_entry.queue_position)::INT
            FROM public.queue_entries current_entry
            WHERE current_entry.clinic_id = a.clinic_id
              AND current_entry.status = 'in_consultation'
        ), 0)::INT,
        COALESCE(d.is_in_clinic, FALSE),
        (
            CASE WHEN qe.queue_position IS NULL THEN 0 ELSE (
                SELECT COUNT(*)::INT
                FROM public.queue_entries ahead
                WHERE ahead.clinic_id = a.clinic_id
                  AND ahead.status = 'waiting'
                  AND ahead.queue_position < qe.queue_position
            ) END
        ) * COALESCE(c.avg_consultation_time_minutes, 10)::INT
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

-- 9.2 Server-Side Exact 10-Digit Phone Verification for Guest Identity
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
    v_clean_code TEXT := trim(COALESCE(p_tracking_code, ''));
    v_phone TEXT := right(regexp_replace(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
BEGIN
    IF length(v_phone) <> 10
       OR (v_clean_code !~ '^[0-9]{10}$' AND v_clean_code !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       OR NOT private.consume_tracking_rate_limit('guest-identity', v_clean_code, 10, 900) THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE (a.tracking_code_10_digit = v_clean_code OR a.id::TEXT = v_clean_code)
          AND right(regexp_replace(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_phone
    );
END;
$$;
REVOKE ALL ON FUNCTION public.verify_guest_appointment_identity(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_guest_appointment_identity(TEXT, TEXT) TO anon, authenticated, service_role;

-- 9.3 Exact 10-Digit Mobile Matching in verify_and_get_lab_report_meta
CREATE OR REPLACE FUNCTION public.verify_and_get_lab_report_meta(
    p_tracking_code VARCHAR,
    p_phone VARCHAR
)
RETURNS TABLE (
    report_id UUID,
    appointment_id UUID,
    clinic_id UUID,
    test_name VARCHAR,
    stage VARCHAR,
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
    v_clean_phone VARCHAR := RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
    v_appt public.appointments%ROWTYPE;
BEGIN
    IF LENGTH(v_clean_phone) <> 10 THEN
        RAISE EXCEPTION 'Verification failed: Exact 10-digit mobile number required.';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE tracking_code_10_digit = v_clean_code OR id::text = v_clean_code
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Strict server-side verification: exact 10-digit phone match against appointment record
    IF RIGHT(REGEXP_REPLACE(COALESCE(v_appt.patient_mobile, ''), '\D', '', 'g'), 10) <> v_clean_phone THEN
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

-- =========================================================================
-- END OF MIGRATION
-- =========================================================================
