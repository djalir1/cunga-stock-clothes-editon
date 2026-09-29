-- Live updates for categories too (a category added on one phone shows on the others)
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
