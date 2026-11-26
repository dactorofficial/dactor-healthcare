-- =============================================================================
-- DACTOR PLATFORM: Fix eSewa / Online Payment Live Queue Transfer,
-- Payment Method Attribution & Visit Type (NEW vs FOLLOW-UP)
-- =============================================================================

-- 1. Ensure required columns & constraints on appointments
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS visit_type TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_of_appointment_id UUID,
    ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$
BEGIN
    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_mode;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_payment_mode
        CHECK (UPPER(payment_mode) IN (
            'ONLINE', 'PAY_AT_DESK', 'DESK', 'CASH', 'FREE',
            'ESEWA', 'KHALTI', 'FONEPAY', 'CONNECTIPS'
        ));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Default visit_type trigger on INSERT so new bookings are explicitly 'new'
CREATE OR REPLACE FUNCTION public.trg_appointments_default_visit_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.visit_type IS NULL OR trim(NEW.visit_type) = '' THEN
        IF COALESCE(NEW.attempt_number, 1) > 1
           OR NEW.follow_up_of_appointment_id IS NOT NULL
           OR UPPER(COALESCE(NEW.payment_mode, '')) = 'FREE'
           OR COALESCE(NEW.notes, '') ~* 'follow[- ]?up' THEN
            NEW.visit_type := 'follow_up';
        ELSE
            NEW.visit_type := 'new';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_default_visit_type ON public.appointments;
CREATE TRIGGER appointments_default_visit_type
    BEFORE INSERT ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_appointments_default_visit_type();

