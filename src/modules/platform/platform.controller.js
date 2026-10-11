import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as service from "./platform.service.js";
import { createTenantSchema, createPlatformUserSchema, updatePlatformUserSchema, updateTenantSchema } from "./platform.validation.js";

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

export const tenantRoles = asyncHandler(async (req, res) => {
  const items = await service.listTenantRoles(req.params.id);
  return res.json({ success: true, data: { items, pagination: { page: 1, limit: items.length || 1, total: items.length, totalPages: 1 } } });
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

export const audit = asyncHandler(async (req, res) => {
  const items = await service.listPlatformAudit(req.query);
  return res.json({ success: true, data: { items } });
});
