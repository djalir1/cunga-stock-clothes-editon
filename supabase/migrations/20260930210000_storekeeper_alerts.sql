-- Storekeepers can get phone alerts too, like supervisors: the owner picks which kinds
-- (shop_settings.storekeeper_alerts), each storekeeper switches them on or off for themselves.
-- Default: what matters on the shop floor (stock running low, clothes out on approval, deliveries, debts).
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS storekeeper_alerts TEXT[] NOT NULL
    DEFAULT ARRAY['low_stock', 'temp_stock', 'orders', 'debt_due', 'debt_overdue'];

-- Everyone with a role can save their own alert choices
DROP POLICY IF EXISTS "Own prefs: add" ON public.notification_prefs;
CREATE POLICY "Own prefs: add" ON public.notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_staff()));

CREATE OR REPLACE FUNCTION public.notification_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin') THEN RAISE EXCEPTION 'Only the developers can see this'; END IF;
  RETURN jsonb_build_object(
    'supervisor_alerts', (SELECT to_jsonb(supervisor_alerts) FROM public.shop_settings WHERE id = 1),
    'storekeeper_alerts', (SELECT to_jsonb(storekeeper_alerts) FROM public.shop_settings WHERE id = 1),
    'people', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', r.user_id,
               'name', COALESCE(p.full_name, 'Unknown'),
               'role', r.role,
               'prefs', (SELECT to_jsonb(np) - 'user_id' - 'updated_at' FROM public.notification_prefs np WHERE np.user_id = r.user_id),
               'devices', COALESCE((SELECT jsonb_agg(jsonb_build_object('device', s.device, 'include_own', s.include_own,
                                                                        'added', s.created_at, 'last_sent_at', s.last_sent_at)
                                                     ORDER BY s.created_at)
                                      FROM public.push_subscriptions s WHERE s.user_id = r.user_id), '[]'::jsonb))
             ORDER BY r.role, p.full_name)
        FROM public.user_roles r LEFT JOIN public.profiles p ON p.user_id = r.user_id), '[]'::jsonb));
END;
$$;
