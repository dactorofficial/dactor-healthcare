-- =============================================================================
-- Migration: Fix get_clinic_public_payment_methods and Payment Credential RPCs
-- Date: 2026-11-13
-- Fixes: "record 'v_creds' has no field 'esewa_enabled'" runtime crash
-- =============================================================================

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
            -- 1. eSewa: requires esewa_enabled + esewa_is_verified + non-empty product_code & secret_key
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

            -- 2. Khalti: requires khalti_enabled + khalti_is_verified + non-empty secret_key
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

            -- 3. Fonepay: requires fonepay_enabled + fonepay_is_verified + non-empty merchant_code & secret_key
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

            -- 4. ConnectIPS: requires connectips_enabled + connectips_is_verified
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
