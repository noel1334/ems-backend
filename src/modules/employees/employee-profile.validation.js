import { z } from "zod";

const dateSchema = z.coerce.date();

export const createBankAccountSchema = z.object({
    bankName: z
        .string()
        .trim()
        .min(2)
        .max(150),

    accountName: z
        .string()
        .trim()
        .min(2)
        .max(150),

    accountNumber: z
        .string()
        .trim()
        .min(6)
        .max(30),

    accountType: z
        .string()
        .trim()
        .max(50)
        .optional()
        .nullable(),

    isPrimary: z
        .boolean()
        .default(true),

    isActive: z
        .boolean()
        .default(true)
});

export const updateBankAccountSchema = z
    .object({
        bankName: z
            .string()
            .trim()
            .min(2)
            .max(150)
            .optional(),

        accountName: z
            .string()
            .trim()
            .min(2)
            .max(150)
            .optional(),

        accountNumber: z
            .string()
            .trim()
            .min(6)
            .max(30)
            .optional(),

        accountType: z
            .string()
            .trim()
            .max(50)
            .optional()
            .nullable(),

        isPrimary: z
            .boolean()
            .optional(),

        isActive: z
            .boolean()
            .optional()
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: "At least one field is required"
        }
    );

export const createEducationSchema = z.object({
    institution: z
        .string()
        .trim()
        .min(2)
        .max(200),

    qualification: z
        .string()
        .trim()
        .min(2)
        .max(150),

    fieldOfStudy: z
        .string()
        .trim()
        .max(150)
        .optional()
        .nullable(),

    startDate: dateSchema
        .optional()
        .nullable(),

    endDate: dateSchema
        .optional()
        .nullable(),

    grade: z
        .string()
        .trim()
        .max(100)
        .optional()
        .nullable(),

    description: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .nullable()
});

export const updateEducationSchema = createEducationSchema
    .partial()
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: "At least one field is required"
        }
    );

export const createExperienceSchema = z.object({
    companyName: z
        .string()
        .trim()
        .min(2)
        .max(200),

    jobTitle: z
        .string()
        .trim()
        .max(150)
        .optional()
        .nullable(),

    employmentType: z
        .string()
        .trim()
        .max(100)
        .optional()
        .nullable(),

    startDate: dateSchema
        .optional()
        .nullable(),

    endDate: dateSchema
        .optional()
        .nullable(),

    responsibilities: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .nullable(),

    reasonForLeaving: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .nullable()
});

export const updateExperienceSchema =
    createExperienceSchema
        .partial()
        .refine(
            (data) => Object.keys(data).length > 0,
            {
                message: "At least one field is required"
            }
        );

export const createDocumentSchema = z.object({
    documentType: z.enum([
        "PASSPORT",
        "NATIONAL_ID",
        "DRIVERS_LICENSE",
        "VOTERS_CARD",
        "CERTIFICATE",
        "CONTRACT",
        "OFFER_LETTER",
        "RESUME",
        "OTHER"
    ]),

    title: z
        .string()
        .trim()
        .min(2)
        .max(200),

    expiresAt: dateSchema
        .optional()
        .nullable()
});