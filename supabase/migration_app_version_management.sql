-- ==============================================================================
-- DACTOR PLATFORM — APP VERSION & COMPULSORY IN-APP UPDATE MANAGEMENT
-- Migration: migration_app_version_management.sql
-- Description:
--   Establishes remote version control & compulsory update enforcement for
--   Dactor Patient App (and Clinic App). Allows administrators to define
--   minimum required version code, latest available version, and release notes.
-- ==============================================================================

-- 1. Create dedicated app_versions table
CREATE TABLE IF NOT EXISTS public.app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name VARCHAR(50) UNIQUE NOT NULL, -- 'patient_app', 'clinic_app'
    min_version_code INT NOT NULL DEFAULT 1,
    latest_version_code INT NOT NULL DEFAULT 1,
    latest_version_name VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    update_url TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.dactor.patient',
    release_notes TEXT DEFAULT 'A new version of Dactor is available. Please update to continue.',
    is_compulsory BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row-Level Security
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- 3. Public read policy for anon and authenticated users
DROP POLICY IF EXISTS "Public read access for app_versions" ON public.app_versions;
CREATE POLICY "Public read access for app_versions"
    ON public.app_versions FOR SELECT
    USING (true);

-- 4. Admin and Service Role write policy
DROP POLICY IF EXISTS "Service role write access for app_versions" ON public.app_versions;
CREATE POLICY "Service role write access for app_versions"
    ON public.app_versions FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role' 
        OR auth.role() = 'service_role'
        OR auth.jwt() ->> 'email' IN ('admin@dactor.com', 'officialdactor@gmail.com')
    );

-- 5. Seed initial version records
INSERT INTO public.app_versions (
    app_name, 
    min_version_code, 
    latest_version_code, 
    latest_version_name, 
    update_url, 
    release_notes, 
    is_compulsory
) VALUES (
    'patient_app',
    110,
    110,
    '1.0.10',
    'https://play.google.com/store/apps/details?id=com.dactor.patient',
    'Critical security enhancements, live OPD queue tracking stability, and doctor presence alerts.',
    true
), (
    'clinic_app',
    7,
    7,
    '1.0.61',
    'https://play.google.com/store/apps/details?id=com.dactor.clinic',
    'Reception walk-in slot selection, overload token support, and executive practitioner top bar.',
    true
)
ON CONFLICT (app_name) DO UPDATE SET
    min_version_code = EXCLUDED.min_version_code,
    latest_version_code = EXCLUDED.latest_version_code,
    latest_version_name = EXCLUDED.latest_version_name,
    update_url = EXCLUDED.update_url,
    release_notes = EXCLUDED.release_notes,
    is_compulsory = EXCLUDED.is_compulsory,
    updated_at = NOW();

-- 6. Dual-layer fallback in medical_specialties (category = 'system_config')
INSERT INTO public.medical_specialties (name, category, description, search_keywords, is_active)
VALUES 
    ('system_config:patient_app_min_version', 'system_config', 'Patient App Minimum Required Version Code', '110', true),
    ('system_config:patient_app_latest_version', 'system_config', 'Patient App Latest Version Code', '110', true),
    ('system_config:patient_app_version_name', 'system_config', 'Patient App Latest Version Name', '1.0.10', true),
    ('system_config:patient_app_update_url', 'system_config', 'Patient App Play Store / Download URL', 'https://play.google.com/store/apps/details?id=com.dactor.patient', true),
    ('system_config:patient_app_release_notes', 'system_config', 'Patient App Release Notes', 'Critical security enhancements, live OPD queue tracking stability, and doctor presence alerts.', true),
    ('system_config:patient_app_is_compulsory', 'system_config', 'Whether Patient App Update is Compulsory', 'true', true)
ON CONFLICT (name) DO UPDATE SET
    search_keywords = EXCLUDED.search_keywords,
    is_active = true;
