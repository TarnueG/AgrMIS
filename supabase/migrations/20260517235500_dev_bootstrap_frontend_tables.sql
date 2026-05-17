CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  min_stock_level INTEGER DEFAULT 0,
  location TEXT,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reserved_quantity INTEGER DEFAULT 0,
  unit_cost DECIMAL(12, 2) DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  batch_no TEXT,
  quality_status TEXT DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS public.procurement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  supplier TEXT,
  quantity INTEGER DEFAULT 0,
  unit_price DECIMAL(10, 2),
  total_cost DECIMAL(12, 2),
  status TEXT DEFAULT 'pending',
  expected_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ
);

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
CREATE INDEX IF NOT EXISTS idx_procurement_inventory_id ON public.procurement(inventory_id);
CREATE INDEX IF NOT EXISTS idx_procurement_supplier_id ON public.procurement(supplier_id);

DROP TRIGGER IF EXISTS update_inventory_updated_at ON public.inventory;
CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_procurement_updated_at ON public.procurement;
CREATE TRIGGER update_procurement_updated_at
  BEFORE UPDATE ON public.procurement
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated, service_role;
