-- Mobile Money in Rwanda is always in FRW: only cash, bank and "other" can be in USD / EUR.
CREATE OR REPLACE FUNCTION private.normalize_payments(p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    IF r.method = 'mobile_money' AND v_cur <> 'RWF' THEN
      RAISE EXCEPTION 'Mobile Money can only be in FRW. Use Cash or Bank for USD / EUR.';
    END IF;
    v_rate := CASE WHEN v_cur = 'RWF' THEN 1
                   ELSE COALESCE(NULLIF(r.rate, 0), CASE v_cur WHEN 'USD' THEN s.usd_rate ELSE s.eur_rate END) END;
    IF v_rate <= 0 THEN RAISE EXCEPTION 'Exchange rate must be more than zero'; END IF;
    v_out := v_out || jsonb_build_object(
      'method', COALESCE(r.method, 'cash'), 'currency', v_cur,
      'amount', r.amount, 'rate', v_rate, 'frw', round(r.amount * v_rate));
  END LOOP;
  RETURN v_out;
END;
$function$;
