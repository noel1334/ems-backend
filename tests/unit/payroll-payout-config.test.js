import { describe, expect, it } from "vitest";
import { assertPayrollPayoutProviderConfiguration, getPayrollPayoutMode } from "../../src/modules/payroll/payroll.payout.config.js";

const enabled = { PAYROLL_PAYOUTS_ENABLED: "true" };

describe("payroll payout provider mode guard", () => {
  it("defaults to sandbox mode", () => {
    expect(getPayrollPayoutMode({})).toBe("sandbox");
  });

  it("blocks payout initiation while the feature flag is disabled", () => {
    expect(() => assertPayrollPayoutProviderConfiguration("PAYSTACK", { PAYSTACK_SECRET_KEY: "sk_test_example" }))
      .toThrow(/disabled/i);
  });

  it("allows Paystack test credentials in sandbox mode", () => {
    expect(assertPayrollPayoutProviderConfiguration("PAYSTACK", { ...enabled, PAYROLL_PAYOUTS_MODE: "sandbox", PAYSTACK_SECRET_KEY: "sk_test_example" }))
      .toEqual({ provider: "PAYSTACK", mode: "sandbox" });
  });

  it("blocks a Paystack live key in sandbox mode", () => {
    expect(() => assertPayrollPayoutProviderConfiguration("PAYSTACK", { ...enabled, PAYROLL_PAYOUTS_MODE: "sandbox", PAYSTACK_SECRET_KEY: "sk_live_example" }))
      .toThrow(/refuses non-test credentials/i);
  });

  it("allows Flutterwave test credentials in sandbox mode", () => {
    expect(assertPayrollPayoutProviderConfiguration("FLUTTERWAVE", { ...enabled, FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST-example" }))
      .toEqual({ provider: "FLUTTERWAVE", mode: "sandbox" });
  });

  it("requires explicit acknowledgement before live payouts", () => {
    const env = { ...enabled, PAYROLL_PAYOUTS_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_example" };
    expect(() => assertPayrollPayoutProviderConfiguration("PAYSTACK", env)).toThrow(/LIVE_CONFIRMATION/i);
    expect(assertPayrollPayoutProviderConfiguration("PAYSTACK", { ...env, PAYROLL_PAYOUTS_LIVE_CONFIRMATION: "true" }))
      .toEqual({ provider: "PAYSTACK", mode: "live" });
  });

  it("rejects unknown payout mode", () => {
    expect(() => assertPayrollPayoutProviderConfiguration("PAYSTACK", { ...enabled, PAYROLL_PAYOUTS_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_example" }))
      .toThrow(/must be either sandbox or live/i);
  });
});
