-- ============================================================
-- 1. Cancel (void) a sale — owner only; stock goes back, record kept
-- 2. Cost snapshot on every sale line, for profit reports (Phase 4)
-- 3. Suppliers and purchase orders: what's ordered, in transit,
--    and confirming what actually arrived
-- ============================================================

-- ── 1. Cancelled sales ──
ALTER TABLE public.sales
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN void_reason TEXT;
CREATE INDEX idx_sales_voided_by ON public.sales(voided_by);

-- SECURITY DEFINER because sales / debts are not updatable from the app; the
-- function itself checks the caller is the owner.
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id UUID, p_reason TEXT)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE s RECORD; l RECORD; v RECORD; v_paid NUMERIC(12, 2);
BEGIN
  IF NOT private.has_role('owner') THEN
    RAISE EXCEPTION 'Only the owner can cancel a sale' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Say why the sale is cancelled'; END IF;

  SELECT * INTO s FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF s.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This sale is already cancelled'; END IF;

  FOR l IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id AND variant_id IS NOT NULL ORDER BY variant_id LOOP
    SELECT * INTO v FROM public.stock_variants WHERE id = l.variant_id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.stock_variants SET quantity = quantity + l.quantity, sold = GREATEST(sold - l.quantity, 0) WHERE id = v.id;
      INSERT INTO public.stock_movements (item_id, variant_id, sale_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
      VALUES (v.item_id, v.id, p_sale_id, 'adjusted', l.quantity, v.quantity, v.quantity + l.quantity,
              'Sale #' || s.receipt_no || ' cancelled: ' || btrim(p_reason), auth.uid());
    END IF;
  END LOOP;

  -- Money actually taken for this sale (counter payment + any repayments) must be handed back
  SELECT s.amount_paid + COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_initial), 0) INTO v_paid
    FROM public.debts d LEFT JOIN public.debt_payments p ON p.debt_id = d.id WHERE d.sale_id = p_sale_id;
  v_paid := COALESCE(v_paid, s.amount_paid);
  DELETE FROM public.debts WHERE sale_id = p_sale_id;

  UPDATE public.sales SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) WHERE id = p_sale_id;
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'sale_cancelled', 'sale', p_sale_id,
          jsonb_build_object('receipt', s.receipt_no, 'total', s.total, 'refund', v_paid, 'reason', btrim(p_reason)));
  RETURN v_paid;
