-- ============================================================
-- Phone alerts for every action in the shop, for the owner and the
-- developers (the 'admin' role = us, the people who build the app).
--
-- New alerts: stock added / restocked / edited / deleted, prices changed,
-- customer payments, new customers, temporary stock out / back / deleted,
-- new orders and cancelled orders, new accounts waiting for approval.
-- Each one can be switched off in Settings → Phone notifications.
--
-- One action = one alert. A sale also moves stock and may create a
-- customer; only the sale alert is sent. "Main" events (sale, new item,
-- order, temporary stock…) fire at once and mark the transaction; the
-- smaller ones (stock movements, payments, customers, edits) are
-- deferred to commit time and stay quiet when a main event happened.
-- ============================================================

ALTER TABLE public.notification_prefs
  ADD COLUMN stock_changes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN payments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN customers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN new_accounts BOOLEAN NOT NULL DEFAULT true;

-- ── Helpers ──
-- private.push stays quiet while the sample-data script runs (SET LOCAL cunga.silent = '1')
CREATE OR REPLACE FUNCTION private.push(p_body JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF current_setting('cunga.silent', true) = '1' THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION private.mark_main_event()
RETURNS VOID LANGUAGE sql SET search_path = ''
AS $$ SELECT set_config('cunga.main_event', '1', true) $$;

CREATE OR REPLACE FUNCTION private.had_main_event()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT COALESCE(current_setting('cunga.main_event', true), '') = '1' $$;

-- true the first time it is called for this kind in this transaction
CREATE OR REPLACE FUNCTION private.first_in_tx(p_kind TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('cunga.pushed_' || p_kind, true), '') = '1' THEN RETURN false; END IF;
  PERFORM set_config('cunga.pushed_' || p_kind, '1', true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.mark_main_event(), private.had_main_event(), private.first_in_tx(TEXT) FROM PUBLIC, anon, authenticated;

-- ── Existing alerts (sales, low stock, orders) + new/cancelled orders ──
CREATE OR REPLACE FUNCTION private.push_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    PERFORM private.mark_main_event();
    IF TG_OP = 'INSERT' THEN
      PERFORM private.push(jsonb_build_object('action', 'sale', 'sale_id', NEW.id, 'actor', auth.uid()));
    ELSIF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
      PERFORM private.push(jsonb_build_object('action', 'sale_cancelled', 'sale_id', NEW.id, 'actor', auth.uid()));
    END IF;
  ELSIF TG_TABLE_NAME = 'stock_items' THEN
    IF NEW.status <> 'in_stock' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'out_of_stock' AND NEW.status = 'low_stock') THEN
      PERFORM private.push(jsonb_build_object('action', 'low_stock', 'item_id', NEW.id, 'actor', auth.uid()));
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    PERFORM private.mark_main_event();
    IF TG_OP = 'INSERT' THEN
      PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'order_created', 'order_id', NEW.id, 'actor', auth.uid()));
    ELSIF NEW.status IN ('received', 'partial') AND NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM private.push(jsonb_build_object('action', 'order_received', 'order_id', NEW.id, 'actor', auth.uid()));
    ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'order_cancelled', 'order_id', NEW.id, 'actor', auth.uid()));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.push_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER purchase_orders_push_new
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.push_event();

