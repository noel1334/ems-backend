import { z } from "zod";

const emailSchema = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255)
    .transform((value) =>
        value.toLowerCase()
    );

const passwordSchema = z
    .string()
    .min(
        8,
        "Password must contain at least 8 characters"
    )
    .max(
        128,
        "Password cannot exceed 128 characters"
    );

export const createUserSchema =
    z.object({
        email: emailSchema,

        password: passwordSchema,

        firstName: z
            .string()
            .trim()
            .min(2)
            .max(100),

        lastName: z
            .string()
            .trim()
            .min(2)
            .max(100),

        middleName: z
            .string()
            .trim()
            .max(100)
            .optional()
            .nullable(),

        phone: z
            .string()
            .trim()
            .max(30)
            .optional()
            .nullable(),

        avatarUrl: z
            .string()
            .trim()
            .url()
            .max(500)
            .optional()
            .nullable(),

        roleIds: z
            .array(z.string().uuid())
            .max(20)
            .optional()
            .default([])
    });

export const updateUserSchema =
    z
        .object({
            firstName: z
                .string()
                .trim()
                .min(2)
                .max(100)
                .optional(),

            lastName: z
                .string()
                .trim()
                .min(2)
                .max(100)
                .optional(),

            middleName: z
                .string()
                .trim()
                .max(100)
                .optional()
                .nullable(),

            phone: z
                .string()
                .trim()
                .max(30)
                .optional()
                .nullable(),

            avatarUrl: z
                .string()
                .trim()
                .url()
                .max(500)
                .optional()
                .nullable(),

            status: z
                .enum([
                    "ACTIVE",
                    "INACTIVE",
                    "SUSPENDED"
                ])
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

export const assignRolesSchema =
    z.object({
        roleIds: z
            .array(z.string().uuid())
            .min(
                1,
                "At least one role is required"
            )
            .max(20)
    });

export const userListQuerySchema =
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

        status: z
            .enum([
                "ACTIVE",
                "INACTIVE",
                "SUSPENDED",
                "LOCKED"
            ])
            .optional()
    });