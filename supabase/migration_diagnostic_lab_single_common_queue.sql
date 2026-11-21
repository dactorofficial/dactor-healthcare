-- ====================================================================
-- DACTOR PLATFORM: DIAGNOSTIC LAB SINGLE COMMON LIVE QUEUE MIGRATION
-- ====================================================================
-- Architectural Specification:
-- 1. For each particular Diagnostic Lab: There must NOT be multiple queues
--    (by doctor, technician, or test). All patients visiting that diagnostic
--    lab share ONE common unified live queue with sequential tokens #1, #2...
-- 2. Negative Constraint: Under NO circumstances should different diagnostic
--    labs be merged. Each individual lab (clinic_id) maintains its OWN
--    single common queue, completely isolated from any other diagnostic lab.
-- 3. OPD clinics with consulting doctors retain doctor-partitioned queues.
-- ====================================================================

-- 1. AUTHORITATIVE HELPER: Check if a clinic is a Diagnostic Lab
CREATE OR REPLACE FUNCTION public.is_diagnostic_lab_clinic(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_name TEXT;
    v_specialties TEXT[];
BEGIN
    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT type, name, specialties INTO v_type, v_name, v_specialties
    FROM public.clinics
    WHERE id = p_clinic_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF LOWER(COALESCE(v_type, '')) IN ('diagnostic_lab', 'lab', 'pathology_lab', 'imaging_center')
       OR LOWER(COALESCE(v_type, '')) ILIKE '%lab%'
       OR LOWER(COALESCE(v_type, '')) ILIKE '%diagnostic%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%lab%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%diagnostic%'
       OR LOWER(COALESCE(v_name, '')) ILIKE '%patholog%' THEN
        RETURN TRUE;
    END IF;

    IF v_specialties IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(v_specialties) s
        WHERE LOWER(s) ILIKE '%lab%'
           OR LOWER(s) ILIKE '%patholog%'
           OR LOWER(s) ILIKE '%diagnostic%'
           OR LOWER(s) ILIKE '%radiolog%'
           OR LOWER(s) ILIKE '%scan%'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_diagnostic_lab_clinic(UUID) TO anon, authenticated, service_role;

-- 2. UPDATE MULTI-GATEWAY FINALIZATION: Single Common Queue for Diagnostic Labs
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
    v_is_lab BOOLEAN := FALSE;
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

    v_is_lab := public.is_diagnostic_lab_clinic(appt.clinic_id) OR appt.selected_lab_tests IS NOT NULL;

    -- 3a. Mark appointment paid & checked_in & approved (even if patient closed app and paid in background)
    UPDATE public.appointments
    SET status = 'APPROVED',
        approved_at = COALESCE(approved_at, NOW()),
        payment_status = 'paid',
        checkin_status = 'checked_in',
        fee_amount = attempt.amount_npr,
        doctor_id = CASE WHEN v_is_lab THEN NULL ELSE doctor_id END,
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

    -- 3c. Issue live queue token:
    -- For Diagnostic Lab: SINGLE COMMON QUEUE for this clinic_id (Tokens 1..N across entire lab, no doctor partition)
    -- For Doctor Clinic: Partitioned by doctor_id
    IF v_is_lab THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
        FROM public.queue_entries
        WHERE clinic_id = appt.clinic_id
          AND status IN ('waiting', 'inside');

        INSERT INTO public.queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
        VALUES (appt.id, appt.clinic_id, NULL, next_position, 'waiting')
        ON CONFLICT (appointment_id) DO UPDATE SET
            queue_position = EXCLUDED.queue_position,
            status = 'waiting',
            doctor_id = NULL,
            updated_at = NOW();
    ELSE
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_position
        FROM public.queue_entries
        WHERE clinic_id = appt.clinic_id
          AND (
            (appt.doctor_id IS NOT NULL AND doctor_id = appt.doctor_id)
            OR (appt.doctor_id IS NULL AND doctor_id IS NULL)
          )
          AND status IN ('waiting', 'inside');

        INSERT INTO public.queue_entries (appointment_id, clinic_id, doctor_id, queue_position, status)
        VALUES (appt.id, appt.clinic_id, appt.doctor_id, next_position, 'waiting')
        ON CONFLICT (appointment_id) DO NOTHING;
    END IF;

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

    -- 3e. Insert immutable financial ledger entry (if table exists)
    IF v_invoice_id IS NOT NULL AND to_regclass('public.invoice_transactions') IS NOT NULL THEN
        EXECUTE 'INSERT INTO public.invoice_transactions (
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
            $1, $2, $3, ''PAYMENT'', $4, $5, $6, ' || CASE WHEN v_is_lab THEN '''DIAGNOSTIC''' ELSE '''CONSULTATION''' END || ',
            ''Online '' || $7 || '' Appointment Checkout'',
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_transactions it
            WHERE it.invoice_id = $1
              AND it.reference_id = $6
        )'
        USING v_invoice_id, appt.clinic_id, appt.id, attempt.amount_npr, v_gateway_upper, v_effective_ref, v_gateway_label;
    END IF;

    -- 3f. Finalize payment attempt row
    UPDATE public.appointment_payment_attempts
    SET status = 'complete',
        provider_reference = v_effective_ref,
        updated_at = NOW()
    WHERE id = attempt.id;

    -- 3g. Emit confirmation notification
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
                CASE 
                    WHEN assigned_position IS NOT NULL AND v_is_lab THEN format(' | Diagnostic Lab Token #%s', assigned_position)
                    WHEN assigned_position IS NOT NULL THEN format(' | Doctor Queue Token #%s', assigned_position)
                    ELSE '' 
                END
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

-- 3. UPDATE PAY AT DESK APPROVAL: Single Common Queue for Diagnostic Labs
CREATE OR REPLACE FUNCTION public.approve_pay_at_desk_appointment(
    p_appointment_id UUID,
    p_clinic_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_appt appointments%ROWTYPE;
    v_slot slots%ROWTYPE;
    v_next_position INT;
    v_count INT;
    v_is_lab BOOLEAN := FALSE;
BEGIN
    -- 7.1 Acquire exclusive row lock on appointment
    SELECT * INTO v_appt
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id;
    END IF;

    -- 7.2 Authorize caller against appointment's owning clinic
    IF NOT is_authorized_clinic_staff(v_appt.clinic_id) THEN
        RAISE EXCEPTION 'Access denied: Caller is not authorized to approve appointments for clinic %', v_appt.clinic_id;
    END IF;

    -- If caller also supplied p_clinic_id, ensure consistency
    IF p_clinic_id IS NOT NULL AND v_appt.clinic_id <> p_clinic_id THEN
        RAISE EXCEPTION 'Mismatched clinic ID: Appointment does not belong to clinic %', p_clinic_id;
    END IF;

    -- 7.3 Validate strict status transition: ONLY WAITING_FOR_APPROVAL can be approved
    IF v_appt.status <> 'WAITING_FOR_APPROVAL' THEN
        RAISE EXCEPTION 'Cannot approve appointment % with status %: must be WAITING_FOR_APPROVAL', 
            p_appointment_id, v_appt.status;
    END IF;

    -- Check if appointment slot time has already passed
    IF (v_appt.appointment_date + v_appt.appointment_time)::TIMESTAMPTZ < NOW() THEN
        UPDATE appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Appointment slot time has passed. Marked as EXPIRED';
    END IF;

    -- Check if expires_at has passed
    IF v_appt.expires_at IS NOT NULL AND v_appt.expires_at < NOW() THEN
        UPDATE appointments 
        SET status = 'EXPIRED', updated_at = NOW() 
        WHERE id = v_appt.id;
        RAISE EXCEPTION 'Cannot approve: Request has expired. Marked as EXPIRED';
    END IF;

    v_is_lab := public.is_diagnostic_lab_clinic(v_appt.clinic_id) OR v_appt.selected_lab_tests IS NOT NULL;

    -- 7.4 Transition status to APPROVED
    UPDATE appointments
    SET status = 'APPROVED',
        approved_at = NOW(),
        checkin_status = 'checked_in',
        doctor_id = CASE WHEN v_is_lab THEN NULL ELSE doctor_id END,
        updated_at = NOW()
    WHERE id = v_appt.id
    RETURNING * INTO v_appt;

    -- 7.5 Overload Rule: Bypasses capacity check, updates slot booked_count
    IF v_appt.slot_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM slots WHERE id = v_appt.slot_id FOR UPDATE;
        IF FOUND THEN
            SELECT COUNT(*) INTO v_count
            FROM appointments
            WHERE slot_id = v_appt.slot_id
              AND checkin_status <> 'cancelled'
              AND status = 'APPROVED';

            UPDATE slots 
            SET booked_count = v_count,
                updated_at = NOW()
            WHERE id = v_appt.slot_id;
        END IF;
    END IF;

    -- 7.6 Add patient to live queue:
    -- For Diagnostic Lab: SINGLE COMMON QUEUE for this clinic_id (Tokens 1..N across entire lab, no doctor partition)
    -- For Doctor Clinic: Partitioned by doctor_id
    IF v_is_lab THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
        FROM queue_entries
        WHERE clinic_id = v_appt.clinic_id
          AND status IN ('waiting', 'inside');

        INSERT INTO queue_entries (
            appointment_id,
            clinic_id,
            doctor_id,
            queue_position,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_appt.id,
            v_appt.clinic_id,
            NULL,
            v_next_position,
            'waiting',
            NOW(),
            NOW()
        ) ON CONFLICT (appointment_id) DO UPDATE SET
            queue_position = EXCLUDED.queue_position,
            status = 'waiting',
            doctor_id = NULL,
            updated_at = NOW();
    ELSE
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_next_position
        FROM queue_entries
        WHERE clinic_id = v_appt.clinic_id
          AND (
            (v_appt.doctor_id IS NOT NULL AND doctor_id = v_appt.doctor_id)
            OR (v_appt.doctor_id IS NULL AND doctor_id IS NULL)
          )
          AND status IN ('waiting', 'inside');

        INSERT INTO queue_entries (
            appointment_id,
            clinic_id,
            doctor_id,
            queue_position,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_appt.id,
            v_appt.clinic_id,
            v_appt.doctor_id,
            v_next_position,
            'waiting',
            NOW(),
            NOW()
        ) ON CONFLICT (appointment_id) DO UPDATE SET
            queue_position = EXCLUDED.queue_position,
            status = 'waiting',
            updated_at = NOW();
    END IF;

    -- 7.7 Emit notification to patient if user_id is linked
    IF v_appt.user_id IS NOT NULL THEN
        INSERT INTO notifications (
            user_id, appointment_id, title, message, type, target_audience
        ) VALUES (
            v_appt.user_id,
            v_appt.id,
            'Appointment Approved!',
            'Your Pay at Desk appointment #' || v_appt.tracking_code_10_digit || ' is approved (' || 
            CASE WHEN v_is_lab THEN 'Diagnostic Lab Token #' ELSE 'Doctor Queue Token #' END || 
            v_next_position || '). Total due at desk: NPR ' || v_appt.total_amount,
            'pay_at_desk_approved',
            'specific'
        );
    END IF;

    RETURN to_jsonb(v_appt);
END;
$$;

-- 4. UPDATE PUBLIC QUEUE STATUS RPC:
-- Single Common Queue for Diagnostic Labs (scoped strictly to each particular lab)
CREATE OR REPLACE FUNCTION public.get_public_queue_status(p_tracking_code TEXT)
RETURNS TABLE (
    tracking_code_10_digit TEXT,
    clinic_id UUID,
    clinic_name TEXT,
    doctor_id UUID,
    doctor_name TEXT,
    doctor_specialty TEXT,
    appointment_date DATE,
    appointment_time TIME,
    checkin_status TEXT,
    queue_status TEXT,
    queue_position INT,
    patients_ahead INT,
    current_queue_position INT,
    doctor_is_in_clinic BOOLEAN,
    estimated_wait_minutes INT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
    IF COALESCE(p_tracking_code, '') !~ '^[0-9]{10}$' THEN
        RETURN;
    END IF;

    -- Apply rate limit if private schema rate limiter exists
    BEGIN
        IF NOT private.consume_tracking_rate_limit('public-queue', p_tracking_code, 60, 300) THEN
            RETURN;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Continue if rate limiting helper is unavailable in local/test environments
    END;

    RETURN QUERY
    SELECT
        a.tracking_code_10_digit::TEXT,
        a.clinic_id,
        c.name::TEXT,
        a.doctor_id,
        d.full_name::TEXT,
        d.specialty::TEXT,
        a.appointment_date,
        a.appointment_time,
        a.checkin_status::TEXT,
        COALESCE(qe.status::TEXT, 'waiting')::TEXT,
        COALESCE(qe.queue_position, 0)::INT,
        -- Patients ahead strictly for this specific facility & date:
        -- Diagnostic Lab: Single common queue for this clinic (no doctor partition).
        -- Doctor Clinic: Partitioned by doctor_id.
        -- In all cases: strictly isolated to a.clinic_id (never mixing across clinics/labs).
        CASE 
            WHEN qe.queue_position IS NOT NULL THEN (
                SELECT COUNT(*)::INT
                FROM public.queue_entries ahead
                JOIN public.appointments ahead_appt ON ahead_appt.id = ahead.appointment_id
                WHERE ahead.clinic_id = a.clinic_id
                  AND (
                    (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                    OR
                    (
                      NOT (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                      AND (
                        (a.doctor_id IS NOT NULL AND ahead.doctor_id = a.doctor_id)
                        OR (a.doctor_id IS NULL AND ahead.doctor_id IS NULL)
                      )
                    )
                  )
                  AND ahead_appt.appointment_date = a.appointment_date
                  AND ahead.status = 'waiting'
                  AND ahead.queue_position < qe.queue_position
            )
            ELSE (
                SELECT COUNT(*)::INT
                FROM public.appointments prior_appt
                WHERE prior_appt.clinic_id = a.clinic_id
                  AND (
                    (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                    OR
                    (
                      NOT (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                      AND (
                        (a.doctor_id IS NOT NULL AND prior_appt.doctor_id = a.doctor_id)
                        OR (a.doctor_id IS NULL AND prior_appt.doctor_id IS NULL)
                      )
                    )
                  )
                  AND prior_appt.appointment_date = a.appointment_date
                  AND prior_appt.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
                  AND prior_appt.status IN ('APPROVED', 'confirmed')
                  AND prior_appt.id != a.id
                  AND (
                    prior_appt.appointment_time < a.appointment_time
                    OR (prior_appt.appointment_time = a.appointment_time AND prior_appt.created_at < a.created_at)
                  )
            )
        END,
        -- Currently serving token strictly for this facility:
        -- Diagnostic Lab: unified single serving token for this clinic_id.
        -- Doctor Clinic: strictly for this doctor cabin.
        COALESCE((
            SELECT MIN(current_entry.queue_position)::INT
            FROM public.queue_entries current_entry
            JOIN public.appointments current_appt ON current_appt.id = current_entry.appointment_id
            WHERE current_entry.clinic_id = a.clinic_id
              AND (
                (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                OR
                (
                  NOT (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                  AND (
                    (a.doctor_id IS NOT NULL AND current_entry.doctor_id = a.doctor_id)
                    OR (a.doctor_id IS NULL AND current_entry.doctor_id IS NULL)
                  )
                )
              )
              AND current_appt.appointment_date = a.appointment_date
              AND current_entry.status IN ('inside', 'in_consultation')
        ), 0)::INT,
        COALESCE(d.is_in_clinic, FALSE),
        (
            CASE 
                WHEN qe.queue_position IS NOT NULL THEN (
                    SELECT COUNT(*)::INT
                    FROM public.queue_entries ahead
                    JOIN public.appointments ahead_appt ON ahead_appt.id = ahead.appointment_id
                    WHERE ahead.clinic_id = a.clinic_id
                      AND (
                        (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                        OR
                        (
                          NOT (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                          AND (
                            (a.doctor_id IS NOT NULL AND ahead.doctor_id = a.doctor_id)
                            OR (a.doctor_id IS NULL AND ahead.doctor_id IS NULL)
                          )
                        )
                      )
                      AND ahead_appt.appointment_date = a.appointment_date
                      AND ahead.status = 'waiting'
                      AND ahead.queue_position < qe.queue_position
                )
                ELSE (
                    SELECT COUNT(*)::INT
                    FROM public.appointments prior_appt
                    WHERE prior_appt.clinic_id = a.clinic_id
                      AND (
                        (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                        OR
                        (
                          NOT (public.is_diagnostic_lab_clinic(a.clinic_id) OR a.selected_lab_tests IS NOT NULL)
                          AND (
                            (a.doctor_id IS NOT NULL AND prior_appt.doctor_id = a.doctor_id)
                            OR (a.doctor_id IS NULL AND prior_appt.doctor_id IS NULL)
                          )
                        )
                      )
                      AND prior_appt.appointment_date = a.appointment_date
                      AND prior_appt.checkin_status NOT IN ('cancelled', 'completed', 'done', 'no_show')
                      AND prior_appt.status IN ('APPROVED', 'confirmed')
                      AND prior_appt.id != a.id
                      AND (
                        prior_appt.appointment_time < a.appointment_time
                        OR (prior_appt.appointment_time = a.appointment_time AND prior_appt.created_at < a.created_at)
                      )
                )
            END
        ) * COALESCE(c.avg_consultation_time_minutes, 10)::INT
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    LEFT JOIN public.queue_entries qe ON qe.appointment_id = a.id
    WHERE a.tracking_code_10_digit = p_tracking_code
    LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_queue_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue_status(TEXT) TO anon, authenticated, service_role;

-- 5. UPDATE GET DOCTOR LIVE QUEUE RPC:
-- Single Common Queue for Diagnostic Labs (ignores p_doctor_id if clinic is diagnostic lab)
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(
    p_clinic_id UUID,
    p_doctor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    queue_entry_id UUID,
    appointment_id UUID,
    clinic_id UUID,
    doctor_id UUID,
    patient_name TEXT,
    patient_age INT,
    patient_gender TEXT,
    patient_mobile TEXT,
    tracking_code TEXT,
    queue_position INT,
    status TEXT,
    appointment_date DATE,
    appointment_time TIME,
    inside_at TIMESTAMPTZ,
    called_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_lab BOOLEAN;
BEGIN
    v_is_lab := public.is_diagnostic_lab_clinic(p_clinic_id);

    RETURN QUERY
    SELECT
        qe.id AS queue_entry_id,
        qe.appointment_id,
        qe.clinic_id,
        qe.doctor_id,
        a.patient_name::TEXT,
        a.patient_age::INT,
        a.patient_gender::TEXT,
        a.patient_mobile::TEXT,
        a.tracking_code_10_digit::TEXT,
        qe.queue_position::INT,
        qe.status::TEXT,
        a.appointment_date,
        a.appointment_time,
        qe.inside_at,
        qe.called_at,
        qe.completed_at
    FROM public.queue_entries qe
    JOIN public.appointments a ON a.id = qe.appointment_id
    WHERE qe.clinic_id = p_clinic_id
      AND (
        -- If diagnostic lab, always return the clinic's single common queue
        v_is_lab
        OR
        -- If doctor clinic, filter by doctor if doctor_id provided
        (
          (p_doctor_id IS NOT NULL AND qe.doctor_id = p_doctor_id)
          OR (p_doctor_id IS NULL)
        )
      )
    ORDER BY
        CASE WHEN qe.status = 'inside' THEN 0
             WHEN qe.status = 'waiting' THEN 1
             ELSE 2 END,
        qe.queue_position ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_live_queue(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_live_queue(UUID, UUID) TO anon, authenticated, service_role;

-- 6. NORMALIZATION OF HISTORICAL ENTRIES:
-- Re-index active entries sequentially per diagnostic lab (clinic_id)
DO $$
DECLARE
    lab_clinic RECORD;
    entry_row RECORD;
    new_pos INT;
BEGIN
    FOR lab_clinic IN (
        SELECT id FROM public.clinics WHERE public.is_diagnostic_lab_clinic(id) = TRUE
    ) LOOP
        -- Normalize doctor_id to NULL on diagnostic lab appointments and queue entries
        UPDATE public.appointments
        SET doctor_id = NULL
        WHERE clinic_id = lab_clinic.id AND doctor_id IS NOT NULL;

        UPDATE public.queue_entries
        SET doctor_id = NULL
        WHERE clinic_id = lab_clinic.id AND doctor_id IS NOT NULL;

        -- Re-index active queue entries (waiting, inside) sequentially from 1 to N for this lab
        new_pos := 1;
        FOR entry_row IN (
            SELECT id
            FROM public.queue_entries
            WHERE clinic_id = lab_clinic.id
              AND status IN ('waiting', 'inside')
            ORDER BY
                CASE WHEN status = 'inside' THEN 0 ELSE 1 END,
                queue_position ASC,
                created_at ASC
        ) LOOP
            UPDATE public.queue_entries
            SET queue_position = new_pos
            WHERE id = entry_row.id;
            new_pos := new_pos + 1;
        END LOOP;
    END LOOP;
END;
$$;
