-- Livestock v4 — "Mature for Market" gate. Yes => the animal appears/counts in
-- Inventory; No => it stays in Production (Livestock Dashboard) only. Additive.
ALTER TABLE pigs   ADD COLUMN IF NOT EXISTS mature_for_market BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS mature_for_market BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE birds  ADD COLUMN IF NOT EXISTS mature_for_market BOOLEAN NOT NULL DEFAULT false;
