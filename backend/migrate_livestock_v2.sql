-- Livestock v2 Migration — canonical statuses (healthy/recovering/ill/dead),
-- per-animal weight, treatment/recovery fields, individual birds, and the
-- Inventory→Production livestock request pipeline. Idempotent / additive.

-- ── Weight + treatment/recovery fields on pigs ──
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS weight_kg              NUMERIC(8,2);
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS location               VARCHAR(200);
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS treatment_description  TEXT;
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS treatment_date         DATE;
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS expected_recovery_date DATE;

-- ── Weight + treatment/recovery fields on cattle (a.k.a. grazing livestock) ──
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS weight_kg              NUMERIC(8,2);
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS treatment_description  TEXT;
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS treatment_date         DATE;
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS expected_recovery_date DATE;

-- ── Birds: individual records (one row = one bird) ──
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS bird_id                VARCHAR(60);
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS weight_kg              NUMERIC(8,2);
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS status                 VARCHAR(20) NOT NULL DEFAULT 'healthy';
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS location               VARCHAR(200);
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS gender                 VARCHAR(20);
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS treatment_description  TEXT;
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS treatment_date         DATE;
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS expected_recovery_date DATE;
ALTER TABLE birds  ALTER COLUMN batch_number DROP NOT NULL;
ALTER TABLE birds  ALTER COLUMN number_of_birds SET DEFAULT 1;

-- ── Canonicalize legacy 'sick' → 'ill' ──
UPDATE pigs   SET status = 'ill' WHERE status = 'sick';
UPDATE cattle SET status = 'ill' WHERE status = 'sick';

-- ── Inventory → Production livestock request pipeline ──
CREATE TABLE IF NOT EXISTS livestock_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      UUID,
  species      VARCHAR(20) NOT NULL,            -- 'pig' | 'bird' | 'grazing'
  name         VARCHAR(100),
  quantity     INTEGER NOT NULL DEFAULT 1,
  location     VARCHAR(200),
  boars        INTEGER,                         -- pigs only
  sows         INTEGER,                         -- pigs only
  sub_type     VARCHAR(30),                     -- bird: chicken/duck ; grazing: cow/goat/sheep
  order_type   VARCHAR(50) DEFAULT 'Make to Order',
  status       VARCHAR(30) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','fulfilled','declined')),
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_livestock_requests_farm   ON livestock_requests(farm_id);
CREATE INDEX IF NOT EXISTS idx_livestock_requests_status ON livestock_requests(status);
