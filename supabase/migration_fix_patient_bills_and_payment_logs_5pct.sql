-- ==============================================================================
-- Migration: Fix Patient Bills, Invoices & Payment Logs for Pay at Desk (+5%)
-- File: supabase/migration_fix_patient_bills_and_payment_logs_5pct.sql
--
-- Fixes:
--   1. Adds missing columns (reference_id, category) to public.invoice_transactions
--      so collection & payment logs never fail with 42703 column errors.
--   2. Adds BEFORE INSERT OR UPDATE trigger on public.billing_invoices to guarantee
--      any invoice linked to a PAY_AT_DESK appointment includes the 5% platform
--      service charge in total_amount, balance_due, paid_amount (when paid),
--      and itemized line items ("Pay at Desk Service Charge (5%)").
--   3. Backfills historical PAY_AT_DESK billing_invoices and invoice_transactions
--      that were stored with only the clinic base consultation fee.
--   4. Updates mark_pay_at_desk_collected() so existing base-fee items & txns
--      are upgraded cleanly to include the 5% service charge line and total.
-- ==============================================================================

-- 1. Ensure invoice_transactions schema includes reference_id and category
ALTER TABLE IF EXISTS public.invoice_transactions
    ADD COLUMN IF NOT EXISTS reference_id TEXT,
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'CONSULTATION';

-- 2. Trigger Function: Enforce 5% Pay-at-Desk Service Charge on billing_invoices
CREATE OR REPLACE FUNCTION public.enforce_pay_at_desk_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_pct NUMERIC := 5.0;
    v_fee NUMERIC(10, 2);
    v_charge NUMERIC(10, 2);
    v_expected_total NUMERIC(10, 2);
    v_items_sum NUMERIC(10, 2) := 0.00;
    v_has_service_charge BOOLEAN := false;
    v_elem JSONB;
BEGIN
    IF NEW.appointment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = NEW.appointment_id;

    IF NOT FOUND OR UPPER(COALESCE(v_appt.payment_mode, '')) <> 'PAY_AT_DESK' THEN
        RETURN NEW;
    END IF;

    v_fee := COALESCE(v_appt.fee_amount, 0.00);
    IF v_fee <= 0.00 THEN
        RETURN NEW;
    END IF;

    BEGIN
        v_pct := COALESCE(public.get_pay_at_desk_service_charge_percent(), 5.0);
    EXCEPTION WHEN OTHERS THEN
        v_pct := 5.0;
    END;

    v_charge := CASE
        WHEN COALESCE(v_appt.service_charge_amount, 0.00) > 0.00 THEN v_appt.service_charge_amount
        ELSE ROUND(v_fee * (v_pct / 100.0), 2)
    END;

    v_expected_total := CASE
        WHEN COALESCE(v_appt.total_amount, 0.00) > v_fee THEN v_appt.total_amount
        ELSE ROUND(v_fee + v_charge, 2)
    END;

    -- Inspect existing items JSONB array
    IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
        NEW.items := '[]'::jsonb;
    END IF;

    v_has_service_charge := LOWER(COALESCE(NEW.items::TEXT, '')) LIKE '%service charge%'
        OR LOWER(COALESCE(NEW.items::TEXT, '')) LIKE '%5%%';

    FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        v_items_sum := v_items_sum + COALESCE(
            NULLIF((v_elem ->> 'total'), '')::NUMERIC,
            COALESCE(NULLIF((v_elem ->> 'price'), '')::NUMERIC, 0.00)
                * GREATEST(COALESCE(NULLIF((v_elem ->> 'quantity'), '')::NUMERIC, 1), 1),
            0.00
        );
    END LOOP;

    IF jsonb_array_length(NEW.items) = 0 THEN
        NEW.items := jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid()::TEXT,
                'item_name', 'OPD Consultation Fee',
                'itemName', 'OPD Consultation Fee',
                'name', 'OPD Consultation Fee',
                'quantity', 1,
                'price', v_fee,
                'total', v_fee
            ),
            jsonb_build_object(
                'id', gen_random_uuid()::TEXT,
                'item_name', 'Pay at Desk Service Charge (5%)',
                'itemName', 'Pay at Desk Service Charge (5%)',
                'name', 'Pay at Desk Service Charge (5%)',
                'quantity', 1,
                'price', v_charge,
                'total', v_charge
            )
        );
        NEW.total_amount := GREATEST(COALESCE(NEW.total_amount, 0.00), v_expected_total);
    ELSIF NOT v_has_service_charge AND v_charge > 0.00 THEN
        NEW.items := NEW.items || jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid()::TEXT,
                'item_name', 'Pay at Desk Service Charge (5%)',
                'itemName', 'Pay at Desk Service Charge (5%)',
                'name', 'Pay at Desk Service Charge (5%)',
                'quantity', 1,
                'price', v_charge,
                'total', v_charge
            )
        );
        NEW.total_amount := GREATEST(
            COALESCE(NEW.total_amount, 0.00),
            ROUND(v_items_sum + v_charge, 2),
            v_expected_total
        );
    ELSE
        NEW.total_amount := GREATEST(COALESCE(NEW.total_amount, 0.00), v_expected_total);
    END IF;

    IF LOWER(COALESCE(NEW.payment_status, '')) = 'paid' THEN
        NEW.paid_amount := GREATEST(COALESCE(NEW.paid_amount, 0.00), NEW.total_amount);
        NEW.balance_due := 0.00;
    ELSE
        NEW.paid_amount := COALESCE(NEW.paid_amount, 0.00);
        NEW.balance_due := GREATEST(0.00, ROUND(NEW.total_amount - NEW.paid_amount, 2));
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_invoices_z_enforce_pay_at_desk_totals ON public.billing_invoices;
CREATE TRIGGER billing_invoices_z_enforce_pay_at_desk_totals
BEFORE INSERT OR UPDATE ON public.billing_invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pay_at_desk_invoice_totals();

