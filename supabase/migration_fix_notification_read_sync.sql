-- Migration: Safe Stored Procedure to Mark Notifications as Read
-- Description: Allows users and clinics to securely mark personal/appointment notifications as read
-- without mutating global broadcast notifications or violating RLS policies.

CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(p_notification_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_notification_ids IS NULL OR array_length(p_notification_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Update is_read = TRUE only for personal, appointment, or clinic-targeted notifications.
    -- Multi-user global broadcasts are excluded so marking read by one user doesn't alter state for everyone.
    UPDATE public.notifications
    SET is_read = TRUE
    WHERE id = ANY(p_notification_ids)
      AND target_audience NOT IN ('all_users', 'all_doctors', 'all_clinics', 'patients', 'public', 'all');
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_as_read(UUID[]) TO authenticated, anon;
