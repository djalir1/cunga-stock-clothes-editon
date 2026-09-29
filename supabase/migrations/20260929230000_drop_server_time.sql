-- Clock check removed: logins no longer depend on the device clock (see src/lib/authStorage.ts)
DROP FUNCTION IF EXISTS public.server_time();