END;
$$;
REVOKE ALL ON FUNCTION public.void_sale(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_sale(UUID, TEXT) TO authenticated;

-- Balances ignore cancelled sales' debts automatically (they are deleted above).

-- ── 2. Cost of each piece at the time of sale ──
ALTER TABLE public.sale_items ADD COLUMN unit_cost NUMERIC(12, 2);
UPDATE public.sale_items si SET unit_cost = v.cost_price FROM public.stock_variants v WHERE v.id = si.variant_id;

CREATE OR REPLACE FUNCTION public.record_sale(
  p_lines JSONB,
  p_customer_id UUID DEFAULT NULL, p_customer_name TEXT DEFAULT NULL, p_customer_phone TEXT DEFAULT NULL,
  p_amount_paid NUMERIC DEFAULT NULL, p_due_date DATE DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash', p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'pos'
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_customer UUID; v_customer_name TEXT; v_sale UUID; v_debt UUID;
  v_total NUMERIC(12, 2) := 0; v_paid NUMERIC(12, 2); v_status TEXT;
  l RECORD; v RECORD;
BEGIN
  PERFORM private.require_editor();
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'A sale needs at least one item'; END IF;

  FOR l IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC, set_name TEXT) LOOP
    IF l.variant_id IS NULL THEN RAISE EXCEPTION 'Each line needs an item'; END IF;
    IF COALESCE(l.quantity, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be more than zero'; END IF;
    IF l.unit_price IS NULL OR l.unit_price < 0 THEN RAISE EXCEPTION 'Enter the price agreed for each item'; END IF;
    v_total := v_total + l.quantity * l.unit_price;
  END LOOP;

  v_paid := COALESCE(p_amount_paid, v_total);
  IF v_paid < 0 OR v_paid > v_total THEN RAISE EXCEPTION 'Amount paid must be between 0 and the total'; END IF;
  v_status := CASE WHEN v_paid = v_total THEN 'paid' WHEN v_paid = 0 THEN 'credit' ELSE 'partial' END;

  v_customer := private.resolve_customer(p_customer_id, p_customer_name, p_customer_phone);
  IF v_status <> 'paid' AND v_customer IS NULL THEN
    RAISE EXCEPTION 'A customer is required when the sale is not fully paid';
  END IF;
  SELECT name INTO v_customer_name FROM public.customers WHERE id = v_customer;

  INSERT INTO public.sales (customer_id, customer_name, total, amount_paid, payment_status, payment_method, source, notes)
  VALUES (v_customer, v_customer_name, v_total, v_paid, v_status, COALESCE(p_payment_method, 'cash'),
          COALESCE(p_source, 'pos'), NULLIF(btrim(p_notes), ''))
  RETURNING id INTO v_sale;

  FOR l IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC, set_name TEXT)
    ORDER BY variant_id
  LOOP
    SELECT sv.*, si.name AS item_name, c.name AS category_name INTO v
      FROM public.stock_variants sv
      JOIN public.stock_items si ON si.id = sv.item_id
      LEFT JOIN public.categories c ON c.id = si.category_id
     WHERE sv.id = l.variant_id FOR UPDATE OF sv;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF v.quantity < l.quantity THEN
      RAISE EXCEPTION 'Not enough stock for %: only % left', private.variant_label(v.item_name, v.size, v.color), v.quantity;
    END IF;

    UPDATE public.stock_variants SET quantity = quantity - l.quantity, sold = sold + l.quantity WHERE id = v.id;
    INSERT INTO public.sale_items (sale_id, variant_id, item_name, size, color, category_name, set_name, quantity, unit_price, unit_cost)
    VALUES (v_sale, v.id, v.item_name, v.size, v.color, v.category_name, NULLIF(btrim(l.set_name), ''), l.quantity, l.unit_price, v.cost_price);
    INSERT INTO public.stock_movements (item_id, variant_id, sale_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
    VALUES (v.item_id, v.id, v_sale, 'issued', -l.quantity, v.quantity, v.quantity - l.quantity,
            CASE WHEN v_customer_name IS NOT NULL THEN 'Sold to: ' || v_customer_name ELSE 'Sold' END, auth.uid());
  END LOOP;

  IF v_status <> 'paid' THEN
    INSERT INTO public.debts (customer_id, sale_id, amount, due_date)
    VALUES (v_customer, v_sale, v_total, p_due_date) RETURNING id INTO v_debt;
    IF v_paid > 0 THEN
      INSERT INTO public.debt_payments (debt_id, amount, method, note, is_initial)
      VALUES (v_debt, v_paid, COALESCE(p_payment_method, 'cash'), 'Paid at time of sale', true);
    END IF;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'sold', 'sale', v_sale,
          jsonb_build_object('total', v_total, 'paid', v_paid, 'status', v_status, 'customer', v_customer_name));
  RETURN v_sale;
END;
$$;

-- ── 3. Suppliers & purchase orders ──
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  phone TEXT,
  location TEXT,               -- e.g. "Kampala", "Guangzhou", "Nyabugogo"
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX idx_suppliers_name ON public.suppliers(lower(name));
CREATE INDEX idx_suppliers_created_by ON public.suppliers(created_by);

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,                      -- snapshot
  status TEXT NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered', 'in_transit', 'partial', 'received', 'cancelled')),
  ordered_on DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_on DATE,
  transport TEXT,                          -- how it's coming: bus company, DHL, envelope / parcel number
  tracking_ref TEXT,
  shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0), -- paid to the supplier so far
  notes TEXT,
  received_on DATE,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,                 -- snapshot
  size TEXT,
  color TEXT,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost NUMERIC(12, 2) CHECK (unit_cost >= 0),
  line_total NUMERIC(12, 2) GENERATED ALWAYS AS (quantity_ordered * COALESCE(unit_cost, 0)) STORED
);
CREATE INDEX idx_po_lines_po ON public.purchase_order_lines(po_id);
CREATE INDEX idx_po_lines_item ON public.purchase_order_lines(item_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read suppliers" ON public.suppliers FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change suppliers" ON public.suppliers FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove suppliers" ON public.suppliers FOR DELETE TO authenticated USING ((SELECT private.can_write()));
CREATE POLICY "Staff read orders" ON public.purchase_orders FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add orders" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change orders" ON public.purchase_orders FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove orders" ON public.purchase_orders FOR DELETE TO authenticated USING ((SELECT private.can_write()) AND status IN ('ordered', 'cancelled'));
CREATE POLICY "Staff read order lines" ON public.purchase_order_lines FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add order lines" ON public.purchase_order_lines FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change order lines" ON public.purchase_order_lines FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove order lines" ON public.purchase_order_lines FOR DELETE TO authenticated USING ((SELECT private.can_write()));

-- New order. p_lines: [{item_id, size, color, quantity, unit_cost}]
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_lines JSONB,
  p_supplier_id UUID DEFAULT NULL, p_supplier_name TEXT DEFAULT NULL, p_supplier_phone TEXT DEFAULT NULL,
  p_expected_on DATE DEFAULT NULL, p_transport TEXT DEFAULT NULL, p_tracking_ref TEXT DEFAULT NULL,
  p_shipping_cost NUMERIC DEFAULT 0, p_amount_paid NUMERIC DEFAULT 0, p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'ordered'
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_supplier UUID := p_supplier_id; v_supplier_name TEXT; v_po UUID; l RECORD; v_item_name TEXT;
BEGIN
  PERFORM private.require_editor();
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Add at least one item to the order'; END IF;
  IF p_status NOT IN ('ordered', 'in_transit') THEN RAISE EXCEPTION 'A new order is either ordered or on the way'; END IF;

  IF v_supplier IS NULL AND NULLIF(btrim(p_supplier_name), '') IS NOT NULL THEN
    SELECT id INTO v_supplier FROM public.suppliers WHERE lower(name) = lower(btrim(p_supplier_name));
    IF v_supplier IS NULL THEN
      INSERT INTO public.suppliers (name, phone) VALUES (btrim(p_supplier_name), NULLIF(btrim(p_supplier_phone), ''))
      RETURNING id INTO v_supplier;
    END IF;
  END IF;
  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = v_supplier;

  INSERT INTO public.purchase_orders (supplier_id, supplier_name, status, expected_on, transport, tracking_ref, shipping_cost, amount_paid, notes)
  VALUES (v_supplier, v_supplier_name, p_status, p_expected_on, NULLIF(btrim(p_transport), ''), NULLIF(btrim(p_tracking_ref), ''),
          COALESCE(p_shipping_cost, 0), COALESCE(p_amount_paid, 0), NULLIF(btrim(p_notes), ''))
  RETURNING id INTO v_po;

  FOR l IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(item_id UUID, size TEXT, color TEXT, quantity INT, unit_cost NUMERIC) LOOP
    IF COALESCE(l.quantity, 0) <= 0 THEN RAISE EXCEPTION 'Each line needs a quantity'; END IF;
    SELECT name INTO v_item_name FROM public.stock_items WHERE id = l.item_id;
    IF v_item_name IS NULL THEN RAISE EXCEPTION 'Pick an item for every line'; END IF;
    INSERT INTO public.purchase_order_lines (po_id, item_id, item_name, size, color, quantity_ordered, unit_cost)
    VALUES (v_po, l.item_id, v_item_name, NULLIF(btrim(l.size), ''), NULLIF(btrim(l.color), ''), l.quantity, l.unit_cost);
  END LOOP;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'ordered', 'purchase_order', v_po, jsonb_build_object('supplier', v_supplier_name));
  RETURN v_po;
END;
$$;

-- Goods arrived: p_lines [{line_id, quantity}] = pieces that arrived now.
-- Adds them to stock (creating the size/colour if it's new) and updates the order status.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id UUID, p_lines JSONB)
RETURNS TEXT LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE po RECORD; r RECORD; ln RECORD; v RECORD; v_variant UUID; v_any BOOLEAN := false; v_status TEXT;
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
     SET status = v_status, received_on = CASE WHEN v_status = 'received' THEN CURRENT_DATE ELSE received_on END
   WHERE id = p_po_id;
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'received', 'purchase_order', p_po_id, jsonb_build_object('order', po.po_no, 'status', v_status));
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(JSONB, UUID, TEXT, TEXT, DATE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(JSONB, UUID, TEXT, TEXT, DATE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
