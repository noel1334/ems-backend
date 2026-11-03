export const makePayrollPayoutReference = (disbursementId, attemptNumber = 1) => {
  const id = String(disbursementId).replace(/-/g, "").toLowerCase();
  const suffix = Number(attemptNumber) > 1 ? `-${Number(attemptNumber)}` : "";
  // Paystack references are limited to 50 characters and must use lowercase letters, digits, - or _.
  return `ems-sal-${id}${suffix}`.slice(0, 50);
};

export const normalizePayrollPayoutStatus = (provider, rawStatus) => {
  const status = String(rawStatus || "").trim().toUpperCase();
  if (provider === "PAYSTACK") {
    if (status === "SUCCESS") return "PAID";
    if (status === "REVERSED") return "REVERSED";
    if (status === "FAILED") return "FAILED";
    if (status === "OTP") return "REQUIRES_REVIEW";
    return "PROCESSING";
  }
  if (provider === "FLUTTERWAVE") {
    if (["SUCCESSFUL", "SUCCESS"].includes(status)) return "PAID";
    if (status === "REVERSED") return "REVERSED";
    if (status === "FAILED") return "FAILED";
    return "PROCESSING";
  }
  throw new Error(`Unsupported payroll payout provider: ${provider}`);
};

export const isDefinitiveTransferFailure = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== "object") return false;
  // Only a provider transfer object's explicit FAILED state proves that the transfer failed.
  // Generic API errors, HTTP failures, timeouts, and reversed outcomes must not be converted
  // into FAILED here: a request may already have been accepted, or reversal accounting differs.
  return String(providerResponse.data?.status || "").trim().toUpperCase() === "FAILED";
};

export const makePayoutWebhookEventKey = (provider, payload) => {
  const eventType = String(payload?.event || payload?.["event.type"] || "unknown");
  const data = payload?.data || payload?.transfer || {};
  const reference = String(data.reference || data.tx_ref || "no-reference");
  const id = String(data.id ?? data.transfer_id ?? "no-id");
  const status = String(data.status || "unknown").toLowerCase();
  return `${String(provider).toUpperCase()}:${eventType}:${reference}:${id}:${status}`.slice(0, 190);
};
