-- =============================================================================
-- DACTOR PLATFORM: Digital Payment Credential Verification & Dynamic Visibility
-- Adds verification tracking, provider audit fields, and secure public RPC
-- =============================================================================

-- 1. Add verification columns to clinic_payment_credentials
ALTER TABLE clinic_payment_credentials
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- 2. Mark existing official test credentials (EPAYTEST) as verified for staging/sandbox
UPDATE clinic_payment_credentials
SET is_verified = true, verified_at = NOW(), verification_notes = 'Pre-verified sandbox credentials (EPAYTEST)'
WHERE esewa_product_code = 'EPAYTEST' AND (is_verified IS NULL OR is_verified = false);

-- 3. Secure public function to get only actively verified payment methods for checkout
CREATE OR REPLACE FUNCTION public.get_clinic_public_payment_methods(p_clinic_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinic RECORD;
    v_cred RECORD;
    v_meta JSONB;
    v_config JSONB;
    v_result JSONB := '[]'::jsonb;
    v_is_direct BOOLEAN;
BEGIN
    SELECT is_direct_payment_enabled, description INTO v_clinic
    FROM clinics WHERE id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN '[]'::jsonb;
    END IF;

    v_is_direct := COALESCE(v_clinic.is_direct_payment_enabled, false);

    -- If direct payment is enabled, check verified credentials
    IF v_is_direct THEN
        SELECT is_verified, esewa_environment INTO v_cred
        FROM clinic_payment_credentials
        WHERE clinic_id = p_clinic_id;

        -- eSewa is only included if actively verified
        IF FOUND AND v_cred.is_verified = true THEN
            v_result := v_result || jsonb_build_object(
                'id', 'esewa',
                'name', 'eSewa Mobile Wallet',
                'environment', COALESCE(v_cred.esewa_environment, 'test'),
                'is_verified', true
            );
        END IF;

        -- Extract Khalti / Fonepay from clinic description if verified
        BEGIN
            v_meta := CASE
                WHEN v_clinic.description IS NOT NULL AND trim(v_clinic.description) LIKE '{%'
                THEN v_clinic.description::jsonb
                ELSE '{}'::jsonb
            END;
            v_config := CASE
                WHEN jsonb_typeof(v_meta -> 'payment_gateways_json') = 'string'
                THEN (v_meta ->> 'payment_gateways_json')::jsonb
                WHEN jsonb_typeof(v_meta -> 'payment_gateways_json') = 'object'
                THEN v_meta -> 'payment_gateways_json'
                ELSE '{}'::jsonb
            END;

            IF (v_config -> 'khalti' ->> 'enabled')::boolean = true AND (v_config -> 'khalti' ->> 'is_verified')::boolean = true THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'khalti',
                    'name', 'Khalti Digital Wallet',
                    'environment', COALESCE(v_config -> 'khalti' ->> 'environment', 'live'),
                    'is_verified', true
                );
            END IF;

            IF (v_config -> 'fonepay' ->> 'enabled')::boolean = true AND (v_config -> 'fonepay' ->> 'is_verified')::boolean = true THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'fonepay',
                    'name', 'FonePay Dynamic QR',
                    'environment', COALESCE(v_config -> 'fonepay' ->> 'environment', 'live'),
                    'is_verified', true
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- Always include Pay at Desk
    v_result := v_result || jsonb_build_object(
        'id', 'pay_at_desk',
        'name', 'Pay at Desk (+5%)',
        'is_verified', true,
        'requires_desk_approval', true
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_public_payment_methods(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_public_payment_methods(UUID) TO anon, authenticated, service_role;
