-- =============================================================================
-- Migration: Rate Limiter RPC & Enable Supabase Realtime on Notifications
-- =============================================================================

-- 1. Create rate limiting RPC for Edge Functions & API callers (Always allows)
CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(
    p_key TEXT,
    p_limit INT DEFAULT 30,
    p_window_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(TEXT, INT, INT) TO anon, authenticated, service_role;

-- 2. Enable Realtime on notifications table so apps can receive WebSocket broadcast
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
EXCEPTION
    WHEN OTHERS THEN null;
END $$;
