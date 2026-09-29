-- ============================================================
-- Payments in several parts and in several currencies.
--
-- Everything is still counted in Rwandan francs (FRW): totals, debts,
-- reports. A customer can now pay with several parts, e.g. part by
-- Mobile Money and the rest in cash, and each part can be in FRW (the
-- default), USD or EUR. A foreign part is saved with the rate used and
-- its FRW value. When foreign cash is worth more than the bill, the
-- difference is given back as change in FRW.
--
-- Payment part (JSON): { method, currency, amount (in that currency), rate (FRW per 1 unit) }
-- ============================================================

-- ── Today's exchange rates (the owner keeps them up to date; the till can adjust per payment) ──
ALTER TABLE public.shop_settings
  ADD COLUMN usd_rate NUMERIC(12, 2) NOT NULL DEFAULT 1450 CHECK (usd_rate > 0),
  ADD COLUMN eur_rate NUMERIC(12, 2) NOT NULL DEFAULT 1650 CHECK (eur_rate > 0),
  ADD COLUMN rates_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── How each sale was paid ──
ALTER TABLE public.sales
  ADD COLUMN payments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN change_given NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (change_given >= 0);
ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'other', 'split'));

-- ── Currency of each debt payment (amount stays in FRW) ──
ALTER TABLE public.debt_payments
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'RWF' CHECK (currency IN ('RWF', 'USD', 'EUR')),
  ADD COLUMN amount_foreign NUMERIC(12, 2),
  ADD COLUMN rate NUMERIC(12, 2);

-- ── Checks the parts and adds each part's FRW value ──
CREATE OR REPLACE FUNCTION private.normalize_payments(p_payments JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  r RECORD; v_out JSONB := '[]'::jsonb; v_rate NUMERIC; v_cur TEXT;
  s RECORD;
BEGIN
  SELECT usd_rate, eur_rate INTO s FROM public.shop_settings WHERE id = 1;
  FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_payments, '[]'::jsonb))
             AS x(method TEXT, currency TEXT, amount NUMERIC, rate NUMERIC) LOOP
    IF COALESCE(r.amount, 0) = 0 THEN CONTINUE; END IF;
    IF r.amount < 0 THEN RAISE EXCEPTION 'A payment amount can''t be negative'; END IF;
    IF COALESCE(r.method, 'cash') NOT IN ('cash', 'mobile_money', 'bank', 'other') THEN
      RAISE EXCEPTION 'Unknown payment method: %', r.method;
    END IF;
    v_cur := upper(COALESCE(NULLIF(r.currency, ''), 'RWF'));
    IF v_cur = 'FRW' THEN v_cur := 'RWF'; END IF;
    IF v_cur NOT IN ('RWF', 'USD', 'EUR') THEN RAISE EXCEPTION 'Unknown currency: %', r.currency; END IF;
    v_rate := CASE WHEN v_cur = 'RWF' THEN 1
                   ELSE COALESCE(NULLIF(r.rate, 0), CASE v_cur WHEN 'USD' THEN s.usd_rate ELSE s.eur_rate END) END;
    IF v_rate <= 0 THEN RAISE EXCEPTION 'Exchange rate must be more than zero'; END IF;
    v_out := v_out || jsonb_build_object(
      'method', COALESCE(r.method, 'cash'), 'currency', v_cur,
      'amount', r.amount, 'rate', v_rate, 'frw', round(r.amount * v_rate));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_payments(JSONB) FROM PUBLIC, anon, authenticated;

