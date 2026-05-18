import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { hashPassword } from '../lib/crypto';
import prisma from '../lib/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';
import { setFarmContext } from '../middleware/farm';
import { logAuditEvent, clientInfo } from '../lib/audit';
import { invalidateCache } from '../lib/permissions';
import { deactivateUser, reactivateUser } from '../lib/userStatus';
import {
  ADMIN_ROLE_NAMES,
  ALL_SUBSYSTEMS,
  DEFAULT_ROLE_DEFINITIONS,
  getDefaultPermissionsForRole,
  SUBSYSTEMS,
  SYSTEM_ROLE_NAMES,
  type PermissionState,
} from '../lib/accessControlConfig';

const router = Router();
router.use(requireAuth);
router.use(setFarmContext);

const permissionFields = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove', 'canExport'] as const;

const permissionStateSchema = z.object({
  subsystem: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canApprove: z.boolean(),
  canExport: z.boolean(),
});

const batchPermissionSchema = z.object({
  permissions: z.array(permissionStateSchema).min(1),
});

const createRoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(250).optional().or(z.literal('')),
  duplicateFromRoleId: z.string().uuid().optional().nullable(),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().max(250).optional().or(z.literal('')),
});

router.get('/subsystems', requirePermission('access_control', 'view'), async (req, res) => {
  const farmId = req.user!.farmId;

  try {
    const [roles, permissions] = await Promise.all([
      prisma.roles.findMany({ orderBy: { name: 'asc' } }),
      (prisma as any).subsystem_permissions.findMany({ where: { farm_id: farmId } }),
    ]);

    const mergedPermissions = roles.flatMap((role) =>
      mergePermissionRows(
        role.name,
        permissions.filter((permission: any) => permission.role_id === role.id),
      ).map((permission) => ({
        role_id: role.id,
        farm_id: farmId,
        subsystem: permission.subsystem,
        can_view: permission.canView,
        can_create: permission.canCreate,
        can_edit: permission.canEdit,
        can_delete: permission.canDelete,
        can_approve: permission.canApprove,
        can_export: permission.canExport,
      })),
    );

    return res.json({
      subsystems: SUBSYSTEMS,
      roles: await withRoleUsage(roles),
      permissions: mergedPermissions,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch permissions', code: 'DB_ERROR' });
  }
});

router.get('/roles', requirePermission('access_control', 'view'), async (_req, res) => {
  try {
    const roles = await prisma.roles.findMany({ orderBy: { name: 'asc' } });
    return res.json({ roles: await withRoleUsage(roles) });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch roles', code: 'DB_ERROR' });
  }
});

router.get('/roles/:id/permissions', requirePermission('access_control', 'view'), async (req, res) => {
  const farmId = req.user!.farmId;
  try {
    const role = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }

    const rows = await (prisma as any).subsystem_permissions.findMany({
      where: { farm_id: farmId, role_id: role.id },
    });

    return res.json({
      role,
      permissions: mergePermissionRows(role.name, rows),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch role permissions', code: 'DB_ERROR' });
  }
});

router.put('/roles/:id/permissions', requirePermission('access_control', 'edit'), async (req, res) => {
  const parsed = batchPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const farmId = req.user!.farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });
  }

  try {
    const role = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }
    if (ADMIN_ROLE_NAMES.has(role.name)) {
      return res.status(400).json({ error: 'System admin permissions cannot be edited', code: 'PROTECTED_ROLE' });
    }

    const incoming = parsed.data.permissions;
    const invalidSubsystem = incoming.find((row) => !ALL_SUBSYSTEMS.includes(row.subsystem as any));
    if (invalidSubsystem) {
      return res.status(400).json({ error: `Unknown subsystem "${invalidSubsystem.subsystem}"`, code: 'VALIDATION_ERROR' });
    }

    const permissionMap = new Map(
      incoming.map((row) => [
        row.subsystem,
        {
          canView: row.canView,
          canCreate: row.canCreate,
          canEdit: row.canEdit,
          canDelete: row.canDelete,
          canApprove: row.canApprove,
          canExport: row.canExport,
        },
      ]),
    );

    const beforeRows = await (prisma as any).subsystem_permissions.findMany({
      where: { farm_id: farmId, role_id: role.id },
    });

    await prisma.$transaction(async (tx) => {
      for (const subsystem of ALL_SUBSYSTEMS) {
        const next = permissionMap.get(subsystem) ?? emptyPermission();
        await (tx as any).subsystem_permissions.upsert({
          where: { farm_id_role_id_subsystem: { farm_id: farmId, role_id: role.id, subsystem } },
          update: {
            can_view: next.canView,
            can_create: next.canCreate,
            can_edit: next.canEdit,
            can_delete: next.canDelete,
            can_approve: next.canApprove,
            can_export: next.canExport,
            updated_at: new Date(),
          },
          create: {
            farm_id: farmId,
            role_id: role.id,
            subsystem,
            can_view: next.canView,
            can_create: next.canCreate,
            can_edit: next.canEdit,
            can_delete: next.canDelete,
            can_approve: next.canApprove,
            can_export: next.canExport,
          },
        });
      }
    });

    invalidateCache(role.id, farmId);

    const after = mergePermissionRows(
      role.name,
      await (prisma as any).subsystem_permissions.findMany({ where: { farm_id: farmId, role_id: role.id } }),
    );
    const before = mergePermissionRows(role.name, beforeRows);
    const { ip, userAgent } = clientInfo(req);

    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'permission_changed',
      subsystem: 'access_control',
      description: `Permissions updated for role "${role.name}"`,
      metadata: { roleId: role.id, roleName: role.name, before, after },
      ipAddress: ip,
      userAgent,
    });

    return res.json({ message: 'Permissions updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update permissions', code: 'DB_ERROR' });
  }
});

