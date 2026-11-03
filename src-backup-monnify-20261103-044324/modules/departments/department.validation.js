import { z } from "zod";

const optionalText = (max = 255) =>
    z
        .string()
        .trim()
        .max(max)
        .optional()
        .nullable();

export const createDepartmentSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Department name must contain at least 2 characters")
        .max(150, "Department name cannot exceed 150 characters"),

    code: z
        .string()
        .trim()
        .min(2, "Department code must contain at least 2 characters")
        .max(30, "Department code cannot exceed 30 characters")
        .regex(
            /^[A-Za-z0-9_-]+$/,
            "Department code may only contain letters, numbers, underscores and hyphens"
        ),

    description: optionalText(500)
});

export const updateDepartmentSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2)
            .max(150)
            .optional(),

        code: z
            .string()
            .trim()
            .min(2)
            .max(30)
            .regex(
                /^[A-Za-z0-9_-]+$/,
                "Department code may only contain letters, numbers, underscores and hyphens"
            )
            .optional(),

        description: optionalText(500),

        isActive: z.boolean().optional()
    })
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one field must be provided"
    );

export const departmentIdSchema = z.object({
    id: z.string().uuid("Invalid department ID")
});

export const departmentListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20),

    search: z
        .string()
        .trim()
        .max(100)
        .optional(),

    isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional()
});