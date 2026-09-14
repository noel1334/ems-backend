// src/modules/attendance/attendance.validation.js

import { z } from "zod";

const uuidSchema = z.string().uuid();

const dateSchema = z.coerce.date();

export const employeeIdParamSchema = z.object({
    employeeId: uuidSchema,
});

export const attendanceIdParamSchema = z.object({
    id: uuidSchema,
});

export const listAttendanceSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),

    employeeId: uuidSchema.optional(),

    status: z
        .enum([
            "PRESENT",
            "LATE",
            "ABSENT",
            "HALF_DAY",
            "ON_LEAVE",
            "HOLIDAY",
            "REST_DAY",
            "INCOMPLETE",
            "CORRECTED",
        ])
        .optional(),

    approvalStatus: z
        .enum(["PENDING", "APPROVED", "REJECTED"])
        .optional(),

    from: dateSchema.optional(),
    to: dateSchema.optional(),

    search: z.string().trim().max(100).optional(),

    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const checkInSchema = z.object({
    employeeId: uuidSchema.optional(),

    occurredAt: dateSchema.optional(),

    source: z
        .enum([
            "WEB",
            "MOBILE",
            "ADMIN",
            "HR",
            "TERMINAL",
            "BIOMETRIC",
            "SYSTEM",
        ])
        .default("WEB"),

    deviceId: z.string().trim().max(255).optional(),

    latitude: z.number().min(-90).max(90).optional(),

    longitude: z.number().min(-180).max(180).optional(),

    notes: z.string().trim().max(1000).optional(),
});

export const checkOutSchema = z.object({
    employeeId: uuidSchema.optional(),

    occurredAt: dateSchema.optional(),

    source: z
        .enum([
            "WEB",
            "MOBILE",
            "ADMIN",
            "HR",
            "TERMINAL",
            "BIOMETRIC",
            "SYSTEM",
        ])
        .default("WEB"),

    deviceId: z.string().trim().max(255).optional(),

    latitude: z.number().min(-90).max(90).optional(),

    longitude: z.number().min(-180).max(180).optional(),

    notes: z.string().trim().max(1000).optional(),
});

export const breakStartSchema = z.object({
    breakName: z.string().trim().max(100).optional(),

    occurredAt: dateSchema.optional(),

    source: z
        .enum([
            "WEB",
            "MOBILE",
            "ADMIN",
            "HR",
            "TERMINAL",
            "BIOMETRIC",
            "SYSTEM",
        ])
        .default("WEB"),
});

export const breakEndSchema = z.object({
    occurredAt: dateSchema.optional(),

    source: z
        .enum([
            "WEB",
            "MOBILE",
            "ADMIN",
            "HR",
            "TERMINAL",
            "BIOMETRIC",
            "SYSTEM",
        ])
        .default("WEB"),
});

export const correctionSchema = z.object({
    checkInAt: dateSchema.nullable().optional(),

    checkOutAt: dateSchema.nullable().optional(),

    status: z
        .enum([
            "PRESENT",
            "LATE",
            "ABSENT",
            "HALF_DAY",
            "ON_LEAVE",
            "HOLIDAY",
            "REST_DAY",
            "INCOMPLETE",
            "CORRECTED",
        ])
        .optional(),

    notes: z.string().trim().max(2000).optional(),

    reason: z.string().trim().min(3).max(1000),
});

export const approvalSchema = z.object({
    approved: z.boolean(),

    notes: z.string().trim().max(1000).optional(),
});

export const attendanceReportSchema = z.object({
    from: dateSchema,
    to: dateSchema,

    employeeId: uuidSchema.optional(),

    departmentId: uuidSchema.optional(),

    status: z
        .enum([
            "PRESENT",
            "LATE",
            "ABSENT",
            "HALF_DAY",
            "ON_LEAVE",
            "HOLIDAY",
            "REST_DAY",
            "INCOMPLETE",
            "CORRECTED",
        ])
        .optional(),
});