import AppError from "../../common/errors/AppError.js";

const isTruthy = (value) => String(value || "false").trim().toLowerCase() === "true";

export const getPayrollPayoutMode = (env = process.env) => {
  const mode = String(env.PAYROLL_PAYOUTS_MODE || "sandbox").trim().toLowerCase();
  if (!["sandbox", "live"].includes(mode)) {
    throw new AppError("PAYROLL_PAYOUTS_MODE must be either sandbox or live.", 503, { code: "PAYROLL_PAYOUTS_MODE_INVALID" });
  }
  return mode;
};

export const assertPayrollPayoutProviderCredentials = (provider, env = process.env) => {
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

export const assertPayrollPayoutProviderConfiguration = (provider, env = process.env) => {
  if (!isTruthy(env.PAYROLL_PAYOUTS_ENABLED)) {
    throw new AppError("Automated salary payouts are disabled. Set PAYROLL_PAYOUTS_ENABLED=true only after completing provider test-mode checks.", 503, { code: "PAYROLL_PAYOUTS_DISABLED" });
  }
  return assertPayrollPayoutProviderCredentials(provider, env);
};

// Paystack does not expose a fee-quote API for standard NGN bank transfers.
// These configurable defaults match the published Nigerian tier schedule and must be reviewed
// against the merchant's current contract before live payouts are enabled.
export const estimatePaystackTransferFee = (amount, env = process.env) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new AppError("Salary amount must be greater than zero before a fee can be estimated.", 400);
  const upTo5000 = Number(env.PAYSTACK_TRANSFER_FEE_UP_TO_5000_NGN ?? 10);
  const from5001To50000 = Number(env.PAYSTACK_TRANSFER_FEE_5001_TO_50000_NGN ?? 25);
  const above50000 = Number(env.PAYSTACK_TRANSFER_FEE_ABOVE_50000_NGN ?? 50);
  const levy = Number(env.PAYSTACK_TRANSFER_STAMP_DUTY_NGN ?? 50);
  const levyThreshold = Number(env.PAYSTACK_TRANSFER_STAMP_DUTY_THRESHOLD_NGN ?? 10000);
  const payrollExempt = isTruthy(env.PAYSTACK_REGISTERED_PAYROLL_EXEMPTION);
  const fee = value <= 5000 ? upTo5000 : value <= 50000 ? from5001To50000 : above50000;
  if ([upTo5000, from5001To50000, above50000, levy, levyThreshold].some((n) => !Number.isFinite(n) || n < 0)) {
    throw new AppError("Paystack transfer fee configuration contains an invalid amount.", 503, { code: "PAYOUT_FEE_CONFIGURATION_INVALID" });
  }
  return Number((fee + (!payrollExempt && value >= levyThreshold ? levy : 0)).toFixed(2));
};