-- ── Sale: same as before, plus p_payments (the parts). Old callers (amount + method) still work. ──
DROP FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT);
CREATE FUNCTION public.record_sale(
  p_lines JSONB, p_customer_id UUID DEFAULT NULL, p_customer_name TEXT DEFAULT NULL, p_customer_phone TEXT DEFAULT NULL,
  p_amount_paid NUMERIC DEFAULT NULL, p_due_date DATE DEFAULT NULL, p_payment_method TEXT DEFAULT 'cash',
  p_notes TEXT DEFAULT NULL, p_source TEXT DEFAULT 'pos', p_payments JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_customer UUID; v_customer_name TEXT; v_sale UUID; v_debt UUID;
  v_total NUMERIC(12, 2) := 0; v_paid NUMERIC(12, 2); v_status TEXT;
  v_parts JSONB; v_received NUMERIC(12, 2); v_change NUMERIC(12, 2) := 0; v_cash NUMERIC(12, 2);
  v_method TEXT; v_left NUMERIC(12, 2); v_part NUMERIC(12, 2);
  l RECORD; v RECORD; pt RECORD;
BEGIN
  PERFORM private.require_editor();
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'A sale needs at least one item'; END IF;

  FOR l IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC, set_name TEXT) LOOP
    IF l.variant_id IS NULL THEN RAISE EXCEPTION 'Each line needs an item'; END IF;
    IF COALESCE(l.quantity, 0) <= 0 THEN RAISE EXCEPTION 'Quantity must be more than zero'; END IF;
    IF l.unit_price IS NULL OR l.unit_price < 0 THEN RAISE EXCEPTION 'Enter the price agreed for each item'; END IF;
    v_total := v_total + l.quantity * l.unit_price;
  END LOOP;

  IF p_payments IS NOT NULL THEN
    v_parts := private.normalize_payments(p_payments);
    SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_received FROM jsonb_array_elements(v_parts) p;
    SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_cash FROM jsonb_array_elements(v_parts) p WHERE p->>'method' = 'cash';
    v_paid := LEAST(v_received, v_total);
    v_change := v_received - v_paid;
    IF v_change > v_cash THEN
      RAISE EXCEPTION 'Only cash can be more than the bill (change is given back in cash). Lower the Mobile Money / bank amount.';
    END IF;
    SELECT CASE WHEN COUNT(DISTINCT p->>'method') = 1 THEN MIN(p->>'method') WHEN COUNT(*) = 0 THEN 'cash' ELSE 'split' END
      INTO v_method FROM jsonb_array_elements(v_parts) p;
  ELSE
    v_paid := COALESCE(p_amount_paid, v_total);
    IF v_paid < 0 OR v_paid > v_total THEN RAISE EXCEPTION 'Amount paid must be between 0 and the total'; END IF;
    v_method := COALESCE(p_payment_method, 'cash');
    v_parts := CASE WHEN v_paid > 0
      THEN jsonb_build_array(jsonb_build_object('method', v_method, 'currency', 'RWF', 'amount', v_paid, 'rate', 1, 'frw', v_paid))
      ELSE '[]'::jsonb END;
  END IF;
  v_status := CASE WHEN v_paid = v_total THEN 'paid' WHEN v_paid = 0 THEN 'credit' ELSE 'partial' END;

  v_customer := private.resolve_customer(p_customer_id, p_customer_name, p_customer_phone);
  IF v_status <> 'paid' AND v_customer IS NULL THEN
    RAISE EXCEPTION 'A customer is required when the sale is not fully paid';
  END IF;
  SELECT name INTO v_customer_name FROM public.customers WHERE id = v_customer;

  INSERT INTO public.sales (customer_id, customer_name, total, amount_paid, payment_status, payment_method, source, notes,
                            payments, change_given)
  VALUES (v_customer, v_customer_name, v_total, v_paid, v_status, v_method,
          COALESCE(p_source, 'pos'), NULLIF(btrim(p_notes), ''), v_parts, v_change)
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
    -- What was paid at the till counts towards the debt, one line per part
    v_left := v_paid;
    FOR pt IN SELECT * FROM jsonb_to_recordset(v_parts) AS x(method TEXT, currency TEXT, amount NUMERIC, rate NUMERIC, frw NUMERIC) LOOP
      EXIT WHEN v_left <= 0;
      v_part := LEAST(pt.frw, v_left);
      INSERT INTO public.debt_payments (debt_id, amount, method, note, is_initial, currency, amount_foreign, rate)
      VALUES (v_debt, v_part, pt.method, 'Paid at time of sale', true, pt.currency,
              CASE WHEN pt.currency <> 'RWF' THEN round(v_part / pt.rate, 2) END, CASE WHEN pt.currency <> 'RWF' THEN pt.rate END);
      v_left := v_left - v_part;
    END LOOP;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'sold', 'sale', v_sale,
          jsonb_build_object('total', v_total, 'paid', v_paid, 'status', v_status, 'customer', v_customer_name,
                             'payments', v_parts, 'change', v_change));
  RETURN v_sale;
