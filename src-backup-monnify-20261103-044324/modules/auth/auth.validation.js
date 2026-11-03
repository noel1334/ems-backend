import { z } from "zod";

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

const emailSchema = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255)
    .transform((value) => value.toLowerCase());

export const registerCompanySchema = z.object({
    company: z.object({
        name: z
            .string()
            .trim()
            .min(2)
            .max(150),

        legalName: z
            .string()
            .trim()
            .max(200)
            .optional()
            .nullable(),

        slug: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .regex(
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                "Slug may contain lowercase letters, numbers and hyphens only"
            ),

        email: emailSchema,

        phone: z
            .string()
            .trim()
            .max(30)
            .optional()
            .nullable(),

        address: z
            .string()
            .trim()
            .max(255)
            .optional()
            .nullable(),

        city: z
            .string()
            .trim()
            .max(100)
            .optional()
            .nullable(),

        state: z
            .string()
            .trim()
            .max(100)
            .optional()
            .nullable(),

        country: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .default("Nigeria"),

        timezone: z
            .string()
            .trim()
            .min(1)
            .default("Africa/Lagos"),

        currency: z
            .string()
            .trim()
            .length(3)
            .transform((value) =>
                value.toUpperCase()
            )
            .default("NGN")
    }),

    admin: z.object({
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

        email: emailSchema,

        phone: z
            .string()
            .trim()
            .max(30)
            .optional()
            .nullable(),

        password: passwordSchema
    })
});

export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetSchema = z.object({ token: z.string().min(32).max(256), password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: passwordSchema, newPassword: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(32).max(256) });
