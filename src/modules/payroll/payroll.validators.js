import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.");

const componentFields = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  type: z.enum(["EARNING", "DEDUCTION"]),
  calculation: z.enum([
    "FIXED",
    "PERCENTAGE_OF_BASIC",
    "PERCENTAGE_OF_GROSS",
    "ATTENDANCE_DEDUCTION",
  ]),
  amount: z.coerce.number().min(0).default(0),
  percentage: z.union([z.null(), z.coerce.number().min(0).max(100)]).optional(),
  isTaxable: z.boolean().default(false),
  isPensionable: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const createComponentFields = componentFields.superRefine((value, ctx) => {
  if (
    value.calculation !== "FIXED" &&
    value.calculation !== "ATTENDANCE_DEDUCTION" &&
    (value.percentage === undefined || value.percentage === null)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["percentage"],
      message: "Percentage is required for percentage-based components.",
    });
  }
});

export const componentSchema = createComponentFields;

export const componentUpdateSchema = componentFields.partial().superRefine((value, ctx) => {
  if (
    value.calculation !== undefined &&
    value.calculation !== "FIXED" &&
    value.calculation !== "ATTENDANCE_DEDUCTION" &&
    (value.percentage === undefined || value.percentage === null)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["percentage"],
      message: "Provide a percentage when changing to a percentage-based calculation.",
    });
  }
});

const structureFields = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});

export const structureSchema = structureFields.extend({
  // Optional nested components are created in the same database operation as the structure.
  components: z.array(createComponentFields).max(50).optional().default([]),
}).superRefine((value, ctx) => {
  const codes = value.components.map((item) => item.code.toUpperCase());
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicates.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["components"],
      message: `Component codes must be unique within a structure: ${[...new Set(duplicates)].join(", ")}`,
    });
  }
});

export const structureUpdateSchema = structureFields.partial();

export const salaryComponentOverrideSchema = z.object({
  amount: z.coerce.number().min(0).optional(),
  percentage: z.coerce.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const employeeSalarySchema = z.object({
  employeeId: z.string().uuid(),
  structureId: z.string().uuid(),
  basicSalary: z.coerce.number().positive(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.optional(),
  componentOverrides: z.record(z.string(), salaryComponentOverrideSchema).optional().default({}),
}).superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "Effective-to date cannot be before effective-from date." });
  }
});

export const salaryListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  employeeId: z.string().uuid().optional(),
  structureId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

export const salaryStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const payrollPeriodSchema = z.object({
  name: z.string().trim().min(2).max(100),
  startDate: dateOnly,
  endDate: dateOnly,
  payDate: dateOnly.optional(),
}).superRefine((value, ctx) => {
  if (value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date cannot be before start date." });
  }
});

export const payrollPayoutExecutionSchema = z.object({
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  // Explicit second-step confirmation is required even for API callers.
  confirm: z.literal(true),
});

export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.string().optional(),
});

export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: result.error.flatten(),
    });
  }
  // Express 5 exposes req.query through a getter without a setter.
  // Store validated query values separately; body and params remain assignable.
  if (source === "query") {
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};
