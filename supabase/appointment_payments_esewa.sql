-- ========================================================
-- DACTOR PLATFORM: eSewa Appointment Checkout & Server-Owned Payment Finalization
-- Safe migration: preserves Khalti, Fonepay, ConnectIPS and general clinic metadata
-- ========================================================

-- 1. Ensure required enum values exist without throwing duplicate errors
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'cancelled'
    ) THEN
        ALTER TYPE checkin_status_enum ADD VALUE 'cancelled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'payment_status_enum' AND e.enumlabel = 'failed'
    ) THEN
        ALTER TYPE payment_status_enum ADD VALUE 'failed';
    END IF;
END $$;

-- 2. Server-only clinic credentials storage (zero exposure to client apps or anon role)
CREATE TABLE IF NOT EXISTS clinic_payment_credentials (
    clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
    esewa_product_code TEXT NOT NULL,
    esewa_secret_key TEXT NOT NULL,
    esewa_environment TEXT NOT NULL DEFAULT 'test' CHECK (esewa_environment IN ('test', 'live')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinic_payment_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinic_payment_credentials FROM anon, authenticated, public;
GRANT ALL ON clinic_payment_credentials TO service_role;

-- 3. Payment attempts table (tracked per appointment, unique transaction UUID)
CREATE TABLE IF NOT EXISTS appointment_payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    gateway TEXT NOT NULL CHECK (gateway = 'esewa'),
    transaction_uuid TEXT NOT NULL UNIQUE,
    amount_npr NUMERIC(10, 2) NOT NULL CHECK (amount_npr > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed', 'expired')),
    provider_reference TEXT,
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointment_payment_attempts_appointment_idx
    ON appointment_payment_attempts (appointment_id, created_at DESC);
ALTER TABLE appointment_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON appointment_payment_attempts FROM anon, authenticated, public;
GRANT ALL ON appointment_payment_attempts TO service_role;

-- 4. Move previously saved eSewa secrets out of clinic-visible JSON/columns.
-- NOTE: Khalti, Fonepay, ConnectIPS and custom credentials are strictly preserved.
DO $$
DECLARE
    clinic_row RECORD;
    meta JSONB;
    config JSONB;
    esewa JSONB;
    clean_config JSONB;
    product_code TEXT;
    secret_key TEXT;
    env TEXT;
BEGIN
    FOR clinic_row IN SELECT id, description, merchant_id, payment_api_key, payment_secret_key, payment_gateway_provider FROM clinics LOOP
        BEGIN
            meta := CASE
                WHEN clinic_row.description IS NOT NULL AND trim(clinic_row.description) LIKE '{%'
                THEN clinic_row.description::jsonb
                ELSE '{}'::jsonb
            END;
            config := CASE
                WHEN jsonb_typeof(meta -> 'payment_gateways_json') = 'string'
                THEN (meta ->> 'payment_gateways_json')::jsonb
                WHEN jsonb_typeof(meta -> 'payment_gateways_json') = 'object'
                THEN meta -> 'payment_gateways_json'
                ELSE '{}'::jsonb
            END;
            esewa := COALESCE(config -> 'esewa', '{}'::jsonb);
            product_code := COALESCE(NULLIF(esewa ->> 'merchant_id', ''), NULLIF(clinic_row.merchant_id, ''), NULLIF(clinic_row.payment_api_key, ''));
            secret_key := COALESCE(NULLIF(esewa ->> 'secret_key', ''), NULLIF(clinic_row.payment_secret_key, ''));
            env := CASE WHEN lower(COALESCE(esewa ->> 'environment', 'test')) = 'live' THEN 'live' ELSE 'test' END;
            
            IF product_code IS NOT NULL AND secret_key IS NOT NULL AND (NULLIF(esewa ->> 'secret_key', '') IS NOT NULL OR lower(COALESCE(clinic_row.payment_gateway_provider, 'esewa')) = 'esewa') THEN
                INSERT INTO clinic_payment_credentials (clinic_id, esewa_product_code, esewa_secret_key, esewa_environment)
                VALUES (clinic_row.id, product_code, secret_key, env)
                ON CONFLICT (clinic_id) DO UPDATE SET
                    esewa_product_code = EXCLUDED.esewa_product_code,
                    esewa_secret_key = EXCLUDED.esewa_secret_key,
                    esewa_environment = EXCLUDED.esewa_environment,
                    updated_at = NOW();
            END IF;

            -- Preserve all other gateways: blank out ONLY esewa.secret_key in the public config
            IF config ? 'esewa' THEN
                clean_config := jsonb_set(config, '{esewa,secret_key}', '""'::jsonb, true);
            ELSE
                clean_config := config;
            END IF;

            IF jsonb_typeof(meta) = 'object' THEN
                meta := jsonb_set(meta, '{payment_gateways_json}', to_jsonb(clean_config::text), true);
                UPDATE clinics SET description = meta::text WHERE id = clinic_row.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Leave malformed legacy metadata untouched for manual review.
            NULL;
        END;
    END LOOP;
END $$;

-- Only clear payment_secret_key if the active provider is eSewa (preserving other gateway keys)
UPDATE clinics SET payment_secret_key = NULL 
WHERE payment_secret_key IS NOT NULL AND lower(COALESCE(payment_gateway_provider, 'esewa')) = 'esewa';

-- 5. Idempotent payment finalization procedure
CREATE OR REPLACE FUNCTION finalize_esewa_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    attempt appointment_payment_attempts%ROWTYPE;
    appt appointments%ROWTYPE;
    next_position INTEGER;
BEGIN
    SELECT * INTO attempt
    FROM appointment_payment_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR round(attempt.amount_npr, 2) <> round(p_verified_amount, 2) THEN
        RETURN FALSE;
    END IF;

    IF attempt.status = 'complete' THEN
        RETURN TRUE;
    END IF;

    SELECT * INTO appt FROM appointments WHERE id = attempt.appointment_id FOR UPDATE;
    IF NOT FOUND OR appt.clinic_id <> attempt.clinic_id THEN
        RETURN FALSE;
    END IF;

    IF appt.payment_status::text = 'paid' THEN
        UPDATE appointment_payment_attempts
        SET status = 'complete', provider_reference = COALESCE(p_provider_reference, provider_reference), updated_at = NOW()
        WHERE id = attempt.id;
        RETURN TRUE;
    END IF;

    IF appt.checkin_status::text NOT IN ('not_checked_in', 'checked_in', 'cancelled') OR appt.payment_status::text NOT IN ('pending', 'unpaid', 'failed') THEN
        RETURN FALSE;
    END IF;

    UPDATE appointments
    SET payment_status = 'paid', checkin_status = 'checked_in', fee_amount = attempt.amount_npr, updated_at = NOW()
    WHERE id = appt.id;

    IF appt.slot_id IS NOT NULL THEN
        UPDATE slots SET booked_count = (
            SELECT COUNT(*) FROM appointments
            WHERE slot_id = appt.slot_id AND checkin_status::text <> 'cancelled'
        ) WHERE id = appt.slot_id;
    END IF;

    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
    FROM queue_entries
    WHERE clinic_id = appt.clinic_id AND status IN ('waiting', 'inside');

    INSERT INTO queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
    VALUES (appt.id, appt.clinic_id, appt.doctor_id, next_position, 'waiting')
    ON CONFLICT (appointment_id) DO NOTHING;

    INSERT INTO billing_invoices (
        appointment_id, clinic_id, total_amount, paid_amount, balance_due,
        payment_status, paid_at, remarks
    ) VALUES (
        appt.id, appt.clinic_id, attempt.amount_npr, attempt.amount_npr, 0,
        'paid', NOW(), 'Paid via eSewa; provider reference: ' || COALESCE(p_provider_reference, attempt.transaction_uuid)
    ) ON CONFLICT (appointment_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        paid_amount = EXCLUDED.paid_amount,
        balance_due = 0,
        payment_status = 'paid',
        paid_at = COALESCE(billing_invoices.paid_at, NOW()),
        remarks = EXCLUDED.remarks,
        updated_at = NOW();

    UPDATE appointment_payment_attempts
    SET status = 'complete', provider_reference = p_provider_reference, updated_at = NOW()
    WHERE id = attempt.id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;
