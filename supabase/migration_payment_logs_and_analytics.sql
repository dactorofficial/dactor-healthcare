-- =========================================================================
-- DACTOR PLATFORM: PAYMENT LOGS, FINANCIAL LEDGERS & DOCTOR ANALYTICS MIGRATION
-- File: supabase/migration_payment_logs_and_analytics.sql
-- =========================================================================

-- 1. EXTEND INVOICE_TRANSACTIONS WITH REFERENCE_ID & CATEGORY
ALTER TABLE public.invoice_transactions 
    ADD COLUMN IF NOT EXISTS reference_id TEXT,
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'CONSULTATION';

CREATE INDEX IF NOT EXISTS idx_invoice_transactions_ref 
    ON public.invoice_transactions (clinic_id, reference_id);

CREATE INDEX IF NOT EXISTS idx_invoice_transactions_method_time 
    ON public.invoice_transactions (clinic_id, payment_method, transaction_time DESC);

-- 2. CREATE CLINIC SUBSCRIPTION PAYMENTS (APPEND-ONLY LICENSE AUDIT LOG)
CREATE TABLE IF NOT EXISTS public.clinic_subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL DEFAULT '1_month',
    amount_npr DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'ESEWA', -- ESEWA, KHALTI, FONEPAY, CONNECTIPS, BANK_TRANSFER, CASH, MANUAL_ADMIN
    transaction_reference TEXT,
    payment_proof_url TEXT,
    period_start TIMESTAMPTZ DEFAULT NOW(),
    period_end TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'verified', -- pending_verification, verified, rejected, refunded
    notes TEXT,
    recorded_by_email TEXT,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_subscription_payments_clinic 
    ON public.clinic_subscription_payments (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_subscription_payments_status 
    ON public.clinic_subscription_payments (status, created_at DESC);

ALTER TABLE public.clinic_subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_subscription_payments_admin_all" ON public.clinic_subscription_payments;
CREATE POLICY "clinic_subscription_payments_admin_all" ON public.clinic_subscription_payments
    FOR ALL USING (public.is_admin_portal_user()) WITH CHECK (public.is_admin_portal_user());

DROP POLICY IF EXISTS "clinic_subscription_payments_clinic_select" ON public.clinic_subscription_payments;
CREATE POLICY "clinic_subscription_payments_clinic_select" ON public.clinic_subscription_payments
    FOR SELECT USING (public.is_authorized_clinic_staff(clinic_id));

DROP POLICY IF EXISTS "clinic_subscription_payments_clinic_insert" ON public.clinic_subscription_payments;
CREATE POLICY "clinic_subscription_payments_clinic_insert" ON public.clinic_subscription_payments
    FOR INSERT WITH CHECK (
        public.is_authorized_clinic_staff(clinic_id)
        AND status IN ('pending_verification', 'verified')
    );

-- Backfill existing clinic activations into clinic_subscription_payments
INSERT INTO public.clinic_subscription_payments (
    clinic_id,
    plan_type,
    amount_npr,
    payment_method,
    transaction_reference,
    period_start,
    period_end,
    status,
    notes,
    recorded_by_email,
    verified_at,
    created_at
)
SELECT 
    c.id,
    COALESCE(c.activation_plan, '1_month'),
    COALESCE(c.activation_paid_amount, 1500.00),
    'MANUAL_ADMIN',
    'HISTORICAL_ACTIVATION',
    COALESCE(c.created_at, NOW()),
    c.activation_expires_at,
    'verified',
    COALESCE(c.activation_notes, 'Initial Clinic Activation / License Setup'),
    c.contact_email,
    NOW(),
    COALESCE(c.updated_at, c.created_at, NOW())
FROM public.clinics c
WHERE (c.activation_paid_amount > 0 OR c.is_activated = true)
  AND NOT EXISTS (
      SELECT 1 FROM public.clinic_subscription_payments p WHERE p.clinic_id = c.id
  );

-- 3. CREATE PLATFORM COMMISSION SETTLEMENTS (5% PAY AT DESK COMMISSION LEDGER)
CREATE TABLE IF NOT EXISTS public.platform_commission_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    period_end DATE NOT NULL DEFAULT CURRENT_DATE,
    appointments_count INT NOT NULL DEFAULT 0,
    gross_desk_amount_npr DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    commission_amount_npr DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
    transaction_reference TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'settled', -- pending, settled, waived
    notes TEXT,
    recorded_by_email TEXT,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_commission_settlements_clinic 
    ON public.platform_commission_settlements (clinic_id, settled_at DESC);

ALTER TABLE public.platform_commission_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_commission_settlements_admin_all" ON public.platform_commission_settlements;
CREATE POLICY "platform_commission_settlements_admin_all" ON public.platform_commission_settlements
    FOR ALL USING (public.is_admin_portal_user()) WITH CHECK (public.is_admin_portal_user());

DROP POLICY IF EXISTS "platform_commission_settlements_clinic_select" ON public.platform_commission_settlements;
CREATE POLICY "platform_commission_settlements_clinic_select" ON public.platform_commission_settlements
    FOR SELECT USING (public.is_authorized_clinic_staff(clinic_id));

-- 4. UPDATE FINALIZE_ESEWA_APPOINTMENT_PAYMENT TO WRITE TO INVOICE_TRANSACTIONS
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
    v_invoice_id UUID;
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
        updated_at = NOW()
    RETURNING id INTO v_invoice_id;

    -- Write immutable ledger transaction entry
    IF v_invoice_id IS NOT NULL THEN
        INSERT INTO invoice_transactions (
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
            'ESEWA',
            COALESCE(p_provider_reference, attempt.transaction_uuid),
            'CONSULTATION',
            'Online eSewa Appointment Checkout',
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM invoice_transactions it
            WHERE it.invoice_id = v_invoice_id 
              AND it.reference_id = COALESCE(p_provider_reference, attempt.transaction_uuid)
        );
    END IF;

    UPDATE appointment_payment_attempts
    SET status = 'complete', provider_reference = p_provider_reference, updated_at = NOW()
    WHERE id = attempt.id;

    RETURN TRUE;
END;
$$;

-- 5. RPC: SECURE READ OF CLINIC APPOINTMENT PAYMENT ATTEMPTS (FOR CLINIC & ADMIN LOGS)
CREATE OR REPLACE FUNCTION public.get_clinic_payment_attempts(p_clinic_id UUID)
RETURNS TABLE (
    id UUID,
    appointment_id UUID,
    clinic_id UUID,
    gateway TEXT,
    transaction_uuid TEXT,
    amount_npr NUMERIC,
    status TEXT,
    provider_reference TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    patient_name TEXT,
    patient_mobile TEXT,
    tracking_code_10_digit TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin_portal_user() OR public.is_authorized_clinic_staff(p_clinic_id)) THEN
        RAISE EXCEPTION 'Access denied to payment attempts for clinic %', p_clinic_id;
    END IF;

    RETURN QUERY
    SELECT 
        apa.id,
        apa.appointment_id,
        apa.clinic_id,
        apa.gateway,
        apa.transaction_uuid,
        apa.amount_npr,
        apa.status,
        apa.provider_reference,
        apa.created_at,
        apa.updated_at,
        a.patient_name::TEXT,
        a.patient_mobile::TEXT,
        a.tracking_code_10_digit::TEXT
    FROM appointment_payment_attempts apa
    LEFT JOIN appointments a ON a.id = apa.appointment_id
    WHERE apa.clinic_id = p_clinic_id
    ORDER BY apa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_payment_attempts(UUID) TO authenticated, anon, service_role;

-- 6. RPC: DOCTOR PATIENT GROWTH & REVENUE ANALYTICS (DAILY & MONTHLY)
-- Implements Nepal family-phone safe unique patient identity resolution:
-- COALESCE(user_id::text, email, phone + '|' + lower_name)
CREATE OR REPLACE FUNCTION public.get_doctor_patient_revenue_stats(
    p_clinic_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_doctor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    doctor_id UUID,
    doctor_name TEXT,
    specialty TEXT,
    period_date DATE,
    period_month TEXT,
    new_patients_count BIGINT,
    followup_patients_count BIGINT,
    total_patients_count BIGINT,
    consultation_revenue NUMERIC,
    total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (public.is_admin_portal_user() OR public.is_authorized_clinic_staff(p_clinic_id)) THEN
        RAISE EXCEPTION 'Access denied to doctor analytics for clinic %', p_clinic_id;
    END IF;

    RETURN QUERY
    WITH ranked_patient_visits AS (
        SELECT 
            a.id AS appt_id,
            a.clinic_id,
            a.doctor_id,
            a.appointment_date,
            TO_CHAR(a.appointment_date, 'YYYY-MM') AS appt_month,
            COALESCE(a.fee_amount, 0.00) AS appt_fee,
            COALESCE(a.total_amount, a.fee_amount, 0.00) AS appt_total,
            CASE 
                WHEN ROW_NUMBER() OVER (
                    PARTITION BY a.clinic_id, a.doctor_id, 
                    COALESCE(
                        a.user_id::TEXT,
                        NULLIF(LOWER(TRIM(a.patient_email)), ''),
                        RIGHT(REGEXP_REPLACE(COALESCE(a.patient_mobile, ''), '\D', '', 'g'), 10) || '|' || LOWER(TRIM(a.patient_name))
                    )
                    ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.created_at ASC
                ) = 1 THEN 1 
                ELSE 0 
            END AS is_first_doctor_visit
        FROM appointments a
        WHERE a.clinic_id = p_clinic_id
          AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
          AND a.doctor_id IS NOT NULL
          AND COALESCE(a.is_deleted, false) = false
          AND COALESCE(a.status, 'APPROVED') = 'APPROVED'
          AND COALESCE(a.checkin_status::TEXT, '') <> 'cancelled'
    )
    SELECT 
        d.id AS doctor_id,
        d.full_name::TEXT AS doctor_name,
        d.specialty::TEXT AS specialty,
        rpv.appointment_date AS period_date,
        rpv.appt_month::TEXT AS period_month,
        COUNT(CASE WHEN rpv.is_first_doctor_visit = 1 THEN 1 END) AS new_patients_count,
        COUNT(CASE WHEN rpv.is_first_doctor_visit = 0 THEN 1 END) AS followup_patients_count,
        COUNT(*) AS total_patients_count,
        COALESCE(SUM(rpv.appt_fee), 0.00)::NUMERIC AS consultation_revenue,
        COALESCE(SUM(rpv.appt_total), 0.00)::NUMERIC AS total_revenue
    FROM ranked_patient_visits rpv
    JOIN doctors d ON d.id = rpv.doctor_id
    WHERE rpv.appointment_date BETWEEN p_start_date AND p_end_date
    GROUP BY d.id, d.full_name, d.specialty, rpv.appointment_date, rpv.appt_month
    ORDER BY rpv.appointment_date DESC, d.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_patient_revenue_stats(UUID, DATE, DATE, UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
