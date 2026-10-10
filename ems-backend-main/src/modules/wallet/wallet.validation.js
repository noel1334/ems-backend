import { z } from "zod";

const positiveAmount = z
  .union([z.string(), z.number()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), {
    message: "Amount must be a valid number.",
  })
  .refine((value) => value > 0, {
    message: "Amount must be greater than zero.",
  });

export const creditWalletSchema = z.object({
  amount: positiveAmount,

  description: z.string().trim().max(500).optional(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const debitWalletSchema = z.object({
  amount: positiveAmount,

  description: z.string().trim().max(500).optional(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const walletTransactionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),

  limit: z.coerce.number().int().positive().max(100).default(20),

  type: z.enum(["CREDIT", "DEBIT"]).optional(),

  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REVERSED"]).optional(),

  search: z.string().trim().max(100).optional(),

  startDate: z.string().datetime().optional(),

  endDate: z.string().datetime().optional(),
});

export const validateWalletBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: result.error.flatten(),
      });
    }

    req.body = result.data;

    next();
  };
};

export const validateWalletQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters.",
        errors: result.error.flatten(),
      });
    }

    req.query = result.data;

    next();
  };
};
 