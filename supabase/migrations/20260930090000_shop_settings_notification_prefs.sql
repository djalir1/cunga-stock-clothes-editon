-- ============================================================
-- Shop settings (name, logo… on receipts), notification choices for the
-- owner / supervisor, who received an order, and more phone alerts:
-- low stock (instant), order arrived (instant), daily 8:00 reminders
-- (debts due soon / overdue, deliveries due / late, temporary stock due
-- back, low stock, yesterday's sales).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Shop settings: one row ──
CREATE TABLE public.shop_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Cunga Stock' CHECK (btrim(name) <> ''),
  tagline TEXT DEFAULT 'Clothing Store',
  location TEXT DEFAULT 'Kigali, Rwanda',
  phone TEXT,
  email TEXT,
  tin TEXT,                                       -- tax number printed on receipts
  logo_url TEXT,
  receipt_footer TEXT DEFAULT 'Murakoze! Thank you for shopping with us.',
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_shop_settings_updated_by ON public.shop_settings(updated_by);
INSERT INTO public.shop_settings (id) VALUES (1);
CREATE TRIGGER update_shop_settings_updated_at BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read shop settings" ON public.shop_settings FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Owner changes shop settings" ON public.shop_settings FOR UPDATE TO authenticated
  USING ((SELECT private.has_role('owner'))) WITH CHECK ((SELECT private.has_role('owner')));

-- ── What each owner / supervisor wants to be notified about ──
CREATE TABLE public.notification_prefs (
  user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sales BOOLEAN NOT NULL DEFAULT true,
  sale_cancelled BOOLEAN NOT NULL DEFAULT true,
  low_stock BOOLEAN NOT NULL DEFAULT true,
  debt_due BOOLEAN NOT NULL DEFAULT true,
  debt_due_days INTEGER NOT NULL DEFAULT 2 CHECK (debt_due_days BETWEEN 0 AND 14),
  debt_overdue BOOLEAN NOT NULL DEFAULT true,
  orders BOOLEAN NOT NULL DEFAULT true,
  temp_stock BOOLEAN NOT NULL DEFAULT true,
  daily_summary BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own prefs: read" ON public.notification_prefs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Own prefs: add" ON public.notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND ((SELECT private.has_role('owner')) OR (SELECT private.has_role('admin'))));
CREATE POLICY "Own prefs: change" ON public.notification_prefs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Who checked an order in ──
ALTER TABLE public.purchase_orders ADD COLUMN received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_purchase_orders_received_by ON public.purchase_orders(received_by);

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id UUID, p_lines JSONB)
RETURNS TEXT LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE po RECORD; r RECORD; ln RECORD; v RECORD; v_any BOOLEAN := false; v_status TEXT;
BEGIN
  PERFORM private.require_editor();
  SELECT * INTO po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF po.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'This order is already %', po.status; END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(line_id UUID, quantity INT) WHERE COALESCE(quantity, 0) > 0 LOOP
    SELECT * INTO ln FROM public.purchase_order_lines WHERE id = r.line_id AND po_id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order line not found'; END IF;
    IF ln.item_id IS NULL THEN RAISE EXCEPTION '% was deleted from stock; add it again first', ln.item_name; END IF;

    SELECT * INTO v FROM public.stock_variants
     WHERE item_id = ln.item_id
       AND lower(COALESCE(size, '')) = lower(COALESCE(ln.size, ''))
       AND lower(COALESCE(color, '')) = lower(COALESCE(ln.color, ''))
     FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.stock_variants (item_id, size, color, quantity, total_added, cost_price,
                                         default_price)
      VALUES (ln.item_id, ln.size, ln.color, 0, 0, ln.unit_cost,
              (SELECT default_price FROM public.stock_variants WHERE item_id = ln.item_id AND default_price IS NOT NULL LIMIT 1))
      RETURNING * INTO v;
    END IF;

    UPDATE public.stock_variants
       SET quantity = quantity + r.quantity, total_added = total_added + r.quantity,
           cost_price = COALESCE(ln.unit_cost, cost_price)
     WHERE id = v.id;
    INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
    VALUES (v.item_id, v.id, 'added', r.quantity, v.quantity, v.quantity + r.quantity,
            'Received order #' || po.po_no || COALESCE(' from ' || po.supplier_name, ''), auth.uid());
    UPDATE public.purchase_order_lines SET quantity_received = quantity_received + r.quantity WHERE id = ln.id;
    v_any := true;
  END LOOP;
  IF NOT v_any THEN RAISE EXCEPTION 'Enter how many pieces arrived'; END IF;

  v_status := CASE WHEN EXISTS (SELECT 1 FROM public.purchase_order_lines WHERE po_id = p_po_id AND quantity_received < quantity_ordered)
                   THEN 'partial' ELSE 'received' END;
  UPDATE public.purchase_orders
     SET status = v_status, received_on = CASE WHEN v_status = 'received' THEN CURRENT_DATE ELSE received_on END,
         received_by = auth.uid()
   WHERE id = p_po_id;
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'received', 'purchase_order', p_po_id, jsonb_build_object('order', po.po_no, 'status', v_status));
  RETURN v_status;
END;
$$;

-- ── Alerts: one helper that queues a call to the notify function ──
CREATE OR REPLACE FUNCTION private.push(p_body JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://grtacefgvlefghagqlma.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret')),
    body := p_body);
EXCEPTION WHEN OTHERS THEN
  NULL; -- alerts are best-effort; never block the shop
END;
$$;
REVOKE ALL ON FUNCTION private.push(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.push_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM private.push(jsonb_build_object('action', 'sale', 'sale_id', NEW.id, 'actor', auth.uid()));
    ELSIF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
      PERFORM private.push(jsonb_build_object('action', 'sale_cancelled', 'sale_id', NEW.id, 'actor', auth.uid()));
    END IF;
  ELSIF TG_TABLE_NAME = 'stock_items' THEN
    -- Just went low or sold out
    IF NEW.status <> 'in_stock' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'out_of_stock' AND NEW.status = 'low_stock') THEN
      PERFORM private.push(jsonb_build_object('action', 'low_stock', 'item_id', NEW.id, 'actor', auth.uid()));
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    IF NEW.status IN ('received', 'partial') AND NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM private.push(jsonb_build_object('action', 'order_received', 'order_id', NEW.id, 'actor', auth.uid()));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.push_event() FROM PUBLIC, anon, authenticated;

-- WHEN instead of "UPDATE OF status": the status is set by a BEFORE trigger when quantity changes
CREATE TRIGGER stock_items_push_notify
  AFTER UPDATE ON public.stock_items
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.push_event();
CREATE TRIGGER purchase_orders_push_notify
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.push_event();

-- ── Daily reminders at 08:00 Kigali (06:00 UTC) ──
SELECT cron.schedule('daily-shop-reminders', '0 6 * * *', $cron$SELECT private.push('{"action":"daily"}'::jsonb)$cron$);

ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_settings;