-- 3. Backfill Existing PAY_AT_DESK billing_invoices Missing the 5% Service Charge
DO $$
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    -- Touching updated_at fires BEFORE UPDATE trigger billing_invoices_z_enforce_pay_at_desk_totals
    UPDATE public.billing_invoices bi
    SET payment_status = CASE
            WHEN LOWER(COALESCE(bi.payment_status, '')) = 'paid'
              OR LOWER(COALESCE(a.payment_status, '')) = 'paid' THEN 'paid'
            ELSE COALESCE(bi.payment_status, a.payment_status, 'pending')
        END,
        paid_at = CASE
            WHEN (LOWER(COALESCE(bi.payment_status, '')) = 'paid' OR LOWER(COALESCE(a.payment_status, '')) = 'paid')
            THEN COALESCE(bi.paid_at, a.updated_at, NOW())
            ELSE bi.paid_at
        END,
        updated_at = NOW()
    FROM public.appointments a
    WHERE bi.appointment_id = a.id
      AND UPPER(COALESCE(a.payment_mode, '')) = 'PAY_AT_DESK'
      AND COALESCE(a.fee_amount, 0.00) > 0.00
      AND (
          COALESCE(bi.total_amount, 0.00) < COALESCE(a.total_amount, 0.00)
          OR NOT (LOWER(COALESCE(bi.items::TEXT, '')) LIKE '%service charge%')
          OR (
              LOWER(COALESCE(a.payment_status, '')) = 'paid'
              AND (
                  LOWER(COALESCE(bi.payment_status, '')) <> 'paid'
                  OR COALESCE(bi.paid_amount, 0.00) < COALESCE(a.total_amount, 0.00)
              )
          )
      );
END $$;

-- 4. Backfill Historical invoice_transactions Missing the 5% Commission Amount
UPDATE public.invoice_transactions it
SET amount = GREATEST(COALESCE(it.amount, 0.00), COALESCE(bi.total_amount, a.total_amount, it.amount)),
    notes = CASE
        WHEN COALESCE(it.notes, '') = '' THEN
            'Pay at Desk Collection (Includes 5% Commission: NPR ' || COALESCE(a.service_charge_amount, 0)::TEXT || ')'
        ELSE it.notes
    END
FROM public.appointments a
LEFT JOIN public.billing_invoices bi ON bi.appointment_id = a.id
WHERE it.appointment_id = a.id
  AND UPPER(COALESCE(a.payment_mode, '')) = 'PAY_AT_DESK'
  AND COALESCE(a.total_amount, 0.00) > COALESCE(a.fee_amount, 0.00)
  AND UPPER(COALESCE(it.transaction_type, 'PAYMENT')) = 'PAYMENT'
  AND COALESCE(NULLIF(it.category, ''), 'CONSULTATION') = 'CONSULTATION'
  AND COALESCE(it.amount, 0.00) < COALESCE(a.total_amount, 0.00);

