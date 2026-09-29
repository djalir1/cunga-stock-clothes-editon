-- ============================================================
-- Reset shop data and load sample data (users are NOT touched).
-- Keeps: auth users, profiles, user_roles, push_subscriptions,
--        notification_prefs, shop_settings.
-- Sample data goes through the app's own functions, so stock, debts
-- and movements add up exactly like real use. Phone alerts are
-- switched off while seeding.
-- ============================================================
BEGIN;

-- No phone alerts while loading sample data
SET LOCAL cunga.silent = '1';

ALTER TABLE public.sales DISABLE TRIGGER sales_push_notify;
ALTER TABLE public.stock_items DISABLE TRIGGER stock_items_push_notify;
ALTER TABLE public.purchase_orders DISABLE TRIGGER purchase_orders_push_notify;

TRUNCATE public.activity_logs, public.debt_payments, public.debts, public.sale_items, public.sales,
         public.temp_stock_checkouts, public.item_set_parts, public.item_sets, public.purchase_order_lines,
         public.purchase_orders, public.suppliers, public.stock_movements, public.stock_variants,
         public.stock_items, public.categories, public.customers, public.shop_colors
  RESTART IDENTITY;

UPDATE public.profiles SET full_name = 'Eloge Chris'
 WHERE user_id = 'ef2208e8-0baa-4a78-ad69-ab6648c2d68f' AND full_name LIKE '%@%';

DO $$
DECLARE
  owner_id CONSTANT UUID := '9dbc01c3-f906-4e64-941d-f1876c8b6332';
  eloge_id CONSTANT UUID := 'ef2208e8-0baa-4a78-ad69-ab6648c2d68f';
  c_shirts UUID; c_trousers UUID; c_dresses UUID; c_suits UUID; c_shoes UUID; c_kids UUID; c_acc UUID;
  i_shirt UUID; i_polo UUID; i_ankara UUID; i_jeans UUID; i_chino UUID; i_maxi UUID; i_skirt UUID;
  i_jacket UUID; i_strousers UUID; i_shoes UUID; i_sneakers UUID; i_kids UUID; i_belt UUID; i_socks UUID;
  v_set UUID; s UUID; t UUID; po UUID;
  cu_aline UUID; cu_jc UUID; cu_diane UUID; cu_eric UUID; cu_grace UUID;

