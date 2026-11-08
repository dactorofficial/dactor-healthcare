-- =============================================================================
-- DACTOR PLATFORM: Super Admin Payment Gateway Management & Global Demo Mode
-- 1. Sets rajanpurbey55@gmail.com as authorized Super Admin.
-- 2. Creates public.platform_payment_settings for global payment config & demo mode.
-- 3. Updates get_clinic_public_payment_methods to force demo mode when activated.
-- 4. Updates get_clinic_gateway_setup_status with global demo mode status.
-- =============================================================================

-- 1. Ensure rajanpurbey55@gmail.com exists in public.profiles as super_admin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = 'rajanpurbey55@gmail.com') THEN
        UPDATE public.profiles
        SET role = 'super_admin',
            updated_at = NOW()
        WHERE LOWER(email) = 'rajanpurbey55@gmail.com';
    ELSE
        INSERT INTO public.profiles (
            id,
            email,
            role,
            full_name,
            phone,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            'rajanpurbey55@gmail.com',
            'super_admin',
            'Super Administrator',
            '+9779800000000',
            NOW(),
            NOW()
        );
    END IF;
END $$;

-- 2. Update is_admin_portal_user() to explicitly recognize rajanpurbey55@gmail.com
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
      OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'rajanpurbey55@gmail.com'
      OR LOWER(COALESCE(auth.jwt() ->> 'preferred_username', '')) = 'rajanpurbey55@gmail.com'
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE public.profiles.auth_uid = auth.uid()
            AND (
              public.profiles.role = 'super_admin'
              OR LOWER(public.profiles.email) = 'rajanpurbey55@gmail.com'
            )
        )
      )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_portal_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;

-- 3. Create platform_payment_settings table
CREATE TABLE IF NOT EXISTS public.platform_payment_settings (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    is_global_demo_mode BOOLEAN NOT NULL DEFAULT false,
    primary_gateway TEXT NOT NULL DEFAULT 'esewa',
    platform_gateways JSONB NOT NULL DEFAULT '{
        "primary_gateway": "esewa",
        "esewa": {
            "enabled": true,
            "provider_name": "eSewa Mobile Wallet",
            "environment": "test",
            "merchant_id": "EPAYTEST",
            "public_key": "",
            "secret_key": "8gBm/:&EnhH.1/q",
            "account_number": "",
            "callback_url": "https://dactor.np/payment/esewa/callback"
        },
        "khalti": {
            "enabled": false,
            "provider_name": "Khalti Digital Wallet",
            "environment": "test",
            "merchant_id": "",
            "public_key": "",
            "secret_key": "",
            "account_number": "",
            "callback_url": "https://dactor.np/payment/khalti/callback"
        },
        "fonepay": {
            "enabled": false,
            "provider_name": "Fonepay Dynamic QR",
            "environment": "test",
            "merchant_id": "",
            "public_key": "",
            "secret_key": "",
            "account_number": "",
            "callback_url": "https://dactor.np/payment/fonepay/callback"
        },
        "connectips": {
            "enabled": false,
            "provider_name": "ConnectIPS Direct Bank",
            "environment": "test",
            "merchant_id": "",
            "public_key": "",
            "secret_key": "",
            "account_number": "",
            "callback_url": "https://dactor.np/payment/connectips/callback"
        },
        "custom": {
            "enabled": false,
            "provider_name": "Custom Bank / Merchant API",
            "environment": "test",
            "merchant_id": "",
            "public_key": "",
            "secret_key": "",
            "account_number": "",
            "callback_url": ""
        }
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT 'system'
);

-- Seed initial row if missing
INSERT INTO public.platform_payment_settings (id, is_global_demo_mode, primary_gateway, updated_at)
VALUES ('global_config', false, 'esewa', NOW())
ON CONFLICT (id) DO NOTHING;

-- Row Level Security
ALTER TABLE public.platform_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select platform_payment_settings" ON public.platform_payment_settings;
CREATE POLICY "Allow select platform_payment_settings" ON public.platform_payment_settings
    FOR SELECT TO anon, authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS "Allow super_admin modify platform_payment_settings" ON public.platform_payment_settings;
CREATE POLICY "Allow super_admin modify platform_payment_settings" ON public.platform_payment_settings
    FOR ALL TO authenticated, service_role
    USING (public.is_admin_portal_user())
    WITH CHECK (public.is_admin_portal_user());