END;
$$;
REVOKE ALL ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ── Pays debts oldest first from a list of parts. Extra (only from cash) is change. ──
-- Returns what is still owed.
CREATE OR REPLACE FUNCTION private.apply_debt_parts(p_debt_ids UUID[], p_parts JSONB, p_note TEXT)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  d RECORD; pt RECORD; v_owed NUMERIC(12, 2); v_received NUMERIC(12, 2); v_cash NUMERIC(12, 2);
  v_part_left NUMERIC(12, 2); v_pay NUMERIC(12, 2); v_balance NUMERIC(12, 2);
  v_bal JSONB := '{}'::jsonb;
BEGIN
  SELECT COALESCE(SUM(balance), 0) INTO v_owed FROM public.debt_balances WHERE id = ANY(p_debt_ids) AND balance > 0;
  SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_received FROM jsonb_array_elements(p_parts) p;
  SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_cash FROM jsonb_array_elements(p_parts) p WHERE p->>'method' = 'cash';
  IF v_received <= 0 THEN RAISE EXCEPTION 'Payment must be more than zero'; END IF;
  IF v_owed = 0 THEN RAISE EXCEPTION 'Nothing is owed'; END IF;
  IF v_received - v_owed > v_cash THEN
    RAISE EXCEPTION 'Payment is more than what is owed (%). Only cash can be more (the rest is given back as change).', v_owed;
  END IF;

  FOR d IN SELECT id, balance FROM public.debt_balances WHERE id = ANY(p_debt_ids) AND balance > 0
            ORDER BY due_date NULLS LAST, created_at LOOP
    v_bal := v_bal || jsonb_build_object(d.id::text, d.balance);
  END LOOP;

  -- Non-cash parts first, so any change comes out of the cash
  FOR pt IN SELECT * FROM jsonb_to_recordset(p_parts) AS x(method TEXT, currency TEXT, amount NUMERIC, rate NUMERIC, frw NUMERIC)
             ORDER BY (method = 'cash') LOOP
    v_part_left := pt.frw;
    FOR d IN SELECT id FROM public.debt_balances WHERE id = ANY(p_debt_ids) ORDER BY due_date NULLS LAST, created_at LOOP
      EXIT WHEN v_part_left <= 0;
      v_balance := COALESCE((v_bal->>d.id::text)::numeric, 0);
      CONTINUE WHEN v_balance <= 0;
      v_pay := LEAST(v_part_left, v_balance);
      INSERT INTO public.debt_payments (debt_id, amount, method, note, currency, amount_foreign, rate)
      VALUES (d.id, v_pay, pt.method, NULLIF(btrim(p_note), ''), pt.currency,
              CASE WHEN pt.currency <> 'RWF' THEN round(v_pay / pt.rate, 2) END, CASE WHEN pt.currency <> 'RWF' THEN pt.rate END);
      v_bal := v_bal || jsonb_build_object(d.id::text, v_balance - v_pay);
      v_part_left := v_part_left - v_pay;
    END LOOP;
  END LOOP;
  RETURN GREATEST(v_owed - v_received, 0);