BEGIN
  -- act as the owner (auth.uid() inside the app's functions)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  -- Categories
  INSERT INTO public.categories (name, description, color) VALUES
    ('Shirts & Tops', 'Shirts, T-shirts, blouses', '#3B82F6') RETURNING id INTO c_shirts;
  INSERT INTO public.categories (name, description, color) VALUES ('Trousers & Jeans', 'Jeans, chinos, trousers', '#10B981') RETURNING id INTO c_trousers;
  INSERT INTO public.categories (name, description, color) VALUES ('Dresses & Skirts', 'Dresses, skirts, kitenge', '#EC4899') RETURNING id INTO c_dresses;
  INSERT INTO public.categories (name, description, color) VALUES ('Suits & Sets', 'Suits and outfits sold as sets', '#8B5CF6') RETURNING id INTO c_suits;
  INSERT INTO public.categories (name, description, color) VALUES ('Shoes', 'Shoes and sneakers', '#F59E0B') RETURNING id INTO c_shoes;
  INSERT INTO public.categories (name, description, color) VALUES ('Kids', 'Children''s clothes', '#06B6D4') RETURNING id INTO c_kids;
  INSERT INTO public.categories (name, description, color) VALUES ('Accessories', 'Belts, socks, bags', '#84CC16') RETURNING id INTO c_acc;

  -- A colour the shop saved itself
  INSERT INTO public.shop_colors (name, hex) VALUES ('Kitenge print', '#C2410C');

  -- Items (price = usual selling price hint; cost = what the shop paid)
  i_shirt := public.create_stock_item('Slim fit shirt', c_shirts, 3, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 15000, 'cost_price', 7000))
    FROM (VALUES ('S','White',4),('M','White',6),('L','White',5),('XL','White',2),('M','Sky Blue',5),('L','Sky Blue',4),('M','Black',4),('L','Black',3)) v(sz,col,q)));
  i_polo := public.create_stock_item('Polo T-shirt', c_shirts, 4, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 12000, 'cost_price', 5000))
    FROM (VALUES ('M','Navy',6),('L','Navy',6),('XL','Navy',3),('M','Red',4),('L','Red',3),('M','White',5),('L','White',4)) v(sz,col,q)));
  i_ankara := public.create_stock_item('Ankara blouse', c_shirts, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', 'Kitenge print', 'quantity', q, 'default_price', 18000, 'cost_price', 8000))
    FROM (VALUES ('S',3),('M',4),('L',3)) v(sz,q)));
  i_jeans := public.create_stock_item('Slim jeans', c_trousers, 4, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 25000, 'cost_price', 12000))
    FROM (VALUES ('30','Blue',3),('32','Blue',6),('34','Blue',5),('36','Blue',2),('32','Black',4),('34','Black',3)) v(sz,col,q)));
  i_chino := public.create_stock_item('Chino trousers', c_trousers, 3, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 20000, 'cost_price', 9000))
    FROM (VALUES ('30','Khaki',3),('32','Khaki',4),('34','Khaki',3),('32','Navy',4),('34','Navy',2)) v(sz,col,q)));
  i_maxi := public.create_stock_item('Kitenge maxi dress', c_dresses, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', 'Kitenge print', 'quantity', q, 'default_price', 35000, 'cost_price', 15000))
    FROM (VALUES ('S',2),('M',4),('L',3)) v(sz,q)));
  i_skirt := public.create_stock_item('Pleated skirt', c_dresses, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 16000, 'cost_price', 7000))
    FROM (VALUES ('S','Black',3),('M','Black',4),('L','Black',2),('M','Beige',3)) v(sz,col,q)));
  i_jacket := public.create_stock_item('Suit jacket', c_suits, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 60000, 'cost_price', 30000))
    FROM (VALUES ('M','Navy',3),('L','Navy',3),('XL','Navy',2),('M','Grey',2),('L','Grey',2)) v(sz,col,q)));
  i_strousers := public.create_stock_item('Suit trousers', c_suits, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 30000, 'cost_price', 14000))
    FROM (VALUES ('32','Navy',3),('34','Navy',3),('36','Navy',2),('32','Grey',2),('34','Grey',2)) v(sz,col,q)));
  i_shoes := public.create_stock_item('Leather shoes', c_shoes, 2, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 45000, 'cost_price', 22000))
    FROM (VALUES ('40','Black',2),('41','Black',3),('42','Black',3),('43','Black',2),('42','Brown',2),('43','Brown',1)) v(sz,col,q)));
  i_sneakers := public.create_stock_item('Canvas sneakers', c_shoes, 3, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', 'White', 'quantity', q, 'default_price', 30000, 'cost_price', 15000))
    FROM (VALUES ('39',1),('40',2),('41',2),('42',1),('43',1)) v(sz,q)));
  i_kids := public.create_stock_item('Kids T-shirt', c_kids, 4, (
    SELECT jsonb_agg(jsonb_build_object('size', sz, 'color', col, 'quantity', q, 'default_price', 6000, 'cost_price', 2500))
    FROM (VALUES ('3-4Y','Yellow',5),('5-6Y','Yellow',5),('7-8Y','Yellow',4),('3-4Y','Blue',5),('5-6Y','Blue',4)) v(sz,col,q)));
  i_belt := public.create_stock_item('Leather belt', c_acc, 3, '[{"color":"Black","quantity":2,"default_price":8000,"cost_price":3000},{"color":"Brown","quantity":1,"default_price":8000,"cost_price":3000}]'::jsonb);
  i_socks := public.create_stock_item('Cotton socks (3 pairs)', c_acc, 5, '[{"color":"White","quantity":1,"default_price":4000,"cost_price":1500}]'::jsonb);

  -- Outfit set
  INSERT INTO public.item_sets (name, category_id, usual_price) VALUES ('Navy suit', c_suits, 85000) RETURNING id INTO v_set;
  INSERT INTO public.item_set_parts (set_id, item_id, position) VALUES (v_set, i_jacket, 0), (v_set, i_strousers, 1);

  -- ── Sales (made now, back-dated below) ──
  -- Paid walk-ins
  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_shirt AND size='M' AND color='White'), 'quantity', 2, 'unit_price', 14000)),
       NULL, NULL, NULL, NULL, NULL, 'cash');
  UPDATE public.sales SET sold_at = now() - interval '6 days 3 hours' WHERE id = s;

  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_jeans AND size='32' AND color='Blue'), 'quantity', 1, 'unit_price', 25000),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_polo AND size='L' AND color='Navy'), 'quantity', 1, 'unit_price', 12000)),
       NULL, 'Aline Uwase', '0788123456', NULL, NULL, 'mobile_money');
  UPDATE public.sales SET sold_at = now() - interval '5 days 5 hours' WHERE id = s;
  SELECT customer_id INTO cu_aline FROM public.sales WHERE id = s;

  -- Full suit sold as a set for 85,000 (split over the parts by their usual prices)
  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_jacket AND size='L' AND color='Navy'), 'quantity', 1, 'unit_price', 56667, 'set_name', 'Navy suit'),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_strousers AND size='34' AND color='Navy'), 'quantity', 1, 'unit_price', 28333, 'set_name', 'Navy suit')),
       NULL, 'Eric Nshimiyimana', '0788998877', NULL, NULL, 'bank');
  UPDATE public.sales SET sold_at = now() - interval '4 days 2 hours' WHERE id = s;
  SELECT customer_id INTO cu_eric FROM public.sales WHERE id = s;

  -- Credit sale that is now late (due 2 days ago)
  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_maxi AND size='M'), 'quantity', 1, 'unit_price', 33000),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_skirt AND size='M' AND color='Black'), 'quantity', 1, 'unit_price', 15000)),
       NULL, 'Diane Mukamana', '0733221100', 10000, (current_date - 2), 'cash');
  UPDATE public.sales SET sold_at = now() - interval '4 days 6 hours' WHERE id = s;
  UPDATE public.debts SET created_at = now() - interval '4 days 6 hours' WHERE sale_id = s;
  SELECT customer_id INTO cu_diane FROM public.sales WHERE id = s;

  -- Sold by Eloge (storekeeper)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', eloge_id, 'role', 'authenticated')::text, true);
  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_kids AND size='5-6Y' AND color='Yellow'), 'quantity', 2, 'unit_price', 6000),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_socks), 'quantity', 1, 'unit_price', 4000)),
       NULL, NULL, NULL, NULL, NULL, 'cash');
  UPDATE public.sales SET sold_at = now() - interval '3 days 4 hours' WHERE id = s;

  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_shoes AND size='42' AND color='Black'), 'quantity', 1, 'unit_price', 43000)),
       NULL, 'Jean Claude Habimana', '0722334455', 20000, (current_date + 2), 'mobile_money');
  UPDATE public.sales SET sold_at = now() - interval '2 days 3 hours' WHERE id = s;
  UPDATE public.debts SET created_at = now() - interval '2 days 3 hours' WHERE sale_id = s;
  SELECT customer_id INTO cu_jc FROM public.sales WHERE id = s;

  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_polo AND size='M' AND color='Red'), 'quantity', 2, 'unit_price', 11000),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_belt AND color='Black'), 'quantity', 1, 'unit_price', 8000)),
       NULL, NULL, NULL, NULL, NULL, 'mobile_money');
  UPDATE public.sales SET sold_at = now() - interval '1 day 5 hours' WHERE id = s;

  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_sneakers AND size='41'), 'quantity', 1, 'unit_price', 30000)),
       cu_aline, NULL, NULL, NULL, NULL, 'mobile_money');
  UPDATE public.sales SET sold_at = now() - interval '1 day 2 hours' WHERE id = s;

  -- Back to the owner
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  -- Today
  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_ankara AND size='M'), 'quantity', 1, 'unit_price', 18000),
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_chino AND size='32' AND color='Khaki'), 'quantity', 1, 'unit_price', 19000)),
       NULL, 'Grace Ingabire', '0781112233', NULL, NULL, 'cash');
  UPDATE public.sales SET sold_at = now() - interval '3 hours' WHERE id = s;
  SELECT customer_id INTO cu_grace FROM public.sales WHERE id = s;

  s := public.record_sale(jsonb_build_array(
         jsonb_build_object('variant_id', (SELECT id FROM public.stock_variants WHERE item_id = i_shirt AND size='L' AND color='Sky Blue'), 'quantity', 1, 'unit_price', 15000)),
       NULL, NULL, NULL, NULL, NULL, 'cash');
  UPDATE public.sales SET sold_at = now() - interval '1 hour' WHERE id = s;

  -- Diane paid part of her debt yesterday
  PERFORM public.pay_customer_debts(cu_diane, 15000, 'mobile_money', 'MoMo');
  UPDATE public.debt_payments SET paid_at = now() - interval '1 day' WHERE note = 'MoMo';

  -- ── Temporary stock ──
  t := public.check_out_temp((SELECT id FROM public.stock_variants WHERE item_id = i_maxi AND size='L'), 1, cu_grace, NULL, NULL, 10000, current_date, current_date + 1, 'Trying it for a wedding');
  t := public.check_out_temp((SELECT id FROM public.stock_variants WHERE item_id = i_jacket AND size='M' AND color='Grey'), 1, cu_eric, NULL, NULL, NULL, current_date - 3, current_date - 1, 'Showing his brother');
  t := public.check_out_temp((SELECT id FROM public.stock_variants WHERE item_id = i_skirt AND size='S' AND color='Black'), 1, cu_aline, NULL, NULL, NULL, current_date - 5, current_date - 4, NULL);
  PERFORM public.close_temp_checkout(t, 'returned');
  UPDATE public.temp_stock_checkouts SET closed_date = current_date - 4 WHERE id = t;

  -- ── Suppliers & orders ──
  po := public.create_purchase_order(jsonb_build_array(
          jsonb_build_object('item_id', i_sneakers, 'size', '40', 'color', 'White', 'quantity', 6, 'unit_cost', 14500),
          jsonb_build_object('item_id', i_sneakers, 'size', '42', 'color', 'White', 'quantity', 6, 'unit_cost', 14500),
          jsonb_build_object('item_id', i_jeans, 'size', '30', 'color', 'Black', 'quantity', 5, 'unit_cost', 11500)),
        NULL, 'Kampala Wholesale Ltd', '+256 700 123456', current_date + 1, 'Bus / coach', 'Volcano Express · parcel 4471',
        8000, 100000, 'Driver will call on arrival', 'in_transit');
  UPDATE public.purchase_orders SET ordered_on = current_date - 4 WHERE id = po;

  po := public.create_purchase_order(jsonb_build_array(
          jsonb_build_object('item_id', i_kids, 'size', '7-8Y', 'color', 'Blue', 'quantity', 6, 'unit_cost', 2500),
          jsonb_build_object('item_id', i_belt, 'color', 'Brown', 'quantity', 4, 'unit_cost', 3000)),
        NULL, 'Nyabugogo Textiles', '0788445566', current_date + 5, NULL, NULL, 0, 0, NULL, 'ordered');
END $$;

-- Movements and activity follow their sale's date
UPDATE public.stock_movements m SET created_at = s.sold_at FROM public.sales s WHERE m.sale_id = s.id;
UPDATE public.activity_logs a SET created_at = s.sold_at FROM public.sales s WHERE a.entity_id = s.id;
UPDATE public.stock_movements SET created_at = now() - interval '8 days' WHERE sale_id IS NULL AND notes = 'Initial stock';

ALTER TABLE public.sales ENABLE TRIGGER sales_push_notify;
ALTER TABLE public.stock_items ENABLE TRIGGER stock_items_push_notify;
ALTER TABLE public.purchase_orders ENABLE TRIGGER purchase_orders_push_notify;

COMMIT;
