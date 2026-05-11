-- Inventory Workflow Migration
-- Creates 3 tables: production requests, production batches, procurement requests

CREATE TABLE IF NOT EXISTS inventory_production_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID,
  product_name  VARCHAR(100) NOT NULL,
  quantity      DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity_unit VARCHAR(20) DEFAULT 'kg',
  location      VARCHAR(200),
  order_type    VARCHAR(50)  DEFAULT 'Make-to-Order',
  link_order    VARCHAR(50)  DEFAULT 'Make-to-Stock',
  status        VARCHAR(30)  DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','cancelled','passed')),
  stock_item_id UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_production_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      UUID,
  request_id   UUID REFERENCES inventory_production_requests(id) ON DELETE CASCADE,
  batch_number VARCHAR(50),
  quantity     DECIMAL(10,2),
  status       VARCHAR(30) DEFAULT 'pending'
               CHECK (status IN ('pending','in_process','quality_check','passed','rework')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_procurement_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          UUID,
  category         VARCHAR(50) NOT NULL,
  item_name        VARCHAR(100) NOT NULL,
  quantity         DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity_unit    VARCHAR(20) DEFAULT 'liters',
  status           VARCHAR(30) DEFAULT 'pending'
                   CHECK (status IN ('pending','received','cancelled')),
  manufacture_date DATE,
  expiration_date  DATE,
  in_stock         BOOLEAN DEFAULT FALSE,
  stock_item_id    UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
