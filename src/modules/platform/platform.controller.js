import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as service from "./platform.service.js";
import { createTenantSchema, createPlatformUserSchema, updatePlatformUserSchema, assignPlatformUserRolesSchema, updateTenantSchema, createTenantRoleSchema, updateTenantRoleSchema, platformPermissionQuerySchema } from "./platform.validation.js";
import { AppError } from "../../common/errors/AppError.js";

export const tenants = asyncHandler(async (req, res) => {
  const result = await service.listTenants(req.query);
  return res.json({ success: true, data: { items: result.items, pagination: result.pagination }, pagination: result.pagination });
});

export const tenant = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: await service.getTenant(req.params.id) });
});

export const create = asyncHandler(async (req, res) => {
  const input = createTenantSchema.parse(req.body);
  const result = await service.createTenant(req.user.userId, input, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req, res) => {
  const input = updateTenantSchema.parse(req.body);
  return res.json({ success: true, data: await service.updateTenant(req.user.userId, req.params.id, input, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId }) });
});

export const tenantDepartments = asyncHandler(async (req, res) => {
  const items = await service.listTenantDepartments(req.params.id);
  return res.json({ success: true, data: { items, pagination: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 } } });
});

export const tenantDesignations = asyncHandler(async (req, res) => {
  const items = await service.listTenantDesignations(req.params.id);
  return res.json({ success: true, data: { items, pagination: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 } } });
});

export const tenantRoles = asyncHandler(async (req, res) => {
  const items = await service.listTenantRoles(req.params.id);
  return res.json({ success: true, data: { items, pagination: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 } } });
});

export const permissionCatalog = asyncHandler(async (req, res) => {
  const parsed = platformPermissionQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError("Invalid permission catalogue query", 400, { code: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  return res.json({ success: true, data: await service.listPlatformPermissionCatalog(parsed.data) });
});

export const createTenantRole = asyncHandler(async (req, res) => {
  const parsed = createTenantRoleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  const role = await service.createTenantRole(req.user.userId, req.params.id, parsed.data, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.status(201).json({ success: true, message: "Company role created successfully", data: role });
});

export const updateTenantRole = asyncHandler(async (req, res) => {
  const parsed = updateTenantRoleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("Validation failed", 400, { code: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  const role = await service.updateTenantRole(req.user.userId, req.params.id, req.params.roleId, parsed.data, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.json({ success: true, message: "Company role updated successfully", data: role });
});

export const tenantUsers = asyncHandler(async (req, res) => {
  const result = await service.listTenantUsers(req.params.id, req.query);
  return res.json({ success: true, data: { items: result.items, pagination: result.pagination } });
});

export const createTenantUser = asyncHandler(async (req, res) => {
  const input = createPlatformUserSchema.parse(req.body);
  const user = await service.createTenantUser(req.user.userId, req.params.id, input, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.status(201).json({ success: true, message: "Company user created successfully", data: user });
});

export const updateTenantUser = asyncHandler(async (req, res) => {
  const input = updatePlatformUserSchema.parse(req.body);
  const user = await service.updateTenantUserStatus(req.user.userId, req.params.id, req.params.userId, input.status, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.json({ success: true, message: "Company user status updated", data: user });
});

export const assignTenantUserRoles = asyncHandler(async (req, res) => {
  const input = assignPlatformUserRolesSchema.parse(req.body);
  const user = await service.assignTenantUserRoles(req.user.userId, req.params.id, req.params.userId, input.roleIds, { ipAddress: req.ip, userAgent: req.get("user-agent"), requestId: req.requestId });
  return res.json({ success: true, message: "Company user roles updated", data: user });
});

export const audit = asyncHandler(async (req, res) => {
  const items = await service.listPlatformAudit(req.query);
  return res.json({ success: true, data: { items } });
});
