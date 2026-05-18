import prisma from './prisma';
import {
  ADMIN_ROLE_NAMES,
  ALL_SUBSYSTEMS,
  FULL_ACCESS,
  type PermissionState,
  VALID_ROLE_NAMES,
} from './accessControlConfig';

export { VALID_ROLE_NAMES } from './accessControlConfig';

export interface SubsystemAccess extends PermissionState {}

export type PermissionMap = Record<string, SubsystemAccess>;

const FULL_ACCESS_MAP: PermissionMap = Object.fromEntries(
  ALL_SUBSYSTEMS.map((subsystem) => [subsystem, FULL_ACCESS]),
);

// In-process 1-minute cache keyed by roleId:farmId
const cache = new Map<string, { map: PermissionMap; ts: number }>();
const TTL = 60_000;

export function isAdminRole(roleName: string): boolean {
  return ADMIN_ROLE_NAMES.has(roleName.toLowerCase().trim());
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
      canApprove: r.can_approve as boolean,
      canExport: r.can_export as boolean,
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
