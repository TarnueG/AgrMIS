ALTER TABLE public.inventory_production_requests
  ADD COLUMN IF NOT EXISTS sales_order_id uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.inventory_production_batches
  ADD COLUMN IF NOT EXISTS sector varchar(30) DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS linked_sales_order_id uuid,
  ADD COLUMN IF NOT EXISTS planned_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS produced_quantity numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_quantity numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_unit varchar(20) DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS expected_completion date,
  ADD COLUMN IF NOT EXISTS actual_completion date,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS passed_to_inventory boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_inv_prod_req_sales_order
  ON public.inventory_production_requests (sales_order_id);

CREATE INDEX IF NOT EXISTS idx_inv_prod_batch_sales_order
  ON public.inventory_production_batches (linked_sales_order_id);

CREATE INDEX IF NOT EXISTS idx_inv_prod_batch_status
  ON public.inventory_production_batches (status);
