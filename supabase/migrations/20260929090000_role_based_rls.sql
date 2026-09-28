-- ============================================================
-- Role-based RLS: storekeepers write, admins read only.
-- Role helpers move to a non-exposed "private" schema so they
-- can't be called over the API (Supabase advisor lint 0029).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- True only for a signed-in user holding the given role
CREATE OR REPLACE FUNCTION private.has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = _role
  )
$$;

-- True for any signed-in user with a role (storekeeper or admin)
CREATE OR REPLACE FUNCTION private.is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff() TO authenticated;

-- ── Drop old policies ──
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can manage stock" ON public.stock_items;
DROP POLICY IF EXISTS "Authenticated users can view movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can insert movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can view logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can manage temp items" ON public.temp_stock_items;
DROP POLICY IF EXISTS "Authenticated users can manage temp checkouts" ON public.temp_stock_checkouts;

DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_role(UUID);

-- ── user_roles: everyone reads their own; admins read all and manage roles ──
CREATE POLICY "Users read own role, admins read all" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.has_role('admin')));
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('admin')));
CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('admin'))) WITH CHECK ((SELECT private.has_role('admin')));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING ((SELECT private.has_role('admin')));

-- ── Stock tables: staff read, storekeepers write ──
CREATE POLICY "Staff read categories" ON public.categories FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers update categories" ON public.categories FOR UPDATE TO authenticated USING ((SELECT private.has_role('storekeeper'))) WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers delete categories" ON public.categories FOR DELETE TO authenticated USING ((SELECT private.has_role('storekeeper')));

CREATE POLICY "Staff read stock" ON public.stock_items FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert stock" ON public.stock_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers update stock" ON public.stock_items FOR UPDATE TO authenticated USING ((SELECT private.has_role('storekeeper'))) WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers delete stock" ON public.stock_items FOR DELETE TO authenticated USING ((SELECT private.has_role('storekeeper')));

-- Movements and logs are an audit trail: insert only, no update/delete
CREATE POLICY "Staff read movements" ON public.stock_movements FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert movements" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('storekeeper')) AND performed_by = (SELECT auth.uid()));

CREATE POLICY "Staff read logs" ON public.activity_logs FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_role('storekeeper')) AND user_id = (SELECT auth.uid()));

CREATE POLICY "Staff read temp items" ON public.temp_stock_items FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert temp items" ON public.temp_stock_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers update temp items" ON public.temp_stock_items FOR UPDATE TO authenticated USING ((SELECT private.has_role('storekeeper'))) WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers delete temp items" ON public.temp_stock_items FOR DELETE TO authenticated USING ((SELECT private.has_role('storekeeper')));

CREATE POLICY "Staff read temp checkouts" ON public.temp_stock_checkouts FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Storekeepers insert temp checkouts" ON public.temp_stock_checkouts FOR INSERT TO authenticated WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers update temp checkouts" ON public.temp_stock_checkouts FOR UPDATE TO authenticated USING ((SELECT private.has_role('storekeeper'))) WITH CHECK ((SELECT private.has_role('storekeeper')));
CREATE POLICY "Storekeepers delete temp checkouts" ON public.temp_stock_checkouts FOR DELETE TO authenticated USING ((SELECT private.has_role('storekeeper')));
