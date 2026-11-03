import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { isReservedSystemRoleName, isTenantAssignablePermission } from "../rbac/rbac.policy.js";

const includeVersion = { permissions: { include: { permission: true } } };
const tenantSafeVersion = (version) => {
  const permissions = (version.permissions ?? []).filter((entry) => isTenantAssignablePermission(entry.permission));
  return {
    id: version.id,
    version: version.version,
    status: version.status,
    description: version.description,
    publishedAt: version.publishedAt,
    createdAt: version.createdAt,
    permissionIds: permissions.map((entry) => entry.permissionId),
    permissions: permissions.map((entry) => entry.permission),
  };
};
const view = (template) => ({
  id: template.id, key: template.key, name: template.name, description: template.description,
  industry: template.industry, isActive: template.isActive,
  versions: (template.versions ?? []).map(tenantSafeVersion),
});
export const listTemplates = async () => {
  const rows = await prisma.roleTemplate.findMany({ where: { isActive: true }, include: { versions: { orderBy: { version: "desc" }, include: includeVersion } }, orderBy: [{ industry: "asc" }, { name: "asc" }] });
  return rows.map((row) => {
    const published = row.versions.find((version) => version.status === "PUBLISHED") ?? null;
    const draft = row.versions.find((version) => version.status === "DRAFT") ?? null;
    return {
      ...view({ ...row, versions: published ? [published] : [] }),
      latestVersion: row.versions[0]?.version ?? 0,
      latestDraftVersion: draft?.version ?? null,
      draft: draft ? { id: draft.id, version: draft.version, status: draft.status, description: draft.description, createdAt: draft.createdAt, permissionIds: tenantSafeVersion(draft).permissionIds } : null,
    };
  });
};

