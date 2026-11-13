import { z } from "zod";

const positiveAmount = z.coerce.number().finite().min(1000, "Minimum wallet funding amount is NGN 1,000.").refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
  "Amount must have at most two decimal places"
);

export const initializePaymentSchema = z.object({
  amount: positiveAmount,
  email: z.string().trim().email(),
  purpose: z.literal("WALLET_FUNDING").default("WALLET_FUNDING"),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE", "MONNIFY"]),
  salaryAccount: z.enum(["PAYSTACK", "MONNIFY"]).default("PAYSTACK"),
  fundingDestination: z.enum(["EMS_INTERNAL_WALLET", "EXTERNAL_PROVIDER_PAYOUT"]).default("EMS_INTERNAL_WALLET"),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const verifyPaymentSchema = z.object({
  reference: z.string().trim().min(3).max(150),
  transactionId: z.union([z.string().trim().min(1), z.number().finite()]).optional().transform((value) => value == null ? undefined : String(value)),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE", "MONNIFY"]).optional(),
  status: z.enum(["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "REVERSED"]).optional(),
  purpose: z.literal("WALLET_FUNDING").optional(),
  search: z.string().trim().max(150).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const validateBody = (schema, body) => schema.parse(body);
export const validateQuery = (schema, query) => schema.parse(query);

export const createFlutterwaveSubaccountSchema = z.object({
  accountBank: z.string().trim().min(1).max(32),
  accountNumber: z.string().trim().regex(/^\d{8,20}$/, "Enter a valid bank account number."),
  businessMobile: z.string().trim().regex(/^\+?[0-9]{8,15}$/, "Enter a valid business phone number with country code where needed."),
});

export const setFlutterwaveSubaccountSchema = z.object({
  subaccountId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9_-]+$/, "Enter a valid Flutterwave subaccount ID."),
});
