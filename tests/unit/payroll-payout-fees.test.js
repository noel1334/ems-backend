import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFlutterwaveTransferFee } = vi.hoisted(() => ({ getFlutterwaveTransferFee: vi.fn() }));
vi.mock("../../src/modules/payments/flutterwave/flutterwave.transfer.client.js", () => ({
  getFlutterwaveTransferFee,
}));

import { estimatePaystackTransferFee } from "../../src/modules/payroll/payroll.payout.config.js";
import { estimatePayrollPayoutFee, providerReportedPayoutFee } from "../../src/modules/payroll/payroll.payout.fees.js";

describe("payroll payout fee estimates and settlement fees", () => {
  beforeEach(() => getFlutterwaveTransferFee.mockReset());

  it("uses configurable Paystack NGN transfer bands and stamp duty", () => {
    const env = {};
    expect(estimatePaystackTransferFee(5000, env)).toBe(10);
    expect(estimatePaystackTransferFee(5001, env)).toBe(25);
    expect(estimatePaystackTransferFee(50000, env)).toBe(75);
    expect(estimatePaystackTransferFee(50001, env)).toBe(100);
    expect(estimatePaystackTransferFee(10000, env)).toBe(75);
    expect(estimatePaystackTransferFee(10000, { ...env, PAYSTACK_REGISTERED_PAYROLL_EXEMPTION: "true" })).toBe(25);
  });

  it("rejects invalid fee configuration and non-positive amounts", () => {
    expect(() => estimatePaystackTransferFee(1000, { PAYSTACK_TRANSFER_FEE_UP_TO_5000_NGN: "-1" })).toThrow(/invalid amount/i);
    expect(() => estimatePaystackTransferFee(0, {})).toThrow(/greater than zero/i);
  });

  it("obtains Flutterwave's fee quote in NGN", async () => {
    getFlutterwaveTransferFee.mockResolvedValue({ fee: 25, currency: "NGN" });
    await expect(estimatePayrollPayoutFee("FLUTTERWAVE", "12500.00")).resolves.toBe("25.00");
    expect(getFlutterwaveTransferFee).toHaveBeenCalledWith("12500.00");
  });

  it("rejects invalid provider fee quotes", async () => {
    getFlutterwaveTransferFee.mockResolvedValue({ fee: -1, currency: "NGN" });
    await expect(estimatePayrollPayoutFee("FLUTTERWAVE", 12500)).rejects.toThrow(/invalid bank-transfer fee/i);
    getFlutterwaveTransferFee.mockRejectedValueOnce(new Error("fee endpoint down"));
    await expect(estimatePayrollPayoutFee("FLUTTERWAVE", 12500)).rejects.toThrow(/fee endpoint down/i);
  });

  it("converts Paystack's reported fee from kobo, preserves Flutterwave NGN fees, and handles missing fee", () => {
    expect(providerReportedPayoutFee("PAYSTACK", { data: { fee_charged: 2500 } })).toBe("25.00");
    expect(providerReportedPayoutFee("FLUTTERWAVE", { data: { fee: 25 } })).toBe("25.00");
    expect(providerReportedPayoutFee("PAYSTACK", { data: {} })).toBeNull();
  });
});
