-- ============================================================
-- Phase 3 — Customers & debts: a customer pays an amount and it
-- clears their debts oldest-first, in one locked transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pay_customer_debts(
  p_customer_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'cash', p_note TEXT DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  d RECORD; v_left NUMERIC(12, 2) := p_amount; v_owed NUMERIC(12, 2) := 0; v_pay NUMERIC(12, 2);
  v_name TEXT;
BEGIN
  PERFORM private.require_editor();
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Payment must be more than zero'; END IF;
  SELECT name INTO v_name FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  -- Lock this customer's debts so two payments can't both use the same balance
  PERFORM 1 FROM public.debts WHERE customer_id = p_customer_id FOR UPDATE;

  SELECT COALESCE(SUM(balance), 0) INTO v_owed FROM public.debt_balances
   WHERE customer_id = p_customer_id AND balance > 0;
  IF v_owed = 0 THEN RAISE EXCEPTION '% does not owe anything', v_name; END IF;
  IF p_amount > v_owed THEN RAISE EXCEPTION 'Payment is more than what % owes (%)', v_name, v_owed; END IF;

  FOR d IN
    SELECT id, balance FROM public.debt_balances
     WHERE customer_id = p_customer_id AND balance > 0
     ORDER BY due_date NULLS LAST, created_at
  LOOP
    EXIT WHEN v_left <= 0;
    v_pay := LEAST(v_left, d.balance);
    INSERT INTO public.debt_payments (debt_id, amount, method, note)
    VALUES (d.id, v_pay, COALESCE(p_method, 'cash'), NULLIF(btrim(p_note), ''));
    v_left := v_left - v_pay;
  END LOOP;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'debt_payment', 'customer', p_customer_id,
          jsonb_build_object('customer', v_name, 'amount', p_amount, 'method', COALESCE(p_method, 'cash')));
  RETURN v_owed - p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_customer_debts(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_customer_debts(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
