import { describe, expect, it } from "vitest";
import {
  canSubmitPaystackPreview,
  explainPaystackAccountError,
  isPaystackSandboxResolveLimitError,
  recipientFailureSummary,
  shouldResolvePaystackAccounts,
} from "../../src/modules/payments/company-paystack/company-paystack.utils.js";

describe("company Paystack account validation", () => {
  it("skips real bank lookups by default in test mode", () => {
    expect(shouldResolvePaystackAccounts("test", {})).toBe(false);
  });

  it("always requires provider account resolution in live mode", () => {
    expect(shouldResolvePaystackAccounts("live", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "false" })).toBe(true);
  });

  it("allows an explicit opt-in to consume a TEST-mode live bank lookup", () => {
    expect(shouldResolvePaystackAccounts("test", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "true" })).toBe(true);
    expect(shouldResolvePaystackAccounts("test", { PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX: "1" })).toBe(true);
  });

  it("recognizes Paystack's TEST-mode daily bank-resolution cap", () => {
    expect(isPaystackSandboxResolveLimitError("Test mode daily limit of 3 live bank resolves exceeded. Use test bank codes 001 or upgrade to live mode.")).toBe(true);
    expect(isPaystackSandboxResolveLimitError("Cannot resolve account")).toBe(false);
  });

  it("allows TEST submissions after local checks because recipient preparation is the provider preflight", () => {
    expect(canSubmitPaystackPreview({ environment: "test", invalidCount: 0, insufficientBalance: false, providerValidationComplete: false })).toBe(true);
    expect(canSubmitPaystackPreview({ environment: "test", invalidCount: 1, insufficientBalance: false, providerValidationComplete: false })).toBe(false);
  });

  it("still requires provider account verification for LIVE submissions", () => {
    expect(canSubmitPaystackPreview({ environment: "live", invalidCount: 0, insufficientBalance: false, providerValidationComplete: false })).toBe(false);
    expect(canSubmitPaystackPreview({ environment: "live", invalidCount: 0, insufficientBalance: false, providerValidationComplete: true })).toBe(true);
    expect(canSubmitPaystackPreview({ environment: "live", invalidCount: 0, insufficientBalance: true, providerValidationComplete: true })).toBe(false);
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
