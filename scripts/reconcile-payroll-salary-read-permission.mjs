import prisma from "../src/config/database.js";

/**
 * Repairs payroll.salaries.READ grants without granting salary access to every
 * role. Only active company roles already authorised to create/update/delete
 * salary assignments receive the missing READ permission.
 * Works with `prisma db push`; it does not depend on SQL migrations.
 */
async function main() {
  const permission = await prisma.permission.upsert({
    where: { module_resource_action: { module: "payroll", resource: "salaries", action: "READ" } },
    update: { isActive: true, description: "View employee salary assignments and salary history." },
    create: { module: "payroll", resource: "salaries", action: "READ", isActive: true, description: "View employee salary assignments and salary history." },
  });

  const eligibleRoles = await prisma.role.findMany({
    where: {
      isActive: true,
      scope: "COMPANY",
      companyId: { not: null },
      permissions: {
        some: {
          permission: {
            module: "payroll",
            resource: "salaries",
            action: { in: ["CREATE", "UPDATE", "DELETE"] },
            isActive: true,
          },
        },
      },
    },
    select: { id: true, companyId: true, name: true },
  });

  let rolesWithReadGrantAfterReconciliation = 0;
  for (const role of eligibleRoles) {
    const result = await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
    // Upsert returns the row in both cases, so count is reported as roles checked.
    if (result.roleId && result.permissionId) rolesWithReadGrantAfterReconciliation += 1;
  }

  console.log(JSON.stringify({
    message: "Payroll salary permission reconciliation result",
    permission: "payroll.salaries.READ",
    permissionActive: permission.isActive,
    eligibleCompanyRolesChecked: eligibleRoles.length,
    rolesWithReadGrantAfterReconciliation,
    note: "Only active company roles already holding payroll salary write permission were reconciled.",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Payroll salary permission reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
