-- =============================================================================
-- Migration: Multi-Gateway Column Setup & Public Payment Methods Sync
-- File: supabase/migration_setup_payment_methods.sql
-- =============================================================================

-- 1. Safely drop NOT NULL on legacy eSewa columns
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.clinic_payment_credentials ALTER COLUMN esewa_product_code DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.clinic_payment_credentials ALTER COLUMN esewa_secret_key DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- 2. Add all multi-gateway columns to clinic_payment_credentials
ALTER TABLE public.clinic_payment_credentials
    -- eSewa flags
    ADD COLUMN IF NOT EXISTS esewa_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS esewa_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS esewa_verified_at TIMESTAMPTZ,

    -- Khalti credentials
    ADD COLUMN IF NOT EXISTS khalti_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS khalti_public_key TEXT,
    ADD COLUMN IF NOT EXISTS khalti_secret_key TEXT,
    ADD COLUMN IF NOT EXISTS khalti_environment TEXT NOT NULL DEFAULT 'test',
    ADD COLUMN IF NOT EXISTS khalti_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS khalti_verified_at TIMESTAMPTZ,

    -- Fonepay credentials
    ADD COLUMN IF NOT EXISTS fonepay_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fonepay_merchant_code TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_secret_key TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_username TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_password TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_environment TEXT NOT NULL DEFAULT 'test',
    ADD COLUMN IF NOT EXISTS fonepay_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fonepay_verified_at TIMESTAMPTZ,

    -- ConnectIPS credentials
    ADD COLUMN IF NOT EXISTS connectips_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS connectips_merchant_id TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_id TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_name TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_password TEXT,
    ADD COLUMN IF NOT EXISTS connectips_private_key TEXT,
    ADD COLUMN IF NOT EXISTS connectips_environment TEXT NOT NULL DEFAULT 'test',
    ADD COLUMN IF NOT EXISTS connectips_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS connectips_verified_at TIMESTAMPTZ;

-- Backfill existing eSewa keys so clinics don't lose active status
UPDATE public.clinic_payment_credentials
SET
    esewa_enabled = true,
    esewa_is_verified = true,
    esewa_verified_at = COALESCE(verified_at, NOW())
WHERE COALESCE(is_verified, false) = true
  AND esewa_product_code IS NOT NULL AND trim(esewa_product_code) <> ''
  AND esewa_secret_key IS NOT NULL AND trim(esewa_secret_key) <> ''
  AND esewa_is_verified = false;

-- 3. Create platform_payment_settings if missing and seed default config
CREATE TABLE IF NOT EXISTS public.platform_payment_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    is_global_demo_mode BOOLEAN NOT NULL DEFAULT false,
    primary_gateway TEXT NOT NULL DEFAULT 'esewa',
    platform_gateways JSONB NOT NULL DEFAULT '{
        "primary_gateway": "esewa",
        "esewa": {"enabled": true, "environment": "test"},
        "khalti": {"enabled": false, "environment": "test"},
        "fonepay": {"enabled": false, "environment": "test"}
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT 'system'
);

