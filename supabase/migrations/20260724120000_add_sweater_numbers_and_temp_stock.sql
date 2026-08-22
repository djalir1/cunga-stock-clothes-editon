-- ============================================================
-- Migration: Add sweater numbers + Temporary Stock feature
-- Run this in Supabase SQL Editor, then reload schema cache:
-- Dashboard → Settings → API → Reload schema cache
-- ============================================================


-- ── 1. stock_items: add total_added + issued columns (if missing) ──
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS total_added INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS issued INTEGER NOT NULL DEFAULT 0;


-- ── 2. Uniform system tables (create if they don't exist) ──

CREATE TABLE IF NOT EXISTS public.uniform_categories (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.uniform_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'Uncategorized',
  total_quantity     INTEGER NOT NULL DEFAULT 0,
  remaining_quantity INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.uniform_issuances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uniform_id     UUID REFERENCES public.uniform_items(id) ON DELETE CASCADE NOT NULL,
  student_name   TEXT NOT NULL,
  quantity_taken INTEGER NOT NULL DEFAULT 1,
  issue_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ── 3. Add sweater_number to uniform_issuances (Feature 3) ──
ALTER TABLE public.uniform_issuances
  ADD COLUMN IF NOT EXISTS sweater_number TEXT;

-- Unique constraint: each sweater number can only be assigned once
-- (NULLs are allowed to repeat — only non-null values must be unique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_sweater_number'
      AND conrelid = 'public.uniform_issuances'::regclass
  ) THEN
    ALTER TABLE public.uniform_issuances
      ADD CONSTRAINT unique_sweater_number UNIQUE (sweater_number);
  END IF;
END $$;


-- ── 4. Temporary Stock tables (Feature 4) ──

CREATE TABLE IF NOT EXISTS public.temp_stock_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  description        TEXT,
  total_quantity     INTEGER NOT NULL DEFAULT 1,
  available_quantity INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.temp_stock_loans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              UUID NOT NULL REFERENCES public.temp_stock_items(id) ON DELETE CASCADE,
  teacher_name         TEXT NOT NULL,
  department           TEXT,
  quantity             INTEGER NOT NULL DEFAULT 1,
  borrowed_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  actual_return_date   DATE,
  status               TEXT NOT NULL DEFAULT 'borrowed',
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ── 5. Enable RLS on new tables ──
ALTER TABLE public.uniform_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_issuances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_stock_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_stock_loans    ENABLE ROW LEVEL SECURITY;


-- ── 6. RLS Policies (create only if they don't exist) ──

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_uniform_categories' AND tablename = 'uniform_categories') THEN
    CREATE POLICY "auth_uniform_categories" ON public.uniform_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_uniform_items' AND tablename = 'uniform_items') THEN
    CREATE POLICY "auth_uniform_items" ON public.uniform_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_uniform_issuances' AND tablename = 'uniform_issuances') THEN
    CREATE POLICY "auth_uniform_issuances" ON public.uniform_issuances FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_temp_stock_items' AND tablename = 'temp_stock_items') THEN
    CREATE POLICY "auth_temp_stock_items" ON public.temp_stock_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_temp_stock_loans' AND tablename = 'temp_stock_loans') THEN
    CREATE POLICY "auth_temp_stock_loans" ON public.temp_stock_loans FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 7. Auto-update triggers for updated_at ──
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_temp_stock_items_updated_at') THEN
    CREATE TRIGGER update_temp_stock_items_updated_at
      BEFORE UPDATE ON public.temp_stock_items
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_temp_stock_loans_updated_at') THEN
    CREATE TRIGGER update_temp_stock_loans_updated_at
      BEFORE UPDATE ON public.temp_stock_loans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