END;
$$;
REVOKE ALL ON FUNCTION private.apply_debt_parts(UUID[], JSONB, TEXT) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.record_debt_payment(UUID, NUMERIC, TEXT, TEXT);
CREATE FUNCTION public.record_debt_payment(p_debt_id UUID, p_amount NUMERIC DEFAULT NULL, p_method TEXT DEFAULT 'cash',
                                           p_note TEXT DEFAULT NULL, p_payments JSONB DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_parts JSONB; v_left NUMERIC; v_customer UUID; v_name TEXT;
BEGIN
  PERFORM private.require_editor();
  SELECT d.customer_id, c.name INTO v_customer, v_name
    FROM public.debts d LEFT JOIN public.customers c ON c.id = d.customer_id WHERE d.id = p_debt_id FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Debt not found'; END IF;
  v_parts := private.normalize_payments(COALESCE(p_payments,
    jsonb_build_array(jsonb_build_object('method', COALESCE(p_method, 'cash'), 'currency', 'RWF', 'amount', p_amount))));
  v_left := private.apply_debt_parts(ARRAY[p_debt_id], v_parts, p_note);
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'debt_payment', 'customer', v_customer,
          jsonb_build_object('customer', v_name, 'amount', (SELECT SUM((p->>'frw')::numeric) FROM jsonb_array_elements(v_parts) p),
                             'payments', v_parts));
  RETURN v_left;
