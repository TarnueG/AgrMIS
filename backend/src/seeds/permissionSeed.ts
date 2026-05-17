import prisma from '../lib/prisma';
import { clearPermissionCache } from '../lib/permissions';

const DEFAULT_FARM_ID = '00000000-0000-0000-0000-000000000001';

type Perm = { view: boolean; create: boolean; edit: boolean; delete: boolean };

const V: Perm = { view: true, create: false, edit: false, delete: false };
const F: Perm = { view: true, create: true, edit: true, delete: true };
const N: Perm = { view: false, create: false, edit: false, delete: false };

interface RoleDef {
  name: string;
  description: string;
  subsystems: Record<string, Perm>;
}

const ROLES: RoleDef[] = [
  {
    name: 'super_admin',
    description: 'Full unrestricted AMIS access',
    subsystems: {},
  },
  {
    name: 'admin',
    description: 'Legacy full unrestricted AMIS access',
    subsystems: {},
  },
  {
    name: 'farm_manager',
    description: 'Farm-wide operational management across core modules',
    subsystems: {
      dashboard: F, inventory: F, procurement: F, crm: F, marketing: F,
      sales_order_points: F, production: F, livestock: F, finance: F,
      reports: F, human_capital: F, machinery: F, land_parcels: F, settings: V,
    },
  },
  {
    name: 'field_supervisor',
    description: 'Field team supervision and daily operations logging',
    subsystems: {
      dashboard: V, human_capital: V, production: V, settings: V,
      inventory: N, procurement: N, crm: N, marketing: N,
      sales_order_points: N, livestock: N, finance: N,
      reports: N, machinery: N, land_parcels: N,
    },
  },
  {
    name: 'asset_manager',
    description: 'Farm asset and equipment management',
    subsystems: {
      dashboard: V, machinery: F, land_parcels: F, settings: V,
      inventory: N, procurement: N, crm: N, marketing: N,
      sales_order_points: N, production: N, livestock: N,
      finance: N, reports: N, human_capital: N,
    },
  },
  {
    name: 'production_manager',
    description: 'Production operations across all sectors',
    subsystems: {
      dashboard: V, production: F, livestock: F, inventory: V,
      human_capital: V, machinery: V, land_parcels: V, reports: V, settings: V,
      procurement: N, crm: N, marketing: N, sales_order_points: N, finance: N,
    },
  },
  {
    name: 'accountant',
    description: 'Financial management and reporting',
    subsystems: {
      dashboard: V, finance: F, reports: V, inventory: V, procurement: V, settings: V,
      crm: N, marketing: N, sales_order_points: N, production: N,
      livestock: N, human_capital: N, machinery: N, land_parcels: N,
    },
  },
  {
    name: 'sales_customer_officer',
    description: 'Sales, distribution, customer, and order management',
    subsystems: {
      dashboard: V, crm: F, marketing: F, sales_order_points: F,
      reports: V, settings: V,
      procurement: N, production: N, livestock: N, finance: N,
      human_capital: N, machinery: N, land_parcels: N, inventory: N,
    },
  },
  {
    name: 'marketing_manager',
    description: 'Legacy marketing and customer operations role',
    subsystems: {
      dashboard: V, marketing: F, crm: F, sales_order_points: F,
      inventory: V, reports: V, settings: V,
      procurement: N, production: N, livestock: N, finance: N,
      human_capital: N, machinery: N, land_parcels: N,
    },
  },
  {
    name: 'human_resource',
    description: 'Human capital and workforce management',
    subsystems: {
      dashboard: V, human_capital: F, production: V, reports: V, settings: V,
      inventory: N, procurement: N, crm: N, marketing: N,
      sales_order_points: N, livestock: N, finance: N, machinery: N, land_parcels: N,
    },
  },
  {
    name: 'customer',
    description: 'Customer portal access only',
    subsystems: {
      dashboard: N, sales_order_points: F, marketing: V, settings: V,
      procurement: N, production: N, livestock: N, finance: N,
      reports: N, human_capital: N, machinery: N, land_parcels: N, crm: N, inventory: N,
    },
  },
];

export const VALID_ROLE_NAMES = new Set(ROLES.map((role) => role.name));

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
            can_view: perm.view,
            can_create: perm.create,
            can_edit: perm.edit,
            can_delete: perm.delete,
            updated_at: new Date(),
          },
          create: {
            farm_id: farm.id,
            role_id: role.id,
            subsystem,
            can_view: perm.view,
            can_create: perm.create,
            can_edit: perm.edit,
            can_delete: perm.delete,
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
