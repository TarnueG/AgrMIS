-- Task Schedule Migration
-- Creates the farm_tasks table for the Human Capital task scheduler.
-- Personnel and equipment are optional; availability is derived by excluding
-- resources tied to tasks with status='active'.

CREATE TABLE IF NOT EXISTS farm_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID,
  task_name     VARCHAR(200) NOT NULL,
  location      VARCHAR(200),
  men_required  INT DEFAULT 1,
  personnel_id  UUID,
  equipment_id  UUID,
  start_date    DATE,
  end_date      DATE,
  status        VARCHAR(30) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','cancelled')),
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_farm_tasks_farm   ON farm_tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_tasks_status ON farm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_farm_tasks_end    ON farm_tasks(end_date);
