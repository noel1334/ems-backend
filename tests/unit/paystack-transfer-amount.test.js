import { describe, expect, it } from "vitest";
import { toPaystackKobo } from "../../src/modules/payments/paystack/paystack.transfer.client.js";

describe("Paystack transfer amount conversion", () => {
  it("converts naira to integer kobo without binary floating point errors", () => {
    expect(toPaystackKobo("2115000.00")).toBe(211500000);
    expect(toPaystackKobo("0.01")).toBe(1);
    expect(toPaystackKobo("1234.56")).toBe(123456);
  });

  it("rejects non-positive, fractional-kobo and unsafe amounts", () => {
    expect(() => toPaystackKobo("0")).toThrow(/positive/);
    expect(() => toPaystackKobo("-1")).toThrow(/positive/);
    expect(() => toPaystackKobo("1.001")).toThrow(/whole number of kobo/);
    expect(() => toPaystackKobo("99999999999999")).toThrow(/supported range/);
  });
});
