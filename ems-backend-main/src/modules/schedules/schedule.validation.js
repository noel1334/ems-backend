import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const daySchema = z.object({
    dayOfWeek: z.enum([
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
    ]),

    isWorkingDay: z.boolean().default(true),

    shiftId: z
        .string()
        .uuid()
        .optional()
        .nullable(),

    startTime: z
        .string()
        .regex(timeRegex)
        .optional()
        .nullable(),

    endTime: z
        .string()
        .regex(timeRegex)
        .optional()
        .nullable(),

    isOvernight: z.boolean().default(false),
});

export const createScheduleSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2)
        .max(100),

    code: z
        .string()
        .trim()
        .min(2)
        .max(30)
        .regex(
            /^[A-Za-z0-9_-]+$/,
            "Schedule code can only contain letters, numbers, hyphens and underscores"
        ),

    description: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable(),

    isDefault: z.boolean().default(false),

    isActive: z.boolean().default(true),

    days: z
        .array(daySchema)
        .max(7)
        .optional()
        .default([]),
});

export const updateScheduleSchema =
    createScheduleSchema.partial();

export const replaceScheduleDaysSchema =
    z.object({
        days: z
            .array(daySchema)
            .max(7)
            .min(1),
    });

export const assignScheduleSchema = z.object({
    scheduleId: z.string().uuid(),

    effectiveFrom: z.coerce.date(),

    effectiveTo: z
        .coerce
        .date()
        .optional()
        .nullable(),

    isPrimary: z.boolean().default(true),

    isActive: z.boolean().default(true),
});