import { z } from "zod";

const optionalString = z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable();

const emailSchema = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255)
    .transform((value) => value.toLowerCase());

const dateSchema = z.coerce.date();

export const createEmployeeSchema = z.object({
    firstName: z
        .string()
        .trim()
        .min(2, "First name must contain at least 2 characters")
        .max(100),

    middleName: z
        .string()
        .trim()
        .max(100)
        .optional()
        .nullable(),

    lastName: z
        .string()
        .trim()
        .min(2, "Last name must contain at least 2 characters")
        .max(100),

    email: emailSchema.optional().nullable(),

    phone: z
        .string()
        .trim()
        .max(30)
        .optional()
        .nullable(),

    gender: z
        .enum(["MALE", "FEMALE", "OTHER"])
        .optional()
        .nullable(),

    dateOfBirth: dateSchema.optional().nullable(),

    address: optionalString,

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

    jobTitle: z
        .string()
        .trim()
        .max(150)
        .optional()
        .nullable(),

    employeeType: z
        .enum([
            "FULL_TIME",
            "PART_TIME",
            "CONTRACT",
            "INTERN",
            "TEMPORARY"
        ])
        .default("FULL_TIME"),

    employmentStatus: z
        .enum([
            "ACTIVE",
            "INACTIVE",
            "SUSPENDED",
            "TERMINATED",
            "ON_LEAVE"
        ])
        .default("ACTIVE"),

    hireDate: dateSchema,

    terminationDate: dateSchema.optional().nullable(),

    departmentId: z
        .string()
        .uuid()
        .optional()
        .nullable(),

    designationId: z
        .string()
        .uuid()
        .optional()
        .nullable(),

    managerId: z
        .string()
        .uuid()
        .optional()
        .nullable()
});

export const updateEmployeeSchema = z
    .object({
        firstName: z
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

        lastName: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .optional(),

        email: emailSchema.optional().nullable(),

        phone: z
            .string()
            .trim()
            .max(30)
            .optional()
            .nullable(),

        gender: z
            .enum(["MALE", "FEMALE", "OTHER"])
            .optional()
            .nullable(),

        dateOfBirth: dateSchema.optional().nullable(),

        address: optionalString,

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
            .optional(),

        jobTitle: z
            .string()
            .trim()
            .max(150)
            .optional()
            .nullable(),

        employeeType: z
            .enum([
                "FULL_TIME",
                "PART_TIME",
                "CONTRACT",
                "INTERN",
                "TEMPORARY"
            ])
            .optional(),

        employmentStatus: z
            .enum([
                "ACTIVE",
                "INACTIVE",
                "SUSPENDED",
                "TERMINATED",
                "ON_LEAVE"
            ])
            .optional(),

        hireDate: dateSchema.optional(),

        terminationDate: dateSchema.optional().nullable(),

        departmentId: z
            .string()
            .uuid()
            .optional()
            .nullable(),

        designationId: z
            .string()
            .uuid()
            .optional()
            .nullable(),

        managerId: z
            .string()
            .uuid()
            .optional()
            .nullable()
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: "At least one field is required"
        }
    );

export const employeeListSchema = z.object({
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

    departmentId: z
        .string()
        .uuid()
        .optional(),

    designationId: z
        .string()
        .uuid()
        .optional(),

    employeeType: z
        .enum([
            "FULL_TIME",
            "PART_TIME",
            "CONTRACT",
            "INTERN",
            "TEMPORARY"
        ])
        .optional(),

    employmentStatus: z
        .enum([
            "ACTIVE",
            "INACTIVE",
            "SUSPENDED",
            "TERMINATED",
            "ON_LEAVE"
        ])
        .optional()
});