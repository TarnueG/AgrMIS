-- Procurement lifecycle fix: inventory_procurement_requests (Chemicals & Feed requests routed to
-- Procurement, spec 4.2/B) had a CHECK constraint that only allowed 'pending'/'received'/'cancelled'.
-- Completing or cancelling such a request sets status to 'approved'/'disapproved' (the same vocabulary
-- equipment/parcel requests use), which violated the constraint — so supply requests stayed in
-- Requested Orders and the Cancel button 500'd. Extend the allowed values.
-- (Inventory Upcoming Items already maps approved→Processing and disapproved→Cancel.)

ALTER TABLE inventory_procurement_requests DROP CONSTRAINT IF EXISTS inventory_procurement_requests_status_check;
ALTER TABLE inventory_procurement_requests ADD CONSTRAINT inventory_procurement_requests_status_check
  CHECK (status = ANY (ARRAY['pending','received','cancelled','approved','disapproved','processing']));
