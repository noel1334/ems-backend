import { asyncHandler } from "../../common/utils/asyncHandler.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import prisma from "../../config/database.js";
import * as platformService from "./platform.service.js";
import * as shiftService from "../shifts/shift.service.js";
import * as scheduleService from "../schedules/schedule.service.js";
import * as holidayService from "../holidays/holiday.service.js";
import * as schedulingService from "../scheduling/scheduling.service.js";
import { createShiftSchema, updateShiftSchema, createBreakSchema, updateBreakSchema } from "../shifts/shift.validation.js";
import { createScheduleSchema, updateScheduleSchema, replaceScheduleDaysSchema, assignScheduleSchema } from "../schedules/schedule.validation.js";
import { createHolidaySchema, updateHolidaySchema } from "../holidays/holiday.validation.js";
import { generationListSchema } from "../scheduling/scheduling.validation.js";
import { z } from "zod";

const companyId = async (req) => {
  // Every platform request names one company explicitly. Confirm it exists before using its ID.
  await platformService.getTenant(req.params.id);
  return req.params.id;
};
const actor = (req) => req.user?.userId;
const audit = async (req, action, resource, resourceId, targetCompanyId, metadata = {}) => writeAudit(prisma, {
  companyId: null,
  actorUserId: actor(req),
  action,
  module: "platform",
  resource,
  resourceId: resourceId ?? null,
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
  metadata: { targetCompanyId, ...metadata },
});
const assignShiftSchema = z.object({
  shiftId: z.string().uuid(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),
  isPrimary: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
const parseGenerationQuery = (query) => {
  const parsed = generationListSchema.safeParse(query);
  if (!parsed.success) throw new AppError("Invalid schedule generation query", 400, { code: "VALIDATION_ERROR", details: parsed.error.issues });
  return parsed.data;
};

// SHIFTS
export const listShifts = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  return res.json({ success: true, ...await shiftService.list(cid, req.query) });
});
export const createShift = asyncHandler(async (req, res) => {
  const cid = await companyId(req);
  const item = await shiftService.create(cid, createShiftSchema.parse(req.body));
  await audit(req, "CREATE", "workforce_shift", item.id, cid, { name: item.name });
  return res.status(201).json({ success: true, message: "Shift created successfully", data: item });
});
export const getShift = asyncHandler(async (req, res) => res.json({ success: true, data: await shiftService.getById(await companyId(req), req.params.resourceId) }));
export const updateShift = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await shiftService.update(cid, req.params.resourceId, updateShiftSchema.parse(req.body));
  await audit(req, "UPDATE", "workforce_shift", item.id, cid, { name: item.name });
  return res.json({ success: true, message: "Shift updated successfully", data: item });
});
export const deleteShift = asyncHandler(async (req, res) => {
  const cid = await companyId(req); await shiftService.remove(cid, req.params.resourceId);
  await audit(req, "DELETE", "workforce_shift", req.params.resourceId, cid);
  return res.json({ success: true, message: "Shift deleted successfully" });
});
export const addShiftBreak = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await shiftService.addBreak(cid, req.params.resourceId, createBreakSchema.parse(req.body));
  await audit(req, "CREATE", "workforce_shift_break", item.id, cid, { shiftId: req.params.resourceId });
  return res.status(201).json({ success: true, data: item });
});
export const updateShiftBreak = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await shiftService.updateBreakById(cid, req.params.resourceId, req.params.breakId, updateBreakSchema.parse(req.body));
  await audit(req, "UPDATE", "workforce_shift_break", item.id, cid, { shiftId: req.params.resourceId });
  return res.json({ success: true, data: item });
});
export const deleteShiftBreak = asyncHandler(async (req, res) => {
  const cid = await companyId(req); await shiftService.removeBreak(cid, req.params.resourceId, req.params.breakId);
  await audit(req, "DELETE", "workforce_shift_break", req.params.breakId, cid, { shiftId: req.params.resourceId });
  return res.json({ success: true, message: "Shift break deleted successfully" });
});

