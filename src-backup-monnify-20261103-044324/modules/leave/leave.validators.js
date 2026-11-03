import { z } from "zod";

const passthrough = z.object({}).passthrough();
const nonNegative = z.coerce.number().finite().min(0);
const leaveTypeFields = {
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Code can contain letters, numbers, hyphens and underscores"),
  annualEntitlement: nonNegative.default(0),
  minNoticeDays: z.coerce.number().int().min(0).max(365).default(0),
  maxConsecutiveDays: z.union([z.coerce.number().int().min(1).max(366), z.null()]).default(null),
  requiresReason: z.boolean().default(false),
  allowHalfDay: z.boolean().default(true),
  carryForwardAllowed: z.boolean().default(false),
  maxCarryForward: nonNegative.default(0),
  requiresApproval: z.boolean().default(true),
  approvalLevels: z.coerce.number().int().min(1).max(5).default(1),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
};
export const leaveTypeCreateSchema = z.object(leaveTypeFields);
export const leaveTypeUpdateSchema = z.object(leaveTypeFields).partial();
export const leaveRequestCreateSchema = passthrough;
export const leaveRequestUpdateSchema = passthrough;
export const approvalSchema = passthrough;
export const rejectionSchema = passthrough;
export const balanceInitializeSchema = passthrough;
export const balanceAdjustmentSchema = passthrough;
const queryBoolean = z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional();
export const typeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  isActive: queryBoolean,
}).passthrough();
export const balanceListSchema = typeListSchema;
export const requestListSchema = typeListSchema;
