export interface SubsystemAccess {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export const ACCESS_CONTROL_SUBSYSTEMS = [
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

export const ALL_PERMISSION_KEYS = [
  'canView',
  'canCreate',
  'canEdit',
  'canDelete',
  'canApprove',
  'canExport',
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const FULL_ACCESS: SubsystemAccess = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canExport: true,
};

export const VIEW_ONLY_ACCESS: SubsystemAccess = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};

export const NO_ACCESS: SubsystemAccess = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};
