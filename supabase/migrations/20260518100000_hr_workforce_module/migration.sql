CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES public.farm_profiles(id) ON DELETE NO ACTION,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE NO ACTION,
  leave_type varchar(30) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  approval_status varchar(20) NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_employee ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_farm ON public.leave_requests(farm_id);
CREATE INDEX IF NOT EXISTS idx_leave_dates ON public.leave_requests(start_date, end_date);

CREATE TABLE IF NOT EXISTS public.supervisor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES public.farm_profiles(id) ON DELETE NO ACTION,
  supervisor_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE NO ACTION,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE NO ACTION,
  assigned_by uuid REFERENCES public.users(id) ON DELETE NO ACTION,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_supervisor_assignment_employee ON public.supervisor_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_assignment_farm ON public.supervisor_assignments(farm_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_assignment_supervisor ON public.supervisor_assignments(supervisor_id);

ALTER TABLE public.task_assignments
  ALTER COLUMN employee_id DROP NOT NULL;
