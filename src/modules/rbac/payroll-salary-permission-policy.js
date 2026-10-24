const SALARIES = { module: "payroll", resource: "salaries" };
const CORE_SALARY_ROLE_NAMES = new Set(["COMPANY_ADMIN", "FINANCE_ADMIN"]);

const normalizeRoleName = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

const isSalaryPermission = (permission) =>
  permission?.isActive === true &&
  permission.module === SALARIES.module &&
  permission.resource === SALARIES.resource;

/**
 * Creates a narrowly-scoped repair plan for an active company role.
 * Shared/system roles and unrelated employee roles are intentionally excluded.
 */
export function getSalaryPermissionRepairPlan(role, templateActions = []) {
  if (
    !role ||
    role.isActive !== true ||
    role.scope !== "COMPANY" ||
    !role.companyId
  ) {
    return { grantRead: false, grantUpdate: false };
  }

  const currentActions = new Set(
    (role.permissions ?? [])
      .map((grant) => grant.permission)
      .filter(isSalaryPermission)
      .map((permission) => String(permission.action).toUpperCase())
  );
  const publishedTemplateActions = new Set(
    (templateActions ?? []).map((action) => String(action).toUpperCase())
  );
  const coreSalaryRole = CORE_SALARY_ROLE_NAMES.has(normalizeRoleName(role.name));
  const hasSalaryWriteGrant = ["CREATE", "UPDATE", "DELETE"].some((action) => currentActions.has(action));

  return {
    grantRead:
      coreSalaryRole ||
      hasSalaryWriteGrant ||
      publishedTemplateActions.has("CREATE") ||
      publishedTemplateActions.has("READ"),
    grantUpdate:
      coreSalaryRole ||
      currentActions.has("CREATE") ||
      publishedTemplateActions.has("CREATE") ||
      publishedTemplateActions.has("UPDATE"),
  };
}

export { isSalaryPermission };
