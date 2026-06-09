-- Finance PO payment fix: paying a Purchase Order linked to an equipment request
-- materializes the machinery asset and sets equipment_requests.status = 'fulfilled'.
-- The equipment_requests CHECK constraint only allowed pending/approved/disapproved/delivered,
-- so the whole pay transaction rolled back with a 500 — observed as "mobile money payment
-- doesn't work" (the failing POs happened to be the equipment-linked ones).
-- parcel_requests has no such constraint, which is why parcels worked. Allow 'fulfilled'.

ALTER TABLE equipment_requests DROP CONSTRAINT IF EXISTS equipment_requests_status_check;
ALTER TABLE equipment_requests ADD CONSTRAINT equipment_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','disapproved','delivered','fulfilled']));
