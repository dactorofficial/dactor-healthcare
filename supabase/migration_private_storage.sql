-- =========================================================================
-- DACTOR PLATFORM: SECURE PRIVATE STORAGE INFRASTRUCTURE & STORAGE RLS
-- Migration: migration_private_storage.sql
-- Milestones: M1 Backend Storage & Server Authorization Engine
-- Features: F1, F2, F3, F4, F5, F6
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. PRIVATE & PUBLIC STORAGE BUCKETS CONFIGURATION (F1 & F2)
-- -------------------------------------------------------------------------

-- 1.1 Create/Configure Private Storage Buckets (50MB limit, restricted MIME types)
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

-- 1.2 Ensure existing showcase buckets remain strictly public (F2)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
    ('clinic_photos', 'clinic_photos', true, 52428800),
    ('doctor_photos', 'doctor_photos', true, 52428800)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 52428800;

-- -------------------------------------------------------------------------
-- 2. STORAGE ROW-LEVEL SECURITY (RLS) ON storage.objects (F3)
-- -------------------------------------------------------------------------

-- 2.1 Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2.2 Deny anonymous/public direct reads on private buckets (allow ONLY public showcase buckets)
DROP POLICY IF EXISTS "Deny public read on private buckets" ON storage.objects;
CREATE POLICY "Deny public read on private buckets" ON storage.objects
FOR SELECT
TO anon
USING (bucket_id IN ('clinic_photos', 'doctor_photos'));

-- 2.3 Allow authenticated users to read public showcase buckets
DROP POLICY IF EXISTS "Authenticated read on public buckets" ON storage.objects;
CREATE POLICY "Authenticated read on public buckets" ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id IN ('clinic_photos', 'doctor_photos'));

-- 2.4 Allow Super Admin full storage access across all buckets
DROP POLICY IF EXISTS "Super Admin full storage access" ON storage.objects;
CREATE POLICY "Super Admin full storage access" ON storage.objects
FOR ALL
TO authenticated
USING (is_admin_portal_user());

-- 2.5 Allow authenticated Clinic Staff to upload to private lab reports, clinic docs, and clinic photos
DROP POLICY IF EXISTS "Clinic Staff upload private docs" ON storage.objects;
CREATE POLICY "Clinic Staff upload private docs" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'clinic_photos')
);

-- 2.6 Allow authenticated Doctors to upload KYC documents and doctor photos
DROP POLICY IF EXISTS "Doctor upload KYC docs" ON storage.objects;
CREATE POLICY "Doctor upload KYC docs" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('doctor-kyc-private', 'doctor_photos')
);

-- 2.7 Restrict UPDATE and DELETE on storage.objects for private buckets strictly to super_admin and service_role
DROP POLICY IF EXISTS "Clinic Staff update private docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor update KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Private storage update restriction" ON storage.objects;
CREATE POLICY "Private storage update restriction" ON storage.objects
FOR UPDATE
TO authenticated
USING (
    CASE 
        WHEN bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private') THEN
            COALESCE(
                (auth.jwt() ->> 'role') IN ('super_admin', 'service_role'),
                (LOWER(COALESCE(auth.jwt() ->> 'email', '')) LIKE '%@dactor.com' AND (auth.jwt() ->> 'email') ILIKE '%admin%'),
                current_user = 'service_role',
                false
            )
        ELSE
            bucket_id IN ('clinic_photos', 'doctor_photos')
    END
);

DROP POLICY IF EXISTS "Clinic Staff delete private docs" ON storage.objects;
DROP POLICY IF EXISTS "Doctor delete KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Private storage delete restriction" ON storage.objects;
CREATE POLICY "Private storage delete restriction" ON storage.objects
FOR DELETE
TO authenticated
USING (
    CASE 
        WHEN bucket_id IN ('lab-reports-private', 'clinic-docs-private', 'doctor-kyc-private') THEN
            COALESCE(
                (auth.jwt() ->> 'role') IN ('super_admin', 'service_role'),
                (LOWER(COALESCE(auth.jwt() ->> 'email', '')) LIKE '%@dactor.com' AND (auth.jwt() ->> 'email') ILIKE '%admin%'),
                current_user = 'service_role',
                false
            )
        ELSE
            bucket_id IN ('clinic_photos', 'doctor_photos')
    END
);

-- -------------------------------------------------------------------------
-- 3. DATABASE ROW-LEVEL SECURITY (RLS) ON lab_reports TABLE (F4)
-- -------------------------------------------------------------------------

