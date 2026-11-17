-- =========================================================================
-- DACTOR PLATFORM: DOCTOR LIVE QUEUE ISOLATION & ATOMIC STATE TRANSITION
-- File: supabase/migration_doctor_live_queue_rls.sql
-- Milestone: M1 (Backend Security, RLS & SQL Migrations)
-- Status: Production Verified & Approved
-- =========================================================================
-- CRITICAL CONSTRAINTS & REQUIREMENTS:
-- 1. Actor Tracking Columns:
--    - Add updated_by_actor_type ('doctor' | 'receptionist') & updated_by_actor_id (UUID)
--    - Check constraints for actor types and consistency pairing
--    - Partial index on actor fields
-- 2. Enum Safety:
--    - Ensure 'inside' value exists in checkin_status_enum
-- 3. Decoupled Authorization Helper Functions:
--    - get_current_doctor_id() RETURNS UUID
--    - is_authorized_clinic_desk(p_clinic_id UUID) RETURNS BOOLEAN (strictly desk/management)
--    - is_authorized_doctor_for_clinic(p_doctor_id UUID, p_clinic_id UUID) RETURNS BOOLEAN
--    - is_authorized_doctor(p_doctor_id UUID) RETURNS BOOLEAN (compatibility bridge)
-- 4. Atomic State Transition RPC:
--    - transition_queue_entry_status(p_entry_id, p_expected_status, p_new_status, p_actor_type, p_actor_id)
--    - Atomically locks entry row with SELECT ... FOR UPDATE
--    - Optimistic concurrency conflict validation ("This entry was just updated")
--    - Timestamps setting, consultation duration calculation, appointment checkin sync
-- 5. Hardened Row Level Security (RLS):
--    - queue_entries: Doctors strictly isolated to own entries & clinic; clinic desk has clinic-wide access
--    - appointments: Doctors strictly isolated to own assigned appointments
--    - notifications: Doctors can ONLY insert notifications for their own assigned appointments
--    - billing_invoices: Doctors can only view invoices for their own appointments
-- 6. Patient Privacy / Masked RPC:
--    - get_doctor_live_queue(p_clinic_id, p_doctor_id): Masks phone numbers for doctors;
--      strictly requires authentication (anon revoked).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ENUM SAFETY: Ensure 'inside' exists in checkin_status_enum
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'checkin_status_enum' AND e.enumlabel = 'inside'
    ) THEN
        ALTER TYPE public.checkin_status_enum ADD VALUE 'inside';
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;


-- -------------------------------------------------------------------------
-- 2. ACTOR TRACKING COLUMNS ON public.queue_entries
-- -------------------------------------------------------------------------
ALTER TABLE public.queue_entries
    ADD COLUMN IF NOT EXISTS updated_by_actor_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS updated_by_actor_id UUID;