// WORK SCHEDULES and employee assignments
export const listSchedules = asyncHandler(async (req, res) => res.json({ success: true, ...await scheduleService.list(await companyId(req), req.query) }));
export const createSchedule = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await scheduleService.create(cid, createScheduleSchema.parse(req.body));
  await audit(req, "CREATE", "work_schedule", item.id, cid, { name: item.name });
  return res.status(201).json({ success: true, message: "Work schedule created successfully", data: item });
});
export const getSchedule = asyncHandler(async (req, res) => res.json({ success: true, data: await scheduleService.getById(await companyId(req), req.params.resourceId) }));
export const updateSchedule = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await scheduleService.update(cid, req.params.resourceId, updateScheduleSchema.parse(req.body));
  await audit(req, "UPDATE", "work_schedule", item.id, cid, { name: item.name });
  return res.json({ success: true, message: "Work schedule updated successfully", data: item });
});
export const replaceScheduleDays = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const { days } = replaceScheduleDaysSchema.parse(req.body); const item = await scheduleService.replaceDays(cid, req.params.resourceId, days);
  await audit(req, "UPDATE", "work_schedule_days", item.id, cid, { scheduleId: item.id, dayCount: days.length });
  return res.json({ success: true, message: "Schedule days updated successfully", data: item });
});
export const deleteSchedule = asyncHandler(async (req, res) => {
  const cid = await companyId(req); await scheduleService.remove(cid, req.params.resourceId);
  await audit(req, "DELETE", "work_schedule", req.params.resourceId, cid);
  return res.json({ success: true, message: "Work schedule deleted successfully" });
});
export const getEmployeeSchedules = asyncHandler(async (req, res) => res.json({ success: true, data: await scheduleService.getEmployeeSchedules(await companyId(req), req.params.employeeId) }));
export const assignEmployeeSchedule = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await scheduleService.assignToEmployee(cid, req.params.employeeId, assignScheduleSchema.parse(req.body));
  await audit(req, "UPDATE", "employee_schedule_assignment", item.id, cid, { employeeId: req.params.employeeId, scheduleId: req.body.scheduleId });
  return res.status(201).json({ success: true, message: "Work schedule assigned successfully", data: item });
});
export const getEmployeeShifts = asyncHandler(async (req, res) => res.json({ success: true, data: await scheduleService.getEmployeeShifts(await companyId(req), req.params.employeeId) }));
export const assignEmployeeShift = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await scheduleService.assignShiftToEmployee(cid, req.params.employeeId, assignShiftSchema.parse(req.body));
  await audit(req, "UPDATE", "employee_shift_assignment", item.id, cid, { employeeId: req.params.employeeId, shiftId: req.body.shiftId });
  return res.status(201).json({ success: true, message: "Shift assigned successfully", data: item });
});

// HOLIDAYS
export const listHolidays = asyncHandler(async (req, res) => res.json({ success: true, ...await holidayService.list(await companyId(req), req.query) }));
export const createHoliday = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await holidayService.create(cid, createHolidaySchema.parse(req.body));
  await audit(req, "CREATE", "holiday", item.id, cid, { name: item.name, holidayType: item.holidayType });
  return res.status(201).json({ success: true, message: "Holiday created successfully", data: item });
});
export const getHoliday = asyncHandler(async (req, res) => res.json({ success: true, data: await holidayService.getById(await companyId(req), req.params.resourceId) }));
export const updateHoliday = asyncHandler(async (req, res) => {
  const cid = await companyId(req); const item = await holidayService.update(cid, req.params.resourceId, updateHolidaySchema.parse(req.body));
  await audit(req, "UPDATE", "holiday", item.id, cid, { name: item.name, holidayType: item.holidayType });
  return res.json({ success: true, message: "Holiday updated successfully", data: item });
});
export const deleteHoliday = asyncHandler(async (req, res) => {
  const cid = await companyId(req); await holidayService.remove(cid, req.params.resourceId);
  await audit(req, "DELETE", "holiday", req.params.resourceId, cid);
  return res.json({ success: true, message: "Holiday deleted successfully" });
});

// Saved schedule periods used by the workforce calendar.
export const listGenerations = asyncHandler(async (req, res) => res.json({ success: true, ...await schedulingService.listGenerations(await companyId(req), parseGenerationQuery(req.query)) }));
export const getGeneration = asyncHandler(async (req, res) => res.json({ success: true, data: await schedulingService.getGeneration(await companyId(req), req.params.generationId) }));