export const createTemplate = async (actorUserId, data, context = {}) => prisma.$transaction(async tx => {
  const key = data.key.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  if (await tx.roleTemplate.findUnique({ where: { key } })) throw new AppError("Template key already exists", 409, "ROLE_TEMPLATE_EXISTS");
  const permissions = await tx.permission.findMany({ where: { id: { in: data.permissionIds }, isActive: true } });
  if (permissions.length !== new Set(data.permissionIds).size || permissions.some(p => !isTenantAssignablePermission(p))) throw new AppError("Template contains invalid or platform-only permissions", 400, "INVALID_TEMPLATE_PERMISSIONS");
  const template = await tx.roleTemplate.create({ data: { key, name: data.name.trim(), description: data.description ?? null, industry: data.industry ?? null, versions: { create: { version: 1, status: data.publish ? "PUBLISHED" : "DRAFT", description: data.description ?? null, createdById: actorUserId, publishedAt: data.publish ? new Date() : null, permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } } }, include: { versions: { include: includeVersion } } });
  await writeAudit(tx, { companyId: null, actorUserId, action: "CREATE", module: "rbac", resource: "role_template", resourceId: template.id, requestId: context.requestId, ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { key, version: 1, published: !!data.publish, permissionCount: permissions.length } });
  return view(template);
});
export const publishVersion = async (actorUserId, templateId, data, context = {}) => prisma.$transaction(async (tx) => {
  const template = await tx.roleTemplate.findUnique({ where: { id: templateId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!template) throw new AppError("Role template not found", 404, "ROLE_TEMPLATE_NOT_FOUND");
  const permissionIds = [...new Set(data.permissionIds ?? [])];
  const permissions = await tx.permission.findMany({ where: { id: { in: permissionIds }, isActive: true } });
  if (permissions.length !== permissionIds.length || permissions.some((permission) => !isTenantAssignablePermission(permission))) throw new AppError("Template contains invalid or platform-only permissions", 400, "INVALID_TEMPLATE_PERMISSIONS");

  let created;
  if (data.draftVersionId) {
    const draft = await tx.roleTemplateVersion.findFirst({ where: { id: data.draftVersionId, templateId, status: "DRAFT" }, include: includeVersion });
    if (!draft) throw new AppError("Draft template version not found", 404, "ROLE_TEMPLATE_DRAFT_NOT_FOUND");
    // A draft can be revised until publication; published history is immutable.
    await tx.roleTemplateVersionPermission.deleteMany({ where: { versionId: draft.id } });
    if (permissions.length) await tx.roleTemplateVersionPermission.createMany({ data: permissions.map((permission) => ({ versionId: draft.id, permissionId: permission.id })) });
    if (data.publish === false) {
      created = await tx.roleTemplateVersion.update({ where: { id: draft.id }, data: { description: data.description ?? draft.description }, include: includeVersion });
    } else {
      await tx.roleTemplateVersion.updateMany({ where: { templateId, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      await tx.roleTemplate.update({ where: { id: templateId }, data: { description: data.description ?? template.description } });
      created = await tx.roleTemplateVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date(), description: data.description ?? draft.description }, include: includeVersion });
    }
  } else {
    const version = (template.versions[0]?.version ?? 0) + 1;
    const publish = data.publish !== false;
    if (publish) {
      await tx.roleTemplateVersion.updateMany({ where: { templateId, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      await tx.roleTemplate.update({ where: { id: templateId }, data: { description: data.description ?? template.description } });
    }
    created = await tx.roleTemplateVersion.create({ data: { templateId, version, description: data.description ?? null, status: publish ? "PUBLISHED" : "DRAFT", createdById: actorUserId, publishedAt: publish ? new Date() : null, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } }, include: includeVersion });
  }
  await writeAudit(tx, { companyId: null, actorUserId, action: created.status === "PUBLISHED" ? "UPDATE" : "CREATE", module: "rbac", resource: "role_template_version", resourceId: created.id, requestId: context.requestId, ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { templateKey: template.key, version: created.version, status: created.status, permissionCount: permissions.length } });
  return { id: template.id, key: template.key, name: template.name, industry: template.industry, versions: [{ id: created.id, version: created.version, status: created.status, description: created.description, publishedAt: created.publishedAt, permissionIds: created.permissions.map((entry) => entry.permissionId), permissions: created.permissions.map((entry) => entry.permission) }] };
});

/** Let a company administrator explicitly adopt a newer published template version for one tenant role. */
export const applyTemplateVersionToRole = async (actorUserId, companyId, roleId, context = {}) => prisma.$transaction(async (tx) => {
  const role = await tx.role.findFirst({ where: { id: roleId, companyId, scope: "COMPANY", sourceTemplateId: { not: null } }, include: includeVersion });
  if (!role) throw new AppError("This role is not linked to a global template", 409, "ROLE_NOT_TEMPLATE_BASED");
  const template = await tx.roleTemplate.findUnique({ where: { id: role.sourceTemplateId }, include: { versions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1, include: includeVersion } } });
  const latest = template?.versions?.[0];
  if (!latest || latest.version <= (role.sourceTemplateVersion ?? 0)) throw new AppError("This role already uses the latest published template version", 409, "NO_TEMPLATE_UPDATE_AVAILABLE");
  const newIds = [...new Set(latest.permissions.map((entry) => entry.permissionId))];
  const oldIds = new Set((role.permissions ?? []).map((entry) => entry.permissionId));
  const addedIds = newIds.filter((id) => !oldIds.has(id));
  const permissions = await tx.permission.findMany({ where: { id: { in: newIds }, isActive: true } });
  if (permissions.length !== newIds.length || permissions.some((permission) => !isTenantAssignablePermission(permission))) throw new AppError("The latest template contains unavailable or platform-only permissions", 400, "INVALID_TEMPLATE_PERMISSIONS");
  if (addedIds.length) {
    const actor = await tx.user.findFirst({ where: { id: actorUserId, companyId, status: "ACTIVE" }, select: { id: true, roles: { where: { role: { isActive: true, companyId } }, select: { role: { select: { permissions: { where: { permission: { isActive: true } }, select: { permissionId: true } } } } } } } });
    if (!actor) throw new AppError("Active company administrator not found", 403, "ROLE_GRANT_NOT_ALLOWED");
    const allowed = new Set(actor.roles.flatMap((assignment) => assignment.role.permissions.map((grant) => grant.permissionId)));
    if (addedIds.some((id) => !allowed.has(id))) throw new AppError("You cannot adopt template permissions that are not delegated to your account", 403, "PERMISSION_DELEGATION_DENIED");
  }
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (newIds.length) await tx.rolePermission.createMany({ data: newIds.map((permissionId) => ({ roleId, permissionId })), skipDuplicates: true });
  await tx.role.update({ where: { id: roleId }, data: { sourceTemplateVersion: latest.version, description: role.description ?? template.description } });
  await writeAudit(tx, { companyId, actorUserId, action: "UPDATE", module: "rbac", resource: "role", resourceId: roleId, ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { action: "APPLY_TEMPLATE_VERSION", templateKey: template.key, previousVersion: role.sourceTemplateVersion, appliedVersion: latest.version, permissionCount: newIds.length } });
  return tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
});



/** Create a company-owned role from a platform-published template without sharing role records across tenants. */
export const createTenantRoleFromTemplate = async (actorUserId, companyId, templateId, data, context = {}) => prisma.$transaction(async (tx) => {
  const template = await tx.roleTemplate.findFirst({
    where: { id: templateId, isActive: true },
    include: { versions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1, include: includeVersion } },
  });
  if (!template || !template.versions?.[0]) throw new AppError("Published role template not found", 404, "ROLE_TEMPLATE_NOT_FOUND");
  const coreKeys = new Set(["COMPANY_ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "EMPLOYEE", "STORE_KEEPER", "SUPER_ADMIN"]);
  if (coreKeys.has(template.key) || isReservedSystemRoleName(data.name ?? template.name)) {
    throw new AppError("Protected core roles cannot be duplicated from a template. Create a custom role with a different name.", 409, "RESERVED_ROLE_NAME");
  }
  const name = String(data.name ?? template.name).trim();
  if (name.length < 2 || name.length > 80 || !/^[A-Za-z0-9 _-]+$/.test(name)) {
    throw new AppError("Role name must be 2-80 letters, numbers, spaces, underscores or hyphens", 400, "INVALID_ROLE_NAME");
  }
  const existing = await tx.role.findFirst({ where: { companyId, scope: "COMPANY", name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new AppError("A role with this name already exists in this company", 409, "ROLE_ALREADY_EXISTS");

  const permissionIds = [...new Set(Array.isArray(data.permissionIds) ? data.permissionIds : template.versions[0].permissions.map((entry) => entry.permissionId))];
  if (permissionIds.length > 100) throw new AppError("A company role can contain at most 100 permissions", 400, "TOO_MANY_ROLE_PERMISSIONS");
  const permissions = await tx.permission.findMany({ where: { id: { in: permissionIds }, isActive: true } });
  if (permissions.length !== permissionIds.length || permissions.some((permission) => !isTenantAssignablePermission(permission))) {
    throw new AppError("Role contains invalid or platform-only permissions", 400, "INVALID_TEMPLATE_PERMISSIONS");
  }

  const actor = await tx.user.findFirst({
    where: { id: actorUserId, companyId, status: "ACTIVE" },
    select: { id: true, roles: { where: { role: { isActive: true, scope: "COMPANY", companyId } }, select: { role: { select: { permissions: { where: { permission: { isActive: true } }, select: { permissionId: true, permission: true } } } } } } },
  });
  if (!actor) throw new AppError("Active company administrator not found", 403, "ROLE_GRANT_NOT_ALLOWED");
  const allowed = new Set(actor.roles.flatMap((assignment) => assignment.role.permissions.filter((grant) => isTenantAssignablePermission(grant.permission)).map((grant) => grant.permissionId)));
  if (permissionIds.some((permissionId) => !allowed.has(permissionId))) {
    throw new AppError("You can only create a role with permissions already delegated to your account", 403, "PERMISSION_DELEGATION_DENIED");
  }

  const version = template.versions[0];
  const role = await tx.role.create({ data: {
    companyId, name, description: data.description ?? template.description ?? null,
    scope: "COMPANY", isSystem: false, isActive: true,
    sourceTemplateId: template.id, sourceTemplateVersion: version.version,
  } });
  if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  await writeAudit(tx, { companyId, actorUserId, action: "CREATE", module: "rbac", resource: "role", resourceId: role.id, requestId: context.requestId, ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { sourceTemplateKey: template.key, sourceTemplateVersion: version.version, roleName: name, permissionCount: permissionIds.length } });
  return tx.role.findUnique({ where: { id: role.id }, include: { permissions: { include: { permission: true } } } });
});

/** Create independent tenant-owned snapshots of the published core role templates.
 * Existing tenant roles are never overwritten; this is used only during company onboarding.
 */
export const instantiateTenantSystemRoles = async (tx, companyId) => {
  const coreKeys = ["COMPANY_ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "EMPLOYEE", "STORE_KEEPER"];
  const templates = await tx.roleTemplate.findMany({
    where: { key: { in: coreKeys }, isActive: true },
    include: { versions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1, include: includeVersion } },
  });
  const byKey = new Map(templates.map((template) => [template.key, template]));
  if (!byKey.has("COMPANY_ADMIN") || !byKey.get("COMPANY_ADMIN").versions?.[0]) {
    throw new AppError("The published COMPANY_ADMIN role template is missing; run the versioned-role-template migration", 500, "SYSTEM_ROLE_TEMPLATE_MISSING");
  }
  for (const key of coreKeys) {
    const template = byKey.get(key);
    const version = template?.versions?.[0];
    if (!template || !version) continue;
    const exists = await tx.role.findFirst({ where: { companyId, name: key } });
    if (exists) continue;
    const role = await tx.role.create({ data: {
      companyId, name: key, description: template.description ?? template.name,
      scope: "COMPANY", isSystem: false, isActive: true,
      sourceTemplateId: template.id, sourceTemplateVersion: version.version,
    } });
    const ids = version.permissions.map((entry) => entry.permissionId);
    if (ids.length) await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  }
  return tx.role.findMany({ where: { companyId, scope: "COMPANY", name: { in: coreKeys } }, orderBy: { name: "asc" } });
};
