import { describe, expect, it } from "vitest";
import { normalizeMonnifyBankDirectory, findMonnifyBankByCode } from "../../src/modules/payments/monnify/monnify.bank-directory.js";

describe("Monnify bank directory", () => {
  it("normalizes the GET /api/v1/banks response and preserves leading zeroes", () => {
    const banks = normalizeMonnifyBankDirectory({
      requestSuccessful: true,
      responseBody: [
        { name: "Access Bank", code: "044" },
        { name: "Guaranty Trust Bank", code: "058" },
        { name: "Invalid row", code: "" },
      ],
    });

    expect(banks).toEqual([
      { bankName: "Access Bank", bankCode: "044", code: "044" },
      { bankName: "Guaranty Trust Bank", bankCode: "058", code: "058" },
    ]);
    expect(findMonnifyBankByCode(banks, "058")).toMatchObject({ bankName: "Guaranty Trust Bank", bankCode: "058" });
    expect(findMonnifyBankByCode(banks, "58")).toBeNull();
  });

  it("supports the common Monnify directory wrapper shapes", () => {
    expect(normalizeMonnifyBankDirectory({ banks: [{ bankName: "First Bank", bankCode: "011" }] })[0])
      .toMatchObject({ bankName: "First Bank", bankCode: "011" });
    expect(normalizeMonnifyBankDirectory({ content: [{ name: "UBA", code: "033" }] })[0])
      .toMatchObject({ bankName: "UBA", bankCode: "033" });
  });

  it("rejects an empty or malformed provider directory instead of guessing bank codes", () => {
    expect(() => normalizeMonnifyBankDirectory([{ name: "No code" }, { code: "XYZ", name: "Bad code" }]))
      .toThrow(/empty or invalid bank directory/i);
  });
});
