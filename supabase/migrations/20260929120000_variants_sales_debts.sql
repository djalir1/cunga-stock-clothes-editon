-- ============================================================
-- Phase 1 — data model: variants, customers, sales, debts
--
-- * Stock lives on VARIANTS (item × size × colour). stock_items keeps
--   quantity / total_added / issued as automatic sums of its variants.
-- * Selling prices are never stored on an item: unit_price is captured
--   on every sale line. default_price on a variant is only a hint.
-- * All stock changes go through the functions at the bottom, which lock
--   the variant row so two people can't sell the same last piece.
-- ============================================================

-- ── Items: photo ──
ALTER TABLE public.stock_items ADD COLUMN image_url TEXT;

-- ── Variants ──
CREATE TABLE public.stock_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  size TEXT CHECK (size IS NULL OR btrim(size) <> ''),
  color TEXT CHECK (color IS NULL OR btrim(color) <> ''),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  total_added INTEGER NOT NULL DEFAULT 0 CHECK (total_added >= 0),
  sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  default_price NUMERIC(12, 2) CHECK (default_price >= 0), -- hint only, never enforced
  cost_price NUMERIC(12, 2) CHECK (cost_price >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT stock_variants_unique_option UNIQUE NULLS NOT DISTINCT (item_id, size, color)
);
CREATE INDEX idx_stock_variants_item ON public.stock_variants(item_id);

-- ── Customers ──
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  phone TEXT,
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_customers_name ON public.customers(lower(name));
CREATE INDEX idx_customers_created_by ON public.customers(created_by);

-- ── Sales ──
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,                         -- snapshot for receipts
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  amount_paid NUMERIC(12, 2) NOT NULL CHECK (amount_paid >= 0), -- paid at the counter
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'partial', 'credit')),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'other')),
  source TEXT NOT NULL DEFAULT 'pos' CHECK (source IN ('pos', 'stock', 'temp_stock')),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (amount_paid <= total)
);
CREATE INDEX idx_sales_customer ON public.sales(customer_id);
CREATE INDEX idx_sales_sold_at ON public.sales(sold_at);
CREATE INDEX idx_sales_created_by ON public.sales(created_by);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.stock_variants(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,                    -- snapshots: survive item deletion
  size TEXT,
  color TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0), -- negotiated, captured per line
  line_total NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_variant ON public.sale_items(variant_id);

-- ── Debts (Amadeni) ──
CREATE TABLE public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sale_id UUID UNIQUE REFERENCES public.sales(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_debts_customer ON public.debts(customer_id);
CREATE INDEX idx_debts_created_by ON public.debts(created_by);

CREATE TABLE public.debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'mobile_money', 'bank', 'other')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX idx_debt_payments_debt ON public.debt_payments(debt_id);
CREATE INDEX idx_debt_payments_created_by ON public.debt_payments(created_by);

-- balance = debt total − sum(payments); computed, never stored
CREATE VIEW public.debt_balances WITH (security_invoker = true) AS
SELECT
  d.id, d.customer_id, c.name AS customer_name, c.phone AS customer_phone,
  d.sale_id, d.amount, d.due_date, d.notes, d.created_at,
  COALESCE(p.paid, 0)::NUMERIC(12, 2) AS paid,
  (d.amount - COALESCE(p.paid, 0))::NUMERIC(12, 2) AS balance
FROM public.debts d
JOIN public.customers c ON c.id = d.customer_id
LEFT JOIN (SELECT debt_id, SUM(amount) AS paid FROM public.debt_payments GROUP BY debt_id) p ON p.debt_id = d.id;

-- ── Movements now point at a variant (and a sale when there is one) ──
ALTER TABLE public.stock_movements
  ADD COLUMN variant_id UUID REFERENCES public.stock_variants(id) ON DELETE CASCADE,
  ADD COLUMN sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;
CREATE INDEX idx_stock_movements_variant ON public.stock_movements(variant_id);
CREATE INDEX idx_stock_movements_sale ON public.stock_movements(sale_id);
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('added', 'issued', 'returned', 'adjusted', 'loaned', 'loan_returned'));
-- 'issued' = sold · 'loaned' = out with a customer on approval · 'loan_returned' = back on the shelf

-- ── Migrate existing flat stock: one default variant per item ──
INSERT INTO public.stock_variants (item_id, quantity, total_added, sold)
SELECT id, quantity, total_added, issued FROM public.stock_items;

UPDATE public.stock_movements m SET variant_id = v.id
FROM public.stock_variants v WHERE v.item_id = m.item_id AND m.variant_id IS NULL;
ALTER TABLE public.stock_movements ALTER COLUMN variant_id SET NOT NULL;

