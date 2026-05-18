import prisma from '../lib/prisma';
import { clearPermissionCache } from '../lib/permissions';
import { DEFAULT_ROLE_DEFINITIONS, VALID_ROLE_NAMES } from '../lib/accessControlConfig';

const DEFAULT_FARM_ID = '00000000-0000-0000-0000-000000000001';

const ROLES = DEFAULT_ROLE_DEFINITIONS;

const ROLE_RENAMES: Record<string, string> = {
  accounting: 'accountant',
  sales_officer: 'sales_customer_officer',
  customer_officer: 'sales_customer_officer',
};

export async function seedPermissions(): Promise<void> {
  try {
    const farm = await prisma.farm_profiles.upsert({
      where: { id: DEFAULT_FARM_ID },
      update: {},
      create: {
        id: DEFAULT_FARM_ID,
        name: 'Agri-Tech Default Farm',
        country: 'Liberia',
        operational_sectors: ['crop', 'livestock', 'aquaculture'],
      },
    });

    for (const def of ROLES) {
      const role = await prisma.roles.upsert({
        where: { name: def.name },
        update: { description: def.description },
        create: { name: def.name, description: def.description },
      });

      for (const [subsystem, perm] of Object.entries(def.subsystems)) {
        await (prisma as any).subsystem_permissions.upsert({
          where: { farm_id_role_id_subsystem: { farm_id: farm.id, role_id: role.id, subsystem } },
          update: {
            can_view: perm.canView,
            can_create: perm.canCreate,
            can_edit: perm.canEdit,
            can_delete: perm.canDelete,
            can_approve: perm.canApprove,
            can_export: perm.canExport,
            updated_at: new Date(),
          },
          create: {
            farm_id: farm.id,
            role_id: role.id,
            subsystem,
            can_view: perm.canView,
            can_create: perm.canCreate,
            can_edit: perm.canEdit,
            can_delete: perm.canDelete,
            can_approve: perm.canApprove,
            can_export: perm.canExport,
          },
        });
      }
    }

    const allRoles = await prisma.roles.findMany();
    const staleRoles = allRoles.filter((role) => !VALID_ROLE_NAMES.has(role.name));

    if (staleRoles.length > 0) {
      const fallback = await prisma.roles.findFirstOrThrow({ where: { name: 'customer' } });

      for (const stale of staleRoles) {
        const targetName = ROLE_RENAMES[stale.name] ?? 'customer';
        const target = await prisma.roles.findFirst({ where: { name: targetName } });
        const reassignId = target?.id ?? fallback.id;

        const affected = await prisma.users.updateMany({
          where: { role_id: stale.id },
          data: { role_id: reassignId },
        });

        if (affected.count > 0) {
          console.log(`[seed] Reassigned ${affected.count} user(s) from '${stale.name}' to '${targetName}'`);
        }

        await (prisma as any).subsystem_permissions.deleteMany({ where: { role_id: stale.id } });
        await prisma.roles.delete({ where: { id: stale.id } });
        console.log(`[seed] Removed stale role '${stale.name}'`);
      }
    }

    clearPermissionCache();
    console.log('[seed] Roles and permissions seeded successfully');
  } catch (err) {
    console.error('[seed] Permission seed failed:', err);
  }
}