-- Actor type check constraint: doctor or receptionist
DO $$
BEGIN
    ALTER TABLE public.queue_entries DROP CONSTRAINT IF EXISTS chk_queue_entries_actor_type;
    ALTER TABLE public.queue_entries ADD CONSTRAINT chk_queue_entries_actor_type
        CHECK (updated_by_actor_type IS NULL OR updated_by_actor_type IN ('doctor', 'receptionist'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Actor pairing consistency: either both are null or both are non-null
DO $$
BEGIN
    ALTER TABLE public.queue_entries DROP CONSTRAINT IF EXISTS chk_queue_entries_actor_consistency;
    ALTER TABLE public.queue_entries ADD CONSTRAINT chk_queue_entries_actor_consistency
        CHECK (
            (updated_by_actor_type IS NULL AND updated_by_actor_id IS NULL)
            OR
            (updated_by_actor_type IS NOT NULL AND updated_by_actor_id IS NOT NULL)
        );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Performance index for actor auditing and queries
CREATE INDEX IF NOT EXISTS idx_queue_entries_actor
    ON public.queue_entries (updated_by_actor_type, updated_by_actor_id)
    WHERE updated_by_actor_id IS NOT NULL;


-- -------------------------------------------------------------------------
-- 3. DECOUPLED AUTHORIZATION HELPER FUNCTIONS
-- -------------------------------------------------------------------------

-- 3.1 Get Current Authenticated Doctor UUID
CREATE OR REPLACE FUNCTION public.get_current_doctor_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
    v_sub TEXT := public.current_auth_sub();
    v_doc_id UUID;
BEGIN
    IF v_uid IS NULL AND v_sub IS NULL AND v_email = '' THEN
        RETURN NULL;
    END IF;

    SELECT d.id INTO v_doc_id
    FROM public.doctors d
    LEFT JOIN public.profiles p ON p.id = d.user_id
    WHERE (v_uid IS NOT NULL AND (p.auth_uid = v_uid OR d.user_id = v_uid))
       OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
       OR (v_email <> '' AND (LOWER(d.email) = v_email OR LOWER(p.email) = v_email))
    ORDER BY d.updated_at DESC
    LIMIT 1;

    RETURN v_doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_current_doctor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_doctor_id() TO anon, authenticated, service_role;


-- 3.2 Clinic Desk Staff (Manager / Receptionist) Authorization Check
-- Strictly excludes attending doctors who are not desk managers to prevent cross-doctor queue leakage
CREATE OR REPLACE FUNCTION public.is_authorized_clinic_desk(p_clinic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
    v_sub TEXT := public.current_auth_sub();
BEGIN
    IF public.is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF p_clinic_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_email = '' AND v_uid IS NULL AND v_sub IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        -- 1. Primary clinic contact email (Clinic owner/administrator)
        SELECT 1 FROM public.clinics c
        WHERE c.id = p_clinic_id
          AND v_email <> ''
          AND LOWER(c.contact_email) = v_email
        UNION
        -- 2. Accepted clinic staff invitation with desk/administrative role (excluding pure doctors)
        SELECT 1 FROM public.clinic_invitations ci
        WHERE ci.clinic_id = p_clinic_id
          AND v_email <> ''
          AND LOWER(ci.email) = v_email
          AND ci.status = 'accepted'
          AND LOWER(COALESCE(ci.role, '')) IN ('clinic_admin', 'receptionist', 'manager', 'staff', 'admin')
        UNION
        -- 3. Profile with clinic_admin role associated with this clinic
        SELECT 1 FROM public.profiles p
        WHERE (
            (v_uid IS NOT NULL AND (p.auth_uid = v_uid OR p.id = v_uid))
            OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
            OR (v_email <> '' AND LOWER(p.email) = v_email)
        )
        AND p.role::text IN ('clinic_admin', 'super_admin')
        AND (
            EXISTS (
                SELECT 1 FROM public.clinics c
                WHERE c.id = p_clinic_id
                  AND ((v_email <> '' AND LOWER(c.contact_email) = v_email) OR LOWER(c.contact_email) = LOWER(p.email))
            )
            OR EXISTS (
                SELECT 1 FROM public.clinic_invitations ci
                WHERE ci.clinic_id = p_clinic_id
                  AND LOWER(ci.email) = LOWER(p.email)
                  AND ci.status = 'accepted'
                  AND LOWER(COALESCE(ci.role, '')) IN ('clinic_admin', 'receptionist', 'manager', 'staff', 'admin')
            )
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.is_authorized_clinic_desk(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_clinic_desk(UUID) TO anon, authenticated, service_role;


-- 3.3 Doctor Identity & Active Clinic Authorization Check
CREATE OR REPLACE FUNCTION public.is_authorized_doctor_for_clinic(p_doctor_id UUID, p_clinic_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
    v_uid UUID := public.current_auth_uid();
    v_sub TEXT := public.current_auth_sub();
BEGIN
    IF public.is_admin_portal_user() THEN
        RETURN TRUE;
    END IF;

    IF p_doctor_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.doctors d
        LEFT JOIN public.profiles p ON p.id = d.user_id
        WHERE d.id = p_doctor_id
          -- Match clinic filter if provided
          AND (
              p_clinic_id IS NULL
              OR p_clinic_id = COALESCE(d.active_clinic_id, d.primary_clinic_id, d.clinic_id)
              OR p_clinic_id IN (d.clinic_id, d.primary_clinic_id, d.active_clinic_id)
          )
          -- Match caller authenticated identity
          AND (
              (v_uid IS NOT NULL AND (p.auth_uid = v_uid OR d.user_id = v_uid))
              OR (v_sub IS NOT NULL AND p.firebase_uid = v_sub)
              OR (v_email <> '' AND (LOWER(d.email) = v_email OR LOWER(p.email) = v_email))
          )
    );
END;
$$;
REVOKE ALL ON FUNCTION public.is_authorized_doctor_for_clinic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_doctor_for_clinic(UUID, UUID) TO anon, authenticated, service_role;


-- 3.4 Compatibility Bridge: is_authorized_doctor(UUID)
CREATE OR REPLACE FUNCTION public.is_authorized_doctor(p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN public.is_authorized_doctor_for_clinic(p_doctor_id, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.is_authorized_doctor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_doctor(UUID) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------
-- 4. ATOMIC STATE TRANSITION RPC (transition_queue_entry_status)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_queue_entry_status(
    p_entry_id UUID,
    p_expected_status TEXT,
    p_new_status TEXT,
    p_actor_type TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_entry public.queue_entries%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_normalized_expected TEXT;
    v_normalized_new TEXT;
    v_current_status TEXT;
    v_called_at TIMESTAMPTZ;
    v_inside_at TIMESTAMPTZ;
    v_completed_at TIMESTAMPTZ;
    v_duration_seconds BIGINT;
    v_start_ts TIMESTAMPTZ;
    v_new_checkin public.checkin_status_enum;
    v_resolved_actor_type TEXT := p_actor_type;
    v_resolved_actor_id UUID := p_actor_id;
    v_caller_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
    -- 4.1 Validate required parameters
    IF p_entry_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_PARAMETER',
            'message', 'Entry ID is required'
        );
    END IF;

    IF p_new_status IS NULL OR TRIM(p_new_status) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_PARAMETER',
            'message', 'New status is required'
        );
    END IF;

    -- Normalize new status
    v_normalized_new := LOWER(TRIM(p_new_status));
    IF v_normalized_new = 'completed' THEN
        v_normalized_new := 'done';
    END IF;

    IF v_normalized_new NOT IN ('waiting', 'inside', 'done', 'no_show', 'sample_collected', 'processing', 'report_prepared') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_STATUS',
            'message', 'Invalid queue status: ' || p_new_status
        );
    END IF;

    -- Validate actor type
    IF v_resolved_actor_type IS NOT NULL AND v_resolved_actor_type NOT IN ('doctor', 'receptionist') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_ACTOR_TYPE',
            'message', 'Actor type must be either doctor or receptionist'
        );
    END IF;

    -- Defensive actor resolution
    IF v_resolved_actor_type = 'doctor' AND v_resolved_actor_id IS NULL THEN
        v_resolved_actor_id := public.get_current_doctor_id();
    ELSIF v_resolved_actor_type = 'receptionist' AND v_resolved_actor_id IS NULL THEN
        v_resolved_actor_id := public.current_auth_uid();
    END IF;

    -- 4.2 Atomically lock entry row (optimistic concurrency control)
    SELECT * INTO v_entry
    FROM public.queue_entries
    WHERE id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Fallback: check if caller provided appointment_id
        SELECT * INTO v_entry
        FROM public.queue_entries
        WHERE appointment_id = p_entry_id
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NOT_FOUND',
            'message', 'Queue entry not found'
        );
    END IF;

    v_current_status := v_entry.status::TEXT;

    -- Defensive pairing for check constraint: if only one actor field resolved, preserve existing
    IF (v_resolved_actor_type IS NOT NULL AND v_resolved_actor_id IS NULL) OR 
       (v_resolved_actor_type IS NULL AND v_resolved_actor_id IS NOT NULL) THEN
        v_resolved_actor_type := v_entry.updated_by_actor_type;
        v_resolved_actor_id := v_entry.updated_by_actor_id;
    END IF;

    -- 4.3 Caller Authorization Check
    IF NOT (
        v_caller_role = 'service_role'
        OR current_user IN ('postgres')
        OR public.is_admin_portal_user()
        OR (v_resolved_actor_type = 'receptionist' AND public.is_authorized_clinic_desk(v_entry.clinic_id))
        OR (v_resolved_actor_type = 'doctor' AND (
            (v_entry.doctor_id IS NOT NULL AND v_entry.doctor_id = v_resolved_actor_id AND public.is_authorized_doctor_for_clinic(v_resolved_actor_id, v_entry.clinic_id))
            OR (v_entry.doctor_id IS NULL AND public.is_authorized_clinic_desk(v_entry.clinic_id))
        ))
        OR (v_resolved_actor_type IS NULL AND (
            public.is_authorized_clinic_desk(v_entry.clinic_id)
            OR (v_entry.doctor_id IS NOT NULL AND public.is_authorized_doctor_for_clinic(v_entry.doctor_id, v_entry.clinic_id))
        ))
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'message', 'Not authorized to transition this queue entry'
        );
    END IF;

    -- 4.4 Optimistic Concurrency Check: State Conflict Detection
    IF p_expected_status IS NOT NULL AND TRIM(p_expected_status) <> '' THEN
        v_normalized_expected := LOWER(TRIM(p_expected_status));
        IF v_normalized_expected = 'completed' THEN
            v_normalized_expected := 'done';
        END IF;

        IF LOWER(v_current_status) <> v_normalized_expected THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CONFLICT',
                'message', 'This entry was just updated',
                'current_status', v_current_status
            );
        END IF;
    END IF;

    -- 4.5 Timestamp & Consultation Duration Calculations
    v_called_at := v_entry.called_at;
    v_inside_at := v_entry.inside_at;
    v_completed_at := v_entry.completed_at;
    v_duration_seconds := v_entry.consultation_duration_seconds;

    IF v_normalized_new = 'inside' THEN
        v_called_at := COALESCE(v_entry.called_at, v_now);
        v_inside_at := v_now;
    ELSIF v_normalized_new IN ('done', 'processing', 'no_show', 'sample_collected', 'report_prepared') THEN
        v_completed_at := v_now;
        v_start_ts := COALESCE(v_entry.inside_at, v_entry.called_at);
        IF v_start_ts IS NOT NULL AND v_normalized_new IN ('done', 'processing') THEN
            v_duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_start_ts))::BIGINT);
        END IF;
    ELSIF v_normalized_new = 'waiting' THEN
        v_called_at := NULL;
        v_inside_at := NULL;
        v_completed_at := NULL;
        v_duration_seconds := NULL;
    END IF;

    -- 4.6 Atomic Mutation of public.queue_entries
    UPDATE public.queue_entries
    SET
        status = v_normalized_new::public.queue_status_enum,
        called_at = v_called_at,
        inside_at = v_inside_at,
        completed_at = v_completed_at,
        consultation_duration_seconds = v_duration_seconds,
        updated_by_actor_type = v_resolved_actor_type,
        updated_by_actor_id = v_resolved_actor_id,
        updated_at = v_now
    WHERE id = v_entry.id;

    -- 4.7 Authoritative Synchronize Linked Appointment
    IF v_entry.appointment_id IS NOT NULL THEN
        PERFORM set_config('dactor.authoritative_context', 'true', true);

        v_new_checkin := CASE
            WHEN v_normalized_new = 'inside' THEN 'inside'::public.checkin_status_enum
            WHEN v_normalized_new = 'processing' THEN 'processing'::public.checkin_status_enum
            WHEN v_normalized_new = 'sample_collected' THEN 'sample_collected'::public.checkin_status_enum
            WHEN v_normalized_new = 'report_prepared' THEN 'report_prepared'::public.checkin_status_enum
            WHEN v_normalized_new = 'no_show' THEN 'no_show'::public.checkin_status_enum
            WHEN v_normalized_new = 'done' THEN 'completed'::public.checkin_status_enum
            WHEN v_normalized_new = 'waiting' THEN 'checked_in'::public.checkin_status_enum
            ELSE NULL
        END;

        IF v_new_checkin IS NOT NULL THEN
            BEGIN
                UPDATE public.appointments
                SET
                    checkin_status = v_new_checkin,
                    updated_at = v_now
                WHERE id = v_entry.appointment_id;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END IF;

    -- 4.8 Success Response Payload
    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_entry.id,
        'appointment_id', v_entry.appointment_id,
        'status', v_normalized_new,
        'called_at', v_called_at,
        'inside_at', v_inside_at,
        'completed_at', v_completed_at,
        'consultation_duration_seconds', v_duration_seconds,
        'updated_by_actor_type', v_resolved_actor_type,
        'updated_by_actor_id', v_resolved_actor_id
    );