-- 5. Update mark_pay_at_desk_collected() so existing invoices always upgrade items + txns cleanly
CREATE OR REPLACE FUNCTION public.mark_pay_at_desk_collected(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt public.appointments%ROWTYPE;
    v_pct NUMERIC := 5.0;
    v_fee NUMERIC(10, 2);
    v_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_invoice_id UUID;
    v_existing_inv public.billing_invoices%ROWTYPE;
    v_final_inv_total NUMERIC(10, 2);
    v_items JSONB;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    IF p_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Appointment ID cannot be null';
    END IF;

    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    IF NOT (
        (auth.jwt() ->> 'role') = 'service_role'
        OR public.is_admin_portal_user()
        OR public.is_authorized_clinic_staff(v_appt.clinic_id)
        OR (p_clinic_id IS NOT NULL AND v_appt.clinic_id = p_clinic_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized for clinic %', v_appt.clinic_id;
    END IF;

    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID';
    END IF;

    BEGIN
        v_pct := COALESCE(public.get_pay_at_desk_service_charge_percent(), 5.0);
    EXCEPTION WHEN OTHERS THEN
        v_pct := 5.0;
    END;

    v_fee := COALESCE(v_appt.fee_amount, 0.00);
    IF v_fee <= 0 AND v_appt.doctor_id IS NOT NULL THEN
        SELECT COALESCE(consultation_fee, 500.00) INTO v_fee
        FROM public.doctors
        WHERE id = v_appt.doctor_id;
    END IF;
    v_fee := COALESCE(v_fee, 0.00);

    IF v_fee > 0 THEN
        v_charge := CASE
            WHEN COALESCE(v_appt.service_charge_amount, 0) > 0 THEN v_appt.service_charge_amount
            ELSE ROUND(v_fee * (v_pct / 100.0), 2)
        END;
        v_total := CASE
            WHEN COALESCE(v_appt.total_amount, 0) > v_fee THEN v_appt.total_amount
            ELSE ROUND(v_fee + v_charge, 2)
        END;
    ELSE
        v_charge := 0.00;
        v_total := 0.00;
    END IF;

    UPDATE public.appointments
    SET payment_mode = 'PAY_AT_DESK',
        payment_status = 'paid',
        fee_amount = v_fee,
        service_charge_amount = v_charge,
        total_amount = v_total,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Synchronize billing_invoices (trigger also guarantees 5% service charge line item)
    SELECT * INTO v_existing_inv
    FROM public.billing_invoices
    WHERE appointment_id = v_appt.id
    FOR UPDATE;

    v_items := jsonb_build_array(
        jsonb_build_object(
            'item_name', 'OPD Consultation Fee',
            'itemName', 'OPD Consultation Fee',
            'name', 'OPD Consultation Fee',
            'quantity', 1,
            'price', v_fee,
            'total', v_fee
        ),
        jsonb_build_object(
            'item_name', 'Pay at Desk Service Charge (5%)',
            'itemName', 'Pay at Desk Service Charge (5%)',
            'name', 'Pay at Desk Service Charge (5%)',
            'quantity', 1,
            'price', v_charge,
            'total', v_charge
        )
    );

    IF NOT FOUND THEN
        INSERT INTO public.billing_invoices (
            appointment_id, clinic_id, items, total_amount, paid_amount, balance_due,
            payment_status, paid_at, remarks, updated_at
        ) VALUES (
            v_appt.id, v_appt.clinic_id, v_items, v_total, v_total, 0.00,
            'paid', NOW(), 'Paid at Clinic Desk (Includes 5% Platform Service Charge)', NOW()
        )
        RETURNING id, total_amount INTO v_invoice_id, v_final_inv_total;
    ELSE
        UPDATE public.billing_invoices
        SET items = CASE
                WHEN jsonb_array_length(COALESCE(v_existing_inv.items, '[]'::jsonb)) = 0 THEN v_items
                ELSE v_existing_inv.items
            END,
            total_amount = GREATEST(COALESCE(v_existing_inv.total_amount, 0.00), v_total),
            paid_amount = GREATEST(COALESCE(v_existing_inv.paid_amount, 0.00), COALESCE(v_existing_inv.total_amount, 0.00), v_total),
            balance_due = 0.00,
            payment_status = 'paid',
            paid_at = COALESCE(v_existing_inv.paid_at, NOW()),
            updated_at = NOW()
        WHERE id = v_existing_inv.id
        RETURNING id, total_amount INTO v_invoice_id, v_final_inv_total;
    END IF;

    -- Synchronize invoice_transactions audit log idempotently (upgrade existing row if base-fee only)
    IF v_invoice_id IS NOT NULL AND v_final_inv_total > 0 THEN
        UPDATE public.invoice_transactions
        SET amount = GREATEST(COALESCE(amount, 0.00), v_final_inv_total),
            notes = 'Pay at Desk Collection (Includes 5% Commission: NPR ' || v_charge::TEXT || ')',
            reference_id = COALESCE(reference_id, v_appt.tracking_code_10_digit, v_appt.id::TEXT),
            category = COALESCE(NULLIF(category, ''), 'CONSULTATION')
        WHERE appointment_id = v_appt.id
          AND UPPER(COALESCE(payment_method, '')) IN ('PAY_AT_DESK', 'CASH');

        IF NOT FOUND THEN
            INSERT INTO public.invoice_transactions (
                invoice_id, clinic_id, appointment_id, transaction_type, amount,
                payment_method, reference_id, category, notes, transaction_time
            ) VALUES (
                v_invoice_id,
                v_appt.clinic_id,
                v_appt.id,
                'PAYMENT',
                v_final_inv_total,
                'PAY_AT_DESK',
                COALESCE(v_appt.tracking_code_10_digit, v_appt.id::TEXT),
                'CONSULTATION',
                'Pay at Desk Collection (Includes 5% Commission: NPR ' || v_charge::TEXT || ')',
                NOW()
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'payment_status', 'paid',
        'fee_amount', v_fee,
        'service_charge_amount', v_charge,
        'total_amount', v_final_inv_total,
        'invoice_id', v_invoice_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