-- ── Main events that fire at once ──
CREATE OR REPLACE FUNCTION private.activity_now()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_log UUID;
BEGIN
  IF TG_TABLE_NAME = 'stock_items' AND TG_OP = 'INSERT' THEN
    PERFORM private.mark_main_event();
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'item_created', 'item_id', NEW.id, 'actor', auth.uid()));

  ELSIF TG_TABLE_NAME = 'stock_items' AND TG_OP = 'DELETE' THEN
    PERFORM private.mark_main_event();
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'deleted', 'stock_item', OLD.id, jsonb_build_object('name', OLD.name, 'quantity', OLD.quantity))
    RETURNING id INTO v_log;
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'item_deleted', 'log_id', v_log, 'actor', auth.uid()));
    RETURN OLD;

  ELSIF TG_TABLE_NAME = 'temp_stock_checkouts' AND TG_OP = 'INSERT' THEN
    PERFORM private.mark_main_event();
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'taken_on_approval', 'temp_stock', NEW.id,
            jsonb_build_object('customer', NEW.customer_name, 'item', NEW.item_name, 'quantity', NEW.quantity));
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'temp_out', 'checkout_id', NEW.id, 'actor', auth.uid()));

  ELSIF TG_TABLE_NAME = 'temp_stock_checkouts' AND TG_OP = 'UPDATE' THEN
    PERFORM private.mark_main_event();
    -- 'sold' is announced by the sale alert
    IF NEW.status = 'returned' AND OLD.status = 'out' THEN
      INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (auth.uid(), 'brought_back', 'temp_stock', NEW.id,
              jsonb_build_object('customer', NEW.customer_name, 'item', NEW.item_name, 'quantity', NEW.quantity));
      PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'temp_returned', 'checkout_id', NEW.id, 'actor', auth.uid()));
    END IF;

  ELSIF TG_TABLE_NAME = 'temp_stock_checkouts' AND TG_OP = 'DELETE' THEN
    PERFORM private.mark_main_event();
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'deleted', 'temp_stock', OLD.id,
            jsonb_build_object('customer', OLD.customer_name, 'item', OLD.item_name, 'quantity', OLD.quantity, 'status', OLD.status))
    RETURNING id INTO v_log;
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'temp_deleted', 'log_id', v_log, 'actor', auth.uid()));
    RETURN OLD;

  ELSIF TG_TABLE_NAME = 'profiles' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.user_id, 'signed_up', 'account', NEW.user_id, jsonb_build_object('name', NEW.full_name));
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'new_account', 'user_id', NEW.user_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD); -- never block the shop
END;
$$;
REVOKE EXECUTE ON FUNCTION private.activity_now() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stock_items_activity_new AFTER INSERT ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION private.activity_now();
CREATE TRIGGER stock_items_activity_deleted AFTER DELETE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION private.activity_now();
CREATE TRIGGER temp_stock_activity AFTER INSERT OR DELETE OR UPDATE OF status ON public.temp_stock_checkouts
  FOR EACH ROW EXECUTE FUNCTION private.activity_now();
CREATE TRIGGER profiles_activity_new AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.activity_now();

-- ── Smaller events, checked at commit (quiet if a main event happened) ──
CREATE OR REPLACE FUNCTION private.activity_at_commit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_log UUID; v_changes JSONB; v_name TEXT;
BEGIN
  IF private.had_main_event() THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'stock_movements' THEN
    -- restocked / new size or colour / corrected; all rows of this action in one alert
    IF NEW.movement_type IN ('added', 'returned', 'adjusted') AND private.first_in_tx('moves') THEN
      INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
      SELECT auth.uid(), 'restocked', 'stock_item', NEW.item_id,
             jsonb_build_object('pieces', SUM(m.quantity), 'at', now(),
               'lines', jsonb_agg(jsonb_build_object('item', i.name, 'size', v.size, 'color', v.color,
                                                     'quantity', m.quantity, 'type', m.movement_type, 'note', m.notes)))
        FROM public.stock_movements m
        JOIN public.stock_items i ON i.id = m.item_id
        LEFT JOIN public.stock_variants v ON v.id = m.variant_id
       WHERE m.created_at = now() AND m.performed_by IS NOT DISTINCT FROM auth.uid()
         AND m.movement_type IN ('added', 'returned', 'adjusted')
      RETURNING id INTO v_log;
      PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'stock_moves', 'log_id', v_log, 'actor', auth.uid()));
    END IF;

  ELSIF TG_TABLE_NAME = 'debt_payments' THEN
    IF NOT NEW.is_initial AND private.first_in_tx('payment') THEN
      -- "Pay all" already writes its own log line
      IF NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE action = 'debt_payment' AND created_at = now()) THEN
        INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
        SELECT auth.uid(), 'debt_payment', 'customer', d.customer_id,
               jsonb_build_object('customer', c.name, 'amount', NEW.amount, 'method', NEW.method)
          FROM public.debts d LEFT JOIN public.customers c ON c.id = d.customer_id
         WHERE d.id = NEW.debt_id;
      END IF;
      PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'payment', 'at', now(), 'actor', auth.uid()));
    END IF;

  ELSIF TG_TABLE_NAME = 'customers' THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'created', 'customer', NEW.id, jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'customer_added', 'customer_id', NEW.id, 'actor', auth.uid()));

  ELSIF TG_TABLE_NAME = 'stock_items' THEN
    v_changes := '{}'::jsonb;
    IF NEW.name IS DISTINCT FROM OLD.name THEN v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(OLD.name, NEW.name)); END IF;
    IF NEW.min_quantity IS DISTINCT FROM OLD.min_quantity THEN v_changes := v_changes || jsonb_build_object('min_quantity', jsonb_build_array(OLD.min_quantity, NEW.min_quantity)); END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN v_changes := v_changes || jsonb_build_object('category', true); END IF;
    IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN v_changes := v_changes || jsonb_build_object('photo', true); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN v_changes := v_changes || jsonb_build_object('notes', true); END IF;
    IF v_changes = '{}'::jsonb THEN RETURN NULL; END IF;
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'updated', 'stock_item', NEW.id, v_changes || jsonb_build_object('item', NEW.name))
    RETURNING id INTO v_log;
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'item_edited', 'log_id', v_log, 'actor', auth.uid()));

  ELSIF TG_TABLE_NAME = 'stock_variants' THEN
    IF NOT private.first_in_tx('prices') THEN RETURN NULL; END IF;
    SELECT name INTO v_name FROM public.stock_items WHERE id = NEW.item_id;
    v_changes := jsonb_build_object('item', v_name);
    IF NEW.default_price IS DISTINCT FROM OLD.default_price THEN
      v_changes := v_changes || jsonb_build_object('price', jsonb_build_array(OLD.default_price, NEW.default_price));
    END IF;
    IF NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
      v_changes := v_changes || jsonb_build_object('cost', jsonb_build_array(OLD.cost_price, NEW.cost_price));
    END IF;
    -- A price for one size / colour only (the others differ)
    IF EXISTS (SELECT 1 FROM public.stock_variants WHERE item_id = NEW.item_id AND id <> NEW.id
                AND default_price IS DISTINCT FROM NEW.default_price) THEN
      v_changes := v_changes || jsonb_build_object('variant', concat_ws(', ', NEW.size, NEW.color));
    END IF;
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'updated', 'stock_item', NEW.item_id, v_changes)
    RETURNING id INTO v_log;
    PERFORM private.push(jsonb_build_object('action', 'activity', 'kind', 'item_edited', 'log_id', v_log, 'actor', auth.uid()));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- never block the shop
