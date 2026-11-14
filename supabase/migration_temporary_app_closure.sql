-- ==============================================================================
-- DACTOR PLATFORM — TEMPORARY APP CLOSURE / MAINTENANCE MODE MANAGEMENT
-- Migration: migration_temporary_app_closure.sql
-- Description:
--   Adds ability for Superadmin to temporarily close specific applications
--   ('patient_app', 'clinic_app', 'web_app') for maintenance, system upgrades,
--   or operational hold, while providing a clear closure notice to end users.
-- ==============================================================================

-- 1. Ensure app_versions table has closure & maintenance columns
ALTER TABLE public.app_versions
ADD COLUMN IF NOT EXISTS is_temporarily_closed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS closure_title VARCHAR(120) DEFAULT 'App Temporarily Closed',
ADD COLUMN IF NOT EXISTS closure_message TEXT DEFAULT 'This application is temporarily closed for scheduled maintenance. Please check back shortly.';

-- 2. Ensure web_app record exists in app_versions
INSERT INTO public.app_versions (
    app_name, 
    min_version_code, 
    latest_version_code, 
    latest_version_name, 
    update_url, 
    release_notes, 
    is_compulsory,
    is_temporarily_closed,
    closure_title,
    closure_message
) VALUES (
    'web_app',
    1,
    1,
    '1.0.0',
    'https://dactor.com',
    'Dactor Patient & Clinic Web Portal',
    false,
    false,
    'Service Temporarily Unavailable',
    'The web portal is currently undergoing scheduled maintenance. Please check back shortly.'
)
ON CONFLICT (app_name) DO UPDATE SET
    updated_at = NOW();

-- 3. Seed dual-layer fallback in medical_specialties (category = 'system_config')
INSERT INTO public.medical_specialties (name, category, description, search_keywords, is_active)
VALUES 
    ('system_config:patient_app_temporarily_closed', 'system_config', 'Patient App Temporary Closure Status', 'false', true),
    ('system_config:patient_app_closure_title', 'system_config', 'Patient App Temporary Closure Notice Title', 'App Temporarily Closed', true),
    ('system_config:patient_app_closure_message', 'system_config', 'Patient App Temporary Closure Notice Message', 'Dactor Patient App is temporarily closed for scheduled maintenance. Please check back shortly.', true),
    ('system_config:clinic_app_temporarily_closed', 'system_config', 'Clinic App Temporary Closure Status', 'false', true),
    ('system_config:clinic_app_closure_title', 'system_config', 'Clinic App Temporary Closure Notice Title', 'Clinic Portal Temporarily Closed', true),
    ('system_config:clinic_app_closure_message', 'system_config', 'Clinic App Temporary Closure Notice Message', 'Dactor Clinic & Doctor App is temporarily closed for scheduled maintenance. Please check back shortly.', true),
    ('system_config:web_app_temporarily_closed', 'system_config', 'Web App Temporary Closure Status', 'false', true),
    ('system_config:web_app_closure_title', 'system_config', 'Web App Temporary Closure Notice Title', 'Web Portal Temporarily Closed', true),
    ('system_config:web_app_closure_message', 'system_config', 'Web App Temporary Closure Notice Message', 'Dactor Web Portal is temporarily closed for scheduled maintenance. Please check back shortly.', true)
ON CONFLICT (name) DO UPDATE SET
    search_keywords = EXCLUDED.search_keywords,
    is_active = true;
