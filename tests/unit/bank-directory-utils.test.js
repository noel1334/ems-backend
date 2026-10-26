import { describe, expect, it } from "vitest";
import { mergeProviderBankLists, normalizeBankName } from "../../src/modules/payments/bank-directory.utils.js";

describe("provider bank directory", () => {
  it("merges known naming variants while keeping provider codes separate", () => {
    const banks = mergeProviderBankLists(
      [{ name: "Guaranty Trust Bank", code: "058" }, { name: "First Bank of Nigeria", code: "011" }],
      [{ name: "GTBank", code: "000013" }, { name: "First Bank", code: "011" }],
    );
    expect(banks).toHaveLength(2);
    const gt = banks.find((bank) => bank.key === "gtbank");
    expect(gt).toMatchObject({ name: "Guaranty Trust Bank", paystackBankCode: "058", flutterwaveBankCode: "000013" });
    const first = banks.find((bank) => bank.key === "first bank");
    expect(first).toMatchObject({ paystackBankCode: "011", flutterwaveBankCode: "011" });
  });

  it("does not include incomplete provider entries", () => {
    expect(mergeProviderBankLists([{ name: "No Code Bank" }], [{ code: "044" }])).toEqual([]);
  });

  it("normalizes common Nigerian bank aliases", () => {
    expect(normalizeBankName("United Bank for Africa Plc")).toBe("uba");
    expect(normalizeBankName("Access Bank")).toBe("access bank");
    expect(normalizeBankName("Stanbic IBTC Bank Nigeria")).toBe("stanbic ibtc");
  });
});
