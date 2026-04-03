-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id, role)
);

-- Create livestock table
CREATE TABLE public.livestock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_type TEXT NOT NULL,
  breed TEXT,
  quantity INTEGER DEFAULT 0,
  health_status TEXT DEFAULT 'healthy',
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create land_parcels table
CREATE TABLE public.land_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size_hectares DECIMAL(10, 2),
  crop_type TEXT,
  soil_type TEXT,
  status TEXT DEFAULT 'active',
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create machinery table
CREATE TABLE public.machinery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT,
  model TEXT,
  status TEXT DEFAULT 'operational',
  last_maintenance TIMESTAMPTZ,
  next_maintenance TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create inventory table
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL, -- seeds, feed, tools, fertilizer
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  min_stock_level INTEGER DEFAULT 0,
  location TEXT,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  customer_type TEXT DEFAULT 'individual', -- individual, business
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_type TEXT DEFAULT 'mto', -- mts (make-to-stock), mto (make-to-order)
  status TEXT DEFAULT 'pending', -- pending, in_production, quality_check, completed, rejected
  total_amount DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create production_batches table
CREATE TABLE public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, in_progress, quality_check, passed, failed, rework
  quality_result TEXT, -- pass, fail, rework
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transactions table for finance
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL, -- income, expense
  category TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create procurement table
CREATE TABLE public.procurement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  supplier TEXT,
  quantity INTEGER DEFAULT 0,
  unit_price DECIMAL(10, 2),
  total_cost DECIMAL(12, 2),
  status TEXT DEFAULT 'pending', -- pending, approved, ordered, received
  expected_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  hire_date DATE,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machinery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
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

-- Create function to check if user is authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- General authenticated user policies for operational tables
CREATE POLICY "Authenticated users can view livestock" ON public.livestock FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage livestock" ON public.livestock FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view land" ON public.land_parcels FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage land" ON public.land_parcels FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view machinery" ON public.machinery FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage machinery" ON public.machinery FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view inventory" ON public.inventory FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage inventory" ON public.inventory FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage customers" ON public.customers FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage orders" ON public.orders FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view production" ON public.production_batches FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage production" ON public.production_batches FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view transactions" ON public.transactions FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Managers can manage transactions" ON public.transactions FOR ALL USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view procurement" ON public.procurement FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Staff can manage procurement" ON public.procurement FOR ALL USING (public.is_authenticated());

CREATE POLICY "Authenticated users can view employees" ON public.employees FOR SELECT USING (public.is_authenticated());
CREATE POLICY "Admins can manage employees" ON public.employees FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Assign default staff role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create update triggers for all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_livestock_updated_at BEFORE UPDATE ON public.livestock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_land_parcels_updated_at BEFORE UPDATE ON public.land_parcels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_machinery_updated_at BEFORE UPDATE ON public.machinery FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_production_batches_updated_at BEFORE UPDATE ON public.production_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_procurement_updated_at BEFORE UPDATE ON public.procurement FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();