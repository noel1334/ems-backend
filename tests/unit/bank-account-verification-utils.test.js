import { describe, expect, it } from "vitest";
import { normalizeProviderBalanceNgn, normalizeResolvedBankAccount } from "../../src/modules/payments/bank-account-verification.utils.js";

describe("bank-account verification and payout balance normalization", () => {
  it("normalizes a Paystack resolved account", () => {
    expect(normalizeResolvedBankAccount("PAYSTACK", {
      status: true,
      data: { account_number: "0123456789", account_name: "JANE DOE" },
    }, "0123456789")).toEqual({ provider: "PAYSTACK", accountNumber: "0123456789", accountName: "JANE DOE" });
  });

  it("normalizes a Flutterwave resolved account", () => {
    expect(normalizeResolvedBankAccount("FLUTTERWAVE", {
      status: "success",
      data: { account_number: "0123456789", account_name: "JANE DOE" },
    }, "0123456789")).toEqual({ provider: "FLUTTERWAVE", accountNumber: "0123456789", accountName: "JANE DOE" });
  });

  it("rejects an account number that does not match the requested account", () => {
    expect(() => normalizeResolvedBankAccount("PAYSTACK", {
      status: true,
      data: { account_number: "9999999999", account_name: "JANE DOE" },
    }, "0123456789")).toThrow(/does not match/i);
  });

  it("converts Paystack kobo balance to naira", () => {
    expect(normalizeProviderBalanceNgn("PAYSTACK", {
      status: true,
      data: [{ currency: "NGN", balance: 24500000 }],
    })).toBe("245000.00");
  });

  it("reads Flutterwave NGN available balance", () => {
    expect(normalizeProviderBalanceNgn("FLUTTERWAVE", {
      status: "success",
      data: [{ currency: "NGN", available_balance: 245000 }],
    })).toBe("245000.00");
  });

  it("refuses an unavailable or malformed provider balance", () => {
    expect(() => normalizeProviderBalanceNgn("PAYSTACK", { status: true, data: [] })).toThrow(/valid NGN balance/i);
    expect(() => normalizeProviderBalanceNgn("FLUTTERWAVE", { status: "error", data: null })).toThrow(/wallet balances/i);
    expect(() => normalizeProviderBalanceNgn("FLUTTERWAVE", { status: "success", data: [{ currency: "NGN", ledger_balance: 245000 }] })).toThrow(/valid available NGN balance/i);
  });
});
