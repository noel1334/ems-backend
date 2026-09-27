import { z } from "zod";

export const createRoleSchema =
    z.object({
        name: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .regex(
                /^[A-Za-z0-9 _-]+$/,
                "Role name contains invalid characters"
            ),

        description: z
            .string()
            .trim()
            .max(500)
            .optional()
            .nullable(),

        permissionIds: z
            .array(z.string().uuid())
            .max(100)
            .optional()
            .default([])
    });

export const updateRoleSchema =
    z
        .object({
            name: z
                .string()
                .trim()
                .min(2)
                .max(100)
                .regex(
                    /^[A-Za-z0-9 _-]+$/,
                    "Role name contains invalid characters"
                )
                .optional(),

            description: z
                .string()
                .trim()
                .max(500)
                .optional()
                .nullable(),

            isActive: z
                .boolean()
                .optional(),

            permissionIds: z
                .array(z.string().uuid())
                .max(100)
                .optional()
        })
        .refine(
            (value) =>
                Object.keys(value).length > 0,
            {
                message:
                    "At least one field is required"
            }
        );

export const roleListQuerySchema =
    z.object({
        page: z.coerce
            .number()
            .int()
            .min(1)
            .default(1),

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

        scope: z
            .enum([
                "SYSTEM",
                "COMPANY"
            ])
            .optional()
    });