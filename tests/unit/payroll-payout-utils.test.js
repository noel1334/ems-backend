import { describe, expect, it } from "vitest";
import { isDefinitiveTransferFailure, makePayrollPayoutReference, makePayoutWebhookEventKey, normalizePayrollPayoutStatus } from "../../src/modules/payroll/payroll.payout.utils.js";

describe("automated payroll payout safety helpers", () => {
  it("creates a stable, provider-compatible unique reference per attempt", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const first = makePayrollPayoutReference(id);
    const second = makePayrollPayoutReference(id, 2);
    expect(first).toBe("ems-sal-123e4567e89b12d3a456426614174000");
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(50);
    expect(second.length).toBeLessThanOrEqual(50);
    expect(first).toMatch(/^[a-z0-9_-]+$/);
  });

  it("never maps a pending transfer to success", () => {
    expect(normalizePayrollPayoutStatus("PAYSTACK", "pending")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "otp")).toBe("REQUIRES_REVIEW");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "NEW")).toBe("PROCESSING");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "PENDING")).toBe("PROCESSING");
  });

  it("maps success, failure, and reversal distinctly for both providers", () => {
    expect(normalizePayrollPayoutStatus("PAYSTACK", "success")).toBe("PAID");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "failed")).toBe("FAILED");
    expect(normalizePayrollPayoutStatus("PAYSTACK", "reversed")).toBe("REVERSED");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "SUCCESSFUL")).toBe("PAID");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "FAILED")).toBe("FAILED");
    expect(normalizePayrollPayoutStatus("FLUTTERWAVE", "REVERSED")).toBe("REVERSED");
  });

  it("recognizes only an explicit failed transfer object, not a generic API error or reversal", () => {
    expect(isDefinitiveTransferFailure({ status: "error", message: "request timed out" })).toBe(false);
    expect(isDefinitiveTransferFailure({ status: false, message: "request rejected" })).toBe(false);
    expect(isDefinitiveTransferFailure({ status: true, data: { status: "FAILED" } })).toBe(true);
    expect(isDefinitiveTransferFailure({ status: true, data: { status: "REVERSED" } })).toBe(false);
    expect(isDefinitiveTransferFailure({ status: true, data: { status: "NEW" } })).toBe(false);
    expect(isDefinitiveTransferFailure(null)).toBe(false);
  });

  it("creates repeatable webhook event keys for idempotent processing", () => {
    const event = { event: "transfer.success", data: { reference: "ems-sal-test", id: 42, status: "success" } };
    expect(makePayoutWebhookEventKey("PAYSTACK", event)).toBe(makePayoutWebhookEventKey("PAYSTACK", event));
    expect(makePayoutWebhookEventKey("PAYSTACK", event)).not.toBe(makePayoutWebhookEventKey("FLUTTERWAVE", event));
  });
});
