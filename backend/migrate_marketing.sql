CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farm_profiles(id) ON DELETE CASCADE,
  item_name VARCHAR(100) NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL CHECK (price_per_unit >= 0),
  quantity_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS prices_farm_item_unique ON prices(farm_id, item_name);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farm_profiles(id) ON DELETE CASCADE,
  item_name VARCHAR(100) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES farm_profiles(id) ON DELETE CASCADE,
  order_id VARCHAR(20) UNIQUE NOT NULL,
  payment_id UUID,
  item_name VARCHAR(100) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  quantity_unit VARCHAR(20) DEFAULT 'kg',
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','processing','en_route','delivered')),
  amount DECIMAL(10,2) NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT 'Migration complete' AS result;
