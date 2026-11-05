import { describe, expect, it } from "vitest";
import {
  canSubmitPaystackPreview,
  explainPaystackAccountError,
  isPaystackSandboxResolveLimitError,
  isSkippablePaystackAccountError,
  isSkippablePaystackRecipientError,
  partitionPaystackEmployees,
  preparePaystackRecipients,
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

  it("skips only known account-specific Paystack 4xx validation failures", () => {
    expect(isSkippablePaystackAccountError(Object.assign(new Error("Cannot resolve account"), { statusCode: 422 }))).toBe(true);
    expect(isSkippablePaystackAccountError(Object.assign(new Error("Invalid account number"), { statusCode: 400 }))).toBe(true);
    expect(isSkippablePaystackAccountError(Object.assign(new Error("Unauthorized"), { statusCode: 401 }))).toBe(false);
    expect(isSkippablePaystackAccountError(Object.assign(new Error("Too many requests"), { statusCode: 429 }))).toBe(false);
    expect(isSkippablePaystackAccountError(Object.assign(new Error("Gateway timeout"), { statusCode: 502 }))).toBe(false);
    expect(isSkippablePaystackRecipientError(Object.assign(new Error("Cannot resolve account"), { statusCode: 422 }))).toBe(true);
    expect(isSkippablePaystackRecipientError(Object.assign(new Error("Unauthorized"), { statusCode: 401 }))).toBe(false);
  });

  it("recognizes Paystack's TEST-mode daily bank-resolution cap", () => {
    expect(isPaystackSandboxResolveLimitError("Test mode daily limit of 3 live bank resolves exceeded. Use test bank codes 001 or upgrade to live mode.")).toBe(true);
    expect(isPaystackSandboxResolveLimitError("Cannot resolve account")).toBe(false);
  });

  it("allows a partial TEST payroll and skips invalid employees instead of blocking valid employees", () => {
    expect(canSubmitPaystackPreview({ environment: "test", validCount: 4, insufficientBalance: false, providerValidationComplete: false })).toBe(true);
    expect(canSubmitPaystackPreview({ environment: "test", validCount: 0, insufficientBalance: false, providerValidationComplete: false })).toBe(false);
  });

  it("allows LIVE payroll when remaining eligible employees are provider-verified, even if other rows are blocked", () => {
    expect(canSubmitPaystackPreview({ environment: "live", validCount: 2, insufficientBalance: false, providerValidationComplete: true })).toBe(true);
    expect(canSubmitPaystackPreview({ environment: "live", validCount: 2, insufficientBalance: false, providerValidationComplete: false })).toBe(false);
    expect(canSubmitPaystackPreview({ environment: "live", validCount: 2, insufficientBalance: true, providerValidationComplete: true })).toBe(false);
    expect(canSubmitPaystackPreview({ environment: "live", validCount: 0, insufficientBalance: false, providerValidationComplete: true })).toBe(false);
  });

  it("partitions eligible and invalid employees without adding blocked employees to the transfer batch", () => {
    const rows = [
      { disbursementId: "d1", valid: true },
      { disbursementId: "d2", valid: false, errors: ["Cannot resolve account"] },
      { disbursementId: "d3", valid: true },
      { disbursementId: "d4", valid: false, errors: ["Invalid bank code"] },
    ];
    const result = partitionPaystackEmployees(rows);
    expect(result.eligible.map((row) => row.disbursementId)).toEqual(["d1", "d3"]);
    expect(result.skipped.map((row) => row.disbursementId)).toEqual(["d2", "d4"]);
    expect(result.eligible.some((row) => row.valid === false)).toBe(false);
  });

  it("skips a recipient-creation failure and returns the other eligible employees for the batch", async () => {
    const rows = [
      { employee: "Good Employee", disbursementId: "d1", valid: true },
      { employee: "Bad Employee", disbursementId: "d2", valid: true },
      { employee: "Another Good Employee", disbursementId: "d3", valid: true },
    ];
    const result = await preparePaystackRecipients(
      rows,
      async (row) => {
        if (row.disbursementId === "d2") throw Object.assign(new Error("Cannot resolve account"), { statusCode: 422, code: "PAYSTACK_RECIPIENT_REJECTED" });
        return { ...row, recipientCode: `RCP_${row.disbursementId}` };
      },
      (row, error) => ({ employee: row.employee, message: error.message, code: error.code }),
      2,
    );
    expect(result.prepared.map((row) => row.disbursementId)).toEqual(["d1", "d3"]);
    expect(result.failed).toEqual([{ row: rows[1], failure: { employee: "Bad Employee", message: "Cannot resolve account", code: "PAYSTACK_RECIPIENT_REJECTED" } }]);
    expect(result.fatal).toEqual([]);
  });

  it("aborts safely when recipient preparation fails for an operational reason", async () => {
    const rows = [{ employee: "Employee", disbursementId: "d1", valid: true }];
    const result = await preparePaystackRecipients(
      rows,
      async () => { throw Object.assign(new Error("Paystack gateway timeout"), { statusCode: 502 }); },
      (row, error) => ({ employee: row.employee, message: error.message }),
    );
    expect(result.prepared).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.fatal).toHaveLength(1);
    expect(result.fatal[0].failure.message).toBe("Paystack gateway timeout");
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
