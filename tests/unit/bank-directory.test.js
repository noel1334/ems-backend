import { afterEach, describe, expect, it } from "vitest";
import { canonicalBankKey, listBankDirectory, resolveBankAccount } from "../../src/modules/employees/bank-directory.service.js";

afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FLUTTERWAVE_SECRET_KEY;
});

describe("employee bank directory", () => {
  it("normalizes common provider bank-name variations without sharing provider codes", () => {
    expect(canonicalBankKey("Access Bank Plc")).toBe(canonicalBankKey("Access Bank"));
    expect(canonicalBankKey("Moniepoint Microfinance Bank")).toBe(canonicalBankKey("Moniepoint"));
    expect(canonicalBankKey("First City Monument Bank")).not.toBe(canonicalBankKey("First Bank of Nigeria"));
  });

  it("requires at least one provider secret key for a live directory", async () => {
    await expect(listBankDirectory()).rejects.toMatchObject({ code: "BANK_PROVIDERS_NOT_CONFIGURED", statusCode: 503 });
  });

  it("rejects invalid account numbers before contacting a provider", async () => {
    await expect(resolveBankAccount({ provider: "PAYSTACK", accountNumber: "123", bankCode: "057" }))
      .rejects.toMatchObject({ code: "INVALID_ACCOUNT_NUMBER", statusCode: 400 });
  });

  it("rejects bank codes that are absent for the selected provider", async () => {
    await expect(resolveBankAccount({ provider: "FLUTTERWAVE", accountNumber: "0123456789", bankCode: "" }))
      .rejects.toMatchObject({ code: "BANK_CODE_UNAVAILABLE", statusCode: 400 });
  });
});
