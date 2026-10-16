/**
 * A company-less access token is valid only when its JWT contains the
 * platform Super Admin role name. Sensitive platform routes must still
 * verify the role against the database in requireSuperAdmin.
 */
export const hasValidTenantContext = (payload) => {
  if (payload?.companyId) return true;

  return (
    Array.isArray(payload?.roles) &&
    payload.roles.includes("SUPER_ADMIN")
  );
};
