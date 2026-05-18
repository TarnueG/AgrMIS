ALTER TABLE public.fish_ponds
  ADD COLUMN IF NOT EXISTS fish_type varchar(100),
  ADD COLUMN IF NOT EXISTS stocking_date date,
  ADD COLUMN IF NOT EXISTS expected_harvest_date date;

ALTER TABLE public.mortality_records
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.farm_ops_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  reference_kind varchar(20) NOT NULL,
  reference_id uuid,
  reference_code varchar(80),
  issue text NOT NULL,
  treatment text,
  medicine_used varchar(150),
  inventory_stock_item_id uuid,
  inventory_quantity_used numeric(14,3),
  vet_staff_responsible varchar(150),
  recovery_status varchar(30),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  next_check_date date,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_ops_feed_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  reference_kind varchar(20) NOT NULL,
  reference_id uuid,
  reference_code varchar(80),
  group_name text NOT NULL,
  feed_stock_item_id uuid,
  feed_item_name varchar(150) NOT NULL,
  quantity_used numeric(14,3) NOT NULL,
  unit varchar(30) NOT NULL,
  inventory_source text,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_ops_health_logs_farm_date
  ON public.farm_ops_health_logs (farm_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_farm_ops_health_logs_next_check
  ON public.farm_ops_health_logs (next_check_date);

CREATE INDEX IF NOT EXISTS idx_farm_ops_feed_usage_logs_farm_date
  ON public.farm_ops_feed_usage_logs (farm_id, log_date DESC);
