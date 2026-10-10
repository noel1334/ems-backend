import prisma from "../config/database.js";
import { hashPassword } from "../common/utils/crypto.js";

const isEnabled = () =>
  String(process.env.BOOTSTRAP_DEMO_DATA || "").toLowerCase() === "true";

export const bootstrapDemoData = async () => {
  if (!isEnabled()) {
    return;
  }

  const email = (
    process.env.DEMO_ADMIN_EMAIL || "demo.admin@example.com"
  ).trim().toLowerCase();

  const password =
    process.env.DEMO_ADMIN_PASSWORD || "Password1234";

  const companyName =
    process.env.DEMO_COMPANY_NAME || "EMS Demo Company";

  const companySlug =
    process.env.DEMO_COMPANY_SLUG || "ems-demo";

  console.log("🌱 Demo bootstrap enabled...");

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.upsert({
      where: {
        slug: companySlug,
      },
      update: {
        name: companyName,
      },
      create: {
        name: companyName,
        slug: companySlug,
        country: "Nigeria",
        timezone: "Africa/Lagos",
        currency: "NGN",
        status: "ACTIVE",
        plan: "FREE",
        isSubscriptionActive: false,
      },
    });

    const role = await tx.role.findFirst({
      where: {
        name: "COMPANY_ADMIN",
        scope: "COMPANY",
        isSystem: true,
        isActive: true,
      },
    });

    if (!role) {
      throw new Error(
        "Demo bootstrap failed: COMPANY_ADMIN system role does not exist. Run the database seed first."
      );
    }

    let user = await tx.user.findFirst({
      where: {
        companyId: company.id,
        email,
      },
    });

    if (!user) {
      const passwordHash = await hashPassword(password);

      user = await tx.user.create({
        data: {
          companyId: company.id,
          email,
          passwordHash,
          firstName: "Demo",
          lastName: "Administrator",
          status: "ACTIVE",
          emailVerified: true,
          emailVerifiedAt: new Date(),
          failedLoginCount: 0,
        },
      });

      console.log(`✅ Demo admin created: ${email}`);
    } else {
      console.log(`ℹ️ Demo admin already exists: ${email}`);
    }

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });

    console.log("✅ Demo admin role verified");
  });

  console.log("✅ Demo bootstrap completed");
};
