import { describe, expect, it } from "vitest";
import { toPaystackKobo } from "../../src/modules/payments/paystack/paystack.transfer.client.js";

describe("Paystack transfer amount conversion", () => {
  it("converts naira to integer kobo without binary floating point errors", () => {
    expect(toPaystackKobo("325000.00")).toBe(32500000);
    expect(toPaystackKobo("1000.25")).toBe(100025);
  });

  it("rejects non-positive, fractional-kobo and unsafe amounts", () => {
    expect(() => toPaystackKobo("0")).toThrow(/positive/);
    expect(() => toPaystackKobo("1.001")).toThrow(/whole number of kobo/);
    expect(() => toPaystackKobo("100000000000000")).toThrow(/supported range/);
  });
});
