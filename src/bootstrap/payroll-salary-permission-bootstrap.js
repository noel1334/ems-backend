import prisma from "../config/database.js";

import { getSalaryPermissionRepairPlan, isSalaryPermission } from "../modules/rbac/payroll-salary-permission-policy.js";

const SALARIES = { module: "payroll", resource: "salaries" };

/**
 * Repairs payroll salary permission rows and role grants at API startup.
 * It is safe to run repeatedly, works with `prisma db push`, and never grants
 * salary permissions to shared/system roles or to unrelated employee roles.
 */
export async function reconcilePayrollSalaryPermissions() {
  return prisma.$transaction(async (tx) => {
    const [readPermission, updatePermission] = await Promise.all([
      tx.permission.upsert({
        where: { module_resource_action: { ...SALARIES, action: "READ" } },
        update: {
          isActive: true,
          description: "View employee salary assignments and salary history.",
        },
        create: {
          ...SALARIES,
          action: "READ",
          isActive: true,
          description: "View employee salary assignments and salary history.",
        },
      }),
      tx.permission.upsert({
        where: { module_resource_action: { ...SALARIES, action: "UPDATE" } },
        update: {
          isActive: true,
          description: "Update employee salary assignments and status.",
        },
        create: {
          ...SALARIES,
          action: "UPDATE",
          isActive: true,
          description: "Update employee salary assignments and status.",
        },
      }),
    ]);

    const [roles, templates] = await Promise.all([
      tx.role.findMany({
        where: {
          isActive: true,
          scope: "COMPANY",
          companyId: { not: null },
        },
        select: {
          id: true,
          companyId: true,
          name: true,
          scope: true,
          isActive: true,
          sourceTemplateId: true,
          permissions: {
            select: {
              permission: {
                select: {
                  module: true,
                  resource: true,
                  action: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      tx.roleTemplate.findMany({
        where: { isActive: true },
        select: {
          id: true,
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { version: "desc" },
            take: 1,
            select: {
              permissions: {
                select: {
                  permission: {
                    select: {
                      module: true,
                      resource: true,
                      action: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const latestTemplateActions = new Map();
    for (const template of templates) {
      const latestVersion = template.versions[0];
      const actions = (latestVersion?.permissions ?? [])
        .map(({ permission }) => permission)
        .filter(isSalaryPermission)
        .map(({ action }) => action);
      latestTemplateActions.set(template.id, actions);
    }

    const grants = [];
    let eligibleReadRoles = 0;
    let eligibleUpdateRoles = 0;

    for (const role of roles) {
      const templateActions = latestTemplateActions.get(role.sourceTemplateId) ?? [];
      const plan = getSalaryPermissionRepairPlan(role, templateActions);
      if (plan.grantRead) {
        grants.push({ roleId: role.id, permissionId: readPermission.id });
        eligibleReadRoles += 1;
      }
      if (plan.grantUpdate) {
        grants.push({ roleId: role.id, permissionId: updatePermission.id });
        eligibleUpdateRoles += 1;
      }
    }

    const grantRowsAdded = grants.length
      ? await tx.rolePermission.createMany({ data: grants, skipDuplicates: true })
      : { count: 0 };

    const result = {
      message: "Payroll salary permission reconciliation result",
      permissionCatalog: {
        readActive: readPermission.isActive,
        updateActive: updatePermission.isActive,
      },
      activeCompanyRolesChecked: roles.length,
      eligibleReadRoles,
      eligibleUpdateRoles,
      grantRowsAdded: grantRowsAdded.count,
      excludedGlobalAndInactiveRoles: true,
    };

    console.info(JSON.stringify(result));
    return result;
  });
}
