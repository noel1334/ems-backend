import { describe, expect, it } from "vitest";
import { initializePaymentSchema, verifyPaymentSchema } from "../../src/modules/payments/payment.validation.js";
import { initializeFundingSchema, verifyFundingSchema } from "../../src/modules/wallet/funding/funding.validation.js";
import { validateWalletQuery, walletTransactionQuerySchema } from "../../src/modules/wallet/wallet.validation.js";

describe("company wallet funding validation", () => {
  it("accepts a minimum NGN funding request with a hosted checkout callback", () => {
    const result = initializeFundingSchema.parse({
      amount: "1000.00",
      email: "finance@example.com",
      provider: "PAYSTACK",
      callbackUrl: "https://ems.example/app/wallet",
      idempotencyKey: "wallet-funding-123456",
    });
    expect(result.amount).toBe(1000);
    expect(result.provider).toBe("PAYSTACK");
  });

  it("rejects funding below NGN 1,000", () => {
    expect(initializeFundingSchema.safeParse({ amount: 999, email: "finance@example.com", provider: "PAYSTACK" }).success).toBe(false);
    expect(initializePaymentSchema.safeParse({ amount: 999, email: "finance@example.com", provider: "PAYSTACK" }).success).toBe(false);
  });

  it("rejects payment amounts with more than two decimal places", () => {
    expect(initializePaymentSchema.safeParse({ amount: 1000.001, email: "finance@example.com", provider: "PAYSTACK" }).success).toBe(false);
  });

  it("allows Flutterwave's returned transaction ID to pass through verification", () => {
    expect(verifyPaymentSchema.parse({ reference: "PAY-12345", transactionId: 123456 }).transactionId).toBe("123456");
    expect(verifyFundingSchema.parse({ reference: "PAY-12345", transactionId: "123456" }).transactionId).toBe("123456");
  });

  it("stores validated wallet queries without assigning to Express 5's read-only req.query", () => {
    const req = {};
    Object.defineProperty(req, "query", { get: () => ({ page: "2", limit: "15", type: "CREDIT" }) });
    let called = false;
    const res = { status() { return this; }, json() { throw new Error("Valid wallet query should not error"); } };
    validateWalletQuery(walletTransactionQuerySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.validatedQuery.page).toBe(2);
    expect(req.validatedQuery.limit).toBe(15);
    expect(req.validatedQuery.type).toBe("CREDIT");
  });
});
