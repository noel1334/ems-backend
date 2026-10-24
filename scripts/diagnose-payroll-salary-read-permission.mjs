import prisma from "../src/config/database.js";

const email = String(process.env.EMS_PERMISSION_DIAGNOSE_EMAIL ?? "").trim().toLowerCase();
if (!email) {
  console.error("Set EMS_PERMISSION_DIAGNOSE_EMAIL to the affected user's sign-in email. This command is read-only.");
  process.exitCode = 2;
} else {
  try {
    const user = await prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        companyId: true,
        status: true,
        roles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                id: true,
                name: true,
                scope: true,
                companyId: true,
                isActive: true,
                isSystem: true,
                sourceTemplateId: true,
                permissions: { select: { permission: { select: { module: true, resource: true, action: true, isActive: true } } } },
              },
            },
          },
        },
      },
    });

    const catalog = await prisma.permission.findMany({
      where: { module: "payroll", resource: "salaries" },
      select: { module: true, resource: true, action: true, isActive: true },
      orderBy: { action: "asc" },
    });

    if (!user) {
      console.log(JSON.stringify({ found: false, message: "No user with that email was found in the configured database.", catalog }, null, 2));
    } else {
      const roles = user.roles.map(({ role }) => {
        const effectiveTenantRole = user.companyId !== null && role.scope === "COMPANY" && role.companyId === user.companyId && role.isActive;
        const salaryPermissions = role.permissions
          .map(({ permission }) => permission)
          .filter((permission) => permission.module === "payroll" && permission.resource === "salaries")
          .map((permission) => ({ action: permission.action, isActive: permission.isActive }));
        const hasRead = salaryPermissions.some((permission) => permission.action === "READ" && permission.isActive);
        return {
          roleId: role.id,
          roleName: role.name,
          scope: role.scope,
          roleCompanyId: role.companyId,
          roleActive: role.isActive,
          isSystem: role.isSystem,
          sourceTemplateId: role.sourceTemplateId,
          effectiveTenantRole,
          salaryPermissions,
          shouldAuthorizeSalaryRead: effectiveTenantRole && hasRead,
        };
      });
      console.log(JSON.stringify({
        found: true,
        user: { id: user.id, email: user.email, companyId: user.companyId, status: user.status },
        permissionCatalog: catalog,
        assignedActiveRoles: roles,
        diagnosis: roles.some((role) => role.shouldAuthorizeSalaryRead)
          ? "At least one active tenant role should grant payroll.salaries.READ. If production still denies access, the deployed backend/database may differ from this connection or the deployed route may use another guard."
          : "No active tenant role attached to this user currently grants payroll.salaries.READ. A checkbox on a global template is not enough until the grant is attached to the tenant-owned role that this user actually has.",
      }, null, 2));
    }
  } catch (error) {
    console.error("Permission diagnostics failed:", error?.message ?? error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
