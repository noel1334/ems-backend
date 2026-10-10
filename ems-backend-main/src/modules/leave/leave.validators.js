import { z } from "zod";

const passthrough = z.object({}).passthrough();
export const leaveTypeCreateSchema = passthrough;
export const leaveTypeUpdateSchema = passthrough;
export const leaveRequestCreateSchema = passthrough;
export const leaveRequestUpdateSchema = passthrough;
export const approvalSchema = passthrough;
export const rejectionSchema = passthrough;
export const balanceInitializeSchema = passthrough;
export const balanceAdjustmentSchema = passthrough;
export const typeListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).passthrough();
export const balanceListSchema = typeListSchema;
export const requestListSchema = typeListSchema;
