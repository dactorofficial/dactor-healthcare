-- =========================================================================
-- DACTOR PLATFORM: OFFLINE SYNC, SOFT DELETES & APPEND-ONLY BILLING LEDGER
-- Migration File: supabase/migration_offline_sync_and_ledger.sql
-- =========================================================================

-- 1. ADD SOFT DELETE TOMBSTONES ACROSS CORE OPERATIONAL TABLES
ALTER TABLE public.appointments 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.billing_invoices 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.queue_entries 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.doctors 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.clinic_catalog 
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. CREATE SYNC INDEXES FOR FAST DELTA QUERIES
CREATE INDEX IF NOT EXISTS idx_appointments_sync 
    ON public.appointments (clinic_id, updated_at DESC, is_deleted);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_sync 
    ON public.billing_invoices (clinic_id, updated_at DESC, is_deleted);

CREATE INDEX IF NOT EXISTS idx_queue_entries_sync 
    ON public.queue_entries (clinic_id, updated_at DESC, is_deleted);

CREATE INDEX IF NOT EXISTS idx_clinic_catalog_sync 
    ON public.clinic_catalog (clinic_id, updated_at DESC, is_deleted);

CREATE INDEX IF NOT EXISTS idx_doctors_sync 
    ON public.doctors (clinic_id, updated_at DESC, is_deleted);

-- 3. APPEND-ONLY FINANCIAL LEDGER: INVOICE TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.invoice_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PAYMENT', 'CORRECTION', 'REFUND', 'DISCOUNT')),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH', -- CASH, ESEWA, CARD, KHALTI, OTHER
    device_id VARCHAR(50), -- Terminal ID / Device Prefix
    transaction_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoice_transactions_invoice 
    ON public.invoice_transactions (invoice_id, transaction_time);
CREATE INDEX IF NOT EXISTS idx_invoice_transactions_clinic_sync 
    ON public.invoice_transactions (clinic_id, updated_at DESC, is_deleted);

