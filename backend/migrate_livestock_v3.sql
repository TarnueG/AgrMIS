-- Livestock v3 — gender on grazing livestock (cattle). Additive / idempotent.
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
