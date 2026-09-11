import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";

const permissions = [
  // ============================================================
  // SYSTEM
  // ============================================================
  {
    module: "system",
    resource: "settings",
    action: "READ",
    description: "View system settings",
  },
  {
    module: "system",
    resource: "settings",
    action: "UPDATE",
    description: "Update system settings",
  },

  // ============================================================
  // COMPANY
  // ============================================================
  {
    module: "company",
    resource: "company",
    action: "CREATE",
    description: "Create a company",
  },
  {
    module: "company",
    resource: "company",
    action: "READ",
    description: "View company information",
  },
  {
    module: "company",
    resource: "company",
    action: "UPDATE",
    description: "Update company information",
  },
  {
    module: "company",
    resource: "company",
    action: "DELETE",
    description: "Delete a company",
  },

  // ============================================================
  // USERS
  // ============================================================
  {
    module: "users",
    resource: "users",
    action: "CREATE",
    description: "Create users",
  },
  {
    module: "users",
    resource: "users",
    action: "READ",
    description: "View users",
  },
  {
    module: "users",
    resource: "users",
    action: "UPDATE",
    description: "Update users",
  },
  {
    module: "users",
    resource: "users",
    action: "DELETE",
    description: "Delete users",
  },
  {
    module: "users",
    resource: "users",
    action: "MANAGE",
    description: "Manage user accounts",
  },

  // ============================================================
  // RBAC
  // ============================================================
  {
    module: "rbac",
    resource: "roles",
    action: "CREATE",
    description: "Create roles",
  },
  {
    module: "rbac",
    resource: "roles",
    action: "READ",
    description: "View roles",
  },
  {
    module: "rbac",
    resource: "roles",
    action: "UPDATE",
    description: "Update roles",
  },
  {
    module: "rbac",
    resource: "roles",
    action: "DELETE",
    description: "Delete roles",
  },
  {
    module: "rbac",
    resource: "permissions",
    action: "READ",
    description: "View permissions",
  },
  {
    module: "rbac",
    resource: "permissions",
    action: "MANAGE",
    description: "Manage role permissions",
  },

  // ============================================================
  // DEPARTMENTS
  // ============================================================
  {
    module: "departments",
    resource: "departments",
    action: "CREATE",
    description: "Create departments",
  },
  {
    module: "departments",
    resource: "departments",
    action: "READ",
    description: "View departments",
  },
  {
    module: "departments",
    resource: "departments",
    action: "UPDATE",
    description: "Update departments",
  },
  {
    module: "departments",
    resource: "departments",
    action: "DELETE",
    description: "Delete departments",
  },

  // ============================================================
  // DESIGNATIONS
  // ============================================================
  {
    module: "designations",
    resource: "designations",
    action: "CREATE",
    description: "Create designations",
  },
  {
    module: "designations",
    resource: "designations",
    action: "READ",
    description: "View designations",
  },
  {
    module: "designations",
    resource: "designations",
    action: "UPDATE",
    description: "Update designations",
  },
  {
    module: "designations",
    resource: "designations",
    action: "DELETE",
    description: "Delete designations",
  },

  // ============================================================
  // EMPLOYEES
  // ============================================================
  {
    module: "employees",
    resource: "employees",
    action: "CREATE",
    description: "Create employees",
  },
  {
    module: "employees",
    resource: "employees",
    action: "READ",
    description: "View employees",
  },
  {
    module: "employees",
    resource: "employees",
    action: "UPDATE",
    description: "Update employees",
  },
  {
    module: "employees",
    resource: "employees",
    action: "DELETE",
    description: "Delete employees",
  },
  {
    module: "employees",
    resource: "employees",
    action: "MANAGE",
    description: "Manage employees",
  },

  // ============================================================
  // ATTENDANCE
  // ============================================================
  {
    module: "attendance",
    resource: "attendance",
    action: "CREATE",
    description: "Create attendance records",
  },
  {
    module: "attendance",
    resource: "attendance",
    action: "READ",
    description: "View attendance",
  },
  {
    module: "attendance",
    resource: "attendance",
    action: "UPDATE",
    description: "Update attendance",
  },
  {
    module: "attendance",
    resource: "attendance",
    action: "DELETE",
    description: "Delete attendance",
  },
  {
    module: "attendance",
    resource: "attendance",
    action: "MANAGE",
    description: "Manage attendance",
  },

  // ============================================================
  // LEAVE
  // ============================================================
  {
    module: "leave",
    resource: "leave",
    action: "CREATE",
    description: "Create leave requests",
  },
  {
    module: "leave",
    resource: "leave",
    action: "READ",
    description: "View leave records",
  },
  {
    module: "leave",
    resource: "leave",
    action: "UPDATE",
    description: "Update leave records",
  },
  {
    module: "leave",
    resource: "leave",
    action: "DELETE",
    description: "Delete leave records",
  },
  {
    module: "leave",
    resource: "leave",
    action: "APPROVE",
    description: "Approve or reject leave requests",
  },

  // ============================================================
  // PAYROLL
  // ============================================================
  {
    module: "payroll",
    resource: "payroll",
    action: "CREATE",
    description: "Create payroll records",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "READ",
    description: "View payroll",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "UPDATE",
    description: "Update payroll",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "DELETE",
    description: "Delete payroll records",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "APPROVE",
    description: "Approve payroll",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "EXPORT",
    description: "Export payroll",
  },
  {
    module: "payroll",
    resource: "payroll",
    action: "MANAGE",
    description: "Manage payroll",
  },

  // ============================================================
  // WALLET
  // ============================================================
  {
    module: "wallet",
    resource: "wallet",
    action: "READ",
    description: "View wallet",
  },
  {
    module: "wallet",
    resource: "wallet",
    action: "MANAGE",
    description: "Manage wallet",
  },

  // ============================================================
  // PAYMENTS
  // ============================================================
  {
    module: "payments",
    resource: "payments",
    action: "CREATE",
    description: "Create payment transactions",
  },
  {
    module: "payments",
    resource: "payments",
    action: "READ",
    description: "View payment transactions",
  },
  {
    module: "payments",
    resource: "payments",
    action: "MANAGE",
    description: "Manage payment transactions",
  },
];

