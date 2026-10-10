import { z } from "zod";

export const initializeFundingSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  email: z.string().email(),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verifyFundingSchema = z.object({ reference: z.string().min(3).max(150) });
