-- Task Schedule: upgrade start/end to date+time.
-- Promotes farm_tasks.start_date and end_date from DATE to TIMESTAMPTZ so the
-- task scheduler can capture a specific time of day. Existing DATE values are
-- preserved at local midnight by the implicit cast.

ALTER TABLE farm_tasks
  ALTER COLUMN start_date TYPE TIMESTAMPTZ USING start_date::timestamptz,
  ALTER COLUMN end_date   TYPE TIMESTAMPTZ USING end_date::timestamptz;
