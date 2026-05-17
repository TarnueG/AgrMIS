export const ADMIN_ROLES = new Set(['super_admin', 'admin']);

export function normalizeRole(role?: string | null): string {
  return (role ?? '').toLowerCase().trim();
}

export function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.has(normalizeRole(role));
}

export function isCustomerRole(role?: string | null): boolean {
  return normalizeRole(role) === 'customer';
}
