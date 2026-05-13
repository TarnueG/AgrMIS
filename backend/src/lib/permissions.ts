import prisma from './prisma';

const ADMIN_ROLES = new Set(['admin']);

export const VALID_ROLE_NAMES = new Set([
  'admin', 'field_supervisor', 'asset_manager', 'production_manager',
  'accountant', 'marketing_manager', 'human_resource', 'customer',
]);

export interface SubsystemAccess {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type PermissionMap = Record<string, SubsystemAccess>;

export const ALL_SUBSYSTEMS = [
  'dashboard', 'inventory', 'procurement', 'crm', 'marketing',
  'sales_order_points', 'production', 'livestock', 'finance', 'reports',
  'human_capital', 'machinery', 'land_parcels', 'settings',
] as const;

const FULL: SubsystemAccess = { canView: true, canCreate: true, canEdit: true, canDelete: true };

const FULL_ACCESS_MAP: PermissionMap = Object.fromEntries(
  ALL_SUBSYSTEMS.map(s => [s, FULL])
);

// In-process 1-minute cache keyed by roleId:farmId
const cache = new Map<string, { map: PermissionMap; ts: number }>();
const TTL = 60_000;

export function isAdminRole(roleName: string): boolean {
  return ADMIN_ROLES.has(roleName.toLowerCase().trim());
}

export async function getPermissions(
  roleId: string,
  roleName: string,
  farmId: string | null
): Promise<PermissionMap> {
  if (isAdminRole(roleName)) return FULL_ACCESS_MAP;

  const key = `${roleId}:${farmId ?? 'null'}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.map;

  const rows = await (prisma as any).subsystem_permissions.findMany({
    where: { role_id: roleId, farm_id: farmId },
  });

  const map: PermissionMap = {};
  for (const r of rows) {
    map[r.subsystem as string] = {
      canView: r.can_view as boolean,
      canCreate: r.can_create as boolean,
      canEdit: r.can_edit as boolean,
      canDelete: r.can_delete as boolean,
    };
  }

  cache.set(key, { map, ts: Date.now() });
  return map;
}

export function invalidateCache(roleId: string, farmId: string | null) {
  cache.delete(`${roleId}:${farmId ?? 'null'}`);
}

export function clearPermissionCache() {
  cache.clear();
}
