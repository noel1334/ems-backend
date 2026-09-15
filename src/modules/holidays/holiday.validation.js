import { z } from "zod";

export const createHolidaySchema = z.object({
    name: z
        .string()
        .trim()
        .min(2)
        .max(150),

    description: z
        .string()
        .trim()
        .max(500)
        .optional()
        .nullable(),

    date: z.coerce.date(),

    holidayType: z
        .enum([
            "PUBLIC",
            "COMPANY",
            "OPTIONAL",
            "RELIGIOUS",
            "OTHER",
        ])
        .default("COMPANY"),

    isRecurring: z.boolean().default(false),

    isActive: z.boolean().default(true),
});

export const updateHolidaySchema =
    createHolidaySchema.partial();