INSERT INTO public.platform_payment_settings (id, is_global_demo_mode, primary_gateway, updated_at)
VALUES ('global_config', false, 'esewa', NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Install get_clinic_public_payment_methods
CREATE OR REPLACE FUNCTION public.get_clinic_public_payment_methods(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_direct BOOLEAN := false;
    v_cred public.clinic_payment_credentials%ROWTYPE;
    v_result JSONB := '[]'::jsonb;
    v_is_global_demo BOOLEAN := false;
    v_effective_env TEXT;
BEGIN
    -- Check global demo mode status
    BEGIN
        SELECT COALESCE(is_global_demo_mode, false)
        INTO v_is_global_demo
        FROM public.platform_payment_settings
        WHERE id = 'global_config';
    EXCEPTION WHEN OTHERS THEN
        v_is_global_demo := false;
    END;

    SELECT COALESCE(is_direct_payment_enabled, false)
    INTO v_is_direct
    FROM public.clinics
    WHERE id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Online gateways appear when direct payment is enabled & verified credentials exist
    IF v_is_direct THEN
        SELECT * INTO v_cred
        FROM public.clinic_payment_credentials
        WHERE clinic_id = p_clinic_id;

        IF FOUND THEN
            -- 1. eSewa
            IF COALESCE(v_cred.esewa_enabled, false) = true
               AND (COALESCE(v_cred.esewa_is_verified, false) = true OR v_is_global_demo OR COALESCE(v_cred.is_verified, false) = true)
               AND COALESCE(trim(v_cred.esewa_product_code), '') <> ''
               AND COALESCE(trim(v_cred.esewa_secret_key), '') <> '' THEN
                v_effective_env := CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.esewa_environment, 'live') END;
                v_result := v_result || jsonb_build_object(
                    'id', 'esewa',
                    'name', 'eSewa Mobile Wallet',
                    'subtitle', 'Instant eSewa Wallet & Bank Checkout',
                    'environment', v_effective_env,
                    'merchant_display_id', trim(v_cred.esewa_product_code),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 2. Khalti
            IF COALESCE(v_cred.khalti_enabled, false) = true
               AND (COALESCE(v_cred.khalti_is_verified, false) = true OR v_is_global_demo OR COALESCE(v_cred.is_verified, false) = true)
               AND COALESCE(trim(v_cred.khalti_secret_key), '') <> '' THEN
                v_effective_env := CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.khalti_environment, 'live') END;
                v_result := v_result || jsonb_build_object(
                    'id', 'khalti',
                    'name', 'Khalti Digital Wallet',
                    'subtitle', 'Khalti Wallet, Mobile Banking & SCT/Visa',
                    'environment', v_effective_env,
                    'merchant_display_id', COALESCE(NULLIF(trim(v_cred.khalti_public_key), ''), 'Verified Khalti Merchant'),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 3. Fonepay
            IF COALESCE(v_cred.fonepay_enabled, false) = true
               AND (COALESCE(v_cred.fonepay_is_verified, false) = true OR v_is_global_demo OR COALESCE(v_cred.is_verified, false) = true)
               AND COALESCE(trim(v_cred.fonepay_merchant_code), '') <> ''
               AND COALESCE(trim(v_cred.fonepay_secret_key), '') <> '' THEN
                v_effective_env := CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.fonepay_environment, 'live') END;
                v_result := v_result || jsonb_build_object(
                    'id', 'fonepay',
                    'name', 'Fonepay QR / Direct Banking',
                    'subtitle', 'Interbank Dynamic QR & 60+ Mobile Banking Apps',
                    'environment', v_effective_env,
                    'merchant_display_id', trim(v_cred.fonepay_merchant_code),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 4. ConnectIPS
            IF COALESCE(v_cred.connectips_enabled, false) = true
               AND (COALESCE(v_cred.connectips_is_verified, false) = true OR v_is_global_demo OR COALESCE(v_cred.is_verified, false) = true)
               AND COALESCE(trim(v_cred.connectips_merchant_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_password), '') <> ''
               AND COALESCE(trim(v_cred.connectips_private_key), '') <> '' THEN
                v_effective_env := CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.connectips_environment, 'live') END;
                v_result := v_result || jsonb_build_object(
                    'id', 'connectips',
                    'name', 'ConnectIPS National Payment Switch',
                    'subtitle', 'Direct Bank-to-Bank Realtime Transfer',
                    'environment', v_effective_env,
                    'merchant_display_id', trim(v_cred.connectips_merchant_id),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;
        END IF;
    END IF;

    -- Always include Pay at Desk
    v_result := v_result || jsonb_build_object(
        'id', 'pay_at_desk',
        'name', 'Pay at Desk (+5%)',
        'subtitle', 'Cash or Counter QR on Arrival (Includes 5% Service Charge)',
        'environment', 'desk',
        'merchant_display_id', 'Cash Counter',
        'is_verified', true,
        'requires_desk_approval', true
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_public_payment_methods(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_public_payment_methods(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
