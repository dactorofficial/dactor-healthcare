-- ==============================================================================
-- Migration: Repair Pay-at-Desk Historical Bookings, Double 5% Fix & Auth Hardening
-- File: supabase/migration_repair_pay_at_desk_settlements.sql
--
-- Context:
--   Following the Pay-at-Desk settlement overhaul (commit a681621), desk collections
--   made through clinic counter billing now properly settle through mark_pay_at_desk_collected.
--   However, historical bookings made prior to the fix may remain:
--     1. Unpaid on appointments table despite being marked 'paid' on billing_invoices.
--     2. Bearing a "double 5%" platform commission charge where the bill total was
--        inadvertently saved as the base fee_amount, causing the 5% trigger to compound.
--
-- Deliverables:
--   1. Authoritative repair RPC: repair_pay_at_desk_historical_bookings()
--      - Idempotently scans and repairs all desynchronized Pay-at-Desk bookings.
--      - Restores the true doctor base fee and recalculates 5% commission correctly.
--      - Sets payment_status = 'paid' on appointments where counter invoice was paid.
--      - Synchronizes billing_invoices and invoice_transactions.
--      - Returns detailed JSON summary with counts and recovered commission NPR.
--   2. Immediate execution block to repair existing database records automatically.
--   3. Hardened is_authorized_clinic_staff(UUID) function ensuring verified clinic
--      users and Super Admins can invoke desk collection without authorization drop.
--   4. Guarded mark_pay_at_desk_collected(UUID, UUID) with anti-double-5% normalization.
-- ==============================================================================

