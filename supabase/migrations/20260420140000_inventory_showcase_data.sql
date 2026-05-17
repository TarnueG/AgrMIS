-- Showcase data for the AgrMIS inventory dashboard.
-- This is intentionally idempotent and only inserts records that are missing.
-- Remove this migration in a production deployment if demo/sample records are not desired.

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_category_check;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_check
  CHECK (
    category IN (
      'seeds',
      'feed',
      'tools',
      'fertilizer',
      'chemicals',
      'equipment',
      'livestock_feed',
      'fish_feed',
      'harvested_goods',
      'finished_goods',
      'spare_parts'
    )
  );

ALTER TABLE public.procurement DROP CONSTRAINT IF EXISTS procurement_status_check;

ALTER TABLE public.procurement
  ADD CONSTRAINT procurement_status_check
  CHECK (
    status IN (
      'pending',
      'approved',
      'ordered',
      'received',
      'cancelled'
    )
  );

DO $$
DECLARE
  green_seed_id UUID;
  agrochem_id UUID;
  feedworks_id UUID;
  farm_parts_id UUID;

  maize_seed_id UUID;
  urea_id UUID;
  npk_id UUID;
  fish_feed_id UUID;
  broiler_feed_id UUID;
  fungicide_id UUID;
  diesel_filter_id UUID;
  tomatoes_id UUID;
  rice_goods_id UUID;
  crates_id UUID;

  procurement_id UUID;