-- 4. RLS POLICIES FOR INVOICE TRANSACTIONS
ALTER TABLE public.invoice_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_transactions_select_rule" ON public.invoice_transactions;
CREATE POLICY "invoice_transactions_select_rule" ON public.invoice_transactions
FOR SELECT USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = invoice_transactions.appointment_id
          AND (
              (auth.uid() IS NOT NULL AND (a.user_id = auth.uid() OR EXISTS (
                  SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND p.auth_uid = auth.uid()
              )))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

DROP POLICY IF EXISTS "invoice_transactions_insert_rule" ON public.invoice_transactions;
CREATE POLICY "invoice_transactions_insert_rule" ON public.invoice_transactions
FOR INSERT WITH CHECK (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

DROP POLICY IF EXISTS "invoice_transactions_update_rule" ON public.invoice_transactions;
CREATE POLICY "invoice_transactions_update_rule" ON public.invoice_transactions
FOR UPDATE USING (
    is_admin_portal_user()
    OR is_authorized_clinic_staff(clinic_id)
);

-- 5. AUTOMATIC LEDGER BALANCE SYNCHRONIZATION TRIGGER
CREATE OR REPLACE FUNCTION public.sync_invoice_balance_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
    v_target_invoice_id UUID;
    v_total_paid DECIMAL(10, 2);
    v_total_amount DECIMAL(10, 2);
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

    -- Calculate total paid amount from non-deleted ledger transactions
    SELECT COALESCE(SUM(
        CASE 
            WHEN transaction_type = 'REFUND' THEN -ABS(amount)
            WHEN transaction_type = 'CORRECTION' THEN amount
            WHEN transaction_type = 'DISCOUNT' THEN 0.00
            ELSE ABS(amount)
        END
    ), 0.00)
    INTO v_total_paid
    FROM public.invoice_transactions
    WHERE invoice_id = v_target_invoice_id 
      AND is_deleted = FALSE;

    SELECT total_amount INTO v_total_amount
    FROM public.billing_invoices
    WHERE id = v_target_invoice_id;

    IF FOUND THEN
        UPDATE public.billing_invoices
        SET paid_amount = v_total_paid,
            balance_due = GREATEST(0.00, v_total_amount - v_total_paid),
            payment_status = CASE 
                WHEN (v_total_amount - v_total_paid) <= 0.00 AND v_total_amount > 0.00 THEN 'paid'::payment_status_enum
                WHEN v_total_paid > 0.00 THEN 'partial'::payment_status_enum
                ELSE 'pending'::payment_status_enum
            END,
            paid_at = CASE WHEN v_total_paid > 0.00 THEN COALESCE(paid_at, v_now) ELSE paid_at END,
            updated_at = v_now
        WHERE id = v_target_invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_invoice_balance ON public.invoice_transactions;
CREATE TRIGGER trg_sync_invoice_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_invoice_balance_from_transactions();

-- 6. RPC FUNCTION FOR ATOMIC LWW APPOINTMENT UPSERT
CREATE OR REPLACE FUNCTION public.upsert_appointment_lww(p_appointment JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing RECORD;
    v_result RECORD;
    v_client_updated_at TIMESTAMPTZ;
BEGIN
    v_client_updated_at := COALESCE((p_appointment->>'updated_at')::TIMESTAMPTZ, NOW());

    SELECT id, updated_at INTO v_existing
    FROM public.appointments
    WHERE id = (p_appointment->>'id')::UUID;

    IF FOUND THEN
        IF v_existing.updated_at > v_client_updated_at THEN
            SELECT * INTO v_result FROM public.appointments WHERE id = v_existing.id;
            RETURN jsonb_build_object('status', 'rejected_server_newer', 'record', to_jsonb(v_result));
        END IF;
    END IF;

    INSERT INTO public.appointments (
        id, tracking_code_10_digit, slot_id, clinic_id, doctor_id, user_id,
        patient_name, patient_age, patient_gender, patient_mobile, patient_email,
        payment_status, checkin_status, appointment_date, appointment_time,
        fee_amount, is_walkin, payment_mode, status, total_amount,
        is_deleted, deleted_at, updated_at
    ) VALUES (
        (p_appointment->>'id')::UUID,
        p_appointment->>'tracking_code_10_digit',
        (p_appointment->>'slot_id')::UUID,
        (p_appointment->>'clinic_id')::UUID,
        (p_appointment->>'doctor_id')::UUID,
        (p_appointment->>'user_id')::UUID,
        p_appointment->>'patient_name',
        (p_appointment->>'patient_age')::INT,
        p_appointment->>'patient_gender',
        p_appointment->>'patient_mobile',
        p_appointment->>'patient_email',
        COALESCE((p_appointment->>'payment_status')::payment_status_enum, 'pending'),
        COALESCE((p_appointment->>'checkin_status')::checkin_status_enum, 'checked_in'),
        (p_appointment->>'appointment_date')::DATE,
        (p_appointment->>'appointment_time')::TIME,
        COALESCE((p_appointment->>'fee_amount')::DECIMAL, 0.00),
        COALESCE((p_appointment->>'is_walkin')::BOOLEAN, false),
        COALESCE(p_appointment->>'payment_mode', 'ONLINE'),
        COALESCE(p_appointment->>'status', 'APPROVED'),
        COALESCE((p_appointment->>'total_amount')::DECIMAL, 0.00),
        COALESCE((p_appointment->>'is_deleted')::BOOLEAN, false),
        (p_appointment->>'deleted_at')::TIMESTAMPTZ,
        v_client_updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        patient_name = EXCLUDED.patient_name,
        patient_age = EXCLUDED.patient_age,
        patient_gender = EXCLUDED.patient_gender,
        patient_mobile = EXCLUDED.patient_mobile,
        patient_email = EXCLUDED.patient_email,
        payment_status = EXCLUDED.payment_status,
        checkin_status = EXCLUDED.checkin_status,
        appointment_date = EXCLUDED.appointment_date,
        appointment_time = EXCLUDED.appointment_time,
        fee_amount = EXCLUDED.fee_amount,
        is_walkin = EXCLUDED.is_walkin,
        payment_mode = EXCLUDED.payment_mode,
        status = EXCLUDED.status,
        total_amount = EXCLUDED.total_amount,
        is_deleted = EXCLUDED.is_deleted,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
    WHERE appointments.updated_at <= EXCLUDED.updated_at
    RETURNING * INTO v_result;

    RETURN jsonb_build_object('status', 'upserted', 'record', to_jsonb(v_result));
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_appointment_lww(JSONB) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
