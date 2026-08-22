-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'storekeeper');

-- Create enum for stock status
CREATE TYPE public.stock_status AS ENUM ('in_stock', 'out_of_stock', 'low_stock');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'storekeeper',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create stock_items table
CREATE TABLE public.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 5,
  status stock_status NOT NULL DEFAULT 'in_stock',
  person_responsible TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create stock_movements table for tracking history
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.stock_items(id) ON DELETE CASCADE NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('added', 'issued', 'returned', 'adjusted')),
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get current user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_roles (only admins can manage roles)
CREATE POLICY "Authenticated users can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for categories
CREATE POLICY "Authenticated users can view categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for stock_items
CREATE POLICY "Authenticated users can view stock" ON public.stock_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage stock" ON public.stock_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for stock_movements
CREATE POLICY "Authenticated users can view movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for activity_logs
CREATE POLICY "Authenticated users can view logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'storekeeper');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to auto-update stock status based on quantity
CREATE OR REPLACE FUNCTION public.update_stock_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity = 0 THEN
    NEW.status = 'out_of_stock';
  ELSIF NEW.quantity <= NEW.min_quantity THEN
    NEW.status = 'low_stock';
  ELSE
    NEW.status = 'in_stock';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_stock_status_trigger
  BEFORE INSERT OR UPDATE OF quantity ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_status();

-- Enable realtime for stock_items and stock_movements
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- Insert default categories
INSERT INTO public.categories (name, description, color) VALUES
  ('Electronics', 'Computers, projectors, and electronic equipment', '#3B82F6'),
  ('Furniture', 'Desks, chairs, and office furniture', '#10B981'),
  ('Stationery', 'Pens, papers, and office supplies', '#F59E0B'),
  ('Sports', 'Sports equipment and gear', '#EF4444'),
  ('Laboratory', 'Lab equipment and chemicals', '#8B5CF6'),
  ('Cleaning', 'Cleaning supplies and equipment', '#06B6D4'),
  ('Books', 'Textbooks and library materials', '#EC4899'),
  ('Medical', 'First aid and medical supplies', '#F97316');