-- 3. Unified Atomic Payment Finalization RPC (Idempotent + Self-Healing + Lab/Doctor Scoped)
CREATE OR REPLACE FUNCTION public.finalize_online_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    v_is_lab BOOLEAN := FALSE;
    v_effective_doc_id UUID;
    v_today DATE := public.dactor_today();
    v_visit_type TEXT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    SELECT * INTO attempt
    FROM public.appointment_payment_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND OR round(attempt.amount_npr, 2) <> round(p_verified_amount, 2) THEN
        RETURN FALSE;
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
    v_effective_ref := COALESCE(
        NULLIF(trim(p_provider_reference), ''),
        NULLIF(trim(attempt.provider_reference), ''),
        attempt.transaction_uuid
    );
    v_is_lab := public.is_diagnostic_lab_clinic(appt.clinic_id) OR appt.selected_lab_tests IS NOT NULL;
    v_effective_doc_id := CASE WHEN v_is_lab THEN NULL ELSE appt.doctor_id END;
    v_visit_type := COALESCE(
        NULLIF(trim(appt.visit_type), ''),
        CASE
            WHEN COALESCE(appt.attempt_number, 1) > 1
                 OR appt.follow_up_of_appointment_id IS NOT NULL
                 OR COALESCE(appt.notes, '') ~* 'follow[- ]?up'
            THEN 'follow_up'
            ELSE 'new'
        END
    );

    -- Guard against finalizing cancelled/terminal unpaid attempts unless already paid
    IF attempt.status <> 'complete' AND appt.payment_status::text <> 'paid' THEN
        IF appt.checkin_status::text NOT IN ('not_checked_in', 'checked_in', 'waiting', 'cancelled')
           OR appt.payment_status::text NOT IN ('pending', 'unpaid', 'failed') THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- 3a. Authoritatively approve & mark paid (also self-heals previously stuck 'pending_payment' rows)
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = COALESCE(approved_at, NOW()),
        payment_status = 'paid',
        checkin_status = CASE
            WHEN checkin_status::text IN ('completed', 'done', 'cancelled') THEN checkin_status
            ELSE 'checked_in'::public.checkin_status_enum
        END,
        payment_mode = 'ONLINE',
        fee_amount = CASE WHEN COALESCE(fee_amount, 0) <= 0 THEN attempt.amount_npr ELSE fee_amount END,
        total_amount = CASE WHEN COALESCE(total_amount, 0) <= 0 THEN attempt.amount_npr ELSE total_amount END,
        doctor_id = CASE WHEN v_is_lab THEN NULL ELSE doctor_id END,
        visit_type = v_visit_type,
        expires_at = NULL,
        gateway_backstop_expires_at = NULL,
        updated_at = NOW()
    WHERE id = appt.id;

    -- 3b. Reconcile slot booked_count (active approved bookings only)
    IF appt.slot_id IS NOT NULL THEN
        UPDATE public.slots
        SET booked_count = (
            SELECT COUNT(*) FROM public.appointments
            WHERE slot_id = appt.slot_id
              AND checkin_status::text <> 'cancelled'
              AND UPPER(COALESCE(status, '')) IN ('APPROVED', 'CONFIRMED', 'PENDING_PAYMENT', 'WAITING_FOR_APPROVAL')
        )
        WHERE id = appt.slot_id;
    END IF;

    -- Cancel any lingering unapproved Pay at Desk requests for the exact same patient/clinic/date
    UPDATE public.appointments
    SET status = 'CANCELLED',
        checkin_status = 'cancelled',
        updated_at = NOW()
    WHERE clinic_id = appt.clinic_id
      AND patient_mobile = appt.patient_mobile
      AND appointment_date = appt.appointment_date
      AND LOWER(TRIM(patient_name)) = LOWER(TRIM(appt.patient_name))
      AND UPPER(COALESCE(payment_mode, '')) = 'PAY_AT_DESK'
      AND status = 'WAITING_FOR_APPROVAL'
      AND id <> appt.id;

    -- 3c. Issue live queue token idempotently for today's visits (Lab single queue OR Doctor-isolated queue)
    IF appt.appointment_date = v_today
       AND LOWER(COALESCE(appt.checkin_status::text, '')) NOT IN ('completed', 'done', 'cancelled', 'no_show') THEN
        SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO next_position
        FROM public.queue_entries qe
        JOIN public.appointments a ON a.id = qe.appointment_id
        WHERE qe.clinic_id = appt.clinic_id
          AND a.appointment_date = appt.appointment_date
          AND (
              (v_is_lab = TRUE AND qe.doctor_id IS NULL)
              OR (v_is_lab = FALSE AND (
                  (v_effective_doc_id IS NOT NULL AND qe.doctor_id = v_effective_doc_id)
                  OR (v_effective_doc_id IS NULL AND qe.doctor_id IS NULL)
              ))
          );

        INSERT INTO public.queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
        VALUES (appt.id, appt.clinic_id, v_effective_doc_id, next_position, 'waiting')
        ON CONFLICT (appointment_id) DO UPDATE SET
            doctor_id = EXCLUDED.doctor_id,
            updated_at = NOW();
    END IF;

    SELECT queue_position INTO assigned_position
    FROM public.queue_entries
    WHERE appointment_id = appt.id
    LIMIT 1;

    -- 3d. Upsert billing invoice with explicit gateway label (never CASH)
    INSERT INTO public.billing_invoices (
        appointment_id, clinic_id, total_amount, paid_amount, balance_due,
        payment_status, paid_at, remarks
    ) VALUES (
        appt.id, appt.clinic_id, attempt.amount_npr, attempt.amount_npr, 0,
        'paid', NOW(), 'Paid via ' || v_gateway_label || '; provider reference: ' || v_effective_ref
    ) ON CONFLICT (appointment_id) DO UPDATE SET
        total_amount = GREATEST(public.billing_invoices.total_amount, EXCLUDED.total_amount),
        paid_amount = GREATEST(public.billing_invoices.paid_amount, EXCLUDED.paid_amount),
        balance_due = GREATEST(0, GREATEST(public.billing_invoices.total_amount, EXCLUDED.total_amount) - GREATEST(public.billing_invoices.paid_amount, EXCLUDED.paid_amount)),
        payment_status = 'paid',
        paid_at = COALESCE(public.billing_invoices.paid_at, NOW()),
        remarks = CASE
            WHEN COALESCE(public.billing_invoices.remarks, '') = '' THEN EXCLUDED.remarks
            WHEN public.billing_invoices.remarks ILIKE '%' || v_gateway_label || '%' THEN public.billing_invoices.remarks
            ELSE EXCLUDED.remarks
        END,
        updated_at = NOW()
    RETURNING id INTO v_invoice_id;

    -- 3e. Insert immutable financial ledger entry with explicit gateway payment_method
    IF v_invoice_id IS NOT NULL AND to_regclass('public.invoice_transactions') IS NOT NULL THEN
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
            CASE WHEN v_is_lab THEN 'DIAGNOSTIC' ELSE 'CONSULTATION' END,
            'Online ' || v_gateway_label || ' Appointment Checkout',
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_transactions it
            WHERE it.appointment_id = appt.id
              AND (
                  it.reference_id = v_effective_ref
                  OR UPPER(COALESCE(it.payment_method, '')) = v_gateway_upper
              )
        );
    END IF;

    -- 3f. Finalize payment attempt row
    UPDATE public.appointment_payment_attempts
    SET status = 'complete',
        provider_reference = v_effective_ref,
        updated_at = NOW()
    WHERE id = attempt.id;

    -- 3g. Emit confirmation notification idempotently
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
        NULL;
    END;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_esewa_appointment_payment(
    p_attempt_id UUID,
    p_provider_reference TEXT,
    p_verified_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.finalize_online_appointment_payment(p_attempt_id, p_provider_reference, p_verified_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_online_appointment_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_online_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_esewa_appointment_payment(UUID, TEXT, NUMERIC) TO service_role;

-- 4. One-Time Idempotent Data Repair for Paid Online Appointments Stuck in pending_payment / CASH / NULL visit_type
DO $$
DECLARE
    v_today DATE := public.dactor_today();
    r_appt RECORD;
    v_is_lab BOOLEAN;
    v_eff_doc UUID;
    v_next_pos INT;
    v_gw TEXT;
    v_ref TEXT;
BEGIN
    PERFORM set_config('dactor.authoritative_context', 'true', true);

    -- 4a. Promote paid ONLINE appointments stuck in pending_payment -> APPROVED
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = COALESCE(approved_at, updated_at, NOW()),
        payment_mode = 'ONLINE',
        checkin_status = CASE
            WHEN checkin_status::text IN ('completed', 'done', 'cancelled', 'no_show') THEN checkin_status
            ELSE 'checked_in'::public.checkin_status_enum
        END,
        expires_at = NULL,
        gateway_backstop_expires_at = NULL,
        updated_at = NOW()
    WHERE LOWER(COALESCE(payment_status::text, '')) = 'paid'
      AND UPPER(COALESCE(payment_mode, '')) = 'ONLINE'
      AND status = 'pending_payment';

    -- 4b. Backfill visit_type = 'new' for paid/first-attempt new consultations
    UPDATE public.appointments
    SET visit_type = 'new'
    WHERE (visit_type IS NULL OR trim(visit_type) = '')
      AND COALESCE(attempt_number, 1) = 1
      AND follow_up_of_appointment_id IS NULL
      AND COALESCE(fee_amount, 0) > 0
      AND UPPER(COALESCE(payment_mode, '')) <> 'FREE'
      AND COALESCE(notes, '') !~* 'follow[- ]?up';

    -- 4c. Ensure today's repaired APPROVED online appointments have a queue_entries row
    FOR r_appt IN
        SELECT a.*
        FROM public.appointments a
        WHERE a.appointment_date = v_today
          AND UPPER(COALESCE(a.status, '')) IN ('APPROVED', 'CONFIRMED')
          AND LOWER(COALESCE(a.checkin_status::text, '')) NOT IN ('completed', 'done', 'cancelled', 'no_show')
          AND NOT EXISTS (SELECT 1 FROM public.queue_entries qe WHERE qe.appointment_id = a.id)
    LOOP
        v_is_lab := public.is_diagnostic_lab_clinic(r_appt.clinic_id) OR r_appt.selected_lab_tests IS NOT NULL;
        v_eff_doc := CASE WHEN v_is_lab THEN NULL ELSE r_appt.doctor_id END;

        SELECT COALESCE(MAX(qe.queue_position), 0) + 1 INTO v_next_pos
        FROM public.queue_entries qe
        JOIN public.appointments a2 ON a2.id = qe.appointment_id
        WHERE qe.clinic_id = r_appt.clinic_id
          AND a2.appointment_date = r_appt.appointment_date
          AND (
              (v_is_lab = TRUE AND qe.doctor_id IS NULL)
              OR (v_is_lab = FALSE AND (
                  (v_eff_doc IS NOT NULL AND qe.doctor_id = v_eff_doc)
                  OR (v_eff_doc IS NULL AND qe.doctor_id IS NULL)
              ))
          );

        INSERT INTO public.queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
        VALUES (r_appt.id, r_appt.clinic_id, v_eff_doc, v_next_pos, 'waiting')
        ON CONFLICT (appointment_id) DO NOTHING;
    END LOOP;

    -- 4d. Backfill missing invoice_transactions & fix false CASH method on online gateway invoices
    IF to_regclass('public.invoice_transactions') IS NOT NULL THEN
        FOR r_appt IN
            SELECT
                bi.id AS invoice_id,
                bi.clinic_id,
                bi.appointment_id,
                bi.paid_amount,
                bi.paid_at,
                bi.remarks,
                a.payment_mode,
                a.selected_lab_tests,
                (
                    SELECT UPPER(apa.gateway)
                    FROM public.appointment_payment_attempts apa
                    WHERE apa.appointment_id = bi.appointment_id
                      AND apa.status = 'complete'
                    ORDER BY apa.updated_at DESC
                    LIMIT 1
                ) AS attempt_gateway,
                (
                    SELECT COALESCE(NULLIF(trim(apa.provider_reference), ''), apa.transaction_uuid)
                    FROM public.appointment_payment_attempts apa
                    WHERE apa.appointment_id = bi.appointment_id
                      AND apa.status = 'complete'
                    ORDER BY apa.updated_at DESC
                    LIMIT 1
                ) AS attempt_ref
            FROM public.billing_invoices bi
            JOIN public.appointments a ON a.id = bi.appointment_id
            WHERE COALESCE(a.is_deleted, FALSE) = FALSE
              AND bi.payment_status::text = 'paid'
              AND bi.paid_amount > 0
              AND UPPER(COALESCE(a.payment_mode, '')) = 'ONLINE'
        LOOP
            v_gw := COALESCE(
                r_appt.attempt_gateway,
                CASE
                    WHEN COALESCE(r_appt.remarks, '') ILIKE '%khalti%' THEN 'KHALTI'
                    WHEN COALESCE(r_appt.remarks, '') ILIKE '%fonepay%' THEN 'FONEPAY'
                    WHEN COALESCE(r_appt.remarks, '') ILIKE '%connectips%' THEN 'CONNECTIPS'
                    WHEN COALESCE(r_appt.remarks, '') ILIKE '%esewa%' THEN 'ESEWA'
                    ELSE 'ONLINE'
                END
            );
            v_ref := r_appt.attempt_ref;

            -- Fix any erroneously recorded CASH transaction on an online gateway invoice
            UPDATE public.invoice_transactions
            SET payment_method = v_gw,
                reference_id = COALESCE(reference_id, v_ref)
            WHERE appointment_id = r_appt.appointment_id
              AND UPPER(COALESCE(payment_method, '')) = 'CASH';

            -- Insert missing invoice_transactions row
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
                r_appt.invoice_id,
                r_appt.clinic_id,
                r_appt.appointment_id,
                'PAYMENT',
                r_appt.paid_amount,
                v_gw,
                v_ref,
                CASE WHEN r_appt.selected_lab_tests IS NOT NULL THEN 'DIAGNOSTIC' ELSE 'CONSULTATION' END,
                'Online ' || v_gw || ' Appointment Checkout',
                COALESCE(r_appt.paid_at, NOW())
            WHERE NOT EXISTS (
                SELECT 1 FROM public.invoice_transactions it
                WHERE it.appointment_id = r_appt.appointment_id
            );
        END LOOP;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