-- ── Keep item totals in sync with their variants ──
CREATE OR REPLACE FUNCTION private.sync_item_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_item UUID := COALESCE(NEW.item_id, OLD.item_id);
BEGIN
  UPDATE public.stock_items i SET
    quantity = s.q, total_added = s.a, issued = s.s
  FROM (
    SELECT COALESCE(SUM(quantity), 0)::INT AS q, COALESCE(SUM(total_added), 0)::INT AS a, COALESCE(SUM(sold), 0)::INT AS s
    FROM public.stock_variants WHERE item_id = v_item
  ) s
  WHERE i.id = v_item;
  RETURN NULL;
END;
$$;

CREATE TRIGGER stock_variants_sync_item
  AFTER INSERT OR UPDATE OF quantity, total_added, sold OR DELETE ON public.stock_variants
  FOR EACH ROW EXECUTE FUNCTION private.sync_item_totals();

CREATE TRIGGER update_stock_variants_updated_at BEFORE UPDATE ON public.stock_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Temporary stock now draws from real variants ──
ALTER TABLE public.temp_stock_checkouts
  ADD COLUMN variant_id UUID REFERENCES public.stock_variants(id) ON DELETE SET NULL,
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN item_name TEXT,
  ADD COLUMN size TEXT,
  ADD COLUMN color TEXT;
CREATE INDEX idx_temp_checkouts_variant ON public.temp_stock_checkouts(variant_id);
CREATE INDEX idx_temp_checkouts_customer ON public.temp_stock_checkouts(customer_id);
CREATE INDEX idx_temp_checkouts_sale ON public.temp_stock_checkouts(sale_id);

-- Move any separate temp items into main stock (on-shelf = available; pieces out stay out)
DO $$
DECLARE t RECORD; v_item UUID; v_variant UUID;
BEGIN
  FOR t IN SELECT * FROM public.temp_stock_items LOOP
    INSERT INTO public.stock_items (name, notes) VALUES (t.name, t.description) RETURNING id INTO v_item;
    INSERT INTO public.stock_variants (item_id, size, color, quantity, total_added)
    VALUES (v_item, NULLIF(btrim(t.size), ''), NULLIF(btrim(t.color), ''), t.available_quantity, t.total_quantity)
    RETURNING id INTO v_variant;
    UPDATE public.temp_stock_checkouts
      SET variant_id = v_variant, item_name = t.name, size = t.size, color = t.color
      WHERE item_id = t.id;
  END LOOP;
END $$;

ALTER TABLE public.temp_stock_checkouts DROP COLUMN item_id;
ALTER TABLE public.temp_stock_checkouts ALTER COLUMN item_name SET NOT NULL;
DROP TABLE public.temp_stock_items;

-- ── RLS: staff read, owner/storekeeper write ──
ALTER TABLE public.stock_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read variants" ON public.stock_variants FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert variants" ON public.stock_variants FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update variants" ON public.stock_variants FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete variants" ON public.stock_variants FOR DELETE TO authenticated USING ((SELECT private.can_write()));

CREATE POLICY "Staff read customers" ON public.customers FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update customers" ON public.customers FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors delete customers" ON public.customers FOR DELETE TO authenticated USING ((SELECT private.can_write()));

-- Sales, lines and payments are a financial record: no updates or deletes from the app
CREATE POLICY "Staff read sales" ON public.sales FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));

CREATE POLICY "Staff read sale items" ON public.sale_items FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert sale items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));

CREATE POLICY "Staff read debts" ON public.debts FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert debts" ON public.debts FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));
CREATE POLICY "Editors update debts" ON public.debts FOR UPDATE TO authenticated USING ((SELECT private.can_write())) WITH CHECK ((SELECT private.can_write()));

CREATE POLICY "Staff read debt payments" ON public.debt_payments FOR SELECT TO authenticated USING ((SELECT private.is_staff()));
CREATE POLICY "Editors insert debt payments" ON public.debt_payments FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_write()));

