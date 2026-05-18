import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from './useAuth';
import { isAdminRole, normalizeRole } from '@/lib/roles';
import {
  ACCESS_CONTROL_SUBSYSTEMS,
  FULL_ACCESS,
  NO_ACCESS,
  VIEW_ONLY_ACCESS,
  type SubsystemAccess,
} from '@/lib/accessControl';

interface PermissionsResponse {
  role: string;
  permissions: Record<string, SubsystemAccess>;
}

const ALL_SUBSYSTEMS = ACCESS_CONTROL_SUBSYSTEMS.map((subsystem) => subsystem.key);

const buildPermissionMap = (
  overrides: Partial<Record<(typeof ALL_SUBSYSTEMS)[number], SubsystemAccess>>
): Record<string, SubsystemAccess> =>
  Object.fromEntries(
    ALL_SUBSYSTEMS.map((subsystem) => [subsystem, overrides[subsystem] ?? NO_ACCESS])
  );

const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, SubsystemAccess>> = {
  admin: buildPermissionMap(
    Object.fromEntries(ALL_SUBSYSTEMS.map((subsystem) => [subsystem, FULL_ACCESS])) as Partial<
      Record<(typeof ALL_SUBSYSTEMS)[number], SubsystemAccess>
    >
  ),
  super_admin: buildPermissionMap(
    Object.fromEntries(ALL_SUBSYSTEMS.map((subsystem) => [subsystem, FULL_ACCESS])) as Partial<
      Record<(typeof ALL_SUBSYSTEMS)[number], SubsystemAccess>
    >
  ),
  farm_manager: buildPermissionMap({
    dashboard: FULL_ACCESS,
    inventory: FULL_ACCESS,
    procurement: FULL_ACCESS,
    crm: FULL_ACCESS,
    marketing: FULL_ACCESS,
    sales_order_points: FULL_ACCESS,
    production: FULL_ACCESS,
    livestock: FULL_ACCESS,
    finance: FULL_ACCESS,
    reports: FULL_ACCESS,
    human_capital: FULL_ACCESS,
    machinery: FULL_ACCESS,
    land_parcels: FULL_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  inventory_manager: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    inventory: FULL_ACCESS,
    procurement: { ...VIEW_ONLY_ACCESS, canApprove: true, canExport: true },
    reports: { ...VIEW_ONLY_ACCESS, canExport: true },
    settings: VIEW_ONLY_ACCESS,
  }),
  procurement_officer: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    inventory: VIEW_ONLY_ACCESS,
    procurement: FULL_ACCESS,
    reports: { ...VIEW_ONLY_ACCESS, canExport: true },
    settings: VIEW_ONLY_ACCESS,
  }),
  sales_customer_officer: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    crm: FULL_ACCESS,
    marketing: FULL_ACCESS,
    sales_order_points: FULL_ACCESS,
    reports: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  field_supervisor: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    human_capital: VIEW_ONLY_ACCESS,
    production: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  asset_manager: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    machinery: FULL_ACCESS,
    land_parcels: FULL_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  production_manager: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    production: FULL_ACCESS,
    livestock: FULL_ACCESS,
    inventory: VIEW_ONLY_ACCESS,
    human_capital: VIEW_ONLY_ACCESS,
    machinery: VIEW_ONLY_ACCESS,
    land_parcels: VIEW_ONLY_ACCESS,
    reports: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  accountant: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    finance: FULL_ACCESS,
    reports: VIEW_ONLY_ACCESS,
    inventory: VIEW_ONLY_ACCESS,
    procurement: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  marketing_manager: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    marketing: FULL_ACCESS,
    crm: FULL_ACCESS,
    sales_order_points: FULL_ACCESS,
    inventory: VIEW_ONLY_ACCESS,
    reports: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  human_resource: buildPermissionMap({
    dashboard: VIEW_ONLY_ACCESS,
    human_capital: FULL_ACCESS,
    production: VIEW_ONLY_ACCESS,
    reports: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
  customer: buildPermissionMap({
    sales_order_points: FULL_ACCESS,
    marketing: VIEW_ONLY_ACCESS,
    settings: VIEW_ONLY_ACCESS,
  }),
};

export function usePermissions() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery<PermissionsResponse>({
    queryKey: ['user-permissions', user?.role],
    queryFn: () => api.get('/auth/permissions'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const role = normalizeRole(data?.role ?? user?.role ?? '');
  const isAdmin = isAdminRole(role);
  const fallbackPermissions = DEFAULT_ROLE_PERMISSIONS[role] ?? {};
  const perms = isAdmin
    ? (DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS.super_admin)
    : {
        ...fallbackPermissions,
        ...(data?.permissions ?? {}),
      };

  const canView = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canView ?? false);

  const canCreate = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canCreate ?? false);

  const canEdit = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canEdit ?? false);

  const canDelete = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canDelete ?? false);

  const canApprove = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canApprove ?? false);

  const canExport = (subsystem: string): boolean =>
    isAdmin || (perms[subsystem]?.canExport ?? false);

  return {
    permissions: perms,
    role,
    isAdmin,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    canExport,
    isLoading,
    isError,
  };
}
