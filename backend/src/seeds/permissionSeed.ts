import prisma from '../lib/prisma';
import { clearPermissionCache } from '../lib/permissions';

type Perm = { view: boolean; create: boolean; edit: boolean; delete: boolean };

const V: Perm = { view: true,  create: false, edit: false, delete: false };
const F: Perm = { view: true,  create: true,  edit: true,  delete: true  };
const N: Perm = { view: false, create: false, edit: false, delete: false };

interface RoleDef {
  name: string;
  description: string;
  subsystems: Record<string, Perm>;
}

const ROLES: RoleDef[] = [
  {
    name: 'admin',
    description: 'Full unrestricted system access',
    subsystems: {},
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
    name: 'marketing_manager',
    description: 'Marketing, CRM, and sales order management',
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
    description: 'Customer portal — own orders and marketing',
    subsystems: {
      dashboard: V, sales_order_points: F, marketing: V, crm: V, inventory: V, settings: V,
      procurement: N, production: N, livestock: N, finance: N,
      reports: N, human_capital: N, machinery: N, land_parcels: N,
    },
  },
];

// Canonical set of valid role names
export const VALID_ROLE_NAMES = new Set(ROLES.map(r => r.name));

// Renamed roles: old_name -> new_canonical_name (users get reassigned, old role deleted)
const ROLE_RENAMES: Record<string, string> = {
  accounting: 'accountant',
};

export async function seedPermissions(): Promise<void> {
  try {
    const farm = await prisma.farm_profiles.findFirst({ where: { deleted_at: null } });
    if (!farm) {
      console.log('[seed] No farm found — skipping permission seed');
      return;
    }

    // Step 1: Upsert all 8 canonical roles and their subsystem permissions
    for (const def of ROLES) {
      const role = await prisma.roles.upsert({
        where: { name: def.name },
        update: { description: def.description },
        create: { name: def.name, description: def.description },
      });

      for (const [subsystem, p] of Object.entries(def.subsystems)) {
        await (prisma as any).subsystem_permissions.upsert({
          where: { farm_id_role_id_subsystem: { farm_id: farm.id, role_id: role.id, subsystem } },
          update: {
            can_view: p.view, can_create: p.create,
            can_edit: p.edit, can_delete: p.delete,
            updated_at: new Date(),
          },
          create: {
            farm_id: farm.id, role_id: role.id, subsystem,
            can_view: p.view, can_create: p.create,
            can_edit: p.edit, can_delete: p.delete,
          },
        });
      }
    }

    // Step 2: Remove stale roles — reassign users first, then delete
    const allRoles = await prisma.roles.findMany();
    const staleRoles = allRoles.filter(r => !VALID_ROLE_NAMES.has(r.name));

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
          console.log(`[seed] Reassigned ${affected.count} user(s) from '${stale.name}' → '${targetName}'`);
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
