-- Alerts belong to the phone, not to the login: a phone stays registered after logging out,
-- so alerts keep arriving. When someone else turns alerts on on the same phone, the phone
-- moves to them (the row-level rules alone would block that, as the row is someone else's).
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_device TEXT, p_include_own BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_staff() THEN
    RAISE EXCEPTION 'Only shop staff can turn on alerts';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, device, include_own)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_device, p_include_own)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        device = EXCLUDED.device, include_own = EXCLUDED.include_own;
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
