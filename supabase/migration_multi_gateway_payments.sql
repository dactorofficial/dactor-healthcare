-- =============================================================================
-- DACTOR PLATFORM: Multi-Gateway Online Payments (eSewa, Khalti, Fonepay, ConnectIPS)
-- Server-owned credentials, strict clinic-owner key visibility, atomic finalization,
-- and closed-app / background reconciliation support.
-- =============================================================================

-- 1. EXTEND CLINIC_PAYMENT_CREDENTIALS FOR ISOLATED MULTI-GATEWAY STORAGE
-- Allow non-eSewa-only clinics by dropping NOT NULL on eSewa columns
ALTER TABLE public.clinic_payment_credentials
    ALTER COLUMN esewa_product_code DROP NOT NULL,
    ALTER COLUMN esewa_secret_key DROP NOT NULL;

ALTER TABLE public.clinic_payment_credentials
    -- eSewa isolated flags
    ADD COLUMN IF NOT EXISTS esewa_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS esewa_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS esewa_verified_at TIMESTAMPTZ,

    -- Khalti ePayment v2 credentials
    ADD COLUMN IF NOT EXISTS khalti_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS khalti_public_key TEXT,
    ADD COLUMN IF NOT EXISTS khalti_secret_key TEXT,
    ADD COLUMN IF NOT EXISTS khalti_environment TEXT NOT NULL DEFAULT 'test'
        CHECK (khalti_environment IN ('test', 'live')),
    ADD COLUMN IF NOT EXISTS khalti_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS khalti_verified_at TIMESTAMPTZ,

    -- Fonepay Merchant Web / Dynamic QR credentials
    ADD COLUMN IF NOT EXISTS fonepay_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fonepay_merchant_code TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_secret_key TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_username TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_password TEXT,
    ADD COLUMN IF NOT EXISTS fonepay_environment TEXT NOT NULL DEFAULT 'test'
        CHECK (fonepay_environment IN ('test', 'live')),
    ADD COLUMN IF NOT EXISTS fonepay_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fonepay_verified_at TIMESTAMPTZ,

    -- ConnectIPS (NCHL connectIPSWebGW) credentials
    ADD COLUMN IF NOT EXISTS connectips_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS connectips_merchant_id TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_id TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_name TEXT,
    ADD COLUMN IF NOT EXISTS connectips_app_password TEXT,
    ADD COLUMN IF NOT EXISTS connectips_private_key TEXT,
    ADD COLUMN IF NOT EXISTS connectips_environment TEXT NOT NULL DEFAULT 'test'
        CHECK (connectips_environment IN ('test', 'live')),
    ADD COLUMN IF NOT EXISTS connectips_is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS connectips_verified_at TIMESTAMPTZ;

-- Backfill existing verified eSewa rows ONLY when both product_code and secret_key were actually saved
UPDATE public.clinic_payment_credentials
SET
    esewa_enabled = true,
    esewa_is_verified = true,
    esewa_verified_at = COALESCE(verified_at, NOW())
WHERE COALESCE(is_verified, false) = true
  AND esewa_product_code IS NOT NULL AND trim(esewa_product_code) <> ''
  AND esewa_secret_key IS NOT NULL AND trim(esewa_secret_key) <> ''
  AND esewa_is_verified = false;

-- Enforce service_role-only access on clinic_payment_credentials (zero secret leakage to clients)
ALTER TABLE public.clinic_payment_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_payment_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.clinic_payment_credentials TO service_role;

DROP POLICY IF EXISTS "No client access to payment credentials" ON public.clinic_payment_credentials;
CREATE POLICY "No client access to payment credentials" ON public.clinic_payment_credentials
    FOR ALL USING (false) WITH CHECK (false);


