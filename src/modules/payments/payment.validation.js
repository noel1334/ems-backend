import { z } from "zod";

const positiveAmount = z.coerce.number().finite().positive().refine(
  (value) => Number.isInteger(Math.round(value * 100)),
  "Amount must have at most two decimal places"
);

export const initializePaymentSchema = z.object({
  amount: positiveAmount,
  email: z.string().trim().email(),
  purpose: z.literal("WALLET_FUNDING").default("WALLET_FUNDING"),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const verifyPaymentSchema = z.object({
  reference: z.string().trim().min(3).max(150),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]).optional(),
  status: z.enum(["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "REVERSED"]).optional(),
  purpose: z.literal("WALLET_FUNDING").optional(),
  search: z.string().trim().max(150).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const validateBody = (schema, body) => schema.parse(body);
export const validateQuery = (schema, query) => schema.parse(query);
