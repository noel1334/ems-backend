import { describe, expect, it } from "vitest";
import { isDefinitiveTransferFailure, makePayrollPayoutReference, normalizePayrollPayoutStatus } from "../../src/modules/payroll/payroll.payout.utils.js";

describe("automated payroll payout safety helpers", () => {
  it("creates a stable Paystack-compatible reference for each disbursement", () => {
    const a = makePayrollPayoutReference("123e4567-e89b-12d3-a456-426614174000");
    expect(a).toBe("ems-sal-123e4567e89b12d3a456426614174000");
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a.length).toBeLessThanOrEqual(50);
    expect(a).toMatch(/^[a-z0-9_-]+$/);
    expect(makePayrollPayoutReference("123e4567-e89b-12d3-a456-426614174000")).toBe(a);
  });

  it("does not treat pending or OTP-required Paystack transfers as paid", () => {
    expect(normalizePayrollPayoutStatus("PAYSTACK", "pending")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "otp")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "success")).toBe("PAID");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "reversed")).toBe("FAILED");
  });

  it("does not treat a newly created Flutterwave transfer as paid", () => {
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "NEW")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "PENDING")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "SUCCESSFUL")).toBe("PAID");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "FAILED")).toBe("FAILED");
  });

  it("recognizes only explicit failure responses as definitive", () => {
    expect(isDefinitiveTransferFailure({ status: "error", message: "rejected" })).toBe(true);
    expect(isDefinitiveTransferFailure({ status: false, message: "provider rejected the request" })).toBe(true);
    expect(isDefinitiveTransferFailure({ status: "success", data: { status: "FAILED" } })).toBe(true);
    expect(isDefinitiveTransferFailure({ status: "success", data: { status: "NEW" } })).toBe(false);
    expect(isDefinitiveTransferFailure(null)).toBe(false);
  });
});