router.post('/roles', requirePermission('access_control', 'create'), async (req, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  const farmId = req.user!.farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });
  }

  const normalizedName = normalizeRoleName(parsed.data.name);

  try {
    const existing = await prisma.roles.findFirst({ where: { name: normalizedName } });
    if (existing) {
      return res.status(409).json({ error: 'Role name already exists', code: 'ROLE_EXISTS' });
    }

    const sourceRole = parsed.data.duplicateFromRoleId
      ? await prisma.roles.findUnique({ where: { id: parsed.data.duplicateFromRoleId } })
      : null;

    const role = await prisma.roles.create({
      data: {
        name: normalizedName,
        description: parsed.data.description || null,
      },
    });

    const basePermissions = sourceRole
      ? mergePermissionRows(
          sourceRole.name,
          await (prisma as any).subsystem_permissions.findMany({
            where: { farm_id: farmId, role_id: sourceRole.id },
          }),
        )
      : permissionsToRows(getDefaultPermissionsForRole(normalizedName));

    await savePermissionsForRole(farmId, role.id, role.name, basePermissions);

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'settings_changed',
      subsystem: 'access_control',
      description: `Role "${role.name}" created`,
      metadata: { roleId: role.id, duplicateFromRoleId: sourceRole?.id ?? null },
      ipAddress: ip,
      userAgent,
    });

    return res.status(201).json({ role });
  } catch {
    return res.status(500).json({ error: 'Failed to create role', code: 'DB_ERROR' });
  }
});

