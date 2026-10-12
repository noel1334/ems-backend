/**
 * Policy for roles that belong to a company tenant.
 * Permissions themselves remain platform-defined in prisma/seed.js.
 */
export const RESERVED_SYSTEM_ROLE_NAMES = new Set([
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "HR_ADMIN",
  "FINANCE_ADMIN",
  "EMPLOYEE",
  "STORE_KEEPER",
]);

export function normalizedRoleName(name) {
  return String(name ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function isReservedSystemRoleName(name) {
  return RESERVED_SYSTEM_ROLE_NAMES.has(normalizedRoleName(name));
}

/**
 * Company roles may not receive platform-only permissions. The list is
 * intentionally conservative: platform settings and creating/deleting tenants
 * are never tenant-admin capabilities.
 */
export function isTenantAssignablePermission(permission) {
  if (!permission || permission.isActive !== true) return false;
  if (String(permission.module).toLowerCase() === "system") return false;
  if (
    String(permission.module).toLowerCase() === "company" &&
    String(permission.resource).toLowerCase() === "company" &&
    ["CREATE", "DELETE"].includes(String(permission.action).toUpperCase())
  ) return false;
  return true;
}

export function isGrantableToTenant(permission) {
  return isTenantAssignablePermission(permission);
}
