-- ==============================================================================
-- Migration: Enforce 5% Pay-at-Desk Commission Totals & Collection Sync
-- File: supabase/migration_fix_pay_at_desk_commission_and_totals.sql
--
-- Fixes:
--   1. Ensures every PAY_AT_DESK appointment strictly stores:
--        service_charge_amount = ROUND(fee_amount * 5%, 2)
--        total_amount          = fee_amount + service_charge_amount
--   2. Backfills existing PAY_AT_DESK appointments where service_charge_amount = 0
--      or total_amount <= fee_amount so Clinic, Patient, and Super Admin show the
--      full amount including the 5% platform commission.
--   3. Adds authoritative RPC mark_pay_at_desk_collected(p_appointment_id, p_clinic_id)
--      which marks the appointment paid, enforces 5% commission totals, and
--      synchronizes billing_invoices and invoice_transactions.
-- ==============================================================================

-- 1. Trigger Function: Enforce 5% Commission on PAY_AT_DESK Appointments
-- Named with `_z_` prefix so it executes AFTER anti-tampering triggers.
CREATE OR REPLACE FUNCTION public.enforce_pay_at_desk_commission_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_pct NUMERIC := 5.0;
    v_fee NUMERIC(10, 2);
    v_charge NUMERIC(10, 2);
BEGIN
    IF UPPER(COALESCE(NEW.payment_mode, '')) = 'PAY_AT_DESK' THEN
        v_fee := COALESCE(NEW.fee_amount, 0.00);
        IF v_fee > 0 THEN
            IF TG_OP = 'INSERT'
               OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
               OR NEW.fee_amount IS DISTINCT FROM OLD.fee_amount
               OR COALESCE(NEW.service_charge_amount, 0.00) <= 0.00
               OR COALESCE(NEW.total_amount, 0.00) <= v_fee THEN
                BEGIN
                    v_pct := COALESCE(public.get_pay_at_desk_service_charge_percent(), 5.0);
                EXCEPTION WHEN OTHERS THEN
                    v_pct := 5.0;
                END;
                v_charge := ROUND(v_fee * (v_pct / 100.0), 2);
                NEW.service_charge_amount := v_charge;
                NEW.total_amount := ROUND(v_fee + v_charge, 2);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_z_enforce_pay_at_desk_commission ON public.appointments;
CREATE TRIGGER appointments_z_enforce_pay_at_desk_commission
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pay_at_desk_commission_totals();

-- 2. Backfill Historical PAY_AT_DESK Appointments Missing 5% Commission Breakdown
DO $$
DECLARE
    v_pct NUMERIC := 5.0;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);
    BEGIN
        v_pct := COALESCE(public.get_pay_at_desk_service_charge_percent(), 5.0);
    EXCEPTION WHEN OTHERS THEN
        v_pct := 5.0;
    END;

    UPDATE public.appointments
    SET
        service_charge_amount = ROUND(fee_amount * (v_pct / 100.0), 2),
        total_amount = ROUND(fee_amount + ROUND(fee_amount * (v_pct / 100.0), 2), 2),
        updated_at = NOW()
    WHERE UPPER(COALESCE(payment_mode, '')) = 'PAY_AT_DESK'
      AND COALESCE(fee_amount, 0) > 0
      AND (
          COALESCE(service_charge_amount, 0) <= 0
          OR COALESCE(total_amount, 0) <= fee_amount
      );
END $$;

-- 3. Authoritative RPC: Mark Pay at Desk Payment Collected at Clinic Counter
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

    -- Synchronize billing_invoices so patient/clinic bills match fee + 5% commission
    SELECT * INTO v_existing_inv
    FROM public.billing_invoices
    WHERE appointment_id = v_appt.id
    FOR UPDATE;

    v_items := jsonb_build_array(
        jsonb_build_object(
            'item_name', 'OPD Consultation Fee',
            'quantity', 1,
            'price', v_fee,
            'total', v_fee
        ),
        jsonb_build_object(
            'item_name', 'Pay at Desk Service Charge (5%)',
            'quantity', 1,
            'price', v_charge,
            'total', v_charge
        )
    );

    IF NOT FOUND THEN
        v_final_inv_total := v_total;
        INSERT INTO public.billing_invoices (
            appointment_id, clinic_id, items, total_amount, paid_amount, balance_due,
            payment_status, paid_at, remarks, updated_at
        ) VALUES (
            v_appt.id, v_appt.clinic_id, v_items, v_final_inv_total, v_final_inv_total, 0.00,
            'paid', NOW(), 'Paid at Clinic Desk (Includes 5% Platform Service Charge)', NOW()
        )
        RETURNING id INTO v_invoice_id;
    ELSE
        v_final_inv_total := GREATEST(COALESCE(v_existing_inv.total_amount, 0.00), v_total);
        UPDATE public.billing_invoices
        SET items = CASE
                WHEN jsonb_array_length(COALESCE(v_existing_inv.items, '[]'::jsonb)) = 0 THEN v_items
                ELSE v_existing_inv.items
            END,
            total_amount = v_final_inv_total,
            paid_amount = GREATEST(COALESCE(v_existing_inv.paid_amount, 0.00), v_final_inv_total),
            balance_due = 0.00,
            payment_status = 'paid',
            paid_at = COALESCE(v_existing_inv.paid_at, NOW()),
            updated_at = NOW()
        WHERE id = v_existing_inv.id
        RETURNING id INTO v_invoice_id;
    END IF;

    -- Synchronize invoice_transactions audit log idempotently
    IF v_invoice_id IS NOT NULL AND v_final_inv_total > 0 THEN
        INSERT INTO public.invoice_transactions (
            invoice_id, clinic_id, appointment_id, transaction_type, amount,
            payment_method, reference_id, category, notes, transaction_time
        )
        SELECT
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
        WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_transactions it
            WHERE it.appointment_id = v_appt.id
              AND UPPER(COALESCE(it.payment_method, '')) = 'PAY_AT_DESK'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appt.id,
        'payment_status', 'paid',
        'fee_amount', v_fee,
        'service_charge_amount', v_charge,
        'total_amount', v_total,
        'invoice_id', v_invoice_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
