-- Card-level visibility permissions (spec 3: was never created, causing
-- /access-control/cards and getCardPermissions to throw "relation does not exist",
-- which left the Access Control card-visibility panel stuck and hid all cards for
-- non-admin roles). The unique constraint name `farm_role_card` is referenced by the
-- PUT /access-control/cards ON CONFLICT clause and must match exactly.

CREATE TABLE IF NOT EXISTS card_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL,
  role_id    UUID NOT NULL,
  card_id    VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT farm_role_card UNIQUE (farm_id, role_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_perms_role ON card_permissions(role_id, farm_id);