router.patch('/roles/:id', requirePermission('access_control', 'edit'), async (req, res) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  try {
    const current = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!current) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }
    if (ADMIN_ROLE_NAMES.has(current.name)) {
      return res.status(400).json({ error: 'System admin roles cannot be renamed', code: 'PROTECTED_ROLE' });
    }

    const nextName = parsed.data.name ? normalizeRoleName(parsed.data.name) : current.name;
    if (nextName !== current.name) {
      const conflict = await prisma.roles.findFirst({ where: { name: nextName } });
      if (conflict) {
        return res.status(409).json({ error: 'Role name already exists', code: 'ROLE_EXISTS' });
      }
    }

    const role = await prisma.roles.update({
      where: { id: current.id },
      data: {
        name: nextName,
        description: parsed.data.description !== undefined ? (parsed.data.description || null) : current.description,
      },
    });

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'settings_changed',
      subsystem: 'access_control',
      description: `Role "${current.name}" updated`,
      metadata: {
        roleId: role.id,
        before: { name: current.name, description: current.description },
        after: { name: role.name, description: role.description },
      },
      ipAddress: ip,
      userAgent,
    });

    return res.json({ role });
  } catch {
    return res.status(500).json({ error: 'Failed to update role', code: 'DB_ERROR' });
  }
});

router.post('/roles/:id/duplicate', requirePermission('access_control', 'create'), async (req, res) => {
  const farmId = req.user!.farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });
  }

  try {
    const source = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!source) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }

    const name = await nextDuplicateRoleName(source.name);
    const role = await prisma.roles.create({
      data: {
        name,
        description: source.description ? `${source.description} (copy)` : 'Copied role',
      },
    });

    const permissions = mergePermissionRows(
      source.name,
      await (prisma as any).subsystem_permissions.findMany({ where: { farm_id: farmId, role_id: source.id } }),
    );

    await savePermissionsForRole(farmId, role.id, role.name, permissions);

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'settings_changed',
      subsystem: 'access_control',
      description: `Role "${source.name}" duplicated to "${role.name}"`,
      metadata: { sourceRoleId: source.id, roleId: role.id },
      ipAddress: ip,
      userAgent,
    });

    return res.status(201).json({ role });
  } catch {
    return res.status(500).json({ error: 'Failed to duplicate role', code: 'DB_ERROR' });
  }
});

router.post('/roles/:id/reset', requirePermission('access_control', 'edit'), async (req, res) => {
  const farmId = req.user!.farmId;
  if (!farmId) {
    return res.status(400).json({ error: 'Farm context required', code: 'NO_FARM' });
  }

  try {
    const role = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }
    if (ADMIN_ROLE_NAMES.has(role.name)) {
      return res.status(400).json({ error: 'System admin roles cannot be reset', code: 'PROTECTED_ROLE' });
    }

    const defaults = permissionsToRows(getDefaultPermissionsForRole(role.name));
    await savePermissionsForRole(farmId, role.id, role.name, defaults);

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'permission_changed',
      subsystem: 'access_control',
      description: `Role "${role.name}" reset to defaults`,
      metadata: { roleId: role.id, roleName: role.name },
      ipAddress: ip,
      userAgent,
    });

    return res.json({ message: 'Role reset to defaults' });
  } catch {
    return res.status(500).json({ error: 'Failed to reset role', code: 'DB_ERROR' });
  }
});

router.delete('/roles/:id', requirePermission('access_control', 'delete'), async (req, res) => {
  try {
    const role = await prisma.roles.findUnique({ where: { id: String(req.params.id) } });
    if (!role) {
      return res.status(404).json({ error: 'Role not found', code: 'NOT_FOUND' });
    }
    if (SYSTEM_ROLE_NAMES.has(role.name)) {
      return res.status(400).json({ error: 'System roles cannot be deleted', code: 'PROTECTED_ROLE' });
    }
    if (role.id === req.user!.roleId) {
      return res.status(400).json({ error: 'You cannot delete your current role', code: 'SELF_ROLE_DELETE' });
    }

    const assignedUsers = await prisma.users.count({ where: { role_id: role.id, deleted_at: null } });
    if (assignedUsers > 0) {
      return res.status(400).json({ error: 'Role is still assigned to active users', code: 'ROLE_IN_USE' });
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).subsystem_permissions.deleteMany({ where: { role_id: role.id } });
      await tx.roles.delete({ where: { id: role.id } });
    });

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      eventType: 'settings_changed',
      subsystem: 'access_control',
      description: `Role "${role.name}" deleted`,
      metadata: { roleId: role.id },
      ipAddress: ip,
      userAgent,
    });

    return res.status(204).end();
  } catch {
    return res.status(500).json({ error: 'Failed to delete role', code: 'DB_ERROR' });
  }
});