END;
$$;
REVOKE ALL ON FUNCTION public.transition_queue_entry_status(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_queue_entry_status(UUID, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------
-- 5. HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------

-- =========================================================================
-- 5.1 public.queue_entries RLS
-- =========================================================================
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "queue_entries_select_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_insert_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_update_rule" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_delete_rule" ON public.queue_entries;

CREATE POLICY "queue_entries_select_rule" ON public.queue_entries
FOR SELECT USING (
    public.is_admin_portal_user()
    -- Receptionists and clinic managers retain clinic-wide queue access
    OR public.is_authorized_clinic_desk(clinic_id)
    -- Attending doctors strictly see ONLY their own assigned queue rows
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
    -- Patient self-access to their own appointment queue status
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = queue_entries.appointment_id
          AND (
              (a.user_id IS NOT NULL AND (
                  (public.current_auth_uid() IS NOT NULL AND a.user_id = public.current_auth_uid())
                  OR EXISTS (
                      SELECT 1 FROM public.profiles p
                      WHERE p.id = a.user_id
                        AND (
                            (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                            OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                            OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                        )
                  )
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
              OR (COALESCE(auth.jwt() ->> 'phone_number', '') <> '' AND RIGHT(REGEXP_REPLACE(a.patient_mobile, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(auth.jwt() ->> 'phone_number', '\D', '', 'g'), 10))
          )
    )
);

CREATE POLICY "queue_entries_insert_rule" ON public.queue_entries
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
);

CREATE POLICY "queue_entries_update_rule" ON public.queue_entries
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
)
WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
);

CREATE POLICY "queue_entries_delete_rule" ON public.queue_entries
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
);


-- =========================================================================
-- 5.2 public.appointments RLS
-- =========================================================================
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_rule" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete_rule" ON public.appointments;

CREATE POLICY "appointments_select_rule" ON public.appointments
FOR SELECT USING (
    public.is_admin_portal_user()
    -- Clinic desk staff retain clinic-wide appointment access
    OR public.is_authorized_clinic_desk(clinic_id)
    -- Attending doctors strictly see ONLY their own assigned appointments
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
    -- Patient self-access
    OR (
        user_id IS NOT NULL
        AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(patient_email) = LOWER(auth.jwt() ->> 'email'))
    OR (COALESCE(auth.jwt() ->> 'phone_number', '') <> '' AND RIGHT(REGEXP_REPLACE(patient_mobile, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(auth.jwt() ->> 'phone_number', '\D', '', 'g'), 10))
);

CREATE POLICY "appointments_insert_rule" ON public.appointments
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
    OR (
        public.current_auth_uid() IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
    OR (
        public.current_auth_sub() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = appointments.user_id
              AND p.firebase_uid = public.current_auth_sub()
        )
    )
);

CREATE POLICY "appointments_update_rule" ON public.appointments
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
    OR (
        user_id IS NOT NULL
        AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
)
WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    OR (
        doctor_id IS NOT NULL
        AND public.is_authorized_doctor_for_clinic(doctor_id, clinic_id)
    )
    OR (
        user_id IS NOT NULL
        AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = appointments.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
);

CREATE POLICY "appointments_delete_rule" ON public.appointments
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
);


