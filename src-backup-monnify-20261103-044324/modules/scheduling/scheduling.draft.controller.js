import { z } from "zod";
import AppError from "../../common/errors/AppError.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as platformService from "../platform/platform.service.js";
import { updateGenerationAssignments } from "./scheduling.draft.service.js";

const schema = z.object({
  assignments: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["WORK", "LEAVE", "REST", "OFF"]),
    shiftId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  })).min(1).max(1500),
});
const meta = (req) => ({ requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent") });
const parse = (body) => {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("Invalid schedule draft changes", 400, { code: "VALIDATION_ERROR", details: result.error.issues });
  return result.data.assignments;
};
const managerRoles = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "HR_ADMIN", "HR_MANAGER", "DEPARTMENT_ADMIN", "DEPARTMENT_MANAGER", "SCHEDULING_MANAGER", "ATTENDANCE_MANAGER", "OPERATIONS_MANAGER"]);

export const updateTenantAssignments = asyncHandler(async (req, res) => {
  const companyId = req.tenant?.companyId ?? req.tenant?.id ?? req.user?.companyId;
  if (!companyId) throw new AppError("Company context is required", 400);
  const changes = parse(req.body);
  const generation = await (await import("../../config/database.js")).default.scheduleGeneration.findFirst({
    where: { id: req.params.id, companyId }, select: { generatedById: true },
  });
  if (!generation) throw new AppError("Schedule draft not found", 404);
  const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toUpperCase()) : [];
  if (generation.generatedById !== req.user?.userId && !roles.some((r) => managerRoles.has(r))) {
    throw new AppError("You can edit only drafts you generated unless your role grants scheduling oversight", 403);
  }
  const result = await updateGenerationAssignments(companyId, req.user?.userId, req.params.id, changes, meta(req));
  return res.json({ success: true, message: "Schedule draft changes saved", data: result });
});

export const updatePlatformAssignments = asyncHandler(async (req, res) => {
  const tenant = await platformService.getTenant(req.params.id);
  if (!tenant) throw new AppError("Company not found", 404);
  const result = await updateGenerationAssignments(req.params.id, req.user?.userId, req.params.generationId, parse(req.body), meta(req));
  return res.json({ success: true, message: "Schedule draft changes saved", data: result });
});