router.get('/users', requirePermission('access_control', 'view'), async (_req, res) => {
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
      roles: await withRoleUsage(roles),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch users', code: 'DB_ERROR' });
  }
});

router.patch('/users/:id/role', requirePermission('access_control', 'edit'), async (req, res) => {
  const schema = z.object({ roleId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
  }

  try {
    await prisma.users.update({
      where: { id: String(req.params.id) },
      data: { role_id: parsed.data.roleId, updated_at: new Date() },
    });

    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      targetUserId: String(req.params.id),
      eventType: 'role_changed',
      subsystem: 'access_control',
      description: `Role updated for user ${req.params.id}`,
      metadata: { newRoleId: parsed.data.roleId },
      ipAddress: ip,
      userAgent,
    });

    return res.json({ message: 'Role updated' });
  } catch {
    return res.status(500).json({ error: 'Failed to update role', code: 'DB_ERROR' });
  }
});

router.patch('/users/:id/deactivate', requirePermission('access_control', 'edit'), async (req, res) => {
  const userId = String(req.params.id);
  if (userId === req.user!.userId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account', code: 'SELF_DEACTIVATE' });
  }
  try {
    await deactivateUser(userId);
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      targetUserId: userId,
      eventType: 'user_deactivated',
      subsystem: 'access_control',
      description: `User ${userId} deactivated`,
      ipAddress: ip,
      userAgent,
    });
    return res.json({ message: 'User deactivated' });
  } catch {
    return res.status(500).json({ error: 'Failed to deactivate user', code: 'DB_ERROR' });
  }
});

router.patch('/users/:id/activate', requirePermission('access_control', 'edit'), async (req, res) => {
  const userId = String(req.params.id);
  try {
    await reactivateUser(userId);
    const { ip, userAgent } = clientInfo(req);
    await logAuditEvent({
      actorUserId: req.user!.userId,
      targetUserId: userId,
      eventType: 'user_activated',
      subsystem: 'access_control',
      description: `User ${userId} activated`,
      ipAddress: ip,
      userAgent,
    });
    return res.json({ message: 'User activated' });
  } catch {
    return res.status(500).json({ error: 'Failed to activate user', code: 'DB_ERROR' });
  }
});

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
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

const ELIGIBLE_JOB_TITLES = new Set([
  'farm manager',
  'asset manager',
  'marketing manager',
  'sales customer officer',
  'sales_customer_officer',
  'human resource',
  'accountant',
  'procurement',
  'procurement officer',
  'inventory manager',
  'production manager',
  'field supervisor',
]);

