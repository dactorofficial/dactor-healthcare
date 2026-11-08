-- =========================================================================
-- DACTOR PLATFORM: LIVE QUEUE QUARANTINE & UNAPPROVED APPOINTMENT ISOLATION
-- Migration: migration_unapproved_appointment_quarantine.sql
-- =========================================================================

-- 1. Ensure appointments status check constraint allows 'pending_payment'
DO $$
BEGIN
    ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_status 
        CHECK (status IN ('WAITING_FOR_APPROVAL', 'APPROVED', 'UNAPPROVED', 'EXPIRED', 'pending_payment'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Server-side Trigger: Bar unapproved appointments from entering queue_entries
CREATE OR REPLACE FUNCTION public.check_queue_entry_appointment_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_appt_status VARCHAR(50);
    v_appt_checkin VARCHAR(50);
BEGIN
    SELECT status, checkin_status INTO v_appt_status, v_appt_checkin
    FROM public.appointments
    WHERE id = NEW.appointment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot insert queue entry: appointment % not found', NEW.appointment_id;
    END IF;

    IF v_appt_status IS NULL OR v_appt_status <> 'APPROVED' OR v_appt_checkin = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot insert unapproved appointment % (status=%, checkin=%) into live queue',
            NEW.appointment_id, COALESCE(v_appt_status, 'NULL'), COALESCE(v_appt_checkin, 'NULL');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_entry_check_approved ON public.queue_entries;
CREATE TRIGGER trg_queue_entry_check_approved
BEFORE INSERT OR UPDATE ON public.queue_entries
FOR EACH ROW
EXECUTE FUNCTION public.check_queue_entry_appointment_approved();

-- 3. Server-side Trigger: Automatically purge queue_entries when an appointment is unapproved, expired, or cancelled
CREATE OR REPLACE FUNCTION public.sync_appointment_status_to_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.status <> 'APPROVED' OR NEW.checkin_status = 'cancelled' THEN
        DELETE FROM public.queue_entries WHERE appointment_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_status_to_queue ON public.appointments;
CREATE TRIGGER trg_sync_appointment_status_to_queue
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_status_to_queue();

-- 4. Server-Authoritative Purge Function for Rogue Unapproved Queue Entries
CREATE OR REPLACE FUNCTION public.purge_unapproved_queue_entries()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_deleted_count INT := 0;
    v_orphaned_count INT := 0;
BEGIN
    -- Purge queue entries linked to unapproved or cancelled appointments
    WITH purged AS (
        DELETE FROM public.queue_entries qe
        USING public.appointments a
        WHERE qe.appointment_id = a.id
          AND (a.status <> 'APPROVED' OR a.checkin_status = 'cancelled')
        RETURNING qe.id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM purged;

    -- Also purge orphaned queue entries whose appointment doesn't exist
    WITH orphaned AS (
        DELETE FROM public.queue_entries qe
        WHERE NOT EXISTS (
            SELECT 1 FROM public.appointments a WHERE a.id = qe.appointment_id
        )
        RETURNING qe.id
    )
    SELECT COUNT(*) INTO v_orphaned_count FROM orphaned;

    RETURN v_deleted_count + v_orphaned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_unapproved_queue_entries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_unapproved_queue_entries() TO authenticated, service_role;

-- 5. Execute immediate cleanup of rogue queue entries
SELECT public.purge_unapproved_queue_entries();
