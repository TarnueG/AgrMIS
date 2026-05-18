alter table if exists public.subsystem_permissions
  add column if not exists can_approve boolean not null default false,
  add column if not exists can_export boolean not null default false;
