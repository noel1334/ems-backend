import { describe, expect, it } from "vitest";
import {
  explainPaystackAccountError,
  recipientFailureSummary,
  shouldResolvePaystackAccounts,
} from "../../src/modules/payments/company-paystack/company-paystack.utils.js";

describe("company Paystack account validation", () => {
  it("requires provider account resolution by default in test mode", () => {
    expect(shouldResolvePaystackAccounts("test", {})).toBe(true);
  });

  it("always requires provider account resolution in live mode", () => {
    expect(shouldResolvePaystackAccounts("live", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "false" })).toBe(true);
  });

  it("allows the explicit sandbox-only diagnostic setting to skip account resolution", () => {
    expect(shouldResolvePaystackAccounts("test", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "false" })).toBe(false);
    expect(shouldResolvePaystackAccounts("test", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "0" })).toBe(false);
  });

  it("explains Paystack's Cannot resolve account response as a bank-code/account-number mismatch", () => {
    const message = explainPaystackAccountError("Cannot resolve account", "044");
    expect(message).toMatch(/selected Paystack bank \(code 044\)/i);
    expect(message).toMatch(/account number/i);
    expect(message).toMatch(/Flutterwave or Monnify/i);
  });

  it("returns safe recipient failure details without exposing a full account number", () => {
    const result = recipientFailureSummary({
      employee: "Jane Employee",
      bankName: "Access Bank",
      _bankCode: "044",
      accountNumberLast4: "1234",
      _accountNumber: "0123456789",
    }, { code: "PAYSTACK_COMPANY_REQUEST_FAILED", message: "Cannot resolve account" });
    expect(result).toMatchObject({ employee: "Jane Employee", bankName: "Access Bank", bankCode: "044", accountNumberLast4: "1234" });
    expect(JSON.stringify(result)).not.toContain("0123456789");
  });
});
