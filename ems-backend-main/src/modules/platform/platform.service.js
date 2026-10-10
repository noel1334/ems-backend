import { randomUUID } from "node:crypto";
import prisma from "../../config/database.js";
import { hashPassword } from "../../common/utils/crypto.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";

const adminSelect = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  roles: { where: { role: { name: "COMPANY_ADMIN", scope: "COMPANY" } }, select: { role: { select: { name: true } } } },
};

const safeAdmin = (user) => ({
  id: user.id,
  companyId: user.companyId,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  adminName: `${user.firstName} ${user.lastName}`.trim(),
  status: user.status,
  lastLoginAt: user.lastLoginAt,
});

const safeCompany = (company) => {
  const admins = Array.isArray(company.users) ? company.users.map(safeAdmin) : [];
  const primaryAdmin = admins[0] ?? null;
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    email: company.email,
    status: company.status,
    plan: company.plan,
    isSubscriptionActive: company.isSubscriptionActive,
    monthlySubscription: company.monthlySubscription ?? 0,
    currency: company.currency,
    country: company.country,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    userCount: company._count?.users ?? 0,
    employeeCount: company._count?.employees ?? 0,
    admins,
    admin: primaryAdmin,
    adminUserId: primaryAdmin?.id ?? null,
    adminName: primaryAdmin?.adminName ?? null,
    adminEmail: primaryAdmin?.email ?? null,
  };
};

const tenantIncludes = {
  _count: { select: { users: true, employees: true } },
  users: {
    where: { roles: { some: { role: { name: "COMPANY_ADMIN", scope: "COMPANY", isActive: true } } } },
    select: adminSelect,
    orderBy: { createdAt: "asc" },
  },
};

async function requireTenant(companyId, tx = prisma) {
  const company = await tx.company.findUnique({ where: { id: companyId } });
  if (!company) throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
  return company;
}

const safePlatformUser = (user) => ({
  id: user.id,
  companyId: user.companyId,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  middleName: user.middleName,
  phone: user.phone,
  status: user.status,
  emailVerified: user.emailVerified,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  employeeId: user.employeeId ?? null,
  employeeNumber: user.employee?.employeeNumber ?? null,
  roles: (user.roles ?? []).map((assignment) => ({
    id: assignment.role.id,
    name: assignment.role.name,
    description: assignment.role.description,
    scope: assignment.role.scope,
    isSystem: assignment.role.isSystem,
  })),
});

export const listTenants = async (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const page = Math.max(Number(query.page) || 1, 1);
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { slug: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, include: tenantIncludes }),
    prisma.company.count({ where }),
  ]);
  return { items: rows.map(safeCompany), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

export const getTenant = async (id) => {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { ...tenantIncludes, users: { ...tenantIncludes.users, take: 100 } },
  });
  if (!company) throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
  return safeCompany(company);
};

