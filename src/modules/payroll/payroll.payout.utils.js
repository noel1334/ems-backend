export const makePayrollPayoutReference = (disbursementId) =>
  `ems-sal-${String(disbursementId).replace(/-/g, "").toLowerCase()}`;

export const normalizePayrollPayoutStatus = (provider, rawStatus) => {
  const status = String(rawStatus || "").trim().toUpperCase();
  if (provider === "PAYSTACK") {
    if (status === "SUCCESS") return "PAID";
    if (["FAILED", "REVERSED"].includes(status)) return "FAILED";
    return "PROCESSING"; // PENDING and OTP are intentionally not treated as successful.
  }
  if (provider === "FLUTTERWAVE") {
    if (["SUCCESSFUL", "SUCCESS"].includes(status)) return "PAID";
    if (["FAILED", "REVERSED"].includes(status)) return "FAILED";
    return "PROCESSING"; // NEW and PENDING must be verified later.
  }
  throw new Error(`Unsupported payroll payout provider: ${provider}`);
};

export const isDefinitiveTransferFailure = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== "object") return false;
  const raw = providerResponse.data?.status;
  const status = String(raw || "").toUpperCase();
  return ["FAILED", "REVERSED"].includes(status) || providerResponse.status === "error" || providerResponse.status === false;
};
