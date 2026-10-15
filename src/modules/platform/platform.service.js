import { randomUUID } from "node:crypto";
import prisma from "../../config/database.js";
import { hashPassword } from "../../common/utils/crypto.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { isReservedSystemRoleName, isTenantAssignablePermission } from "../rbac/rbac.policy.js";
import { instantiateTenantSystemRoles } from "./role-template.service.js";

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
    industry: company.industry ?? "CORPORATE",
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
      industry: data.industry ?? "CORPORATE",
      slug: data.slug,
      email: data.email.toLowerCase(),
      country: data.country,
      timezone: data.timezone,
      currency: data.currency,
      plan: data.plan,
      status: "ACTIVE",
      isSubscriptionActive: data.plan !== "FREE",
    } });
    await instantiateTenantSystemRoles(tx, company.id);
    const role = await tx.role.findFirst({ where: { name: "COMPANY_ADMIN", scope: "COMPANY", isActive: true, companyId: company.id } });
    if (!role) throw new AppError("COMPANY_ADMIN tenant role could not be initialized", 500, "TENANT_ROLE_INITIALIZATION_FAILED");
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


export const listTenantDepartments = async (companyId) => {
  await requireTenant(companyId);
  return prisma.department.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, isActive: true } });
};

export const listTenantDesignations = async (companyId) => {
  await requireTenant(companyId);
  return prisma.designation.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, departmentId: true, isActive: true } });
};

const tenantRoleInclude = {
  permissions: {
    where: { permission: { isActive: true } },
    include: { permission: true },
  },
};

const tenantRoleView = (role) => ({
  id: role.id,
  companyId: role.companyId,
  name: role.name,
  description: role.description,
  scope: role.scope,
  isSystem: role.isSystem,
  isActive: role.isActive,
  permissions: (role.permissions ?? [])
    .map(({ permission }) => permission)
    .filter((permission) => isTenantAssignablePermission(permission))
    .map((permission) => ({
      id: permission.id,
      module: permission.module,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
    })),
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

async function validateTenantPermissionIds(permissionIds = [], tx = prisma) {
  if (!permissionIds.length) return [];
  const permissions = await tx.permission.findMany({
    where: { id: { in: permissionIds }, isActive: true },
  });
  if (permissions.length !== permissionIds.length) {
    throw new AppError("One or more selected permissions are missing or inactive", 400, "INVALID_PERMISSIONS");
  }
  const disallowed = permissions.filter((permission) => !isTenantAssignablePermission(permission));
  if (disallowed.length) {
    throw new AppError("Company roles cannot be granted platform-only permissions", 403, "PLATFORM_PERMISSION_NOT_ASSIGNABLE");
  }
  return permissions;
}

export const listTenantRoles = async (companyId) => {
  await requireTenant(companyId);
  const roles = await prisma.role.findMany({
    where: {
      isActive: true,
      scope: "COMPANY",
      name: { not: "SUPER_ADMIN" },
      companyId,
    },
    include: tenantRoleInclude,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map(tenantRoleView);
};

export const listPlatformPermissionCatalog = async (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 200));
  const all = await prisma.permission.findMany({
    where: { isActive: true, ...(query.module ? { module: query.module } : {}) },
    orderBy: [{ module: "asc" }, { resource: "asc" }, { action: "asc" }],
  });
  const filtered = all.filter((permission) =>
    isTenantAssignablePermission(permission) && (!query.search ||
      `${permission.module} ${permission.resource} ${permission.action} ${permission.description ?? ""}`.toLowerCase().includes(String(query.search).toLowerCase()))
  );
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit).map(({ id, module, resource, action, description }) => ({ id, module, resource, action, description })),
    pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
  };
};

export const createTenantRole = async (actorUserId, companyId, data, context = {}) => prisma.$transaction(async (tx) => {
  await requireTenant(companyId, tx);
  if (isReservedSystemRoleName(data.name)) {
    throw new AppError("This name is reserved for a protected system role", 400, "RESERVED_ROLE_NAME");
  }
  const name = data.name.trim();
  const existing = await tx.role.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new AppError("A role with this name already exists in this company", 409, "ROLE_ALREADY_EXISTS");
  const permissions = await validateTenantPermissionIds(data.permissionIds ?? [], tx);
  const role = await tx.role.create({
    data: { companyId, name, description: data.description ?? null, scope: "COMPANY", isSystem: false, isActive: true },
  });
  if (permissions.length) {
    await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  }
  const result = await tx.role.findUnique({ where: { id: role.id }, include: tenantRoleInclude });
  await writeAudit(tx, {
    companyId,
    actorUserId,
    action: "CREATE",
    module: "platform",
    resource: "tenant_role",
    resourceId: role.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { roleName: role.name, permissionCount: permissions.length },
  });
  return tenantRoleView(result);
});

export const updateTenantRole = async (actorUserId, companyId, roleId, data, context = {}) => prisma.$transaction(async (tx) => {
  await requireTenant(companyId, tx);
  const existing = await tx.role.findFirst({ where: { id: roleId, companyId }, include: tenantRoleInclude });
  if (!existing) throw new AppError("Custom role not found in this company", 404, "ROLE_NOT_FOUND");
  if (existing.isSystem || existing.scope !== "COMPANY") throw new AppError("System roles cannot be modified by tenant administrators", 403, "SYSTEM_ROLE_PROTECTED");

  const updateData = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (isReservedSystemRoleName(name)) throw new AppError("This name is reserved for a protected system role", 400, "RESERVED_ROLE_NAME");
    const duplicate = await tx.role.findFirst({ where: { companyId, id: { not: roleId }, name: { equals: name, mode: "insensitive" } } });
    if (duplicate) throw new AppError("A role with this name already exists in this company", 409, "ROLE_ALREADY_EXISTS");
    updateData.name = name;
  }
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  if (data.permissionIds !== undefined) {
    const permissions = await validateTenantPermissionIds(data.permissionIds, tx);
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissions.length) {
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permissionId: permission.id })), skipDuplicates: true });
    }
  }
  if (Object.keys(updateData).length) await tx.role.update({ where: { id: roleId }, data: updateData });
  const updated = await tx.role.findUnique({ where: { id: roleId }, include: tenantRoleInclude });
  await writeAudit(tx, {
    companyId,
    actorUserId,
    action: "UPDATE",
    module: "platform",
    resource: "tenant_role",
    resourceId: roleId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { before: { name: existing.name, isActive: existing.isActive, permissionIds: existing.permissions.map((item) => item.permissionId) }, after: data },
  });
  return tenantRoleView(updated);
});

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
        companyId,
      },
    });
    if (roles.length !== data.roleIds.length) {
      throw new AppError("One or more roles are unavailable for this company", 400, "INVALID_ROLES");
    }

    const isEmployee = roles.some((role) => role.name === "EMPLOYEE");
    let employee = null;
    if (isEmployee) {
      if (data.departmentId) {
        const department = await tx.department.findFirst({ where: { id: data.departmentId, companyId } });
        if (!department) throw new AppError("Selected department does not belong to this company", 400, "INVALID_DEPARTMENT");
      }
      if (data.designationId) {
        const designation = await tx.designation.findFirst({ where: { id: data.designationId, companyId } });
        if (!designation) throw new AppError("Selected designation does not belong to this company", 400, "INVALID_DESIGNATION");
        if (data.departmentId && designation.departmentId && designation.departmentId !== data.departmentId) {
          throw new AppError("Selected designation belongs to a different department", 400, "DESIGNATION_DEPARTMENT_MISMATCH");
        }
      }
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
        departmentId: data.departmentId ?? null,
        designationId: data.designationId ?? null,
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