router.get('/eligible-personnel', requirePermission('access_control', 'view'), async (req, res) => {
  try {
    const existingUsers = await (prisma as any).users.findMany({
      where: { deleted_at: null },
      select: { email: true },
    });
    const takenEmails = new Set<string>(existingUsers.map((u: any) => (u.email ?? '').toLowerCase()));

    const [employees, customers] = await Promise.all([
      (prisma as any).employees.findMany({
        where: { deleted_at: null, status: 'active' },
        select: {
          id: true,
          personnel_id: true,
          full_name: true,
          email: true,
          job_title: true,
          employment_type: true,
          sector: true,
          phone: true,
          address: true,
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

router.post('/create-account', requirePermission('access_control', 'create'), async (req, res) => {
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

  const parts = fullName.trim().split(/\s+/);
  const base =
    (parts[0] ?? 'user').toLowerCase().replace(/[^a-z0-9]/g, '') +
    (parts.length > 1 ? (parts[parts.length - 1][0] ?? '').toLowerCase() : '');

  let username = base || 'user';
  let counter = 1;
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
  } else {
    await prisma.users.update({
      where: { id: user.id },
      data: { linked_customer_id: sourceId },
    });
  }

  const { ip, userAgent } = clientInfo(req);
  await logAuditEvent({
    actorUserId: req.user!.userId,
    targetUserId: user.id,
    eventType: 'account_created',
    subsystem: 'access_control',
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

function emptyPermission(): PermissionState {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: false,
  };
}

function permissionsToRows(permissionMap: Record<string, PermissionState>) {
  return ALL_SUBSYSTEMS.map((subsystem) => ({
    subsystem,
    ...(permissionMap[subsystem] ?? emptyPermission()),
  }));
}

function mergePermissionRows(roleName: string, rows: any[]) {
  const defaults = getDefaultPermissionsForRole(roleName);
  const rowMap = new Map(rows.map((row) => [row.subsystem, row]));

  return ALL_SUBSYSTEMS.map((subsystem) => {
    const row = rowMap.get(subsystem);
    const fallback = defaults[subsystem] ?? emptyPermission();
    return {
      subsystem,
      canView: row?.can_view ?? fallback.canView,
      canCreate: row?.can_create ?? fallback.canCreate,
      canEdit: row?.can_edit ?? fallback.canEdit,
      canDelete: row?.can_delete ?? fallback.canDelete,
      canApprove: row?.can_approve ?? fallback.canApprove,
      canExport: row?.can_export ?? fallback.canExport,
    };
  });
}

async function savePermissionsForRole(
  farmId: string,
  roleId: string,
  roleName: string,
  permissions: Array<{ subsystem: string } & PermissionState>,
) {
  await prisma.$transaction(async (tx) => {
    for (const subsystem of ALL_SUBSYSTEMS) {
      const next = permissions.find((permission) => permission.subsystem === subsystem)
        ?? { subsystem, ...(getDefaultPermissionsForRole(roleName)[subsystem] ?? emptyPermission()) };

      await (tx as any).subsystem_permissions.upsert({
        where: { farm_id_role_id_subsystem: { farm_id: farmId, role_id: roleId, subsystem } },
        update: {
          can_view: next.canView,
          can_create: next.canCreate,
          can_edit: next.canEdit,
          can_delete: next.canDelete,
          can_approve: next.canApprove,
          can_export: next.canExport,
          updated_at: new Date(),
        },
        create: {
          farm_id: farmId,
          role_id: roleId,
          subsystem,
          can_view: next.canView,
          can_create: next.canCreate,
          can_edit: next.canEdit,
          can_delete: next.canDelete,
          can_approve: next.canApprove,
          can_export: next.canExport,
        },
      });
    }
  });

  invalidateCache(roleId, farmId);
}

async function withRoleUsage(roles: Array<{ id: string; name: string; description: string | null }>) {
  const counts = await prisma.users.groupBy({
    by: ['role_id'],
    where: { deleted_at: null },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((row) => [row.role_id, row._count._all]));

  return roles.map((role) => ({
    ...role,
    assignedUsers: countMap.get(role.id) ?? 0,
    isSystemRole: SYSTEM_ROLE_NAMES.has(role.name),
    isAdminRole: ADMIN_ROLE_NAMES.has(role.name),
    canReset: !ADMIN_ROLE_NAMES.has(role.name),
  }));
}

function normalizeRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function nextDuplicateRoleName(baseName: string) {
  const root = `${baseName}_copy`;
  let candidate = root;
  let counter = 2;
  while (await prisma.roles.findFirst({ where: { name: candidate } })) {
    candidate = `${root}_${counter++}`;
  }
  return candidate;
}

void DEFAULT_ROLE_DEFINITIONS;

export default router;