const roleDefinitions = [
  {
    name: "SUPER_ADMIN",
    description: "System-wide administrator",
    scope: "SYSTEM",
    isSystem: true,
  },
  {
    name: "COMPANY_ADMIN",
    description: "Company administrator",
    scope: "COMPANY",
    isSystem: true,
  },
  {
    name: "HR_ADMIN",
    description: "Human resources administrator",
    scope: "COMPANY",
    isSystem: true,
  },
  {
    name: "FINANCE_ADMIN",
    description: "Finance and payroll administrator",
    scope: "COMPANY",
    isSystem: true,
  },
  {
    name: "EMPLOYEE",
    description: "Standard employee",
    scope: "COMPANY",
    isSystem: true,
  },
];

const seed = async () => {
  console.log("🌱 Starting EMS database seed...");

  // ============================================================
  // 1. PERMISSIONS
  // ============================================================

  console.log("Creating permissions...");

  const permissionMap = new Map();

  for (const permission of permissions) {
    const createdPermission = await prisma.permission.upsert({
      where: {
        module_resource_action: {
          module: permission.module,
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {
        description: permission.description,
        isActive: true,
      },
      create: {
        module: permission.module,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        isActive: true,
      },
    });

    const key = `${permission.module}:${permission.resource}:${permission.action}`;

    permissionMap.set(key, createdPermission);
  }

  console.log(`✅ ${permissionMap.size} permissions ready`);

  // ============================================================
  // 2. SYSTEM ROLES
  // ============================================================

  console.log("Creating system roles...");

  const roleMap = new Map();

  for (const roleDefinition of roleDefinitions) {
    const existingRole = await prisma.role.findFirst({
      where: {
        companyId: null,
        name: roleDefinition.name,
      },
    });

    let role;

    if (existingRole) {
      role = await prisma.role.update({
        where: {
          id: existingRole.id,
        },
        data: {
          description: roleDefinition.description,
          scope: roleDefinition.scope,
          isSystem: roleDefinition.isSystem,
          isActive: true,
        },
      });
    } else {
      role = await prisma.role.create({
        data: {
          name: roleDefinition.name,
          description: roleDefinition.description,
          scope: roleDefinition.scope,
          isSystem: roleDefinition.isSystem,
          isActive: true,
        },
      });
    }

    roleMap.set(role.name, role);
  }

  console.log(`✅ ${roleMap.size} system roles ready`);

  // ============================================================
  // 3. ROLE PERMISSIONS
  // ============================================================

  console.log("Assigning permissions...");

  const allPermissionIds = Array.from(permissionMap.values()).map(
    (permission) => permission.id
  );

  const hrPermissionKeys = permissions
    .filter((permission) =>
      [
        "users",
        "departments",
        "designations",
        "employees",
        "attendance",
        "leave",
      ].includes(permission.module)
    )
    .map(
      (permission) =>
        `${permission.module}:${permission.resource}:${permission.action}`
    );

  const financePermissionKeys = permissions
    .filter((permission) =>
      ["payroll", "wallet", "payments"].includes(permission.module)
    )
    .map(
      (permission) =>
        `${permission.module}:${permission.resource}:${permission.action}`
    );

  const employeePermissionKeys = permissions
    .filter(
      (permission) =>
        permission.action === "READ" &&
        ["employees", "attendance", "leave", "payroll", "wallet"].includes(
          permission.module
        )
    )
    .map(
      (permission) =>
        `${permission.module}:${permission.resource}:${permission.action}`
    );

  const companyAdminPermissionKeys = permissions
    .filter((permission) => permission.module !== "system")
    .map(
      (permission) =>
        `${permission.module}:${permission.resource}:${permission.action}`
    );

  const rolePermissionKeys = {
    SUPER_ADMIN: allPermissionIds,

    COMPANY_ADMIN: companyAdminPermissionKeys
      .map((key) => permissionMap.get(key)?.id)
      .filter(Boolean),

    HR_ADMIN: hrPermissionKeys
      .map((key) => permissionMap.get(key)?.id)
      .filter(Boolean),

    FINANCE_ADMIN: financePermissionKeys
      .map((key) => permissionMap.get(key)?.id)
      .filter(Boolean),

    EMPLOYEE: employeePermissionKeys
      .map((key) => permissionMap.get(key)?.id)
      .filter(Boolean),
  };

  for (const [roleName, permissionIds] of Object.entries(rolePermissionKeys)) {
    const role = roleMap.get(roleName);

    if (!role) {
      throw new Error(`Role ${roleName} was not created`);
    }

    for (const permissionId of permissionIds) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId,
        },
      });
    }
  }

  console.log("✅ Role permissions assigned");

  // ============================================================
  // 4. SYSTEM ADMIN
  // ============================================================
  //
  // We intentionally do NOT create a real production admin here.
  // Create one only when explicitly required through a controlled
  // bootstrap process.
  //
  // ============================================================

  console.log("🌱 EMS database seed completed successfully");
};

seed()
  .catch((error) => {
    console.error("❌ Database seed failed:");
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