END;
$$;
REVOKE EXECUTE ON FUNCTION private.activity_at_commit() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER stock_movements_activity AFTER INSERT ON public.stock_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.activity_at_commit();
CREATE CONSTRAINT TRIGGER debt_payments_activity AFTER INSERT ON public.debt_payments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.activity_at_commit();
CREATE CONSTRAINT TRIGGER customers_activity AFTER INSERT ON public.customers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.activity_at_commit();
CREATE CONSTRAINT TRIGGER stock_items_activity_edited AFTER UPDATE ON public.stock_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.min_quantity IS DISTINCT FROM NEW.min_quantity
        OR OLD.category_id IS DISTINCT FROM NEW.category_id OR OLD.image_url IS DISTINCT FROM NEW.image_url
        OR OLD.notes IS DISTINCT FROM NEW.notes)
  EXECUTE FUNCTION private.activity_at_commit();
CREATE CONSTRAINT TRIGGER stock_variants_activity_prices AFTER UPDATE ON public.stock_variants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.default_price IS DISTINCT FROM NEW.default_price OR OLD.cost_price IS DISTINCT FROM NEW.cost_price)
        AND OLD.quantity = NEW.quantity)
  EXECUTE FUNCTION private.activity_at_commit();

-- ── Developers (admin role) ──
-- Only developers can make or change developer accounts; the owner can't
-- give out or take away the admin role (changes from the SQL editor are fine).
CREATE OR REPLACE FUNCTION private.protect_developer_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.has_role('admin')
     AND ((TG_OP <> 'DELETE' AND NEW.role = 'admin') OR (TG_OP <> 'INSERT' AND OLD.role = 'admin')) THEN
    RAISE EXCEPTION 'Developer accounts can only be changed by the developers';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION private.protect_developer_role() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_roles_protect_developers BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION private.protect_developer_role();

-- Developers can see who gets which alerts, and on which devices
CREATE OR REPLACE FUNCTION public.notification_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_role('admin') THEN RAISE EXCEPTION 'Only the developers can see this'; END IF;
  RETURN COALESCE((
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
      FROM public.user_roles r LEFT JOIN public.profiles p ON p.user_id = r.user_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.notification_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_overview() TO authenticated;
