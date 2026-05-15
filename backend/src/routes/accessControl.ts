import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { hashPassword } from '../lib/crypto';
import prisma from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { invalidateCache } from '../lib/permissions';
import { CARD_REGISTRY, allCardIds } from '../lib/cardRegistry';
import { deactivateUser, reactivateUser, findLinkedUserId } from '../lib/userStatus';

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

const isAdmin = requireRole('admin');

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
      where: { farm_id_role_id_subsystem: { farm_id: farmId, role_id: roleId, subsystem } },
      update: { can_view: canView, can_create: canCreate, can_edit: canEdit, can_delete: canDelete, updated_at: new Date() },
      create: { farm_id: farmId, role_id: roleId, subsystem, can_view: canView, can_create: canCreate, can_edit: canEdit, can_delete: canDelete },
    });
    invalidateCache(roleId, farmId);
    const { ip, userAgent } = clientInfo(req);
    const actions = [canView && 'view', canCreate && 'create', canEdit && 'edit', canDelete && 'delete'].filter(Boolean).join(', ');
    logAuditEvent({ actorUserId: req.user!.userId, eventType: 'permission_changed', subsystem, description: `Permissions updated for subsystem "${subsystem}": [${actions}]`, metadata: { roleId, subsystem, canView, canCreate, canEdit, canDelete }, ipAddress: ip, userAgent });
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
          is_active: true,
          deactivated_at: true,
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
        isActive: u.is_active,
        deactivatedAt: u.deactivated_at,
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
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, targetUserId: String(req.params.id), eventType: 'role_changed', subsystem: 'settings', description: `Role updated for user ${req.params.id}`, metadata: { newRoleId: parsed.data.roleId }, ipAddress: ip, userAgent });
    return res.json({ message: 'Role updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update role', code: 'DB_ERROR' });
  }
});

// PATCH /api/v1/access-control/users/:id/deactivate
router.patch('/users/:id/deactivate', isAdmin, async (req, res) => {
  const userId = String(req.params.id);
  if (userId === req.user!.userId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account', code: 'SELF_DEACTIVATE' });
  }
  try {
    await deactivateUser(userId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, targetUserId: userId, eventType: 'user_deactivated', subsystem: 'settings', description: `User ${userId} deactivated`, ipAddress: ip, userAgent });
    return res.json({ message: 'User deactivated' });
  } catch {
    return res.status(500).json({ error: 'Failed to deactivate user', code: 'DB_ERROR' });
  }
});

