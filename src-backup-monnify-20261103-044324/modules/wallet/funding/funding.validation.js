import { z } from "zod";

export const initializeFundingSchema = z.object({
  amount: z.coerce.number().finite().min(1000, "Minimum wallet funding amount is NGN 1,000.").refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
    "Amount must have at most two decimal places",
  ),
  email: z.string().email(),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  callbackUrl: z.string().url().optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verifyFundingSchema = z.object({ reference: z.string().trim().min(3).max(150), transactionId: z.union([z.string(), z.number()]).optional().transform((value) => value == null ? undefined : String(value)) });
