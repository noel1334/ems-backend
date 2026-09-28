import { z } from "zod";

const dateOnly = z.coerce.date();

const jsonArray = z.array(
    z.union([
        z.string(),
        z.number(),
        z.boolean()
    ])
);

const policyFields = {
    name: z
        .string()
        .trim()
        .min(2)
        .max(120),

    departmentId: z
        .string()
        .uuid()
        .nullable()
        .optional(),

    mode: z
        .enum([
            "FIXED",
            "SHIFT_ROTATION",
            "FLEXIBLE"
        ])
        .default("FIXED"),

    shiftEnabled: z
        .boolean()
        .default(false),

    rotationEnabled: z
        .boolean()
        .default(false),

    rotationDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .nullable()
        .optional(),

    leaveSchedulingMode: z
        .enum([
            "MANUAL",
            "AUTOMATIC",
            "AUTOMATIC_APPROVAL"
        ])
        .default("MANUAL"),

    leaveDurationDays: z
        .number()
        .int()
        .min(0)
        .max(365)
        .default(0),

    leaveCycleAfterDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .nullable()
        .optional(),

    maxLeavePercent: z
        .number()
        .min(0)
        .max(100)
        .nullable()
        .optional(),

    minStaffingPercent: z
        .number()
        .min(0)
        .max(100)
        .nullable()
        .optional(),

    minStaffingCount: z
        .number()
        .int()
        .min(0)
        .nullable()
        .optional(),

    preferredLeaveDays: jsonArray
        .nullable()
        .optional(),

    blockedDates: jsonArray
        .nullable()
        .optional(),

    preferredLeaveDates: jsonArray
        .nullable()
        .optional(),

    shiftIds: z
        .array(z.string().uuid())
        .nullable()
        .optional(),

    workingDays: z
        .array(
            z.number()
                .int()
                .min(0)
                .max(6)
        )
        .nullable()
        .optional(),

    autoApproveLeave: z
        .boolean()
        .default(false),

    preventConsecutiveNightShifts: z
        .boolean()
        .default(false),

    isActive: z
        .boolean()
        .default(true)
};

const policyBaseSchema = z.object(policyFields);

const validatePolicy = (v, ctx) => {
    if (
        v.rotationEnabled &&
        !v.rotationDays
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["rotationDays"],
            message:
                "rotationDays is required when rotation is enabled"
        });
    }

    if (
        v.leaveSchedulingMode !== "MANUAL" &&
        v.leaveDurationDays < 1
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["leaveDurationDays"],
            message:
                "leaveDurationDays must be greater than zero for automatic leave"
        });
    }

    if (
        v.shiftEnabled &&
        v.mode === "FIXED"
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["mode"],
            message:
                "Use SHIFT_ROTATION or FLEXIBLE when shift scheduling is enabled"
        });
    }
};

export const policySchema =
    policyBaseSchema.superRefine(
        validatePolicy
    );

const policyUpdateBaseSchema =
    policyBaseSchema.partial();

export const policyUpdateSchema =
    policyUpdateBaseSchema.superRefine(
        (v, ctx) => {
            /*
             * Only validate cross-field rules when
             * the relevant fields are actually supplied
             * during an update.
             */

            if (
                v.rotationEnabled === true &&
                !v.rotationDays
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["rotationDays"],
                    message:
                        "rotationDays is required when rotation is enabled"
                });
            }

            if (
                v.leaveSchedulingMode !== undefined &&
                v.leaveSchedulingMode !== "MANUAL" &&
                v.leaveDurationDays !== undefined &&
                v.leaveDurationDays < 1
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["leaveDurationDays"],
                    message:
                        "leaveDurationDays must be greater than zero for automatic leave"
                });
            }

            if (
                v.shiftEnabled === true &&
                v.mode === "FIXED"
            ) {
                ctx.addIssue({
                    code: "custom",
                    path: ["mode"],
                    message:
                        "Use SHIFT_ROTATION or FLEXIBLE when shift scheduling is enabled"
                });
            }
        }
    );

export const generateSchema =
    z.object({
        policyId: z
            .string()
            .uuid(),

        startDate: dateOnly,

        endDate: dateOnly,

        publish: z
            .boolean()
            .default(false)
    }).superRefine((v, ctx) => {
        if (
            v.endDate < v.startDate
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["endDate"],
                message:
                    "endDate must be on or after startDate"
            });
        }
    });

export const generationListSchema =
    z.object({
        page: z
            .coerce
            .number()
            .int()
            .min(1)
            .default(1),

        limit: z
            .coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20),

        status: z
            .enum([
                "DRAFT",
                "APPROVED",
                "PUBLISHED",
                "CANCELLED"
            ])
            .optional(),

        policyId: z
            .string()
            .uuid()
            .optional()
    });