-- 2. EXTEND APPOINTMENT_PAYMENT_ATTEMPTS FOR MULTI-GATEWAY & BACKGROUND SWEEPS
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'appointment_payment_attempts'
          AND con.contype = 'c'
          AND (
              pg_get_constraintdef(con.oid) ILIKE '%gateway%'
              OR pg_get_constraintdef(con.oid) ILIKE '%status%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.appointment_payment_attempts DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.appointment_payment_attempts
    ADD COLUMN IF NOT EXISTS provider_pidx TEXT,
    ADD COLUMN IF NOT EXISTS client_return_url TEXT,
    ADD COLUMN IF NOT EXISTS reconcile_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;

ALTER TABLE public.appointment_payment_attempts
    ADD CONSTRAINT appointment_payment_attempts_gateway_check
        CHECK (gateway IN ('esewa', 'khalti', 'fonepay', 'connectips')),
    ADD CONSTRAINT appointment_payment_attempts_status_check
        CHECK (status IN ('pending', 'complete', 'failed', 'expired'));

CREATE INDEX IF NOT EXISTS idx_appointment_payment_attempts_pending_sweep
    ON public.appointment_payment_attempts (status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointment_payment_attempts_pidx
    ON public.appointment_payment_attempts (provider_pidx)
    WHERE provider_pidx IS NOT NULL;


-- 3. GENERALIZED ATOMIC PAYMENT FINALIZATION RPC (IDEMPOTENT + BACKGROUND NOTIFICATION)
CREATE OR REPLACE FUNCTION public.finalize_online_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    attempt public.appointment_payment_attempts%ROWTYPE;
    appt public.appointments%ROWTYPE;
    next_position INTEGER;
    assigned_position INTEGER;
    v_invoice_id UUID;
    v_gateway_upper TEXT;
    v_gateway_label TEXT;
    v_clinic_name TEXT;
    v_effective_ref TEXT;
BEGIN
    SELECT * INTO attempt
    FROM public.appointment_payment_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR round(attempt.amount_npr, 2) <> round(p_verified_amount, 2) THEN
        RETURN FALSE;
    END IF;

    IF attempt.status = 'complete' THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO appt
    FROM public.appointments
    WHERE id = attempt.appointment_id
    FOR UPDATE;

    IF NOT FOUND OR appt.clinic_id <> attempt.clinic_id THEN
        RETURN FALSE;
    END IF;

    v_gateway_upper := UPPER(COALESCE(attempt.gateway, 'ESEWA'));
    v_gateway_label := CASE LOWER(COALESCE(attempt.gateway, 'esewa'))
        WHEN 'khalti' THEN 'Khalti'
        WHEN 'fonepay' THEN 'Fonepay'
        WHEN 'connectips' THEN 'ConnectIPS'
        ELSE 'eSewa'
    END;
    v_effective_ref := COALESCE(NULLIF(trim(p_provider_reference), ''), attempt.transaction_uuid);

    -- Idempotency if appointment was already marked paid by a concurrent callback/sweep
    IF appt.payment_status::text = 'paid' THEN
        UPDATE public.appointment_payment_attempts
        SET status = 'complete',
            provider_reference = COALESCE(NULLIF(trim(p_provider_reference), ''), provider_reference, attempt.transaction_uuid),
            updated_at = NOW()
        WHERE id = attempt.id;
        RETURN TRUE;
    END IF;

    IF appt.checkin_status::text NOT IN ('not_checked_in', 'checked_in', 'waiting', 'cancelled')
       OR appt.payment_status::text NOT IN ('pending', 'unpaid', 'failed') THEN
        RETURN FALSE;
    END IF;

    -- 3a. Mark appointment paid & checked_in & approved (even if patient closed app and paid in background)
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = COALESCE(approved_at, NOW()),
        payment_status = 'paid',
        checkin_status = 'checked_in',
        payment_mode = 'ONLINE',
        fee_amount = attempt.amount_npr,
        updated_at = NOW()
    WHERE id = appt.id;

    -- 3b. Reconcile slot booked_count
    IF appt.slot_id IS NOT NULL THEN
        UPDATE public.slots
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments
            WHERE slot_id = appt.slot_id AND checkin_status::text <> 'cancelled'
        )
        WHERE id = appt.slot_id;
    END IF;

    -- 3c. Issue live queue token idempotently
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM public.queue_entries
    WHERE clinic_id = appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO public.queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
    VALUES (appt.id, appt.clinic_id, appt.doctor_id, next_position, 'waiting')
    ON CONFLICT (appointment_id) DO NOTHING;

    SELECT queue_position INTO assigned_position
    FROM public.queue_entries
    WHERE appointment_id = appt.id
    LIMIT 1;

    -- 3d. Upsert billing invoice
    INSERT INTO public.billing_invoices (
        appointment_id, clinic_id, total_amount, paid_amount, balance_due,
        payment_status, paid_at, remarks
    ) VALUES (
        appt.id, appt.clinic_id, attempt.amount_npr, attempt.amount_npr, 0,
        'paid', NOW(), 'Paid via ' || v_gateway_label || '; provider reference: ' || v_effective_ref
    ) ON CONFLICT (appointment_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        paid_amount = EXCLUDED.paid_amount,
        balance_due = 0,
        payment_status = 'paid',
        paid_at = COALESCE(public.billing_invoices.paid_at, NOW()),
        remarks = EXCLUDED.remarks,
        updated_at = NOW()
    RETURNING id INTO v_invoice_id;

    -- 3e. Insert immutable financial ledger entry
    IF v_invoice_id IS NOT NULL THEN
        INSERT INTO public.invoice_transactions (
            invoice_id,
            clinic_id,
            appointment_id,
            transaction_type,
            amount,
            payment_method,
            reference_id,
            category,
            notes,
            transaction_time
        )
        SELECT
            v_invoice_id,
            appt.clinic_id,
            appt.id,
            'PAYMENT',
            attempt.amount_npr,
            v_gateway_upper,
            v_effective_ref,
            'CONSULTATION',
            'Online ' || v_gateway_label || ' Appointment Checkout',
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_transactions it
            WHERE it.invoice_id = v_invoice_id
              AND it.reference_id = v_effective_ref
        );
    END IF;

    -- 3f. Finalize payment attempt row
    UPDATE public.appointment_payment_attempts
    SET status = 'complete',
        provider_reference = v_effective_ref,
        updated_at = NOW()
    WHERE id = attempt.id;

    -- 3g. Emit confirmation notification so background / closed-app payments notify patient immediately
    BEGIN
        SELECT name INTO v_clinic_name FROM public.clinics WHERE id = appt.clinic_id;
        INSERT INTO public.notifications (
            user_id,
            appointment_id,
            title,
            message,
            type,
            target_audience,
            is_read
        )
        SELECT
            appt.user_id,
            appt.id,
            'Payment Verified & Appointment Confirmed',
            format(
                'NPR %s paid via %s (Ref: %s) for %s. Tracking ID: %s%s.',
                trim(to_char(attempt.amount_npr, 'FM999999990.00')),
                v_gateway_label,
                v_effective_ref,
                COALESCE(v_clinic_name, 'Clinic'),
                COALESCE(appt.tracking_code_10_digit, ''),
                CASE WHEN assigned_position IS NOT NULL THEN format(' | Queue Token #%s', assigned_position) ELSE '' END
            ),
            'payment_receipt',
            'specific',
            false
        WHERE NOT EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.appointment_id = appt.id
              AND n.type = 'payment_receipt'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Notification failure must never roll back a verified financial payment
        NULL;
    END;

    RETURN TRUE;
END;
$$;

-- Backwards-compatible wrapper for existing callers/tests
CREATE OR REPLACE FUNCTION public.finalize_esewa_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.finalize_online_appointment_payment(p_attempt_id, p_provider_reference, p_verified_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_online_appointment_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_online_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;


-- 4. STRICT PUBLIC VISIBILITY RPC (ONLY SHOW GATEWAYS WITH CLINIC-OWNER VERIFIED KEYS; PAY AT DESK ALWAYS AVAILABLE)
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
BEGIN
    SELECT COALESCE(is_direct_payment_enabled, false)
    INTO v_is_direct
    FROM public.clinics
    WHERE id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Online gateways ONLY appear when clinic owner enabled direct payments AND saved verified keys for that gateway
    IF v_is_direct THEN
        SELECT * INTO v_cred
        FROM public.clinic_payment_credentials
        WHERE clinic_id = p_clinic_id;

        IF FOUND THEN
            -- 1. eSewa: requires esewa_enabled + esewa_is_verified + non-empty product_code & secret_key
            IF v_cred.esewa_enabled = true
               AND v_cred.esewa_is_verified = true
               AND COALESCE(trim(v_cred.esewa_product_code), '') <> ''
               AND COALESCE(trim(v_cred.esewa_secret_key), '') <> '' THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'esewa',
                    'name', 'eSewa Mobile Wallet',
                    'subtitle', 'Instant eSewa Wallet & Bank Checkout',
                    'environment', COALESCE(v_cred.esewa_environment, 'live'),
                    'merchant_display_id', trim(v_cred.esewa_product_code),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 2. Khalti: requires khalti_enabled + khalti_is_verified + non-empty secret_key
            IF v_cred.khalti_enabled = true
               AND v_cred.khalti_is_verified = true
               AND COALESCE(trim(v_cred.khalti_secret_key), '') <> '' THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'khalti',
                    'name', 'Khalti Digital Wallet',
                    'subtitle', 'Khalti Wallet, Mobile Banking & SCT/Visa',
                    'environment', COALESCE(v_cred.khalti_environment, 'live'),
                    'merchant_display_id', COALESCE(NULLIF(trim(v_cred.khalti_public_key), ''), 'Verified Khalti Merchant'),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 3. Fonepay: requires fonepay_enabled + fonepay_is_verified + non-empty merchant_code & secret_key
            IF v_cred.fonepay_enabled = true
               AND v_cred.fonepay_is_verified = true
               AND COALESCE(trim(v_cred.fonepay_merchant_code), '') <> ''
               AND COALESCE(trim(v_cred.fonepay_secret_key), '') <> '' THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'fonepay',
                    'name', 'Fonepay QR / Direct Banking',
                    'subtitle', 'Interbank Dynamic QR & 60+ Mobile Banking Apps',
                    'environment', COALESCE(v_cred.fonepay_environment, 'live'),
                    'merchant_display_id', trim(v_cred.fonepay_merchant_code),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;

            -- 4. ConnectIPS: requires connectips_enabled + connectips_is_verified + merchant_id, app_id, app_password & private_key
            IF v_cred.connectips_enabled = true
               AND v_cred.connectips_is_verified = true
               AND COALESCE(trim(v_cred.connectips_merchant_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_id), '') <> ''
               AND COALESCE(trim(v_cred.connectips_app_password), '') <> ''
               AND COALESCE(trim(v_cred.connectips_private_key), '') <> '' THEN
                v_result := v_result || jsonb_build_object(
                    'id', 'connectips',
                    'name', 'ConnectIPS Direct Bank',
                    'subtitle', 'NCHL Direct Bank Account Transfer',
                    'environment', COALESCE(v_cred.connectips_environment, 'live'),
                    'merchant_display_id', trim(v_cred.connectips_app_id),
                    'is_verified', true,
                    'requires_keys', true
                );
            END IF;
        END IF;
    END IF;

    -- 5. Pay at Desk NEVER requires merchant keys or gateway setup and is always available
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


-- 5. CLINIC OWNER / ADMIN GATEWAY SETUP STATUS RPC (RETURNS NON-SECRET SETUP FLAGS ONLY)
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
BEGIN
    IF NOT (public.is_authorized_clinic_staff(p_clinic_id) OR public.is_admin_portal_user()) THEN
        RAISE EXCEPTION 'Unauthorized: Only clinic owner/staff or platform admin can view gateway setup status';
    END IF;

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
            'esewa', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', 'test', 'merchant_id', '', 'has_secret_key', false),
            'khalti', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', 'test', 'public_key', '', 'has_secret_key', false),
            'fonepay', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', 'test', 'merchant_code', '', 'username', '', 'has_secret_key', false, 'has_password', false),
            'connectips', jsonb_build_object('enabled', false, 'is_verified', false, 'environment', 'test', 'merchant_id', '', 'app_id', '', 'app_name', '', 'has_app_password', false, 'has_private_key', false)
        );
    END IF;

    RETURN jsonb_build_object(
        'is_direct_payment_enabled', v_is_direct,
        'esewa', jsonb_build_object(
            'enabled', v_cred.esewa_enabled,
            'is_verified', v_cred.esewa_is_verified,
            'verified_at', v_cred.esewa_verified_at,
            'environment', COALESCE(v_cred.esewa_environment, 'test'),
            'merchant_id', COALESCE(v_cred.esewa_product_code, ''),
            'has_secret_key', COALESCE(trim(v_cred.esewa_secret_key), '') <> ''
        ),
        'khalti', jsonb_build_object(
            'enabled', v_cred.khalti_enabled,
            'is_verified', v_cred.khalti_is_verified,
            'verified_at', v_cred.khalti_verified_at,
            'environment', COALESCE(v_cred.khalti_environment, 'test'),
            'public_key', COALESCE(v_cred.khalti_public_key, ''),
            'has_secret_key', COALESCE(trim(v_cred.khalti_secret_key), '') <> ''
        ),
        'fonepay', jsonb_build_object(
            'enabled', v_cred.fonepay_enabled,
            'is_verified', v_cred.fonepay_is_verified,
            'verified_at', v_cred.fonepay_verified_at,
            'environment', COALESCE(v_cred.fonepay_environment, 'test'),
            'merchant_code', COALESCE(v_cred.fonepay_merchant_code, ''),
            'username', COALESCE(v_cred.fonepay_username, ''),
            'has_secret_key', COALESCE(trim(v_cred.fonepay_secret_key), '') <> '',
            'has_password', COALESCE(trim(v_cred.fonepay_password), '') <> ''
        ),
        'connectips', jsonb_build_object(
            'enabled', v_cred.connectips_enabled,
            'is_verified', v_cred.connectips_is_verified,
            'verified_at', v_cred.connectips_verified_at,
            'environment', COALESCE(v_cred.connectips_environment, 'test'),
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


-- 6. EXPIRE ABANDONED PENDING ATTEMPTS (>24 HOURS) & SCHEDULED BACKGROUND SWEEP HOOK
CREATE OR REPLACE FUNCTION public.expire_stale_online_payment_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    UPDATE public.appointment_payment_attempts
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_online_payment_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_online_payment_attempts() TO service_role;

-- Schedule pg_cron jobs safely when pg_cron extension is active in Supabase
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Clean up stale attempts >24h every 30 minutes
        BEGIN
            PERFORM cron.unschedule('dactor_expire_stale_payment_attempts');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        PERFORM cron.schedule(
            'dactor_expire_stale_payment_attempts',
            '*/30 * * * *',
            $job$SELECT public.expire_stale_online_payment_attempts();$job$
        );

        -- Autonomous 2-minute background sweep via pg_net when vault/settings supply project URL & service key
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            BEGIN
                PERFORM cron.unschedule('dactor_reconcile_pending_payments');
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            PERFORM cron.schedule(
                'dactor_reconcile_pending_payments',
                '*/2 * * * *',
                $job$
                DO $inner$
                DECLARE
                    v_url TEXT := current_setting('app.settings.supabase_url', true);
                    v_key TEXT := current_setting('app.settings.service_role_key', true);
                BEGIN
                    IF v_url IS NOT NULL AND v_url <> '' AND v_key IS NOT NULL AND v_key <> ''
                       AND EXISTS (
                           SELECT 1 FROM public.appointment_payment_attempts
                           WHERE status = 'pending' AND created_at > NOW() - INTERVAL '24 hours'
                       ) THEN
                        PERFORM net.http_post(
                            url := rtrim(v_url, '/') || '/functions/v1/appointment-payment',
                            headers := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || v_key
                            ),
                            body := jsonb_build_object('action', 'reconcile_pending')
                        );
                    END IF;
                END $inner$;
                $job$
            );
        END IF;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