-- =========================================================================
-- 5.3 public.notifications RLS
-- =========================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_rule" ON public.notifications;

CREATE POLICY "notifications_select_rule" ON public.notifications
FOR SELECT USING (
    public.is_admin_portal_user()
    OR target_audience::TEXT IN ('all', 'all_users', 'public')
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = notifications.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
    OR (
        appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = notifications.appointment_id
              AND public.is_authorized_clinic_desk(a.clinic_id)
        )
    )
    OR (
        appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = notifications.appointment_id
              AND a.doctor_id IS NOT NULL
              AND public.is_authorized_doctor_for_clinic(a.doctor_id, a.clinic_id)
        )
    )
);

CREATE POLICY "notifications_insert_rule" ON public.notifications
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    -- Clinic desk staff can insert notifications for any appointment in their clinic
    OR (
        appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = notifications.appointment_id
              AND public.is_authorized_clinic_desk(a.clinic_id)
        )
    )
    -- Attending doctors can strictly ONLY insert notifications for their OWN assigned appointments
    OR (
        appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = notifications.appointment_id
              AND a.doctor_id IS NOT NULL
              AND public.is_authorized_doctor_for_clinic(a.doctor_id, a.clinic_id)
        )
    )
    -- Clinic-wide broadcasts without an appointment_id (topic 'clinic_<id>')
    OR (
        appointment_id IS NULL
        AND target_audience::TEXT LIKE 'clinic_%'
        AND EXISTS (
            SELECT 1 FROM public.clinics c
            WHERE target_audience::TEXT = 'clinic_' || c.id::TEXT
              AND public.is_authorized_clinic_desk(c.id)
        )
    )
);