export const createTenant = async (actorUserId, data, context = {}) => {
  const passwordHash = await hashPassword(data.admin.password);
  const result = await prisma.$transaction(async (tx) => {
    if (await tx.company.findFirst({ where: { OR: [{ slug: data.slug }, { email: data.email.toLowerCase() }] } })) {
      throw new AppError("Tenant slug or email already exists", 409, "TENANT_ALREADY_EXISTS");
    }
    const existingAdmin = await tx.user.findFirst({ where: { email: data.admin.email.toLowerCase() } });
    if (existingAdmin) throw new AppError("A user with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
    const company = await tx.company.create({ data: {
      name: data.name,
      slug: data.slug,
      email: data.email.toLowerCase(),
      country: data.country,
      timezone: data.timezone,
      currency: data.currency,
      plan: data.plan,
      status: "ACTIVE",
      isSubscriptionActive: data.plan !== "FREE",
    } });
    const role = await tx.role.findFirst({ where: { name: "COMPANY_ADMIN", scope: "COMPANY", isSystem: true, isActive: true, companyId: null } });
    if (!role) throw new AppError("COMPANY_ADMIN system role is missing; run the database seed", 500, "SYSTEM_ROLE_MISSING");
    const admin = await tx.user.create({ data: {
      companyId: company.id,
      email: data.admin.email.toLowerCase(),
      passwordHash,
      firstName: data.admin.firstName,
      lastName: data.admin.lastName,
      status: "ACTIVE",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    }, select: { id: true, companyId: true, email: true, firstName: true, lastName: true } });
    await tx.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    return { company, admin };
  });
  await writeAudit(prisma, {
    companyId: null, actorUserId, action: "CREATE", module: "platform", resource: "tenant", resourceId: result.company.id,
    ipAddress: context.ipAddress, userAgent: context.userAgent,
    metadata: { name: result.company.name, plan: result.company.plan, adminId: result.admin.id },
  });
  return getTenant(result.company.id);
};

export const updateTenant = async (actorUserId, id, data, context = {}) => {
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
  const company = await prisma.company.update({ where: { id }, data });
  await writeAudit(prisma, {
    companyId: null, actorUserId, action: "UPDATE", module: "platform", resource: "tenant", resourceId: id,
    ipAddress: context.ipAddress, userAgent: context.userAgent,
    metadata: { before: { status: existing.status, plan: existing.plan, isSubscriptionActive: existing.isSubscriptionActive }, after: data },
  });
  return getTenant(company.id);
};

export const listTenantRoles = async (companyId) => {
  await requireTenant(companyId);
  const roles = await prisma.role.findMany({
    where: {
      isActive: true,
      scope: "COMPANY",
      name: { not: "SUPER_ADMIN" },
      OR: [{ companyId: null }, { companyId }],
    },
    select: { id: true, name: true, description: true, scope: true, isSystem: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles;
};

export const listTenantUsers = async (companyId, query = {}) => {
  await requireTenant(companyId);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const where = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? {
      OR: [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" }, include: { roles: { include: { role: true } }, employee: true } }),
    prisma.user.count({ where }),
  ]);
  return { items: users.map(safePlatformUser), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

export const createTenantUser = async (actorUserId, companyId, data, context = {}) => {
  return prisma.$transaction(async (tx) => {
    const company = await requireTenant(companyId, tx);
    if (company.status !== "ACTIVE") throw new AppError("Activate this company before creating users", 409, "TENANT_NOT_ACTIVE");

    const existing = await tx.user.findFirst({ where: { email: data.email.toLowerCase() } });
    if (existing) throw new AppError("A user with this email already exists. Use a unique email address.", 409, "EMAIL_ALREADY_EXISTS");

    const roles = await tx.role.findMany({
      where: {
        id: { in: data.roleIds },
        isActive: true,
        scope: "COMPANY",
        name: { not: "SUPER_ADMIN" },
        OR: [{ companyId: null }, { companyId }],
      },
    });
    if (roles.length !== data.roleIds.length) {
      throw new AppError("One or more roles are unavailable for this company", 400, "INVALID_ROLES");
    }

    const isEmployee = roles.some((role) => role.name === "EMPLOYEE");
    let employee = null;
    if (isEmployee) {
      employee = await tx.employee.create({ data: {
        companyId,
        employeeNumber: `EMP-${randomUUID().slice(0, 8).toUpperCase()}`,
        firstName: data.firstName,
        middleName: data.middleName ?? null,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        jobTitle: data.jobTitle ?? null,
        employeeType: data.employeeType ?? "FULL_TIME",
        employmentStatus: "ACTIVE",
        hireDate: new Date(),
        country: company.country || "Nigeria",
      } });
    }

    const passwordHash = await hashPassword(data.password);
    const createdUser = await tx.user.create({ data: {
      companyId,
      employeeId: employee?.id ?? null,
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName ?? null,
      phone: data.phone ?? null,
      status: "ACTIVE",
      emailVerified: false,
    } });
    await tx.userRole.createMany({ data: roles.map((role) => ({ userId: createdUser.id, roleId: role.id })) });
    const user = await tx.user.findUnique({ where: { id: createdUser.id }, include: { roles: { include: { role: true } }, employee: true } });

    await writeAudit(tx, {
      companyId: null,
      actorUserId,
      action: "CREATE",
      module: "platform",
      resource: "user",
      resourceId: user.id,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { companyId, email: user.email, roles: roles.map((role) => role.name), employeeId: employee?.id ?? null },
    });

    return safePlatformUser(user);
  });
};

export const updateTenantUserStatus = async (actorUserId, companyId, userId, status, context = {}) => {
  return prisma.$transaction(async (tx) => {
    await requireTenant(companyId, tx);
    const existing = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!existing) throw new AppError("User not found in this company", 404, "USER_NOT_FOUND");
    const updated = await tx.user.update({ where: { id: userId }, data: { status }, include: { roles: { include: { role: true } }, employee: true } });
    if (status !== "ACTIVE") {
      await tx.userSession.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    }
    await writeAudit(tx, {
      companyId: null, actorUserId, action: "UPDATE", module: "platform", resource: "user", resourceId: userId,
      requestId: context.requestId, ipAddress: context.ipAddress, userAgent: context.userAgent,
      metadata: { companyId, statusBefore: existing.status, statusAfter: status },
    });
    return safePlatformUser(updated);
  });
};

export const listPlatformAudit = async (query = {}) => prisma.auditLog.findMany({
  where: { companyId: null, module: "platform" },
  orderBy: { createdAt: "desc" },
  take: Math.min(Number(query.limit) || 100, 200),
  include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
});