BEGIN
  SELECT id INTO green_seed_id FROM public.suppliers WHERE name = 'GreenSeed Agro Supply' LIMIT 1;
  IF green_seed_id IS NULL THEN
    INSERT INTO public.suppliers (name, contact_person, phone, email, address, notes)
    VALUES (
      'GreenSeed Agro Supply',
      'Mara Ionescu',
      '+40 721 100 501',
      'orders@greenseed.example',
      'Bucharest regional seed depot',
      'Primary certified seed supplier for seasonal planting.'
    )
    RETURNING id INTO green_seed_id;
  END IF;

  SELECT id INTO agrochem_id FROM public.suppliers WHERE name = 'AgroChem Inputs Ltd' LIMIT 1;
  IF agrochem_id IS NULL THEN
    INSERT INTO public.suppliers (name, contact_person, phone, email, address, notes)
    VALUES (
      'AgroChem Inputs Ltd',
      'Dan Popescu',
      '+40 721 100 502',
      'supply@agrochem.example',
      'Timisoara agro-inputs hub',
      'Fertilizer and crop protection supplier.'
    )
    RETURNING id INTO agrochem_id;
  END IF;

  SELECT id INTO feedworks_id FROM public.suppliers WHERE name = 'FeedWorks Cooperative' LIMIT 1;
  IF feedworks_id IS NULL THEN
    INSERT INTO public.suppliers (name, contact_person, phone, email, address, notes)
    VALUES (
      'FeedWorks Cooperative',
      'Elena Stan',
      '+40 721 100 503',
      'dispatch@feedworks.example',
      'Cluj feed mill',
      'Livestock and aquaculture feed partner.'
    )
    RETURNING id INTO feedworks_id;
  END IF;

  SELECT id INTO farm_parts_id FROM public.suppliers WHERE name = 'FarmParts Service Center' LIMIT 1;
  IF farm_parts_id IS NULL THEN
    INSERT INTO public.suppliers (name, contact_person, phone, email, address, notes)
    VALUES (
      'FarmParts Service Center',
      'Radu Marin',
      '+40 721 100 504',
      'parts@farmparts.example',
      'Constanta machinery service yard',
      'Tools, filters, and machinery consumables.'
    )
    RETURNING id INTO farm_parts_id;
  END IF;

  SELECT id INTO maize_seed_id FROM public.inventory WHERE item_name = 'Hybrid Maize Seed - FAO 350' LIMIT 1;
  IF maize_seed_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Hybrid Maize Seed - FAO 350', 'seeds', 420, 'bags', 180, 'Seed Store A',
      CURRENT_DATE + INTERVAL '320 days', 'SEED-MZ-2026-A', 'available', 75, 48.50,
      green_seed_id, 'Certified hybrid seed reserved for spring planting blocks.'
    )
    RETURNING id INTO maize_seed_id;
  END IF;

  SELECT id INTO urea_id FROM public.inventory WHERE item_name = 'Urea Fertilizer 46-0-0' LIMIT 1;
  IF urea_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Urea Fertilizer 46-0-0', 'fertilizer', 1200, 'kg', 500, 'Fertilizer Shed 1',
      'FERT-UREA-APR26', 'available', 350, 0.62, agrochem_id,
      'Nitrogen fertilizer allocated to maize and vegetable plots.'
    )
    RETURNING id INTO urea_id;
  END IF;

  SELECT id INTO npk_id FROM public.inventory WHERE item_name = 'NPK Fertilizer 15-15-15' LIMIT 1;
  IF npk_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'NPK Fertilizer 15-15-15', 'fertilizer', 260, 'kg', 400, 'Fertilizer Shed 1',
      'FERT-NPK-LOW26', 'available', 60, 0.74, agrochem_id,
      'Below reorder level; needed before next top dressing cycle.'
    )
    RETURNING id INTO npk_id;
  END IF;

  SELECT id INTO fish_feed_id FROM public.inventory WHERE item_name = 'Floating Fish Feed 32% Protein' LIMIT 1;
  IF fish_feed_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Floating Fish Feed 32% Protein', 'fish_feed', 180, 'bags', 220, 'Feed Store B',
      CURRENT_DATE + INTERVAL '28 days', 'AQUA-FEED-0426', 'available', 45, 22.00,
      feedworks_id, 'Expiring soon; prioritize current pond cycle.'
    )
    RETURNING id INTO fish_feed_id;
  END IF;

  SELECT id INTO broiler_feed_id FROM public.inventory WHERE item_name = 'Broiler Starter Feed' LIMIT 1;
  IF broiler_feed_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Broiler Starter Feed', 'livestock_feed', 95, 'bags', 160, 'Feed Store A',
      CURRENT_DATE + INTERVAL '75 days', 'BROIL-ST-2026-04', 'available', 30, 18.25,
      feedworks_id, 'Low stock for next poultry batch.'
    )
    RETURNING id INTO broiler_feed_id;
  END IF;

  SELECT id INTO fungicide_id FROM public.inventory WHERE item_name = 'Copper Fungicide 5L' LIMIT 1;
  IF fungicide_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Copper Fungicide 5L', 'chemicals', 42, 'canisters', 30, 'Chemical Store',
      CURRENT_DATE + INTERVAL '19 days', 'CHEM-COP-EXP26', 'quarantine', 0, 31.80,
      agrochem_id, 'On quality hold pending label and seal inspection.'
    )
    RETURNING id INTO fungicide_id;
  END IF;

  SELECT id INTO diesel_filter_id FROM public.inventory WHERE item_name = 'Tractor Diesel Filter Set' LIMIT 1;
  IF diesel_filter_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Tractor Diesel Filter Set', 'spare_parts', 14, 'sets', 10, 'Machinery Store',
      'SPARE-FLTR-2026', 'available', 4, 37.50, farm_parts_id,
      'Reserved for scheduled tractor maintenance.'
    )
    RETURNING id INTO diesel_filter_id;
  END IF;

  SELECT id INTO tomatoes_id FROM public.inventory WHERE item_name = 'Harvested Tomatoes - Grade B' LIMIT 1;
  IF tomatoes_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Harvested Tomatoes - Grade B', 'harvested_goods', 680, 'kg', 250, 'Cold Room 1',
      CURRENT_DATE + INTERVAL '5 days', 'HARV-TOM-0420', 'pending_qc', 180, 0.95,
      NULL, 'Harvested pending QC and grading before sale or processing.'
    )
    RETURNING id INTO tomatoes_id;
  END IF;

  SELECT id INTO rice_goods_id FROM public.inventory WHERE item_name = 'Packaged Rice 5kg' LIMIT 1;
  IF rice_goods_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, expiry_date, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Packaged Rice 5kg', 'finished_goods', 310, 'bags', 140, 'Finished Goods Store',
      CURRENT_DATE + INTERVAL '540 days', 'FG-RICE-5KG-26A', 'available', 95, 4.20,
      NULL, 'Finished goods reserved for confirmed customer orders.'
    )
    RETURNING id INTO rice_goods_id;
  END IF;

  SELECT id INTO crates_id FROM public.inventory WHERE item_name = 'Reusable Harvest Crates' LIMIT 1;
  IF crates_id IS NULL THEN
    INSERT INTO public.inventory (
      item_name, category, quantity, unit, min_stock_level, location, batch_no,
      quality_status, reserved_quantity, unit_cost, supplier_id, notes
    )
    VALUES (
      'Reusable Harvest Crates', 'tools', 55, 'pcs', 80, 'Packing Shed',
      'TOOLS-CRATE-2026', 'damaged', 0, 6.75, farm_parts_id,
      'Damaged and short against harvest requirement; replace before next field pick.'
    )
    RETURNING id INTO crates_id;
  END IF;

  -- Movement history powers the received/dispatched trend and latest movement column.
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = maize_seed_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (maize_seed_id, 'received', 300, 48.50, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '5 months' + INTERVAL '4 days', 'Opening certified seed receipt.'),
      (maize_seed_id, 'dispatched', 80, NULL, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '4 months' + INTERVAL '8 days', 'Issued to early planting block.'),
      (maize_seed_id, 'received', 260, 49.20, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '2 months' + INTERVAL '10 days', 'Seasonal replenishment.'),
      (maize_seed_id, 'reserved', 75, NULL, 'showcase', CURRENT_DATE - INTERVAL '6 days', 'Reserved for spring planting plan.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = urea_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (urea_id, 'received', 900, 0.61, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '5 months' + INTERVAL '12 days', 'Bulk fertilizer delivery.'),
      (urea_id, 'dispatched', 360, NULL, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '6 days', 'Issued for maize top dressing.'),
      (urea_id, 'received', 700, 0.62, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '1 months' + INTERVAL '7 days', 'Procurement receipt.'),
      (urea_id, 'dispatched', 210, NULL, 'showcase', CURRENT_DATE - INTERVAL '10 days', 'Issued to vegetable plots.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = fish_feed_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (fish_feed_id, 'received', 240, 22.00, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '2 months' + INTERVAL '5 days', 'Aquaculture feed receipt.'),
      (fish_feed_id, 'dispatched', 70, NULL, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '1 months' + INTERVAL '11 days', 'Issued to pond cycle.'),
      (fish_feed_id, 'dispatched', 35, NULL, 'showcase', CURRENT_DATE - INTERVAL '4 days', 'Daily pond ration issue.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = rice_goods_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (rice_goods_id, 'received', 420, 4.20, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '15 days', 'Production output from packaging line.'),
      (rice_goods_id, 'dispatched', 90, NULL, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '1 months' + INTERVAL '19 days', 'Customer order dispatch.'),
      (rice_goods_id, 'dispatched', 45, NULL, 'showcase', CURRENT_DATE - INTERVAL '2 days', 'Reserved order dispatch.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = crates_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (crates_id, 'received', 90, 6.75, 'showcase', date_trunc('month', CURRENT_DATE) - INTERVAL '4 months' + INTERVAL '9 days', 'Harvest crate purchase.'),
      (crates_id, 'damaged', 35, NULL, 'showcase', CURRENT_DATE - INTERVAL '8 days', 'Crates damaged during field harvest handling.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE inventory_id = fungicide_id AND source_module = 'showcase'
  ) THEN
    INSERT INTO public.inventory_movements (
      inventory_id, movement_type, quantity, unit_cost, source_module, movement_date, notes
    )
    VALUES
      (fungicide_id, 'received', 42, 31.80, 'showcase', CURRENT_DATE - INTERVAL '22 days', 'Chemical receipt awaiting quality inspection.'),
      (fungicide_id, 'reserved', 12, NULL, 'showcase', CURRENT_DATE - INTERVAL '3 days', 'Reserved for disease-control spray plan.');
  END IF;

  -- Procurement records power pending inbound supply and receipt workflow.
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement
    WHERE item_name = 'NPK Fertilizer 15-15-15' AND notes = 'Showcase pending replenishment order.'
  ) THEN
    INSERT INTO public.procurement (
      item_name, supplier, supplier_id, inventory_id, quantity, unit_price, total_cost,
      status, expected_date, notes
    )
    VALUES (
      'NPK Fertilizer 15-15-15', 'AgroChem Inputs Ltd', agrochem_id, npk_id,
      900, 0.73, 657.00, 'ordered', CURRENT_DATE + INTERVAL '9 days',
      'Showcase pending replenishment order.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement
    WHERE item_name = 'Floating Fish Feed 32% Protein' AND notes = 'Showcase urgent feed order.'
  ) THEN
    INSERT INTO public.procurement (
      item_name, supplier, supplier_id, inventory_id, quantity, unit_price, total_cost,
      status, expected_date, notes
    )
    VALUES (
      'Floating Fish Feed 32% Protein', 'FeedWorks Cooperative', feedworks_id, fish_feed_id,
      260, 21.75, 5655.00, 'approved', CURRENT_DATE + INTERVAL '4 days',
      'Showcase urgent feed order.'
    );
  END IF;

  SELECT id INTO procurement_id
  FROM public.procurement
  WHERE item_name = 'Hybrid Maize Seed - FAO 350'
    AND notes = 'Showcase received seed replenishment.'
  LIMIT 1;

  IF procurement_id IS NULL THEN
    INSERT INTO public.procurement (
      item_name, supplier, supplier_id, inventory_id, quantity, unit_price, total_cost,
      status, expected_date, received_at, notes
    )
    VALUES (
      'Hybrid Maize Seed - FAO 350', 'GreenSeed Agro Supply', green_seed_id, maize_seed_id,
      260, 49.20, 12792.00, 'received', CURRENT_DATE - INTERVAL '2 months',
      CURRENT_DATE - INTERVAL '2 months' + INTERVAL '10 days',
      'Showcase received seed replenishment.'
    )
    RETURNING id INTO procurement_id;
  END IF;
END;
$$;