-- ── Storage: item photos ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('item-images', 'item-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Editors upload item images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND (SELECT private.can_write()));
CREATE POLICY "Editors update item images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND (SELECT private.can_write()));
CREATE POLICY "Editors delete item images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND (SELECT private.can_write()));

-- ============================================================
-- Stock operations. SECURITY INVOKER: they run as the caller, so RLS
-- still applies; each also checks can_write() for a clear error.
-- ============================================================

CREATE OR REPLACE FUNCTION private.require_editor()
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_write() THEN
    RAISE EXCEPTION 'You do not have permission to change stock' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Picks an existing customer (by id, or same name + phone) or creates one
CREATE OR REPLACE FUNCTION private.resolve_customer(p_id UUID, p_name TEXT, p_phone TEXT)
RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_id IS NOT NULL THEN RETURN p_id; END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.customers
   WHERE lower(name) = lower(btrim(p_name))
     AND COALESCE(phone, '') = COALESCE(NULLIF(btrim(p_phone), ''), '')
   ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.customers (name, phone)
    VALUES (btrim(p_name), NULLIF(btrim(p_phone), '')) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.variant_label(p_name TEXT, p_size TEXT, p_color TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p_name || COALESCE(' (' || NULLIF(concat_ws(' · ', p_size, p_color), '') || ')', '')
$$;

-- Create an item with its variants. p_variants: [{size, color, quantity, default_price, cost_price}]
CREATE OR REPLACE FUNCTION public.create_stock_item(
  p_name TEXT, p_category_id UUID, p_min_quantity INTEGER, p_variants JSONB,
  p_image_url TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_item UUID; v JSONB; v_variant UUID; v_qty INT;
BEGIN
  PERFORM private.require_editor();
  IF NULLIF(btrim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Item name is required'; END IF;
  IF p_variants IS NULL OR jsonb_array_length(p_variants) = 0 THEN
    p_variants := '[{}]'::JSONB; -- one default variant
  END IF;

  INSERT INTO public.stock_items (name, category_id, min_quantity, image_url, notes, created_by)
  VALUES (btrim(p_name), p_category_id, COALESCE(p_min_quantity, 5), p_image_url, p_notes, auth.uid())
  RETURNING id INTO v_item;

  FOR v IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    v_qty := COALESCE((v->>'quantity')::INT, 0);
    IF v_qty < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;
    INSERT INTO public.stock_variants (item_id, size, color, quantity, total_added, default_price, cost_price)
    VALUES (v_item, NULLIF(btrim(v->>'size'), ''), NULLIF(btrim(v->>'color'), ''), v_qty, v_qty,
            (v->>'default_price')::NUMERIC, (v->>'cost_price')::NUMERIC)
    RETURNING id INTO v_variant;
    IF v_qty > 0 THEN
      INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
      VALUES (v_item, v_variant, 'added', v_qty, 0, v_qty, 'Initial stock', auth.uid());
    END IF;
  END LOOP;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'created', 'stock_item', v_item, jsonb_build_object('name', btrim(p_name)));
  RETURN v_item;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'The same size and colour is listed twice';
END;
$$;

CREATE OR REPLACE FUNCTION public.add_stock_variant(
  p_item_id UUID, p_size TEXT, p_color TEXT, p_quantity INTEGER,
  p_default_price NUMERIC DEFAULT NULL, p_cost_price NUMERIC DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_variant UUID; v_qty INT := COALESCE(p_quantity, 0);
BEGIN
  PERFORM private.require_editor();
  IF v_qty < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;
  INSERT INTO public.stock_variants (item_id, size, color, quantity, total_added, default_price, cost_price)
  VALUES (p_item_id, NULLIF(btrim(p_size), ''), NULLIF(btrim(p_color), ''), v_qty, v_qty, p_default_price, p_cost_price)
  RETURNING id INTO v_variant;
  IF v_qty > 0 THEN
    INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
    VALUES (p_item_id, v_variant, 'added', v_qty, 0, v_qty, 'Initial stock', auth.uid());
  END IF;
  RETURN v_variant;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This item already has that size and colour';
END;
$$;

CREATE OR REPLACE FUNCTION public.restock_variant(p_variant_id UUID, p_quantity INTEGER, p_notes TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v RECORD;
BEGIN
  PERFORM private.require_editor();
  IF COALESCE(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be more than zero'; END IF;
  SELECT * INTO v FROM public.stock_variants WHERE id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;

  UPDATE public.stock_variants
     SET quantity = quantity + p_quantity, total_added = total_added + p_quantity
   WHERE id = p_variant_id;
  INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
  VALUES (v.item_id, p_variant_id, 'added', p_quantity, v.quantity, v.quantity + p_quantity, NULLIF(btrim(p_notes), ''), auth.uid());
  RETURN v.quantity + p_quantity;
END;
$$;

-- Record a sale. p_lines: [{variant_id, quantity, unit_price}]
-- p_amount_paid NULL = paid in full. Anything less creates a debt (needs a customer)
-- plus a debt payment for whatever was paid at the counter.
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

  -- Validate lines and total
  FOR l IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC) LOOP
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

  -- Lock variants in a fixed order so concurrent sales can't deadlock
  FOR l IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC)
    ORDER BY variant_id
  LOOP
    SELECT sv.*, si.name AS item_name INTO v
      FROM public.stock_variants sv JOIN public.stock_items si ON si.id = sv.item_id
     WHERE sv.id = l.variant_id FOR UPDATE OF sv;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF v.quantity < l.quantity THEN
      RAISE EXCEPTION 'Not enough stock for %: only % left', private.variant_label(v.item_name, v.size, v.color), v.quantity;
    END IF;

    UPDATE public.stock_variants SET quantity = quantity - l.quantity, sold = sold + l.quantity WHERE id = v.id;
    INSERT INTO public.sale_items (sale_id, variant_id, item_name, size, color, quantity, unit_price)
    VALUES (v_sale, v.id, v.item_name, v.size, v.color, l.quantity, l.unit_price);
    INSERT INTO public.stock_movements (item_id, variant_id, sale_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
    VALUES (v.item_id, v.id, v_sale, 'issued', -l.quantity, v.quantity, v.quantity - l.quantity,
            CASE WHEN v_customer_name IS NOT NULL THEN 'Sold to: ' || v_customer_name ELSE 'Sold' END, auth.uid());
  END LOOP;

  IF v_status <> 'paid' THEN
    INSERT INTO public.debts (customer_id, sale_id, amount, due_date)
    VALUES (v_customer, v_sale, v_total, p_due_date) RETURNING id INTO v_debt;
    IF v_paid > 0 THEN
      INSERT INTO public.debt_payments (debt_id, amount, method, note)
      VALUES (v_debt, v_paid, COALESCE(p_payment_method, 'cash'), 'Paid at time of sale');
    END IF;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'sold', 'sale', v_sale,
          jsonb_build_object('total', v_total, 'paid', v_paid, 'status', v_status, 'customer', v_customer_name));
  RETURN v_sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_debt_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'cash', p_note TEXT DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_amount NUMERIC(12, 2); v_paid NUMERIC(12, 2); v_balance NUMERIC(12, 2);
BEGIN
  PERFORM private.require_editor();
  SELECT amount INTO v_amount FROM public.debts WHERE id = p_debt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debt not found'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.debt_payments WHERE debt_id = p_debt_id;
  v_balance := v_amount - v_paid;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Payment must be more than zero'; END IF;
  IF p_amount > v_balance THEN RAISE EXCEPTION 'Payment is more than the balance of %', v_balance; END IF;

  INSERT INTO public.debt_payments (debt_id, amount, method, note)
  VALUES (p_debt_id, p_amount, COALESCE(p_method, 'cash'), NULLIF(btrim(p_note), ''));
  RETURN v_balance - p_amount;
END;
$$;

-- Customer takes pieces on approval / reserved: they leave the shelf
CREATE OR REPLACE FUNCTION public.check_out_temp(
  p_variant_id UUID, p_quantity INTEGER,
  p_customer_id UUID DEFAULT NULL, p_customer_name TEXT DEFAULT NULL, p_customer_phone TEXT DEFAULT NULL,
  p_deposit NUMERIC DEFAULT NULL, p_taken_date DATE DEFAULT CURRENT_DATE,
  p_expected_return_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v RECORD; v_customer UUID; c RECORD; v_checkout UUID;
BEGIN
  PERFORM private.require_editor();
  IF COALESCE(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be more than zero'; END IF;
  v_customer := private.resolve_customer(p_customer_id, p_customer_name, p_customer_phone);
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  SELECT name, phone INTO c FROM public.customers WHERE id = v_customer;

  SELECT sv.*, si.name AS item_name INTO v
    FROM public.stock_variants sv JOIN public.stock_items si ON si.id = sv.item_id
   WHERE sv.id = p_variant_id FOR UPDATE OF sv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v.quantity < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock for %: only % left', private.variant_label(v.item_name, v.size, v.color), v.quantity;
  END IF;

  UPDATE public.stock_variants SET quantity = quantity - p_quantity WHERE id = v.id;
  INSERT INTO public.temp_stock_checkouts
    (variant_id, customer_id, customer_name, customer_phone, item_name, size, color, quantity, deposit, taken_date, expected_return_date, notes, status)
  VALUES (v.id, v_customer, c.name, c.phone, v.item_name, v.size, v.color, p_quantity, p_deposit,
          COALESCE(p_taken_date, CURRENT_DATE), p_expected_return_date, NULLIF(btrim(p_notes), ''), 'out')
  RETURNING id INTO v_checkout;
  INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
  VALUES (v.item_id, v.id, 'loaned', -p_quantity, v.quantity, v.quantity - p_quantity, 'Out on approval: ' || c.name, auth.uid());
  RETURN v_checkout;
END;
$$;

-- Close an open checkout.
--   'returned' → pieces go back on the shelf.
--   'sold'     → pieces come back and are sold in the same step at p_unit_price,
--                through record_sale (so debts and History work the same as any sale).
CREATE OR REPLACE FUNCTION public.close_temp_checkout(
  p_checkout_id UUID, p_outcome TEXT,
  p_unit_price NUMERIC DEFAULT NULL, p_amount_paid NUMERIC DEFAULT NULL,
  p_due_date DATE DEFAULT NULL, p_payment_method TEXT DEFAULT 'cash'
) RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE ck RECORD; v RECORD; v_sale UUID;
BEGIN
  PERFORM private.require_editor();
  IF p_outcome NOT IN ('returned', 'sold') THEN RAISE EXCEPTION 'Outcome must be returned or sold'; END IF;
  SELECT * INTO ck FROM public.temp_stock_checkouts WHERE id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF ck.status <> 'out' THEN RAISE EXCEPTION 'This record is already closed'; END IF;
  IF ck.variant_id IS NULL THEN RAISE EXCEPTION 'The item for this record was deleted'; END IF;
  IF p_outcome = 'sold' AND p_unit_price IS NULL THEN RAISE EXCEPTION 'Enter the price the customer paid'; END IF;

  SELECT * INTO v FROM public.stock_variants WHERE id = ck.variant_id FOR UPDATE;
  UPDATE public.stock_variants SET quantity = quantity + ck.quantity WHERE id = v.id;
  INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
  VALUES (v.item_id, v.id, 'loan_returned', ck.quantity, v.quantity, v.quantity + ck.quantity,
          CASE WHEN p_outcome = 'sold' THEN 'Kept by ' || ck.customer_name ELSE 'Returned by ' || ck.customer_name END, auth.uid());

  IF p_outcome = 'sold' THEN
    v_sale := public.record_sale(
      jsonb_build_array(jsonb_build_object('variant_id', ck.variant_id, 'quantity', ck.quantity, 'unit_price', p_unit_price)),
      ck.customer_id, ck.customer_name, ck.customer_phone,
      p_amount_paid, p_due_date, p_payment_method, 'Bought after taking on approval', 'temp_stock');
  END IF;

  UPDATE public.temp_stock_checkouts
     SET status = p_outcome, closed_date = CURRENT_DATE, sale_id = v_sale
   WHERE id = p_checkout_id;
  RETURN v_sale;
END;
$$;

-- Delete a checkout record; if pieces are still out they go back on the shelf
CREATE OR REPLACE FUNCTION public.delete_temp_checkout(p_checkout_id UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE ck RECORD; v RECORD;
BEGIN
  PERFORM private.require_editor();
  SELECT * INTO ck FROM public.temp_stock_checkouts WHERE id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF ck.status = 'out' AND ck.variant_id IS NOT NULL THEN
    SELECT * INTO v FROM public.stock_variants WHERE id = ck.variant_id FOR UPDATE;
    UPDATE public.stock_variants SET quantity = quantity + ck.quantity WHERE id = v.id;
    INSERT INTO public.stock_movements (item_id, variant_id, movement_type, quantity, previous_quantity, new_quantity, notes, performed_by)
    VALUES (v.item_id, v.id, 'loan_returned', ck.quantity, v.quantity, v.quantity + ck.quantity,
            'Record deleted — back on the shelf', auth.uid());
  END IF;
  DELETE FROM public.temp_stock_checkouts WHERE id = p_checkout_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.sync_item_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_editor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.resolve_customer(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.variant_label(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.require_editor() TO authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_customer(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.variant_label(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_stock_item(TEXT, UUID, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_stock_variant(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restock_variant(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_debt_payment(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_out_temp(UUID, INTEGER, UUID, TEXT, TEXT, NUMERIC, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_temp_checkout(UUID, TEXT, NUMERIC, NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_temp_checkout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_item(TEXT, UUID, INTEGER, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stock_variant(UUID, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restock_variant(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_out_temp(UUID, INTEGER, UUID, TEXT, TEXT, NUMERIC, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_temp_checkout(UUID, TEXT, NUMERIC, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_temp_checkout(UUID) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_variants;
