import { z } from "zod";

const positiveAmount = z
  .union([z.string(), z.number()])
  .transform(Number)
  .refine((value) => Number.isFinite(value) && value > 0, {
    message: "Amount must be greater than zero",
  });

export const initializePaymentSchema = z.object({
  amount: positiveAmount,

  email: z.string().trim().email(),

  purpose: z.enum(["WALLET_FUNDING", "SUBSCRIPTION"]).default("WALLET_FUNDING"),

  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),

  callbackUrl: z.string().url().optional(),

  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verifyPaymentSchema = z.object({
  reference: z.string().trim().min(3).max(150),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]).optional(),

  status: z
    .enum(["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "REVERSED"])
    .optional(),

  purpose: z.enum(["WALLET_FUNDING", "SUBSCRIPTION"]).optional(),

  search: z.string().trim().max(150).optional(),

  startDate: z.coerce.date().optional(),

  endDate: z.coerce.date().optional(),
});

export const validateBody = (schema, body) => {
  const result = schema.safeParse(body);

  if (!result.success) {
    const error = new Error("Validation failed");

    error.statusCode = 400;
    error.details = result.error.flatten();

    throw error;
  }

  return result.data;
};

export const validateQuery = (schema, query) => {
  const result = schema.safeParse(query);

  if (!result.success) {
    const error = new Error("Validation failed");

    error.statusCode = 400;
    error.details = result.error.flatten();

    throw error;
  }

  return result.data;
};