-- 4. Update get_clinic_public_payment_methods to enforce Global Demo Mode
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
    SELECT COALESCE(is_global_demo_mode, false)
    INTO v_is_global_demo
    FROM public.platform_payment_settings
    WHERE id = 'global_config';

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
            IF v_cred.esewa_enabled = true
               AND v_cred.esewa_is_verified = true
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
            IF v_cred.khalti_enabled = true
               AND v_cred.khalti_is_verified = true
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
            IF v_cred.fonepay_enabled = true
               AND v_cred.fonepay_is_verified = true
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
            IF v_cred.connectips_enabled = true
               AND v_cred.connectips_is_verified = true
               AND COALESCE(trim(v_cred.connectips_merchant_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_password), '') <> ''
               AND COALESCE(trim(v_cred.connectips_private_key), '') <> '' THEN
                v_effective_env := CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.connectips_environment, 'live') END;
                v_result := v_result || jsonb_build_object(
                    'id', 'connectips',
                    'name', 'ConnectIPS Direct Bank',
                    'subtitle', 'NCHL Direct Bank Account Transfer',
                    'environment', v_effective_env,
                    'merchant_display_id', trim(v_cred.connectips_app_id),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;
        END IF;
    END IF;

    -- 5. Pay at Desk (always available)
    v_result := v_result || jsonb_build_object(
        'id', 'pay_at_desk',
        'name', 'Pay at Desk (+5%)',
        'subtitle', 'Pay cash/QR at clinic counter (+5% service charge)',
        'is_verified', true,
        'requires_keys', false,
        'requires_desk_approval', true
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_public_payment_methods(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_public_payment_methods(UUID) TO anon, authenticated, service_role;

-- 5. Update get_clinic_gateway_setup_status to include global demo status
CREATE OR REPLACE FUNCTION public.get_clinic_gateway_setup_status(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cred public.clinic_payment_credentials%ROWTYPE;
    v_is_direct BOOLEAN := false;
    v_is_global_demo BOOLEAN := false;
BEGIN
    IF NOT (public.is_authorized_clinic_staff(p_clinic_id) OR public.is_admin_portal_user()) THEN
        RAISE EXCEPTION 'Unauthorized: Only clinic owner/staff or platform admin can view gateway setup status';
    END IF;

    SELECT COALESCE(is_global_demo_mode, false)
    INTO v_is_global_demo
    FROM public.platform_payment_settings
    WHERE id = 'global_config';

    SELECT COALESCE(is_direct_payment_enabled, false)
    INTO v_is_direct
    FROM public.clinics
    WHERE id = p_clinic_id;

    SELECT * INTO v_cred
    FROM public.clinic_payment_credentials
    WHERE clinic_id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_direct_payment_enabled', v_is_direct,
            'is_global_demo_mode', v_is_global_demo,
            'esewa', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE 'test' END, 'merchant_id', '', 'has_secret_key', false),
            'khalti', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE 'test' END, 'public_key', '', 'has_secret_key', false),
            'fonepay', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE 'test' END, 'merchant_code', '', 'username', '', 'has_secret_key', false, 'has_password', false),
            'connectips', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE 'test' END, 'merchant_id', '', 'app_id', '', 'app_name', '', 'has_app_password', false, 'has_private_key', false)
        );
    END IF;

    RETURN jsonb_build_object(
        'is_direct_payment_enabled', v_is_direct,
        'is_global_demo_mode', v_is_global_demo,
        'esewa', jsonb_build_object(
            'enabled', v_cred.esewa_enabled,
            'is_verified', v_cred.esewa_is_verified,
            'verified_at', v_cred.esewa_verified_at,
            'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.esewa_environment, 'test') END,
            'merchant_id', COALESCE(v_cred.esewa_product_code, ''),
            'has_secret_key', COALESCE(trim(v_cred.esewa_secret_key), '') <> ''
        ),
        'khalti', jsonb_build_object(
            'enabled', v_cred.khalti_enabled,
            'is_verified', v_cred.khalti_is_verified,
            'verified_at', v_cred.khalti_verified_at,
            'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.khalti_environment, 'test') END,
            'public_key', COALESCE(v_cred.khalti_public_key, ''),
            'has_secret_key', COALESCE(trim(v_cred.khalti_secret_key), '') <> ''
        ),
        'fonepay', jsonb_build_object(
            'enabled', v_cred.fonepay_enabled,
            'is_verified', v_cred.fonepay_is_verified,
            'verified_at', v_cred.fonepay_verified_at,
            'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.fonepay_environment, 'test') END,
            'merchant_code', COALESCE(v_cred.fonepay_merchant_code, ''),
            'username', COALESCE(v_cred.fonepay_username, ''),
            'has_secret_key', COALESCE(trim(v_cred.fonepay_secret_key), '') <> '',
            'has_password', COALESCE(trim(v_cred.fonepay_password), '') <> ''
        ),
        'connectips', jsonb_build_object(
            'enabled', v_cred.connectips_enabled,
            'is_verified', v_cred.connectips_is_verified,
            'verified_at', v_cred.connectips_verified_at,
            'environment', CASE WHEN v_is_global_demo THEN 'test' ELSE COALESCE(v_cred.connectips_environment, 'test') END,
            'merchant_id', COALESCE(v_cred.connectips_merchant_id, ''),
            'app_id', COALESCE(v_cred.connectips_app_id, ''),
            'app_name', COALESCE(v_cred.connectips_app_name, ''),
            'has_app_password', COALESCE(trim(v_cred.connectips_app_password), '') <> '',
            'has_private_key', COALESCE(trim(v_cred.connectips_private_key), '') <> ''
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_gateway_setup_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_gateway_setup_status(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
