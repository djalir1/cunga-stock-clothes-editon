-- ============================================================
-- Sign-up approval + owner role
--   owner       → edit everything + manage the team
--   storekeeper → edit stock, sales, customers
--   admin       → view-only supervisor
--   (no role)   → signed up, waiting for the owner's approval; sees nothing
-- ============================================================

-- One role per user
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
DROP INDEX IF EXISTS public.idx_user_roles_user;

-- Who may change shop data
CREATE OR REPLACE FUNCTION private.can_write()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role IN ('storekeeper', 'owner')
  )
$$;
REVOKE ALL ON FUNCTION private.can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_write() TO authenticated;

-- New sign-ups get no role, except the very first account (or whenever the shop has no owner)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── Profiles: staff see the team; pending users only see themselves ──
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Staff read profiles, users read own" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_staff()));

-- ── Roles: owner manages everyone except themselves (no self-lockout) ──
DROP POLICY IF EXISTS "Users read own role, admins read all" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
CREATE POLICY "Users read own role, staff read all" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_staff()));
CREATE POLICY "Owner assigns roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('owner')) AND user_id <> (SELECT auth.uid()));
CREATE POLICY "Owner changes roles" ON public.user_roles FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('owner')) AND user_id <> (SELECT auth.uid()))
  WITH CHECK ((SELECT private.has_role('owner')) AND user_id <> (SELECT auth.uid()));
CREATE POLICY "Owner removes roles" ON public.user_roles FOR DELETE TO authenticated
  USING ((SELECT private.has_role('owner')) AND user_id <> (SELECT auth.uid()));

-- ── Write policies: storekeeper OR owner ──
DROP POLICY IF EXISTS "Storekeepers insert categories" ON public.categories;
DROP POLICY IF EXISTS "Storekeepers update categories" ON public.categories;
DROP POLICY IF EXISTS "Storekeepers delete categories" ON public.categories;
CREATE POLICY "Editors insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update categories" ON public.categories FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete categories" ON public.categories FOR DELETE TO authenticated USING ((SELECT private.can_write()));

DROP POLICY IF EXISTS "Storekeepers insert stock" ON public.stock_items;
DROP POLICY IF EXISTS "Storekeepers update stock" ON public.stock_items;
DROP POLICY IF EXISTS "Storekeepers delete stock" ON public.stock_items;
CREATE POLICY "Editors insert stock" ON public.stock_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update stock" ON public.stock_items FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete stock" ON public.stock_items FOR DELETE TO authenticated USING ((SELECT private.can_write()));

DROP POLICY IF EXISTS "Storekeepers insert movements" ON public.stock_movements;
CREATE POLICY "Editors insert movements" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_write()) AND performed_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Storekeepers insert logs" ON public.activity_logs;
CREATE POLICY "Editors insert logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_write()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Storekeepers insert temp items" ON public.temp_stock_items;
DROP POLICY IF EXISTS "Storekeepers update temp items" ON public.temp_stock_items;
DROP POLICY IF EXISTS "Storekeepers delete temp items" ON public.temp_stock_items;
CREATE POLICY "Editors insert temp items" ON public.temp_stock_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update temp items" ON public.temp_stock_items FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete temp items" ON public.temp_stock_items FOR DELETE TO authenticated USING ((SELECT private.can_write()));

DROP POLICY IF EXISTS "Storekeepers insert temp checkouts" ON public.temp_stock_checkouts;
DROP POLICY IF EXISTS "Storekeepers update temp checkouts" ON public.temp_stock_checkouts;
DROP POLICY IF EXISTS "Storekeepers delete temp checkouts" ON public.temp_stock_checkouts;
CREATE POLICY "Editors insert temp checkouts" ON public.temp_stock_checkouts FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update temp checkouts" ON public.temp_stock_checkouts FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete temp checkouts" ON public.temp_stock_checkouts FOR DELETE TO authenticated USING ((SELECT private.can_write()));

-- The shop's existing account becomes the owner
UPDATE public.user_roles SET role = 'owner'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'shemaabdul20@gmail.com');
