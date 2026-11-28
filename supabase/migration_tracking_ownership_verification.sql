-- ============================================================================
-- Migration: Tracking Code Ownership Verification & Claim Hardening
-- ============================================================================
-- Enforces:
--   1. Logged-in Gmail match (case-insensitive) for bill download, follow-up,
--      reschedule, and record claiming.
--   2. Strict block if tracking code already belongs to a different Gmail.
--   3. Rate-limited 10-digit mobile verification for guest mode or unclaimed
--      (blank patient_email) walk-in bookings.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_appointment_ownership(
    p_tracking_code TEXT,
    p_email TEXT DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL,
    p_allow_blank_email_phone_fallback BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_code TEXT := UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_tracking_code, '')), '[^a-zA-Z0-9-]', '', 'g'));
    v_email TEXT := LOWER(TRIM(COALESCE(NULLIF(TRIM(p_email), ''), NULLIF(TRIM(auth.jwt() ->> 'email'), ''), '')));
    v_phone TEXT := RIGHT(REGEXP_REPLACE(COALESCE(p_patient_phone, ''), '\D', '', 'g'), 10);
    v_found_count INT := 0;
    v_has_matching_email BOOLEAN := FALSE;
    v_has_other_email BOOLEAN := FALSE;
    v_has_matching_phone BOOLEAN := FALSE;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'invalid_code',
            'message', 'Tracking code is required.'
        );
    END IF;

    SELECT
        COUNT(*),
        BOOL_OR(LOWER(TRIM(COALESCE(a.patient_email, ''))) = v_email AND v_email <> ''),
        BOOL_OR(TRIM(COALESCE(a.patient_email, '')) <> '' AND LOWER(TRIM(a.patient_email)) <> v_email),
        BOOL_OR(
            LENGTH(v_phone) = 10
            AND RIGHT(REGEXP_REPLACE(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) = v_phone
        )
    INTO
        v_found_count,
        v_has_matching_email,
        v_has_other_email,
        v_has_matching_phone
    FROM public.appointments a
    WHERE UPPER(COALESCE(a.tracking_code_10_digit, '')) = v_code
       OR a.id::TEXT = TRIM(COALESCE(p_tracking_code, ''));

    IF v_found_count = 0 THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'not_found',
            'message', 'No appointment found for this tracking code.'
        );
    END IF;

    -- Case 1: Caller has an active Gmail / email
    IF v_email <> '' THEN
        IF v_has_matching_email THEN
            RETURN jsonb_build_object(
                'allowed', TRUE,
                'mode', 'gmail',
                'reason', 'gmail_matched'
            );
        END IF;

        IF v_has_other_email THEN
            RETURN jsonb_build_object(
                'allowed', FALSE,
                'mode', 'gmail',
                'reason', 'gmail_mismatch',
                'message', 'This tracking code belongs to another Gmail account.'
            );
        END IF;

        -- All appointments for this tracking code have blank patient_email (e.g. clinic walk-in)
        IF NOT p_allow_blank_email_phone_fallback THEN
            RETURN jsonb_build_object(
                'allowed', FALSE,
                'mode', 'gmail',
                'reason', 'gmail_mismatch',
                'message', 'This tracking code is not linked to your Gmail account.'
            );
        END IF;

        IF LENGTH(v_phone) <> 10 THEN
            RETURN jsonb_build_object(
                'allowed', FALSE,
                'mode', 'phone_fallback',
                'reason', 'requires_phone',
                'message', 'Please enter the 10-digit mobile number associated with this booking.'
            );
        END IF;
    ELSE
        -- Case 2: Guest caller (no Gmail) -> must verify 10-digit mobile number
        IF LENGTH(v_phone) <> 10 THEN
            RETURN jsonb_build_object(
                'allowed', FALSE,
                'mode', 'guest_phone',
                'reason', 'requires_phone',
                'message', 'Please enter the 10-digit mobile number associated with this tracking code.'
            );
        END IF;
    END IF;

    -- Rate-limit phone verification attempts (5 tries per 15 minutes per tracking code)
    IF NOT private.consume_tracking_rate_limit('ownership-phone', v_code, 5, 900) THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'mode', 'guest_phone',
            'reason', 'rate_limited',
            'message', 'Too many failed verification attempts. Please wait 15 minutes.'
        );
    END IF;

    IF v_has_matching_phone THEN
        RETURN jsonb_build_object(
            'allowed', TRUE,
            'mode', 'guest_phone',
            'reason', 'phone_matched'
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', FALSE,
        'mode', 'guest_phone',
        'reason', 'phone_mismatch',
        'message', 'Mobile number does not match this tracking code.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_appointment_ownership(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_appointment_ownership(TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- Safe claim RPC: never overwrites another user's Gmail; requires matching phone for unclaimed bookings
CREATE OR REPLACE FUNCTION public.claim_appointment_verified(
    p_tracking_code TEXT,
    p_email TEXT,
    p_user_id UUID DEFAULT NULL,
    p_patient_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_code TEXT := UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_tracking_code, '')), '[^a-zA-Z0-9-]', '', 'g'));
    v_email TEXT := LOWER(TRIM(COALESCE(NULLIF(TRIM(p_email), ''), NULLIF(TRIM(auth.jwt() ->> 'email'), ''), '')));
    v_check JSONB;
BEGIN
    IF v_email = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Signed-in Gmail is required to link records.');
    END IF;

    v_check := public.verify_appointment_ownership(v_code, v_email, p_patient_phone, TRUE);
    IF COALESCE((v_check ->> 'allowed')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'reason', COALESCE(v_check ->> 'reason', 'unauthorized'),
            'error', COALESCE(v_check ->> 'message', 'Ownership verification failed.')
        );
    END IF;

    PERFORM set_config('dactor.authoritative_context', 'true', true);

    UPDATE public.appointments
    SET
        patient_email = CASE
            WHEN TRIM(COALESCE(patient_email, '')) = '' THEN v_email
            ELSE patient_email
        END,
        user_id = CASE
            WHEN user_id IS NULL AND p_user_id IS NOT NULL THEN p_user_id
            ELSE user_id
        END,
        updated_at = NOW()
    WHERE (UPPER(COALESCE(tracking_code_10_digit, '')) = v_code OR id::TEXT = TRIM(COALESCE(p_tracking_code, '')))
      AND (TRIM(COALESCE(patient_email, '')) = '' OR LOWER(TRIM(patient_email)) = v_email);

    RETURN jsonb_build_object('success', TRUE, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_appointment_verified(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_appointment_verified(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
