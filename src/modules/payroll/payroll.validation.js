import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.");

export const structureSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
});

export const structureUpdateSchema = structureSchema.partial();

export const componentSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .transform((value) => value.toUpperCase()),

    type: z.enum(["EARNING", "DEDUCTION"]),

    calculation: z.enum([
      "FIXED",
      "PERCENTAGE_OF_BASIC",
      "PERCENTAGE_OF_GROSS",
      "ATTENDANCE_DEDUCTION",
    ]),

    amount: z.coerce.number().min(0).default(0),

    percentage: z.coerce.number().min(0).max(100).optional(),

    isTaxable: z.boolean().default(false),

    isPensionable: z.boolean().default(false),

    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (
      value.calculation !== "FIXED" &&
      value.calculation !== "ATTENDANCE_DEDUCTION" &&
      value.percentage === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentage"],
        message: "Percentage is required.",
      });
    }
  });

export const employeeSalarySchema = z.object({
  employeeId: z.string().uuid(),
  structureId: z.string().uuid(),
  basicSalary: z.coerce.number().positive(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.optional(),
});

export const payrollPeriodSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    startDate: dateOnly,
    endDate: dateOnly,
    payDate: dateOnly.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before start date.",
      });
    }
  });

export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  search: z.string().trim().max(100).optional(),

  status: z.string().optional(),
});

export const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: result.error.flatten(),
      });
    }

    req[source] = result.data;

    next();
  };
};