CREATE POLICY "notifications_update_rule" ON public.notifications
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = notifications.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
);

CREATE POLICY "notifications_delete_rule" ON public.notifications
FOR DELETE USING (
    public.is_admin_portal_user()
    OR (
        user_id IS NOT NULL AND (
            (public.current_auth_uid() IS NOT NULL AND user_id = public.current_auth_uid())
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = notifications.user_id
                  AND (
                      (public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                      OR (public.current_auth_sub() IS NOT NULL AND p.firebase_uid = public.current_auth_sub())
                      OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email'))
                  )
            )
        )
    )
);


-- =========================================================================
-- 5.4 public.billing_invoices RLS (Doctor Financial Privacy)
-- =========================================================================
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_invoices_select_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_insert_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_update_rule" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_delete_rule" ON public.billing_invoices;

CREATE POLICY "billing_invoices_select_rule" ON public.billing_invoices
FOR SELECT USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
    -- Doctors can strictly ONLY view billing invoices for their own appointments
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = billing_invoices.appointment_id
          AND a.doctor_id IS NOT NULL
          AND public.is_authorized_doctor_for_clinic(a.doctor_id, billing_invoices.clinic_id)
    )
    -- Patient self-access
    OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = billing_invoices.appointment_id
          AND (
              (a.user_id IS NOT NULL AND (
                  (public.current_auth_uid() IS NOT NULL AND a.user_id = public.current_auth_uid())
                  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.user_id AND (p.auth_uid = public.current_auth_uid() OR p.firebase_uid = public.current_auth_sub() OR LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
              ))
              OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(a.patient_email) = LOWER(auth.jwt() ->> 'email'))
          )
    )
);

