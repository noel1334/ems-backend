import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(async (url) => {
      if (String(url).includes("api.paystack.co")) {
        return { data: { status: true, data: [{ name: "Access Bank", code: "044", active: true }] } };
      }
      if (String(url).includes("api.flutterwave.com")) {
        return { data: { status: "success", data: [{ name: "Access Bank Plc", code: "100044" }] } };
      }
      throw new Error(`Unexpected provider URL: ${url}`);
    }),
  },
}));

import { getBankDirectory, validateProviderBankCode } from "../../src/modules/payments/bank-directory.service.js";

afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FLUTTERWAVE_SECRET_KEY;
});

describe("provider-specific bank directories", () => {
  it("returns each provider's original bank name/code pairs independently", async () => {
    process.env.PAYSTACK_SECRET_KEY = "test-paystack-key";
    process.env.FLUTTERWAVE_SECRET_KEY = "test-flutterwave-key";

    const result = await getBankDirectory();

    expect(result.providers.PAYSTACK.banks).toEqual([{ name: "Access Bank", code: "044" }]);
    expect(result.providers.FLUTTERWAVE.banks).toEqual([{ name: "Access Bank Plc", code: "100044" }]);
    expect(result.banks[0]).toMatchObject({ paystackBankCode: "044", flutterwaveBankCode: "100044" });
    await expect(validateProviderBankCode("PAYSTACK", "044")).resolves.toMatchObject({ provider: "PAYSTACK", bankCode: "044" });
    await expect(validateProviderBankCode("FLUTTERWAVE", "044")).rejects.toMatchObject({ code: "PROVIDER_BANK_CODE_NOT_IN_DIRECTORY" });
  });
});