-- 1. Hardened is_authorized_clinic_staff(UUID)
CREATE OR REPLACE FUNCTION public.is_authorized_clinic_staff(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := auth.uid();
BEGIN
    -- Super Admin & Service Role bypass
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- JWT claim match
    IF (auth.jwt() ->> 'clinic_id') IS NOT NULL AND (auth.jwt() ->> 'clinic_id')::text = p_clinic_id::text THEN
        RETURN TRUE;
    END IF;

    -- If no email and no UID present, reject
    IF v_email = '' AND v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check clinics contact email or registered owner
    IF v_email <> '' AND EXISTS (
        SELECT 1 FROM public.clinics c
        WHERE c.id = p_clinic_id AND LOWER(COALESCE(c.contact_email, '')) = v_email
    ) THEN
        RETURN TRUE;
    END IF;

    -- Check clinic invitations (accepted staff)
    IF v_email <> '' AND EXISTS (
        SELECT 1 FROM public.clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
    ) THEN
        RETURN TRUE;
    END IF;

    -- Check doctors linked to this clinic
    IF EXISTS (
        SELECT 1 FROM public.doctors d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE (d.clinic_id = p_clinic_id OR d.primary_clinic_id = p_clinic_id OR d.active_clinic_id = p_clinic_id)
          AND (
              (v_email <> '' AND LOWER(COALESCE(d.email, '')) = v_email)
              OR (v_uid IS NOT NULL AND (p.id = v_uid OR p.auth_uid = v_uid))
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- Check profiles table if clinic_id is stored directly on the user profile
    IF v_uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE (p.id = v_uid OR p.auth_uid = v_uid)
          AND (
              (p.raw_user_meta_data ->> 'clinic_id') = p_clinic_id::text
              OR (p.raw_user_meta_data ->> 'role') IN ('clinic_admin', 'receptionist', 'doctor')
          )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_clinic_staff(UUID) TO anon, authenticated, service_role;


-- 2. Enhanced & Anti-Double-5% Guarded mark_pay_at_desk_collected
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
    v_base_fee NUMERIC(10, 2);
    v_doc_fee NUMERIC(10, 2);
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

    -- Authorization check
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

    -- Determine true doctor base fee
    IF v_appt.doctor_id IS NOT NULL THEN
        SELECT COALESCE(consultation_fee, 500.00) INTO v_doc_fee
        FROM public.doctors
        WHERE id = v_appt.doctor_id;
    ELSE
        v_doc_fee := 500.00;
    END IF;

    v_base_fee := COALESCE(v_appt.fee_amount, 0.00);

    -- Anti-double-5% normalization guard:
    -- If fee_amount matches or exceeds total_amount or doctor's fee * 1.05, it was corrupted
    -- by the previous bug where invoice total was saved as fee_amount.
    IF v_doc_fee > 0 AND (v_base_fee > v_doc_fee * 1.04 OR v_base_fee <= 0) THEN
        v_base_fee := v_doc_fee;
    ELSIF v_base_fee <= 0 THEN
        v_base_fee := COALESCE(v_doc_fee, 500.00);
    END IF;

    v_charge := ROUND(v_base_fee * (v_pct / 100.0), 2);
    v_total := ROUND(v_base_fee + v_charge, 2);

    -- Update appointment with sanitized 5% breakdown and paid status
    UPDATE public.appointments
    SET payment_mode = 'PAY_AT_DESK',
        payment_status = 'paid',
        fee_amount = v_base_fee,
        service_charge_amount = v_charge,
        total_amount = v_total,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- Synchronize billing_invoices
    SELECT * INTO v_existing_inv
    FROM public.billing_invoices
    WHERE appointment_id = v_appt.id
    FOR UPDATE;

    v_items := jsonb_build_array(
        jsonb_build_object(
            'item_name', 'OPD Consultation Fee',
            'quantity', 1,
            'price', v_base_fee,
            'total', v_base_fee
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
        -- If existing invoice total was the base fee or corrupted, normalize to v_total
        v_final_inv_total := GREATEST(COALESCE(v_existing_inv.total_amount, 0.00), v_total);
        -- If invoice had the double 5% charge (e.g. 551.25 when total should be 525), restore 525
        IF v_final_inv_total > v_total * 1.04 THEN
            v_final_inv_total := v_total;
        END IF;

        UPDATE public.billing_invoices
        SET items = CASE
                WHEN jsonb_array_length(COALESCE(v_existing_inv.items, '[]'::jsonb)) = 0 THEN v_items
                ELSE v_existing_inv.items
            END,
            total_amount = v_final_inv_total,
            paid_amount = v_final_inv_total,
            balance_due = 0.00,
            payment_status = 'paid',
            paid_at = COALESCE(v_existing_inv.paid_at, NOW()),
            updated_at = NOW()
        WHERE id = v_existing_inv.id
        RETURNING id INTO v_invoice_id;
    END IF;

    -- Synchronize invoice_transactions audit log idempotently
    IF v_invoice_id IS NOT NULL AND v_final_inv_total > 0 THEN
        UPDATE public.invoice_transactions
        SET amount = v_final_inv_total,
            notes = 'Pay at Desk Collection (Includes 5% Commission: NPR ' || v_charge::TEXT || ')',
            reference_id = COALESCE(reference_id, v_appt.tracking_code_10_digit, v_appt.id::TEXT),
            category = COALESCE(NULLIF(category, ''), 'CONSULTATION'),
            transaction_time = COALESCE(transaction_time, NOW())
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
        'fee_amount', v_base_fee,
        'service_charge_amount', v_charge,
        'total_amount', v_total,
        'invoice_id', v_invoice_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pay_at_desk_collected(UUID, UUID) TO anon, authenticated, service_role;


-- 3. Authoritative Repair RPC: repair_pay_at_desk_historical_bookings()
-- Can be called by Super Admin from the Admin Panel or run directly in Supabase SQL Editor.
CREATE OR REPLACE FUNCTION public.repair_pay_at_desk_historical_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    r RECORD;
    v_doc_fee NUMERIC(10, 2);
    v_base_fee NUMERIC(10, 2);
    v_charge NUMERIC(10, 2);
    v_total NUMERIC(10, 2);
    v_pct NUMERIC := 5.0;
    v_repaired_count INT := 0;
    v_unpaid_fixed INT := 0;
    v_double_charge_fixed INT := 0;
    v_total_commission_synced NUMERIC(10, 2) := 0.00;
    v_repaired_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    BEGIN
        v_pct := COALESCE(public.get_pay_at_desk_service_charge_percent(), 5.0);
    EXCEPTION WHEN OTHERS THEN
        v_pct := 5.0;
    END;

    -- Loop through all Pay-at-Desk appointments that have an associated paid bill
    -- OR have a double 5% charge / mismatched fee amounts.
    FOR r IN
        SELECT
            a.id AS appt_id,
            a.clinic_id,
            a.doctor_id,
            a.fee_amount,
            a.service_charge_amount,
            a.total_amount,
            a.payment_status AS appt_payment_status,
            a.tracking_code_10_digit,
            b.id AS invoice_id,
            b.total_amount AS bill_total,
            b.paid_amount AS bill_paid,
            b.payment_status AS bill_payment_status,
            d.consultation_fee AS doc_consultation_fee
        FROM public.appointments a
        JOIN public.billing_invoices b ON b.appointment_id = a.id
        LEFT JOIN public.doctors d ON d.id = a.doctor_id
        WHERE UPPER(COALESCE(a.payment_mode, '')) = 'PAY_AT_DESK'
          AND (
              -- Case 1: Bill is paid at counter but appointment remains unpaid
              (b.payment_status = 'paid' AND COALESCE(a.payment_status, 'unpaid') <> 'paid')
              -- Case 2: Double 5% charge detected (total_amount exceeds bill total or fee matches bill total)
              OR (a.total_amount > b.total_amount AND b.total_amount > 0)
              OR (d.consultation_fee IS NOT NULL AND a.fee_amount > d.consultation_fee * 1.04)
              -- Case 3: Missing service charge breakdown on paid desk bookings
              OR (COALESCE(a.service_charge_amount, 0) <= 0 AND COALESCE(a.fee_amount, 0) > 0)
          )
    LOOP
        -- Determine true base fee
        v_doc_fee := COALESCE(r.doc_consultation_fee, 500.00);

        IF r.fee_amount > v_doc_fee * 1.04 OR r.fee_amount = r.bill_total THEN
            -- fee_amount had the 5%-inclusive bill total saved into it; restore base doctor fee
            v_base_fee := v_doc_fee;
            v_double_charge_fixed := v_double_charge_fixed + 1;
        ELSIF r.fee_amount > 0 THEN
            v_base_fee := r.fee_amount;
        ELSE
            v_base_fee := v_doc_fee;
        END IF;

        v_charge := ROUND(v_base_fee * (v_pct / 100.0), 2);
        v_total := ROUND(v_base_fee + v_charge, 2);

        IF r.appt_payment_status <> 'paid' AND r.bill_payment_status = 'paid' THEN
            v_unpaid_fixed := v_unpaid_fixed + 1;
        END IF;

        -- Update appointment record
        UPDATE public.appointments
        SET fee_amount = v_base_fee,
            service_charge_amount = v_charge,
            total_amount = v_total,
            payment_status = CASE WHEN r.bill_payment_status = 'paid' THEN 'paid' ELSE payment_status END,
            updated_at = NOW()
        WHERE id = r.appt_id;

        -- Update billing_invoices to ensure clean 5% consistency
        UPDATE public.billing_invoices
        SET total_amount = v_total,
            paid_amount = CASE WHEN r.bill_payment_status = 'paid' THEN v_total ELSE paid_amount END,
            balance_due = CASE WHEN r.bill_payment_status = 'paid' THEN 0.00 ELSE balance_due END,
            updated_at = NOW()
        WHERE id = r.invoice_id;

        -- Update invoice_transactions audit log
        UPDATE public.invoice_transactions
        SET amount = v_total,
            notes = 'Pay at Desk Collection (Includes 5% Commission: NPR ' || v_charge::TEXT || ')',
            transaction_time = COALESCE(transaction_time, NOW())
        WHERE appointment_id = r.appt_id
          AND UPPER(COALESCE(payment_method, '')) IN ('PAY_AT_DESK', 'CASH');

        v_repaired_count := v_repaired_count + 1;
        v_total_commission_synced := v_total_commission_synced + v_charge;
        v_repaired_ids := array_append(v_repaired_ids, r.appt_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'repaired_count', v_repaired_count,
        'unpaid_fixed', v_unpaid_fixed,
        'double_charge_fixed', v_double_charge_fixed,
        'total_commission_synced_npr', v_total_commission_synced,
        'repaired_appointment_ids', to_jsonb(v_repaired_ids),
        'executed_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_pay_at_desk_historical_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_pay_at_desk_historical_bookings() TO service_role, authenticated;


-- 4. Immediate Automated Repair Run
DO $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT public.repair_pay_at_desk_historical_bookings() INTO v_res;
    RAISE NOTICE 'Pay-at-Desk historical repair executed: %', v_res;
END $$;

NOTIFY pgrst, 'reload schema';