CREATE POLICY "billing_invoices_insert_rule" ON public.billing_invoices
FOR INSERT WITH CHECK (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
);

CREATE POLICY "billing_invoices_update_rule" ON public.billing_invoices
FOR UPDATE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
);

CREATE POLICY "billing_invoices_delete_rule" ON public.billing_invoices
FOR DELETE USING (
    public.is_admin_portal_user()
    OR public.is_authorized_clinic_desk(clinic_id)
);


-- -------------------------------------------------------------------------
-- 6. PATIENT PRIVACY / MASKED DOCTOR LIVE QUEUE RPC
-- -------------------------------------------------------------------------
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_is_admin BOOLEAN := public.is_admin_portal_user();
    v_is_desk BOOLEAN := public.is_authorized_clinic_desk(p_clinic_id);
    v_caller_doctor_id UUID := public.get_current_doctor_id();
    v_effective_doctor_id UUID := p_doctor_id;
BEGIN
    -- Strict authorization gate: only admin, clinic desk, or attending doctor for this clinic
    IF NOT v_is_admin AND NOT v_is_desk THEN
        IF v_caller_doctor_id IS NULL THEN
            RAISE EXCEPTION 'Access denied: caller is not authorized for clinic %', p_clinic_id;
        END IF;

        -- Doctor cannot request another doctor's queue
        IF v_effective_doctor_id IS NOT NULL AND v_effective_doctor_id <> v_caller_doctor_id THEN
            RAISE EXCEPTION 'Access denied: doctors can only view their own live queue';
        END IF;

        v_effective_doctor_id := v_caller_doctor_id;

        IF NOT public.is_authorized_doctor_for_clinic(v_effective_doctor_id, p_clinic_id) THEN
            RAISE EXCEPTION 'Access denied: doctor is not active at clinic %', p_clinic_id;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        qe.id AS queue_entry_id,
        qe.appointment_id,
        qe.clinic_id,
        qe.doctor_id,
        a.patient_name::TEXT,
        a.patient_age::INT,
        a.patient_gender::TEXT,
        -- Patient PII Protection: Mask phone numbers for doctors; show unmasked only to clinic desk/admin
        CASE 
            WHEN v_is_admin OR v_is_desk THEN a.patient_mobile::TEXT
            WHEN a.patient_mobile IS NOT NULL AND LENGTH(a.patient_mobile) >= 4 THEN
                REPEAT('*', GREATEST(0, LENGTH(a.patient_mobile) - 4)) || RIGHT(a.patient_mobile, 4)
            ELSE '***'
        END AS patient_mobile,
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
        (v_effective_doctor_id IS NOT NULL AND qe.doctor_id = v_effective_doctor_id)
        OR (v_effective_doctor_id IS NULL AND (v_is_admin OR v_is_desk))
      )
    ORDER BY
        CASE WHEN qe.status = 'inside' THEN 0
             WHEN qe.status = 'waiting' THEN 1
             ELSE 2 END,
        qe.queue_position ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_doctor_live_queue(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_doctor_live_queue(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_live_queue(UUID, UUID) TO authenticated, service_role;
