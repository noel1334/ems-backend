import AppError from "../../common/errors/AppError.js";

const isTruthy = (value) => String(value || "false").trim().toLowerCase() === "true";

/**
 * Validates the server-side payout mode and credential class before any provider
 * request. Sandbox is the default so enabling the feature flag alone cannot
 * accidentally authorize transfers with live credentials.
 */
export const getPayrollPayoutMode = (env = process.env) => {
  const mode = String(env.PAYROLL_PAYOUTS_MODE || "sandbox").trim().toLowerCase();
  if (!["sandbox", "live"].includes(mode)) {
    throw new AppError("PAYROLL_PAYOUTS_MODE must be either sandbox or live.", 503, { code: "PAYROLL_PAYOUTS_MODE_INVALID" });
  }
  return mode;
};

export const assertPayrollPayoutProviderConfiguration = (provider, env = process.env) => {
  if (!isTruthy(env.PAYROLL_PAYOUTS_ENABLED)) {
    throw new AppError("Automated salary payouts are disabled. Set PAYROLL_PAYOUTS_ENABLED=true only after completing provider test-mode checks.", 503, { code: "PAYROLL_PAYOUTS_DISABLED" });
  }

  const mode = getPayrollPayoutMode(env);
  const keyName = provider === "PAYSTACK" ? "PAYSTACK_SECRET_KEY" : provider === "FLUTTERWAVE" ? "FLUTTERWAVE_SECRET_KEY" : null;
  if (!keyName) throw new AppError("Choose Paystack or Flutterwave for salary payouts.", 400);
  const secret = String(env[keyName] || "").trim();
  if (!secret) throw new AppError(`${keyName} is not configured on the backend.`, 503, { code: "PAYOUT_PROVIDER_NOT_CONFIGURED" });

  const isTestKey = provider === "PAYSTACK"
    ? secret.startsWith("sk_test_")
    : secret.startsWith("FLWSECK_TEST-");
  const isLiveKey = provider === "PAYSTACK"
    ? secret.startsWith("sk_live_")
    : secret.startsWith("FLWSECK-") && !secret.startsWith("FLWSECK_TEST-");

  if (mode === "sandbox" && !isTestKey) {
    throw new AppError(`${keyName} does not look like a ${provider} test secret. Sandbox mode refuses non-test credentials.`, 503, { code: "PAYOUT_TEST_KEY_REQUIRED" });
  }
  if (mode === "live" && !isLiveKey) {
    throw new AppError(`${keyName} does not look like a ${provider} live secret. Live mode refuses test or unrecognized credentials.`, 503, { code: "PAYOUT_LIVE_KEY_REQUIRED" });
  }
  if (mode === "live" && !isTruthy(env.PAYROLL_PAYOUTS_LIVE_CONFIRMATION)) {
    throw new AppError("Live payouts require PAYROLL_PAYOUTS_LIVE_CONFIRMATION=true as an explicit server-side acknowledgement.", 503, { code: "PAYOUT_LIVE_CONFIRMATION_REQUIRED" });
  }
  return { provider, mode };
};