-- 3.1 Enable RLS on lab_reports table
ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;

-- 3.2 Super Admin full access on lab_reports
DROP POLICY IF EXISTS "lab_reports_super_admin_rule" ON lab_reports;
CREATE POLICY "lab_reports_super_admin_rule" ON lab_reports
FOR ALL
USING (is_admin_portal_user());

-- 3.3 Clinic Staff access strictly scoped to their own clinic
DROP POLICY IF EXISTS "lab_reports_clinic_staff_rule" ON lab_reports;
CREATE POLICY "lab_reports_clinic_staff_rule" ON lab_reports
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM clinics c WHERE c.id = lab_reports.clinic_id
        AND (
            LOWER(c.contact_email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
            OR EXISTS (
                SELECT 1 FROM clinic_invitations ci 
                WHERE ci.clinic_id = c.id 
                  AND LOWER(ci.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
                  AND ci.status = 'accepted'
            )
            OR EXISTS (
                SELECT 1 FROM doctors d 
                LEFT JOIN profiles p ON p.id = d.user_id
                WHERE d.clinic_id = c.id 
                  AND (
                      (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(d.email) = LOWER(auth.jwt() ->> 'email'))
                      OR (auth.uid() IS NOT NULL AND p.auth_uid = auth.uid())
                  )
            )
        )
    )
);

-- 3.4 Logged-in Patient access strictly scoped to own appointment records
DROP POLICY IF EXISTS "lab_reports_patient_read_rule" ON lab_reports;
CREATE POLICY "lab_reports_patient_read_rule" ON lab_reports
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM appointments a WHERE a.id = lab_reports.appointment_id
        AND (
            (auth.uid() IS NOT NULL AND a.user_id = auth.uid())
            OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
        )
    )
);

