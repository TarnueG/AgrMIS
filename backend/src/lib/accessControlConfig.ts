export interface PermissionState {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export interface RoleDefinition {
  name: string;
  description: string;
  subsystems: Record<string, PermissionState>;
}

export const SUBSYSTEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'crm', label: 'CRM / Customers' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'sales_order_points', label: 'Sales & Orders' },
  { key: 'production', label: 'Production' },
  { key: 'livestock', label: 'Livestock / Farm Ops' },
  { key: 'human_capital', label: 'HR / Labor' },
  { key: 'machinery', label: 'Machinery' },
  { key: 'land_parcels', label: 'Land Parcels' },
  { key: 'finance', label: 'Finance' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'audit_logs', label: 'Audit Logs' },
  { key: 'access_control', label: 'Access Control' },
] as const;

export type SubsystemKey = (typeof SUBSYSTEMS)[number]['key'];

export const ADMIN_ROLE_NAMES = new Set(['super_admin', 'admin']);

export const FULL_ACCESS: PermissionState = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canExport: true,
};

export const VIEW_ONLY_ACCESS: PermissionState = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};

export const NO_ACCESS: PermissionState = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};

export const ALL_SUBSYSTEMS = SUBSYSTEMS.map((subsystem) => subsystem.key);

export const SYSTEM_ROLE_NAMES = new Set([
  'super_admin',
  'admin',
  'farm_manager',
  'inventory_manager',
  'procurement_officer',
  'production_manager',
  'sales_customer_officer',
  'human_resource',
  'asset_manager',
  'accountant',
  'field_supervisor',
  'marketing_manager',
  'customer',
]);

function buildPermissionMap(
  overrides: Partial<Record<SubsystemKey, PermissionState>>,
): Record<string, PermissionState> {
  return Object.fromEntries(
    ALL_SUBSYSTEMS.map((subsystem) => [subsystem, overrides[subsystem] ?? NO_ACCESS]),
  );
}

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
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
    subsystems: buildPermissionMap({
      dashboard: FULL_ACCESS,
      inventory: FULL_ACCESS,
      procurement: FULL_ACCESS,
      crm: FULL_ACCESS,
      marketing: FULL_ACCESS,
      sales_order_points: FULL_ACCESS,
      production: FULL_ACCESS,
      livestock: FULL_ACCESS,
      human_capital: FULL_ACCESS,
      machinery: FULL_ACCESS,
      land_parcels: FULL_ACCESS,
      finance: FULL_ACCESS,
      reports: FULL_ACCESS,
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'inventory_manager',
    description: 'Warehouse, stock, and inventory movement management',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      inventory: FULL_ACCESS,
      procurement: { ...VIEW_ONLY_ACCESS, canApprove: true, canExport: true },
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'procurement_officer',
    description: 'Supplier, purchase request, and receiving workflow management',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      inventory: VIEW_ONLY_ACCESS,
      procurement: FULL_ACCESS,
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'production_manager',
    description: 'Production operations across all sectors',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      inventory: VIEW_ONLY_ACCESS,
      production: FULL_ACCESS,
      livestock: FULL_ACCESS,
      human_capital: VIEW_ONLY_ACCESS,
      machinery: VIEW_ONLY_ACCESS,
      land_parcels: VIEW_ONLY_ACCESS,
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'sales_customer_officer',
    description: 'Sales, distribution, customer, and order management',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      crm: FULL_ACCESS,
      marketing: FULL_ACCESS,
      sales_order_points: FULL_ACCESS,
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'human_resource',
    description: 'Human capital and workforce management',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      human_capital: FULL_ACCESS,
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'asset_manager',
    description: 'Farm asset and equipment management',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      machinery: FULL_ACCESS,
      land_parcels: FULL_ACCESS,
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'accountant',
    description: 'Financial management and reporting',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      inventory: VIEW_ONLY_ACCESS,
      procurement: { ...VIEW_ONLY_ACCESS, canExport: true },
      finance: FULL_ACCESS,
      reports: FULL_ACCESS,
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'field_supervisor',
    description: 'Field team supervision and daily operations logging',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      production: VIEW_ONLY_ACCESS,
      livestock: VIEW_ONLY_ACCESS,
      human_capital: VIEW_ONLY_ACCESS,
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'marketing_manager',
    description: 'Marketing and customer operations role',
    subsystems: buildPermissionMap({
      dashboard: VIEW_ONLY_ACCESS,
      crm: VIEW_ONLY_ACCESS,
      marketing: FULL_ACCESS,
      sales_order_points: { ...VIEW_ONLY_ACCESS, canExport: true },
      reports: { ...VIEW_ONLY_ACCESS, canExport: true },
      settings: VIEW_ONLY_ACCESS,
    }),
  },
  {
    name: 'customer',
    description: 'Customer portal access only',
    subsystems: buildPermissionMap({
      marketing: VIEW_ONLY_ACCESS,
      sales_order_points: VIEW_ONLY_ACCESS,
      settings: VIEW_ONLY_ACCESS,
    }),
  },
];

export const VALID_ROLE_NAMES = new Set(DEFAULT_ROLE_DEFINITIONS.map((role) => role.name));

const ROLE_DEFAULTS = new Map(DEFAULT_ROLE_DEFINITIONS.map((definition) => [definition.name, definition]));

export function getRoleDefinition(roleName: string): RoleDefinition | undefined {
  return ROLE_DEFAULTS.get(roleName);
}

export function getDefaultPermissionsForRole(roleName: string): Record<string, PermissionState> {
  if (ADMIN_ROLE_NAMES.has(roleName)) {
    return Object.fromEntries(ALL_SUBSYSTEMS.map((subsystem) => [subsystem, FULL_ACCESS]));
  }

  const definition = ROLE_DEFAULTS.get(roleName);
  if (!definition) {
    return Object.fromEntries(ALL_SUBSYSTEMS.map((subsystem) => [subsystem, NO_ACCESS]));
  }

  return Object.fromEntries(
    ALL_SUBSYSTEMS.map((subsystem) => [subsystem, definition.subsystems[subsystem] ?? NO_ACCESS]),
  );
}