// PATCH /api/v1/access-control/users/:id/activate
router.patch('/users/:id/activate', isAdmin, async (req, res) => {
  const userId = String(req.params.id);
  try {
    await reactivateUser(userId);
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({ actorUserId: req.user!.userId, targetUserId: userId, eventType: 'user_activated', subsystem: 'settings', description: `User ${userId} activated`, ipAddress: ip, userAgent });
    return res.json({ message: 'User activated' });
  } catch {
    return res.status(500).json({ error: 'Failed to activate user', code: 'DB_ERROR' });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const arr: string[] = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
    ...Array.from({ length: 8 }, () => all[crypto.randomInt(all.length)]),
  ];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

const ELIGIBLE_JOB_TITLES = new Set([
  'farm manager', 'asset manager', 'marketing manager',
  'human resource', 'accountant', 'procurement', 'field supervisor',
]);

// GET /api/v1/access-control/eligible-personnel
router.get('/eligible-personnel', isAdmin, async (req, res) => {
  try {
    const existingUsers = await (prisma as any).users.findMany({
      where: { deleted_at: null },
      select: { email: true },
    });
    const takenEmails = new Set<string>(
      existingUsers.map((u: any) => (u.email ?? '').toLowerCase())
    );

    const [employees, customers] = await Promise.all([
      (prisma as any).employees.findMany({
        where: { deleted_at: null, status: 'active' },
        select: {
          id: true, personnel_id: true, full_name: true, email: true,
          job_title: true, employment_type: true, sector: true, phone: true, address: true,
        },
      }),
      prisma.customers.findMany({
        where: { deleted_at: null, is_active: true, farm_id: req.user!.farmId ?? undefined },
        select: { id: true, name: true, email: true, phone: true, address: true, customer_type: true },
      }),
    ]);

    const eligible = [
      ...employees
        .filter((e: any) => {
          if (!e.email || takenEmails.has((e.email as string).toLowerCase())) return false;
          const title = ((e.job_title as string | null) ?? '').toLowerCase().trim();
          return ELIGIBLE_JOB_TITLES.has(title);
        })
        .map((e: any) => ({
          type: 'personnel' as const,
          sourceId: e.id as string,
          displayId: (e.personnel_id as string | null) ?? `EMP-${(e.id as string).substring(0, 6).toUpperCase()}`,
          fullName: e.full_name as string,
          email: e.email as string,
          jobTitle: (e.job_title as string | null) ?? 'Staff',
          employmentType: e.employment_type as string | null,
          sector: e.sector as string | null,
          phone: e.phone as string | null,
          address: e.address as string | null,
        })),
      ...customers
        .filter((c: any) => c.email && !takenEmails.has((c.email as string).toLowerCase()))
        .map((c: any) => ({
          type: 'customer' as const,
          sourceId: c.id as string,
          displayId: `CUST-${(c.id as string).substring(0, 6).toUpperCase()}`,
          fullName: c.name as string,
          email: c.email as string,
          jobTitle: (c.customer_type as string | null) ?? 'Customer',
          phone: c.phone as string | null,
          address: c.address as string | null,
        })),
    ];

    return res.json({ personnel: eligible });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch eligible personnel', code: 'DB_ERROR' });
  }
});

// POST /api/v1/access-control/create-account
router.post('/create-account', isAdmin, async (req, res) => {
  const schema = z.object({
    sourceType: z.enum(['personnel', 'customer']),
    sourceId: z.string(),
    roleId: z.string().uuid(),
    fullName: z.string().min(1),
    email: z.string().email(),
    jobTitle: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }
  const { sourceType, sourceId, roleId, fullName, email, phone } = parsed.data;

  const existing = await (prisma as any).users.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null },
  });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists', code: 'EMAIL_TAKEN' });
  }

  // Generate username: first name + first letter of last name, lowercase
  const parts = fullName.trim().split(/\s+/);
  const base =
    (parts[0] ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '') +
    (parts.length > 1 ? (parts[parts.length - 1][0] ?? '').toLowerCase() : '');

  let username = base || 'user';
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await (prisma as any).users.findFirst({ where: { username, deleted_at: null } });
    if (!taken) break;
    username = `${base}${counter++}`;
  }

  const rawPassword = generatePassword();
  const passwordHash = hashPassword(rawPassword);

  const user = await (prisma as any).users.create({
    data: {
      role_id: roleId,
      full_name: fullName,
      email,
      username,
      password_hash: passwordHash,
      phone: phone ?? null,
    },
    include: { role: true },
  });

  if (sourceType === 'personnel') {
    await (prisma as any).employees.updateMany({
      where: { id: sourceId, deleted_at: null },
      data: { user_id: user.id },
    });
  } else if (sourceType === 'customer') {
    await prisma.users.update({
      where: { id: user.id },
      data: { linked_customer_id: sourceId },
    });
  }

  const { ip, userAgent } = clientInfo(req);
  logAuditEvent({
    actorUserId: req.user!.userId,
    targetUserId: user.id,
    eventType: 'account_created',
    subsystem: 'settings',
    description: `Account created for ${fullName} (${email})`,
    metadata: { roleId, sourceType, sourceId },
    ipAddress: ip,
    userAgent,
  });

  return res.status(201).json({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    username,
    role: user.role.name,
    generatedPassword: rawPassword,
  });
});

// ── Card permissions ──────────────────────────────────────────────────────────

// GET /api/v1/access-control/cards?roleId=<uuid>
router.get('/cards', isAdmin, async (req, res) => {
  const { roleId } = req.query as { roleId?: string };
  const farmId = req.user!.farmId;
  if (!roleId) return res.status(400).json({ error: 'roleId required', code: 'VALIDATION_ERROR' });
  try {
    const rows: Array<{ card_id: string }> = await prisma.$queryRaw`
      SELECT card_id FROM card_permissions
      WHERE role_id = ${roleId}::uuid AND farm_id = ${farmId}::uuid
    `;
    const granted = new Set(rows.map(r => r.card_id));
    return res.json({ registry: CARD_REGISTRY, granted: Array.from(granted) });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch card permissions', code: 'DB_ERROR' });
  }
});

// PUT /api/v1/access-control/cards
router.put('/cards', isAdmin, async (req, res) => {
  const schema = z.object({
    roleId: z.string().uuid(),
    cardIds: z.array(z.string()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });

  const farmId = req.user!.farmId;
  if (!farmId) return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });

  const { roleId, cardIds } = parsed.data;
  try {
    // Delete all existing grants for this role+farm, then re-insert the new set
    await prisma.$executeRaw`
      DELETE FROM card_permissions WHERE role_id = ${roleId}::uuid AND farm_id = ${farmId}::uuid
    `;
    for (const cardId of cardIds) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO card_permissions (farm_id, role_id, card_id)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT ON CONSTRAINT farm_role_card DO NOTHING`,
        farmId, roleId, cardId
      );
    }
    invalidateCache(roleId, farmId);
    const role = await prisma.roles.findUnique({ where: { id: roleId }, select: { name: true } });
    const { ip, userAgent } = clientInfo(req);
    logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'permission_changed',
      subsystem: 'settings',
      description: `Card permissions updated for role "${role?.name ?? roleId}": ${cardIds.length} card(s) granted`,
      metadata: { roleId, cardIds },
      ipAddress: ip,
      userAgent,
    });
    return res.json({ message: 'Card permissions updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update card permissions', code: 'DB_ERROR' });
  }
});

export default router;
