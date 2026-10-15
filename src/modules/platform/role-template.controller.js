import { asyncHandler } from "../../common/utils/asyncHandler.js";
import AppError from "../../common/errors/AppError.js";
import * as service from "./role-template.service.js";

const validateTemplateBody = (body = {}, creating = false) => {
  const errors = [];
  if (creating && (typeof body.key !== "string" || !/^[A-Za-z0-9_-]{2,80}$/.test(body.key))) {
    errors.push("key must be 2-80 letters, numbers, underscores or hyphens");
  }
  if (creating && (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 120)) {
    errors.push("name must contain 2-120 characters");
  }
  if (!Array.isArray(body.permissionIds) || body.permissionIds.length > 200 || body.permissionIds.some((id) => typeof id !== "string")) {
    errors.push("permissionIds must be an array of up to 200 permission IDs");
  }
  if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.length > 500)) {
    errors.push("description must be text no longer than 500 characters");
  }
  if (body.industry !== undefined && body.industry !== null && (typeof body.industry !== "string" || body.industry.length > 80)) {
    errors.push("industry must be text no longer than 80 characters");
  }
  if (body.draftVersionId !== undefined && typeof body.draftVersionId !== "string") {
    errors.push("draftVersionId must be a string");
  }
  if (body.publish !== undefined && typeof body.publish !== "boolean") {
    errors.push("publish must be a boolean");
  }
  if (errors.length) {
    throw new AppError("Validation failed", 400, {
      code: "VALIDATION_ERROR",
      details: errors,
    });
  }
};

export const list = asyncHandler(async (_req, res) => {
  const items = await service.listTemplates();
  return res.json({ success: true, data: { items } });
});

export const create = asyncHandler(async (req, res) => {
  validateTemplateBody(req.body, true);
  const data = await service.createTemplate(req.user.userId, req.body, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.requestId,
  });
  return res.status(201).json({ success: true, data });
});

export const publish = asyncHandler(async (req, res) => {
  validateTemplateBody(req.body, false);
  const data = await service.publishVersion(req.user.userId, req.params.id, req.body, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.requestId,
  });
  return res.status(201).json({ success: true, data });
});

export const applyToTenantRole = asyncHandler(async (req, res) => {
  const companyId = req.tenant?.id;
  if (!companyId) throw new AppError("Company context is required", 403, "TENANT_NOT_FOUND");
  const role = await service.applyTemplateVersionToRole(req.user.userId, companyId, req.params.roleId, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.requestId,
  });
  return res.json({
    success: true,
    message: "Role updated to the latest published template version",
    data: { role },
  });
});

export const createTenantRoleFromTemplate = asyncHandler(async (req, res) => {
  const companyId = req.tenant?.id;
  if (!companyId) throw new AppError("Company context is required", 403, "TENANT_NOT_FOUND");
  const body = req.body ?? {};
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80 || !/^[A-Za-z0-9 _-]+$/.test(body.name.trim())) {
    throw new AppError("Role name must be 2-80 letters, numbers, spaces, underscores or hyphens", 400, "INVALID_ROLE_NAME");
  }
  if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.length > 500)) {
    throw new AppError("description must be text no longer than 500 characters", 400, "INVALID_DESCRIPTION");
  }
  if (!Array.isArray(body.permissionIds) || body.permissionIds.length > 100 || body.permissionIds.some((id) => typeof id !== "string")) {
    throw new AppError("permissionIds must be an array of up to 100 IDs", 400, "INVALID_TEMPLATE_PERMISSIONS");
  }
  const role = await service.createTenantRoleFromTemplate(req.user.userId, companyId, req.params.templateId, body, {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    requestId: req.requestId,
  });
  return res.status(201).json({ success: true, message: "Company role created from the published template", data: { role } });
});
