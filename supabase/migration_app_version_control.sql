-- =========================================================================
-- DACTOR — Master Remote Versioning & Compulsory Update Schema
-- =========================================================================

-- 1. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS & Public Read Policy
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read system_settings" ON public.system_settings;
CREATE POLICY "Public read system_settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin write system_settings" ON public.system_settings;
CREATE POLICY "Admin write system_settings" ON public.system_settings FOR ALL USING (true);

-- 2. Populate system_settings with default Clinic App versioning
INSERT INTO public.system_settings (key, value, description, updated_at)
VALUES
    ('clinic_app_min_version_code', '64', 'Minimum compulsory version code required for clinic app', NOW()),
    ('clinic_app_latest_version_code', '64', 'Latest released version code for clinic app', NOW()),
    ('clinic_app_latest_version_name', '1.0.64', 'Latest released version name for clinic app', NOW()),
    ('clinic_app_force_update', 'false', 'Enforce compulsory update for any client below latest version', NOW()),
    ('clinic_app_update_url', 'https://play.google.com/store/apps/details?id=com.dactor.clinic', 'Store destination for clinic app updates', NOW()),
    ('clinic_app_update_notes', 'Critical patient queue synchronization, appointment security, and performance enhancements.', NOW())
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 3. Populate medical_specialties (category = 'system_config') as resilient dual fallback
INSERT INTO public.medical_specialties (name, category, search_keywords, description, is_active, updated_at)
VALUES
    ('system_config:clinic_min_version_code', 'system_config', '64', 'Minimum compulsory version code required for clinic app', true, NOW()),
    ('system_config:clinic_latest_version_code', 'system_config', '64', 'Latest released version code for clinic app', true, NOW()),
    ('system_config:clinic_latest_version_name', 'system_config', '1.0.64', 'Latest released version name for clinic app', true, NOW()),
    ('system_config:clinic_force_update', 'system_config', 'false', 'Enforce compulsory update for any client below latest version', true, NOW()),
    ('system_config:clinic_update_url', 'system_config', 'https://play.google.com/store/apps/details?id=com.dactor.clinic', 'Store destination for clinic app updates', true, NOW()),
    ('system_config:clinic_update_notes', 'system_config', 'Critical patient queue synchronization, appointment security, and performance enhancements.', 'Release notes shown on mandatory update dialog', true, NOW())
ON CONFLICT (name) DO UPDATE SET
    search_keywords = EXCLUDED.search_keywords,
    description = EXCLUDED.description,
    updated_at = NOW();
