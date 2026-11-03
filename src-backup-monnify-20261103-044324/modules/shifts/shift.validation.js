import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createShiftSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Shift name must contain at least 2 characters")
        .max(100),

    code: z
        .string()
        .trim()
        .min(2, "Shift code must contain at least 2 characters")
        .max(30)
        .regex(
            /^[A-Za-z0-9_-]+$/,
            "Shift code can only contain letters, numbers, hyphens and underscores"
        ),

    description: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable(),

    startTime: z
        .string()
        .regex(timeRegex, "Start time must use HH:mm format"),

    endTime: z
        .string()
        .regex(timeRegex, "End time must use HH:mm format"),

    isOvernight: z.boolean().default(false),

    hasBreak: z.boolean().default(false),

    isActive: z.boolean().default(true),
});

export const updateShiftSchema = createShiftSchema.partial();

export const createBreakSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Break name must contain at least 2 characters")
        .max(100),

    startTime: z
        .string()
        .regex(timeRegex, "Break start time must use HH:mm format"),

    endTime: z
        .string()
        .regex(timeRegex, "Break end time must use HH:mm format"),

    durationMinutes: z
        .number()
        .int()
        .positive()
        .max(1440)
        .optional()
        .nullable(),

    isPaid: z.boolean().default(false),

    isActive: z.boolean().default(true),
});

export const updateBreakSchema = createBreakSchema.partial();