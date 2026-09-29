-- Lets the app detect a device clock that is wrong (wrong time zone), which breaks login sessions
CREATE OR REPLACE FUNCTION public.server_time()
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT now() $$;
GRANT EXECUTE ON FUNCTION public.server_time() TO anon, authenticated;
