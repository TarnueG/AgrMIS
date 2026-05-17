-- Link procurement records to inventory and suppliers so receipts can post stock movements.

ALTER TABLE public.procurement
  ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_procurement_inventory_id ON public.procurement(inventory_id);
CREATE INDEX IF NOT EXISTS idx_procurement_supplier_id ON public.procurement(supplier_id);
