import { describe, expect, it } from "vitest";
import {
  canonicalMonnifyBankName,
  monnifyFailureMessage,
  normalizeMonnifyBanks,
} from "../../src/modules/payments/monnify/monnify.utils.js";

describe("Monnify beneficiary safeguards", () => {
  it("normalizes bank-name variants without treating different banks as equal", () => {
    expect(canonicalMonnifyBankName("Access Bank Plc")).toBe(canonicalMonnifyBankName("Access bank"));
    expect(canonicalMonnifyBankName("Zenith Bank")).not.toBe(canonicalMonnifyBankName("Unity Bank"));
    expect(canonicalMonnifyBankName("Moniepoint MFB")).toBe(canonicalMonnifyBankName("Moniepoint MFB"));
  });

  it("normalizes the current Monnify bank-directory response and preserves directory codes", () => {
    expect(normalizeMonnifyBanks([
      { name: "Access bank", code: "044" },
      { bankName: "Zenith Bank Plc", bankCode: "057" },
      { name: "Invalid code", code: "ABC" },
      { name: "Duplicate access label", code: "044" },
    ])).toEqual([
      { name: "Access bank", code: "044" },
      { name: "Zenith Bank Plc", code: "057" },
    ]);
  });

  it("does not describe Monnify code 99 as a confirmed invalid beneficiary", () => {
    const message = monnifyFailureMessage("99", "Invalid account details supplied");
    expect(message).toMatch(/unexpected processing error/i);
    expect(message).toMatch(/does not confirm.*account.*invalid/i);
    expect(message).toContain("Invalid account details supplied");
  });

  it("gives D03 the definitive invalid-account explanation", () => {
    expect(monnifyFailureMessage("D03", "Invalid account details supplied")).toMatch(/D03.*invalid account details/i);
  });
});
