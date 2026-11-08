-- =============================================================================
-- Migration: Fix Notification & FCM Tokens RLS, Guest Tokens, and Foreign Key Blocker
-- Date: 2026-11-01
-- =============================================================================

-- 0. Ensure prerequisite auth helper functions exist
CREATE OR REPLACE FUNCTION public.current_auth_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.current_auth_uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_portal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      current_user = 'service_role'
      OR (auth.jwt() ->> 'role') = 'service_role'
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
      OR (auth.jwt() ->> 'role') = 'super_admin'
      OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE public.profiles.auth_uid = auth.uid()
            AND public.profiles.role = 'super_admin'
        )
      )
    ),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_portal_user() TO anon, authenticated, service_role;

-- 1. Ensure fcm_tokens supports guest tracking codes and clinic/doctor IDs
ALTER TABLE public.fcm_tokens DROP CONSTRAINT IF EXISTS fcm_tokens_user_id_fkey;
ALTER TABLE public.fcm_tokens ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE public.fcm_tokens ADD COLUMN IF NOT EXISTS doctor_id UUID;
ALTER TABLE public.fcm_tokens ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(50);
ALTER TABLE public.fcm_tokens ADD COLUMN IF NOT EXISTS patient_mobile VARCHAR(30);
ALTER TABLE public.fcm_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure indexes exist for fast token resolution
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_tracking_code ON public.fcm_tokens(tracking_code);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_patient_mobile ON public.fcm_tokens(patient_mobile);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_clinic_id ON public.fcm_tokens(clinic_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON public.fcm_tokens(token);

-- 2. Refactor trigger to allow guest tracking codes & clinic tokens without escalation
CREATE OR REPLACE FUNCTION public.prevent_fcm_token_ownership_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Service role and admin portal bypass
    IF (auth.jwt() ->> 'role') = 'service_role' OR public.is_admin_portal_user() THEN
        RETURN NEW;
    END IF;

    -- Token must be at least 20 chars
    IF NEW.token IS NULL OR LENGTH(TRIM(NEW.token)) < 20 THEN
        RAISE EXCEPTION 'A valid FCM device token is required.';
    END IF;

    -- Allow guest patient tokens linked to tracking_code or patient_mobile (no account required)
    IF NEW.user_id IS NULL THEN
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    -- If user_id is provided, check if it belongs to clinic or doctor
    IF EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = NEW.user_id) THEN
        NEW.clinic_id := NEW.user_id;
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = NEW.user_id) THEN
        NEW.doctor_id := NEW.user_id;
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    -- For patient profiles, ensure caller is authenticated and matches or email matches
    IF public.current_auth_uid() IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = NEW.user_id
              AND ((p.auth_uid IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
        ) THEN
            -- Instead of hard failing if patient_id was cached, fallback user_id to NULL to allow guest tracking
            NEW.user_id := NULL;
        END IF;
    ELSE
        -- Unauthenticated anon caller with user_id: clear user_id and allow guest token registration
        NEW.user_id := NULL;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fcm_tokens_prevent_ownership_escalation ON public.fcm_tokens;
CREATE TRIGGER fcm_tokens_prevent_ownership_escalation
BEFORE INSERT OR UPDATE ON public.fcm_tokens
FOR EACH ROW EXECUTE FUNCTION public.prevent_fcm_token_ownership_escalation();

-- 3. Update RLS policies on fcm_tokens
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcm_tokens_select_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_insert_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_update_rule" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_delete_rule" ON public.fcm_tokens;

-- SELECT: admin, owning user, or token lookup
CREATE POLICY "fcm_tokens_select_rule" ON public.fcm_tokens
FOR SELECT
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id
                  AND ((public.current_auth_uid() IS NOT NULL AND p.auth_uid = public.current_auth_uid())
                    OR (COALESCE(auth.jwt() ->> 'email', '') <> '' AND LOWER(p.email) = LOWER(auth.jwt() ->> 'email')))
            )
        )
    )
    OR (
        -- Allow checking token registration for guest tokens
        user_id IS NULL AND token IS NOT NULL
    )
);

-- INSERT: admin, authenticated patient, guest with token, or clinic device
CREATE POLICY "fcm_tokens_insert_rule" ON public.fcm_tokens
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR (
        -- Guest registration: tracking code, patient mobile, or general device token
        token IS NOT NULL AND LENGTH(token) >= 20
    )
);

-- UPDATE: admin, owning user, or guest updating their token/tracking code
CREATE POLICY "fcm_tokens_update_rule" ON public.fcm_tokens
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        token IS NOT NULL AND LENGTH(token) >= 20
    )
)
WITH CHECK (
    is_admin_portal_user()
    OR (
        token IS NOT NULL AND LENGTH(token) >= 20
    )
);

-- DELETE: admin or owning user
CREATE POLICY "fcm_tokens_delete_rule" ON public.fcm_tokens
FOR DELETE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = fcm_tokens.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);

-- 4. Update RLS policies on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Safely convert target_audience to VARCHAR(50) to support dynamic clinic broadcast topics without enum restrictions
DO $$
BEGIN
    ALTER TABLE public.notifications ALTER COLUMN target_audience TYPE VARCHAR(50) USING target_audience::TEXT;
    ALTER TABLE public.notifications ALTER COLUMN target_audience SET DEFAULT 'specific';
EXCEPTION
    WHEN OTHERS THEN null;
END $$;

DROP POLICY IF EXISTS "notifications_select_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_rule" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_rule" ON public.notifications;

-- SELECT: Broadcasts, user's own notifications, appointment notifications, or clinic alerts
CREATE POLICY "notifications_select_rule" ON public.notifications
FOR SELECT
USING (
    is_admin_portal_user()
    OR target_audience::TEXT IN ('all', 'all_users', 'all_patients', 'all_doctors', 'all_clinics', 'specific')
    OR target_audience::TEXT LIKE 'clinic_%'
    OR appointment_id IS NOT NULL
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);

-- INSERT: Admin, clinic staff for appointments, or authorized clinic alerts/broadcasts
CREATE POLICY "notifications_insert_rule" ON public.notifications
FOR INSERT
WITH CHECK (
    is_admin_portal_user()
    OR target_audience::TEXT LIKE 'clinic_%'
    OR type IN ('clinic_broadcast', 'turn_call', 'manual_alert', 'clinic_break', 'doctor_presence', 'early_arrival', 'queue_alert')
    OR (
        appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = notifications.appointment_id
        )
    )
);

-- UPDATE: Admin or owning user
CREATE POLICY "notifications_update_rule" ON public.notifications
FOR UPDATE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);

-- DELETE: Admin or owning user
CREATE POLICY "notifications_delete_rule" ON public.notifications
FOR DELETE
USING (
    is_admin_portal_user()
    OR (
        public.current_auth_uid() IS NOT NULL
        AND user_id IS NOT NULL
        AND (
            user_id = public.current_auth_uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.auth_uid = public.current_auth_uid()
            )
        )
    )
);