END;
$$;
REVOKE ALL ON FUNCTION public.record_debt_payment(UUID, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(UUID, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;

DROP FUNCTION public.pay_customer_debts(UUID, NUMERIC, TEXT, TEXT);
CREATE FUNCTION public.pay_customer_debts(p_customer_id UUID, p_amount NUMERIC DEFAULT NULL, p_method TEXT DEFAULT 'cash',
                                          p_note TEXT DEFAULT NULL, p_payments JSONB DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_parts JSONB; v_left NUMERIC; v_name TEXT; v_ids UUID[];
BEGIN
  PERFORM private.require_editor();
  SELECT name INTO v_name FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  PERFORM 1 FROM public.debts WHERE customer_id = p_customer_id FOR UPDATE;
  SELECT array_agg(id) INTO v_ids FROM public.debt_balances WHERE customer_id = p_customer_id AND balance > 0;
  IF v_ids IS NULL THEN RAISE EXCEPTION '% does not owe anything', v_name; END IF;

  v_parts := private.normalize_payments(COALESCE(p_payments,
    jsonb_build_array(jsonb_build_object('method', COALESCE(p_method, 'cash'), 'currency', 'RWF', 'amount', p_amount))));
  v_left := private.apply_debt_parts(v_ids, v_parts, p_note);

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'debt_payment', 'customer', p_customer_id,
          jsonb_build_object('customer', v_name, 'amount', (SELECT SUM((p->>'frw')::numeric) FROM jsonb_array_elements(v_parts) p),
                             'payments', v_parts));
  RETURN v_left;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_customer_debts(UUID, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_customer_debts(UUID, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;

-- close_temp_checkout (bought after taking on approval) can pass the parts too
DROP FUNCTION public.close_temp_checkout(UUID, TEXT, NUMERIC, NUMERIC, DATE, TEXT);
CREATE FUNCTION public.close_temp_checkout(p_checkout_id UUID, p_outcome TEXT, p_unit_price NUMERIC DEFAULT NULL,
                                           p_amount_paid NUMERIC DEFAULT NULL, p_due_date DATE DEFAULT NULL,
                                           p_payment_method TEXT DEFAULT 'cash', p_payments JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SET search_path = ''
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
      p_amount_paid, p_due_date, p_payment_method, 'Bought after taking on approval', 'temp_stock', p_payments);
  END IF;

  UPDATE public.temp_stock_checkouts
     SET status = p_outcome, closed_date = CURRENT_DATE, sale_id = v_sale
   WHERE id = p_checkout_id;
  RETURN v_sale;
END;
$$;
REVOKE ALL ON FUNCTION public.close_temp_checkout(UUID, TEXT, NUMERIC, NUMERIC, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_temp_checkout(UUID, TEXT, NUMERIC, NUMERIC, DATE, TEXT, JSONB) TO authenticated;

-- (applied as a follow-up) When foreign cash is worth more than the debt, the last payment line
-- of that part records the full foreign amount handed over, so the drawer count matches.
CREATE OR REPLACE FUNCTION private.apply_debt_parts(p_debt_ids UUID[], p_parts JSONB, p_note TEXT)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  d RECORD; pt RECORD; v_owed NUMERIC(12, 2); v_received NUMERIC(12, 2); v_cash NUMERIC(12, 2);
  v_part_left NUMERIC(12, 2); v_pay NUMERIC(12, 2); v_balance NUMERIC(12, 2); v_last UUID; v_foreign_used NUMERIC(12, 2);
  v_bal JSONB := '{}'::jsonb;
BEGIN
  SELECT COALESCE(SUM(balance), 0) INTO v_owed FROM public.debt_balances WHERE id = ANY(p_debt_ids) AND balance > 0;
  SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_received FROM jsonb_array_elements(p_parts) p;
  SELECT COALESCE(SUM((p->>'frw')::numeric), 0) INTO v_cash FROM jsonb_array_elements(p_parts) p WHERE p->>'method' = 'cash';
  IF v_received <= 0 THEN RAISE EXCEPTION 'Payment must be more than zero'; END IF;
  IF v_owed = 0 THEN RAISE EXCEPTION 'Nothing is owed'; END IF;
  IF v_received - v_owed > v_cash THEN
    RAISE EXCEPTION 'Payment is more than what is owed (%). Only cash can be more (the rest is given back as change).', v_owed;
  END IF;

  FOR d IN SELECT id, balance FROM public.debt_balances WHERE id = ANY(p_debt_ids) AND balance > 0 LOOP
    v_bal := v_bal || jsonb_build_object(d.id::text, d.balance);
  END LOOP;

  FOR pt IN SELECT * FROM jsonb_to_recordset(p_parts) AS x(method TEXT, currency TEXT, amount NUMERIC, rate NUMERIC, frw NUMERIC)
             ORDER BY (method = 'cash') LOOP
    v_part_left := pt.frw; v_last := NULL; v_foreign_used := 0;
    FOR d IN SELECT id FROM public.debt_balances WHERE id = ANY(p_debt_ids) ORDER BY due_date NULLS LAST, created_at LOOP
      EXIT WHEN v_part_left <= 0;
      v_balance := COALESCE((v_bal->>d.id::text)::numeric, 0);
      CONTINUE WHEN v_balance <= 0;
      v_pay := LEAST(v_part_left, v_balance);
      INSERT INTO public.debt_payments (debt_id, amount, method, note, currency, amount_foreign, rate)
      VALUES (d.id, v_pay, pt.method, NULLIF(btrim(p_note), ''), pt.currency,
              CASE WHEN pt.currency <> 'RWF' THEN round(v_pay / pt.rate, 2) END, CASE WHEN pt.currency <> 'RWF' THEN pt.rate END)
      RETURNING id INTO v_last;
      IF pt.currency <> 'RWF' THEN v_foreign_used := v_foreign_used + round(v_pay / pt.rate, 2); END IF;
      v_bal := v_bal || jsonb_build_object(d.id::text, v_balance - v_pay);
      v_part_left := v_part_left - v_pay;
    END LOOP;
    IF pt.currency <> 'RWF' AND v_last IS NOT NULL AND v_foreign_used <> pt.amount THEN
      UPDATE public.debt_payments SET amount_foreign = amount_foreign + (pt.amount - v_foreign_used) WHERE id = v_last;
    END IF;
  END LOOP;
  RETURN GREATEST(v_owed - v_received, 0);
END;
$$;
REVOKE ALL ON FUNCTION private.apply_debt_parts(UUID[], JSONB, TEXT) FROM PUBLIC, anon, authenticated;
