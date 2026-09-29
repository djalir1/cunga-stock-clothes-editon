-- ============================================================
-- Phase 2 — Sales: receipt numbers, category snapshot on lines,
-- and marking the payment taken at the counter on a credit sale
-- ============================================================

ALTER TABLE public.sales ADD COLUMN receipt_no BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX idx_sales_receipt_no ON public.sales(receipt_no);

ALTER TABLE public.sale_items ADD COLUMN category_name TEXT;

-- true = paid at the counter when the sale was made (already in sales.amount_paid);
-- false = a later repayment. Keeps the cash report from counting money twice.
ALTER TABLE public.debt_payments ADD COLUMN is_initial BOOLEAN NOT NULL DEFAULT false;
UPDATE public.debt_payments SET is_initial = true WHERE note = 'Paid at time of sale';

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

  FOR l IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS x(variant_id UUID, quantity INT, unit_price NUMERIC)
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
    INSERT INTO public.sale_items (sale_id, variant_id, item_name, size, color, category_name, quantity, unit_price)
    VALUES (v_sale, v.id, v.item_name, v.size, v.color, v.category_name, l.quantity, l.unit_price);
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

REVOKE ALL ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale(JSONB, UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- Live dashboard / pages
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.temp_stock_checkouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
