import prisma from "../config/database.js";
import { hashPassword } from "../common/utils/crypto.js";
import { instantiateTenantSystemRoles } from "../modules/platform/role-template.service.js";

/**
 * Restore missing built-in role records after an accidental role-table reset.
 * Existing tenant role permissions are never overwritten. User-to-role assignments
 * cannot be inferred safely once deleted, so only the explicitly configured
 * platform account is reattached automatically.
 */
export const bootstrapRoleDefinitions = async () => {
  const activePermissions = await prisma.permission.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (!activePermissions.length) {
    throw new Error("Role bootstrap cannot run because no active permissions exist. Run the database seed first.");
  }

  let superAdminRole = await prisma.role.findFirst({
    where: { companyId: null, name: "SUPER_ADMIN", scope: "SYSTEM" },
  });
  if (!superAdminRole) {
    superAdminRole = await prisma.role.create({
      data: {
        companyId: null,
        name: "SUPER_ADMIN",
        description: "System-wide platform administrator",
        scope: "SYSTEM",
        isSystem: true,
        isActive: true,
      },
    });
  } else if (!superAdminRole.isActive || !superAdminRole.isSystem) {
    superAdminRole = await prisma.role.update({
      where: { id: superAdminRole.id },
      data: { isActive: true, isSystem: true, scope: "SYSTEM" },
    });
  }

  await prisma.rolePermission.createMany({
    data: activePermissions.map(({ id: permissionId }) => ({
      roleId: superAdminRole.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    try {
      await prisma.$transaction((tx) => instantiateTenantSystemRoles(tx, company.id));
    } catch (error) {
      if (error?.code === "SYSTEM_ROLE_TEMPLATE_MISSING") {
        console.warn("⚠️ Company role templates are not seeded yet. Run `npx prisma db seed` to restore built-in company roles.");
        break;
      }
      throw error;
    }
  }

  const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
  const resetExistingPassword =
    String(process.env.SUPER_ADMIN_RESET_PASSWORD || "").trim().toLowerCase() === "true";

  if (!email && !password) {
    console.warn(
      "ℹ️ Platform administrator bootstrap skipped: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in the Render service Environment to create/restore the platform account.",
    );
  } else if (!email || !password) {
    throw new Error(
      "Platform administrator bootstrap requires BOTH SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD. Set both in Render Environment.",
    );
  } else {
    const sameEmailTenantUser = await prisma.user.findFirst({
      where: { email, companyId: { not: null } },
      select: { id: true },
    });
    if (sameEmailTenantUser) {
      throw new Error(
        "SUPER_ADMIN_EMAIL is already used by a company account. Choose a different email for the platform administrator; company users cannot be promoted by this bootstrap.",
      );
    }

    let platformUser = await prisma.user.findFirst({
      where: { email, companyId: null },
    });

    if (!platformUser) {
      platformUser = await prisma.user.create({
        data: {
          companyId: null,
          email,
          passwordHash: await hashPassword(password),
          firstName: "Platform",
          lastName: "Administrator",
          status: "ACTIVE",
          emailVerified: true,
          emailVerifiedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      console.log(`✅ Platform administrator created from SUPER_ADMIN_EMAIL: ${email}`);
    } else if (resetExistingPassword) {
      platformUser = await prisma.user.update({
        where: { id: platformUser.id },
        data: {
          passwordHash: await hashPassword(password),
          status: "ACTIVE",
          emailVerified: true,
          emailVerifiedAt: platformUser.emailVerifiedAt || new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      console.log(`✅ Platform administrator password reset and account unlocked: ${email}`);
    } else {
      console.log(
        `ℹ️ Platform administrator account found: ${email}. Password was not changed. Set SUPER_ADMIN_RESET_PASSWORD=true temporarily if you need to reset it.`,
      );
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: platformUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: platformUser.id, roleId: superAdminRole.id },
    });
    console.log(`✅ Platform Super Admin role verified: ${email}`);
  }
};
