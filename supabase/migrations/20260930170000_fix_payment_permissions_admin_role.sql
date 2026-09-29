-- ============================================================
-- 1. Fix: sales and debt payments failed from the app ("You don't have
--    permission"). record_sale / pay_customer_debts / record_debt_payment
--    run as the logged-in user and call these two helpers, which had no
--    EXECUTE grant for app users. (private is not exposed by the API, so
--    they still can't be called directly from the app.)
-- 2. Roles: owner, admin, supervisor, storekeeper.
--    admin = the developers, with the same powers as the owner (sell and
--    edit, team, shop settings, exchange rates, cancel sales) plus the
--    alerts overview. The owner can't change admin accounts.
-- ============================================================

GRANT EXECUTE ON FUNCTION private.normalize_payments(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION private.apply_debt_parts(UUID[], JSONB, TEXT) TO authenticated;

-- Owner or admin
CREATE OR REPLACE FUNCTION private.is_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin'))
$$;
REVOKE ALL ON FUNCTION private.is_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_manager() TO authenticated;

-- Who can sell and change stock: owner, admin, storekeeper (supervisor stays view-only)
CREATE OR REPLACE FUNCTION private.can_write()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role IN ('storekeeper', 'owner', 'admin'))
$$;

-- Team & access: owner or admin (never their own role)
DROP POLICY "Owner assigns roles" ON public.user_roles;
DROP POLICY "Owner changes roles" ON public.user_roles;
DROP POLICY "Owner removes roles" ON public.user_roles;
CREATE POLICY "Managers assign roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_manager()) AND user_id <> (SELECT auth.uid()));
CREATE POLICY "Managers change roles" ON public.user_roles FOR UPDATE TO authenticated
  USING ((SELECT private.is_manager()) AND user_id <> (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_manager()) AND user_id <> (SELECT auth.uid()));
CREATE POLICY "Managers remove roles" ON public.user_roles FOR DELETE TO authenticated
  USING ((SELECT private.is_manager()) AND user_id <> (SELECT auth.uid()));

-- Only an admin can give, change or remove the admin role
CREATE OR REPLACE FUNCTION private.protect_developer_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.has_role('admin')
     AND ((TG_OP <> 'DELETE' AND NEW.role = 'admin') OR (TG_OP <> 'INSERT' AND OLD.role = 'admin')) THEN
    RAISE EXCEPTION 'Admin accounts can only be changed by an admin';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Shop profile, exchange rates, supervisor alerts: owner or admin
DROP POLICY "Owner changes shop settings" ON public.shop_settings;
CREATE POLICY "Managers change shop settings" ON public.shop_settings FOR UPDATE TO authenticated
  USING ((SELECT private.is_manager())) WITH CHECK ((SELECT private.is_manager()));

-- Cancel a sale: owner or admin
DO $$
BEGIN
  EXECUTE replace(replace(pg_get_functiondef('public.void_sale(uuid,text)'::regprocedure),
    'IF NOT private.has_role(''owner'') THEN', 'IF NOT private.is_manager() THEN'),
    'Only the owner can cancel a sale', 'Only the owner or an admin can cancel a sale');
END $$;

-- Accounts: elogearts3@gmail.com → admin, Eloge Chris → storekeeper (the owner keeps their role)
UPDATE public.user_roles SET role = 'admin'
 WHERE user_id = (SELECT id FROM auth.users WHERE email = 'elogearts3@gmail.com');
UPDATE public.user_roles SET role = 'storekeeper'
 WHERE user_id = 'ef2208e8-0baa-4a78-ad69-ab6648c2d68f';
