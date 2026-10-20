import { z } from "zod";
import AppError from "../../common/errors/AppError.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as platformService from "./platform.service.js";
import * as schedulingService from "../scheduling/scheduling.service.js";
import { updateGenerationAssignments } from "../scheduling/scheduling.draft.service.js";
import { policySchema, policyUpdateSchema, generateSchema, generationListSchema } from "../scheduling/scheduling.validation.js";

const companyId = async (req) => {
  await platformService.getTenant(req.params.id);
  return req.params.id;
};
const actor = (req) => req.user?.userId;
const meta = (req) => ({ requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent") });
const parse = (schema, value, message = "Invalid scheduling request") => {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(message, 400, { code: "VALIDATION_ERROR", details: result.error.issues });
  return result.data;
};
const generationId = (req) => req.params.generationId;

export const listPolicies = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  return res.json({ success: true, ...await schedulingService.listPolicies(cid, req.query) });
});
export const createPolicy = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const result = await schedulingService.createPolicy(cid, parse(policySchema, req.body));
  return res.status(201).json({ success: true, message: "Scheduling policy created", data: result });
});
export const getPolicy = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  return res.json({ success: true, data: await schedulingService.getPolicy(cid, req.params.policyId) });
});
export const updatePolicy = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const result = await schedulingService.updatePolicy(cid, req.params.policyId, parse(policyUpdateSchema, req.body));
  return res.json({ success: true, message: "Scheduling policy updated", data: result });
});
export const timetable = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const result = await schedulingService.getPublishedDepartmentTimetable(cid, req.query);
  return res.json({ success: true, data: result });
});
export const listGenerations = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  return res.json({ success: true, ...await schedulingService.listGenerations(cid, parse(generationListSchema, req.query)) });
});
export const getGeneration = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  return res.json({ success: true, data: await schedulingService.getGeneration(cid, generationId(req)) });
});
export const generate = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const input = parse(generateSchema, req.body);
  const result = await schedulingService.generate(cid, actor(req), input, meta(req));
  return res.status(201).json({ success: true, message: "Schedule generated and saved as a draft", data: result });
});
const draftChangesSchema = z.object({
  assignments: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["WORK", "LEAVE", "REST", "OFF"]),
    shiftId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  })).min(1).max(1500),
});
export const updateDraft = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const changes = parse(draftChangesSchema, req.body, "Invalid schedule draft changes");
  const result = await updateGenerationAssignments(cid, actor(req), generationId(req), changes.assignments, meta(req));
  return res.json({ success: true, message: "Schedule draft changes saved", data: result });
});
export const approve = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const result = await schedulingService.approve(cid, actor(req), generationId(req), meta(req));
  return res.json({ success: true, message: "Schedule generation approved", data: result });
});
export const publish = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const result = await schedulingService.publish(cid, actor(req), generationId(req), meta(req));
  return res.json({ success: true, message: "Schedule published successfully", data: result });
});
