import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

export const SUBSYSTEMS = [
  { key: 'dashboard',         label: 'Dashboard' },
  { key: 'inventory',         label: 'Inventory' },
  { key: 'procurement',       label: 'Procurement' },
  { key: 'crm',               label: 'CRM (Customers)' },
  { key: 'marketing',         label: 'Marketing' },
  { key: 'sales_order_points',label: 'Sales & Order Points' },
  { key: 'production',        label: 'Production' },
  { key: 'livestock',         label: 'Livestock' },
  { key: 'finance',           label: 'Finance' },
  { key: 'reports',           label: 'Reports' },
  { key: 'human_capital',     label: 'Human Capital' },
  { key: 'machinery',         label: 'Machinery' },
  { key: 'land_parcels',      label: 'Land Parcels' },
  { key: 'settings',          label: 'Settings & Access Control' },
];

const isAdmin = requireRole('admin', 'system_admin', 'administrator', 'Admin', 'System Administrator');

// GET /api/v1/access-control/subsystems
router.get('/subsystems', isAdmin, async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const [roles, permissions] = await Promise.all([
      prisma.roles.findMany({ orderBy: { name: 'asc' } }),
      (prisma as any).subsystem_permissions.findMany({ where: { farm_id: farmId } }),
    ]);
    return res.json({ subsystems: SUBSYSTEMS, roles, permissions });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch permissions', code: 'DB_ERROR' });
  }
});

// PUT /api/v1/access-control/subsystems
router.put('/subsystems', isAdmin, async (req, res) => {
  const schema = z.object({
    roleId: z.string().uuid(),
    subsystem: z.string().min(1),
    canView: z.boolean(),
    canCreate: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });

  const farmId = req.user!.farmId;
  if (!farmId) return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });

  const { roleId, subsystem, canView, canCreate, canEdit, canDelete } = parsed.data;
  try {
    await (prisma as any).subsystem_permissions.upsert({
      where: { uq_subsystem_perm: { farm_id: farmId, role_id: roleId, subsystem } },
      update: { can_view: canView, can_create: canCreate, can_edit: canEdit, can_delete: canDelete, updated_at: new Date() },
      create: { farm_id: farmId, role_id: roleId, subsystem, can_view: canView, can_create: canCreate, can_edit: canEdit, can_delete: canDelete },
    });
    return res.json({ message: 'Permission updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update permission', code: 'DB_ERROR' });
  }
});

// GET /api/v1/access-control/users
router.get('/users', isAdmin, async (req, res) => {
  try {
    const [users, roles] = await Promise.all([
      (prisma as any).users.findMany({
        where: { deleted_at: null },
        select: {
          id: true,
          full_name: true,
          email: true,
          username: true,
          role: { select: { id: true, name: true } },
          employees: {
            where: { deleted_at: null },
            take: 1,
            orderBy: { created_at: 'desc' as const },
            select: { job_title: true, department: true, employment_type: true, personnel_id: true },
          },
        },
        orderBy: { full_name: 'asc' },
      }),
      prisma.roles.findMany({ orderBy: { name: 'asc' } }),
    ]);

    return res.json({
      users: users.map((u: any) => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        username: u.username,
        role: u.role,
        employee: u.employees[0] ?? null,
      })),
      roles,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch users', code: 'DB_ERROR' });
  }
});

// PATCH /api/v1/access-control/users/:id/role
router.patch('/users/:id/role', isAdmin, async (req, res) => {
  const schema = z.object({ roleId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  try {
    await prisma.users.update({
      where: { id: String(req.params.id) },
      data: { role_id: parsed.data.roleId, updated_at: new Date() },
    });
    return res.json({ message: 'Role updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update role', code: 'DB_ERROR' });
  }
});

export default router;
