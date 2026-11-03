import { z } from "zod";

const optionalText = (max = 255) =>
    z
        .string()
        .trim()
        .max(max)
        .optional()
        .nullable();

export const createDesignationSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Designation name must contain at least 2 characters")
        .max(150),

    code: z
        .string()
        .trim()
        .min(2, "Designation code must contain at least 2 characters")
        .max(30)
        .regex(
            /^[A-Za-z0-9_-]+$/,
            "Designation code may only contain letters, numbers, underscores and hyphens"
        ),

    departmentId: z
        .string()
        .uuid("Invalid department ID")
        .optional()
        .nullable(),

    description: optionalText(500)
});

export const updateDesignationSchema = z
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
                "Designation code may only contain letters, numbers, underscores and hyphens"
            )
            .optional(),

        departmentId: z
            .string()
            .uuid("Invalid department ID")
            .optional()
            .nullable(),

        description: optionalText(500),

        isActive: z.boolean().optional()
    })
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one field must be provided"
    );

export const designationListQuerySchema = z.object({
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

    departmentId: z
        .string()
        .uuid("Invalid department ID")
        .optional(),

    isActive: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional()
});