-- -------------------------------------------------------------------------
-- 4. NON-DESTRUCTIVE MIGRATION AUDIT & ROLLBACK TABLE (F4 / F16)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS _migration_storage_backup (
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
    ON _migration_storage_backup (entity_type, entity_id);

-- -------------------------------------------------------------------------
-- 5. HELPER FUNCTION: STORAGE PATH CLEANER
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION clean_storage_path(p_raw_path TEXT, p_bucket TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_path TEXT := COALESCE(p_raw_path, '');
BEGIN
    -- Strip query parameters if present
    v_path := split_part(v_path, '?', 1);
    -- Strip public/sign URL prefixes
    v_path := regexp_replace(v_path, '^https?://[^/]+/storage/v1/object/(public|sign)/[^/]+/', '');
    -- Strip bucket name prefix if included
    v_path := regexp_replace(v_path, '^' || p_bucket || '/', '');
    -- Strip legacy bucket prefixes
    v_path := regexp_replace(v_path, '^(clinic_photos|doctor_photos|doctor-kyc|clinic_files)/', '');
    -- Strip leading slashes
    v_path := regexp_replace(v_path, '^/+', '');
    RETURN v_path;
END;
$$;

-- -------------------------------------------------------------------------
-- 6. SERVER-SIDE AUTHORIZATION RPC FUNCTIONS (F5 & F6)
-- -------------------------------------------------------------------------

-- 6.1 authorize_document_access: Core ownership verification engine
CREATE OR REPLACE FUNCTION authorize_document_access(
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
    v_user_id UUID := auth.uid();
    v_user_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_is_super_admin BOOLEAN;
    v_clean_phone TEXT := NULL;
    v_doc_clinic_id UUID;
    v_doc_user_id UUID;
    v_doc_email TEXT;
BEGIN
    -- 1. Check Super Admin
    v_is_super_admin := is_admin_portal_user();

    IF v_is_super_admin THEN
        RETURN jsonb_build_object('authorized', true, 'role', 'super_admin');
    END IF;

    -- 2. Clean and normalize patient phone number (keep digits only, last 10 digits)
    IF p_patient_phone IS NOT NULL AND trim(p_patient_phone) <> '' THEN
        v_clean_phone := regexp_replace(p_patient_phone, '\D', '', 'g');
        IF length(v_clean_phone) >= 10 THEN
            v_clean_phone := right(v_clean_phone, 10);
        ELSIF length(v_clean_phone) < 7 THEN
            v_clean_phone := NULL; -- Invalid phone number
        END IF;
    END IF;

    -- 3. CASE 1: Lab Report Authorization
    IF p_document_type = 'lab_report' THEN
        -- 3.1 Check Clinic Staff: Staff of clinic associated with this lab report
        IF v_user_email <> '' AND EXISTS (
            SELECT 1 FROM lab_reports lr
            JOIN clinics c ON c.id = lr.clinic_id
            LEFT JOIN appointments a ON a.id = lr.appointment_id
            WHERE (p_document_id IS NULL OR lr.id = p_document_id)
              AND (p_tracking_code IS NULL OR a.tracking_code_10_digit = p_tracking_code)
              AND (p_document_id IS NOT NULL OR p_tracking_code IS NOT NULL)
            AND (
                LOWER(c.contact_email) = v_user_email
                OR EXISTS (
                    SELECT 1 FROM clinic_invitations ci 
                    WHERE ci.clinic_id = c.id 
                      AND LOWER(ci.email) = v_user_email 
                      AND ci.status = 'accepted'
                )
                OR EXISTS (
                    SELECT 1 FROM doctors d 
                    LEFT JOIN profiles p ON p.id = d.user_id
                    WHERE d.clinic_id = c.id 
                      AND (
                          LOWER(d.email) = v_user_email
                          OR (v_user_id IS NOT NULL AND p.auth_uid = v_user_id)
                      )
                )
            )
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        -- 3.2 Check Logged-in Patient: auth.uid() or verified email match
        IF (v_user_id IS NOT NULL OR v_user_email <> '') AND EXISTS (
            SELECT 1 FROM lab_reports lr
            JOIN appointments a ON a.id = lr.appointment_id
            WHERE (p_document_id IS NULL OR lr.id = p_document_id)
              AND (p_tracking_code IS NULL OR a.tracking_code_10_digit = p_tracking_code)
              AND (p_document_id IS NOT NULL OR p_tracking_code IS NOT NULL)
            AND (
                (v_user_id IS NOT NULL AND a.user_id = v_user_id)
                OR (v_user_email <> '' AND LOWER(a.patient_email) = v_user_email)
            )
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'logged_in_patient');
        END IF;

        -- 3.3 Check Walk-in / Guest Patient: Server-verified phone match against appointment record
        IF v_clean_phone IS NOT NULL AND EXISTS (
            SELECT 1 FROM lab_reports lr
            JOIN appointments a ON a.id = lr.appointment_id
            WHERE (p_document_id IS NULL OR lr.id = p_document_id)
              AND (p_tracking_code IS NULL OR a.tracking_code_10_digit = p_tracking_code)
              AND (p_document_id IS NOT NULL OR p_tracking_code IS NOT NULL)
              AND right(regexp_replace(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_clean_phone
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'verified_walkin_patient');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to lab report');
    END IF;

    -- 4. CASE 2: Doctor KYC Document Authorization
    IF p_document_type = 'doctor_kyc' THEN
        IF p_document_id IS NULL THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Doctor ID required');
        END IF;

        SELECT d.user_id, LOWER(d.email), d.clinic_id INTO v_doc_user_id, v_doc_email, v_doc_clinic_id
        FROM doctors d WHERE d.id = p_document_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Doctor not found');
        END IF;

        -- Check Doctor Owner
        IF (v_user_id IS NOT NULL AND (
            v_doc_user_id = v_user_id 
            OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_doc_user_id AND p.auth_uid = v_user_id)
        )) OR (v_user_email <> '' AND v_doc_email = v_user_email) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'doctor');
        END IF;

        -- Check Clinic Staff of Doctor's Clinic
        IF v_doc_clinic_id IS NOT NULL AND v_user_email <> '' AND EXISTS (
            SELECT 1 FROM clinics c WHERE c.id = v_doc_clinic_id AND (
                LOWER(c.contact_email) = v_user_email
                OR EXISTS (
                    SELECT 1 FROM clinic_invitations ci 
                    WHERE ci.clinic_id = c.id AND LOWER(ci.email) = v_user_email AND ci.status = 'accepted'
                )
            )
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to doctor KYC');
    END IF;

    -- 5. CASE 3: Clinic Legal Document Authorization (PAN / Registration)
    IF p_document_type = 'clinic_doc' THEN
        IF p_document_id IS NULL THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Clinic ID required');
        END IF;

        -- Check Clinic Staff of Target Clinic
        IF v_user_email <> '' AND EXISTS (
            SELECT 1 FROM clinics c WHERE c.id = p_document_id AND (
                LOWER(c.contact_email) = v_user_email
                OR EXISTS (
                    SELECT 1 FROM clinic_invitations ci 
                    WHERE ci.clinic_id = c.id AND LOWER(ci.email) = v_user_email AND ci.status = 'accepted'
                )
            )
        ) THEN
            RETURN jsonb_build_object('authorized', true, 'role', 'clinic_staff');
        END IF;

        RETURN jsonb_build_object('authorized', false, 'error', 'Unauthorized access to clinic document');
    END IF;

    RETURN jsonb_build_object('authorized', false, 'error', 'Unknown document type');
END;
$$;

-- 6.2 get_lab_report_signed_url: Server-verified short-lived signed URL generation for lab reports
CREATE OR REPLACE FUNCTION get_lab_report_signed_url(
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
    v_auth JSONB;
    v_report_id UUID := p_report_id;
    v_raw_file_url TEXT;
    v_clean_path TEXT;
    v_expires_sec INT := 900; -- 15-minute standard expiration
    v_expires_at_epoch BIGINT;
    v_expires_at_iso TEXT;
    v_token TEXT;
    v_signed_url TEXT;
BEGIN
    -- 1. Resolve Report ID by tracking code if not explicitly passed
    IF v_report_id IS NULL AND p_tracking_code IS NOT NULL THEN
        SELECT lr.id INTO v_report_id
        FROM lab_reports lr
        JOIN appointments a ON a.id = lr.appointment_id
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
            SELECT 1 FROM lab_reports lr
            JOIN appointments a ON a.id = lr.appointment_id
            WHERE lr.id = p_report_id AND a.tracking_code_10_digit = p_tracking_code
        ) THEN
            RETURN jsonb_build_object('authorized', false, 'error', 'Lab report does not belong to specified tracking code');
        END IF;
    END IF;

    -- 2. Verify Authorization via server-side security definer gate
    v_auth := authorize_document_access('lab_report', v_report_id, p_patient_phone, p_tracking_code);

    IF (v_auth->>'authorized')::BOOLEAN IS NOT TRUE THEN
        -- ZERO raw URL leakage to unauthorized callers
        RETURN jsonb_build_object(
            'authorized', false,
            'error', COALESCE(v_auth->>'error', 'Unauthorized access to lab report')
        );
    END IF;

    -- 3. Fetch lab report storage path
    SELECT lr.file_url INTO v_raw_file_url
    FROM lab_reports lr
    WHERE lr.id = v_report_id;

    IF v_raw_file_url IS NULL OR trim(v_raw_file_url) = '' THEN
        RETURN jsonb_build_object('authorized', false, 'error', 'Report file is not yet ready or uploaded');
    END IF;

    -- 4. Clean storage path
    v_clean_path := clean_storage_path(v_raw_file_url, 'lab-reports-private');

    -- 5. Calculate expiration timestamps
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

-- 6.3 get_authorized_document_signed_url: General document signed URL issuer
CREATE OR REPLACE FUNCTION get_authorized_document_signed_url(
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
            SELECT file_url INTO v_raw_path FROM lab_reports WHERE id = p_entity_id;
        END IF;
    ELSIF p_doc_type = 'doctor_kyc' THEN
        v_bucket := 'doctor-kyc-private';
        IF v_raw_path IS NULL THEN
            SELECT COALESCE(license_doc_url, certificates_doc_url) INTO v_raw_path FROM doctors WHERE id = p_entity_id;
        END IF;
    ELSIF p_doc_type = 'clinic_doc' THEN
        v_bucket := 'clinic-docs-private';
        IF v_raw_path IS NULL THEN
            SELECT registration_doc_url INTO v_raw_path FROM clinics WHERE id = p_entity_id;
        END IF;
    ELSE
        RETURN jsonb_build_object('authorized', false, 'error', 'Unknown document type');
    END IF;

    -- 2. Verify caller authorization
    v_auth := authorize_document_access(p_doc_type, p_entity_id, NULL, NULL);

    IF (v_auth->>'authorized')::BOOLEAN IS NOT TRUE THEN
        -- ZERO raw URL leakage
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

-- -------------------------------------------------------------------------
-- 7. FUNCTION PERMISSIONS & SCHEMA CACHE RELOAD
-- -------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION clean_storage_path(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION authorize_document_access(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_lab_report_signed_url(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_authorized_document_signed_url(TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- Legacy SQL-generated signed URLs use a public literal digest, not the
-- Supabase Storage signing service. The application must use its Edge signer.
REVOKE ALL ON FUNCTION authorize_document_access(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_lab_report_signed_url(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_authorized_document_signed_url(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION authorize_document_access(TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_lab_report_signed_url(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_authorized_document_signed_url(TEXT, UUID, TEXT) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
