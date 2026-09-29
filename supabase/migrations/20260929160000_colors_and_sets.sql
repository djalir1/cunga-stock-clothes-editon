-- ============================================================
-- Shop colours (custom colours saved with their swatch) and
-- outfit sets (e.g. shirt + trousers sold together or separately)
-- ============================================================

-- ── Saved colours ──
CREATE TABLE public.shop_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  hex TEXT NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX idx_shop_colors_name ON public.shop_colors(lower(name));
CREATE INDEX idx_shop_colors_created_by ON public.shop_colors(created_by);

ALTER TABLE public.shop_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read colours" ON public.shop_colors FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add colours" ON public.shop_colors FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change colours" ON public.shop_colors FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove colours" ON public.shop_colors FOR DELETE TO authenticated USING ((SELECT private.can_write()));

-- ── Outfit sets: a named group of items. Stock stays on the parts, so a set is
--    "available" when every part has a piece; parts can still be sold alone. ──
CREATE TABLE public.item_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  usual_price NUMERIC(12, 2) CHECK (usual_price >= 0), -- hint for the full set; agreed price typed at sale
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_item_sets_category ON public.item_sets(category_id);
CREATE INDEX idx_item_sets_created_by ON public.item_sets(created_by);
CREATE TRIGGER update_item_sets_updated_at BEFORE UPDATE ON public.item_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.item_set_parts (
  set_id UUID NOT NULL REFERENCES public.item_sets(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, item_id)
);
CREATE INDEX idx_item_set_parts_item ON public.item_set_parts(item_id);

ALTER TABLE public.item_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_set_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sets" ON public.item_sets FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add sets" ON public.item_sets FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change sets" ON public.item_sets FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove sets" ON public.item_sets FOR DELETE TO authenticated USING ((SELECT private.can_write()));
CREATE POLICY "Staff read set parts" ON public.item_set_parts FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors add set parts" ON public.item_set_parts FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors change set parts" ON public.item_set_parts FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors remove set parts" ON public.item_set_parts FOR DELETE TO authenticated USING ((SELECT private.can_write()));

-- ── Sale lines remember which set they were sold in (receipt groups them) ──
ALTER TABLE public.sale_items ADD COLUMN set_name TEXT;

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

  -- Lock variants in a fixed order so two sales can't deadlock
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
    INSERT INTO public.sale_items (sale_id, variant_id, item_name, size, color, category_name, set_name, quantity, unit_price)
    VALUES (v_sale, v.id, v.item_name, v.size, v.color, v.category_name, NULLIF(btrim(l.set_name), ''), l.quantity, l.unit_price);
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_colors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_sets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_set_parts;
