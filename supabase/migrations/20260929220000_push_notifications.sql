-- ============================================================
-- Phone notifications (Web Push) for the owner / supervisor:
-- every sale (and cancelled sale) → the "notify" Edge Function →
-- a notification on each subscribed phone, even when the app is closed.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- One row per phone / browser that turned alerts on
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT,                                 -- e.g. "Android · Chrome", shown in Settings
  include_own BOOLEAN NOT NULL DEFAULT false,  -- also notify me about sales I make myself
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Each person manages only their own devices; only approved staff can subscribe
CREATE POLICY "Own devices: read" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Own devices: add" ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_staff()));
CREATE POLICY "Own devices: change" ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Own devices: remove" ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Shared secret so only this database can ask the function to send sale alerts
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret', 'Database → notify function');

-- Keys and secret for the Edge Function (service role only)
CREATE OR REPLACE FUNCTION public.push_config()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vapid_public',  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vapid_public'),
    'vapid_private', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vapid_private'),
    'hook_secret',   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret'))
$$;
REVOKE ALL ON FUNCTION public.push_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_config() TO service_role;

-- The function creates the VAPID key pair once, on first use
CREATE OR REPLACE FUNCTION public.save_vapid_keys(p_public TEXT, p_private TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'vapid_public') THEN RETURN; END IF;
  PERFORM vault.create_secret(p_public, 'vapid_public', 'Web Push public key');
  PERFORM vault.create_secret(p_private, 'vapid_private', 'Web Push private key');
END;
$$;
REVOKE ALL ON FUNCTION public.save_vapid_keys(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_vapid_keys(TEXT, TEXT) TO service_role;

-- Queue a call to the notify function. pg_net sends it after the transaction commits,
-- so the sale's lines are there when the function reads them; a failure never blocks the sale.
CREATE OR REPLACE FUNCTION private.push_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_type TEXT;
BEGIN
  v_type := CASE WHEN TG_OP = 'INSERT' THEN 'sale'
                 WHEN NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN 'sale_cancelled' END;
  IF v_type IS NULL THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://grtacefgvlefghagqlma.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret')),
    body := jsonb_build_object('action', v_type, 'sale_id', NEW.id, 'actor', auth.uid()));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- notifications are best-effort; the sale always goes through
END;
$$;
REVOKE EXECUTE ON FUNCTION private.push_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sales_push_notify
  AFTER INSERT OR UPDATE OF voided_at ON public.sales
  FOR EACH ROW EXECUTE FUNCTION private.push_event();
