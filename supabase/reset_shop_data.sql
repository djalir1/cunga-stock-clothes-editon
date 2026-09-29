-- ============================================================
-- Empty the shop to test from scratch. Keeps: accounts (auth users,
-- profiles, user_roles), alert devices and choices (push_subscriptions,
-- notification_prefs) and the shop profile (shop_settings).
-- Everything else is removed and numbering (receipts, orders) restarts at 1.
-- The 8 default clothing categories are put back, like a fresh install.
-- Item photos in Storage are not touched.
-- ============================================================
BEGIN;
TRUNCATE public.activity_logs, public.debt_payments, public.debts, public.sale_items, public.sales,
         public.temp_stock_checkouts, public.item_set_parts, public.item_sets, public.purchase_order_lines,
         public.purchase_orders, public.suppliers, public.stock_movements, public.stock_variants,
         public.stock_items, public.categories, public.customers, public.shop_colors
  RESTART IDENTITY;
INSERT INTO public.categories (name, description, color) VALUES
  ('T-Shirts & Tops', 'T-shirts, blouses, polos and tops', '#3B82F6'),
  ('Shirts', 'Casual and formal shirts', '#10B981'),
  ('Trousers & Jeans', 'Trousers, jeans, chinos and shorts', '#F59E0B'),
  ('Dresses & Skirts', 'Dresses, skirts and jumpsuits', '#EC4899'),
  ('Jackets & Coats', 'Jackets, coats, hoodies and sweaters', '#8B5CF6'),
  ('Shoes', 'Sneakers, sandals, heels and boots', '#EF4444'),
  ('Accessories', 'Bags, belts, hats, scarves and jewellery', '#06B6D4'),
  ('Kids', 'Children''s clothing', '#F97316');
COMMIT;
