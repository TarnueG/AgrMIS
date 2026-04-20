-- Inventory operations upgrade: movements, valuation, reservations, suppliers, and quality workflow.

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

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

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'available';

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('received', 'dispatched', 'adjusted', 'reserved', 'released', 'damaged', 'expired')),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit_cost DECIMAL(12, 2),
  source_module TEXT,
  reference_id UUID,
  movement_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_supplier_id ON public.inventory(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_quality_status ON public.inventory(quality_status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON public.inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_date ON public.inventory_movements(movement_type, movement_date DESC);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
      AND policyname = 'Authenticated users can view suppliers'
  ) THEN
    CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers
      FOR SELECT USING (public.is_authenticated());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
      AND policyname = 'Staff can manage suppliers'
  ) THEN
    CREATE POLICY "Staff can manage suppliers" ON public.suppliers
      FOR ALL USING (public.is_authenticated());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_movements'
      AND policyname = 'Authenticated users can view inventory movements'
  ) THEN
    CREATE POLICY "Authenticated users can view inventory movements" ON public.inventory_movements
      FOR SELECT USING (public.is_authenticated());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_movements'
      AND policyname = 'Staff can manage inventory movements'
  ) THEN
    CREATE POLICY "Staff can manage inventory movements" ON public.inventory_movements
      FOR ALL USING (public.is_authenticated());
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
