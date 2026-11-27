const ROW_ARRAY_KEYS = [
  "content",
  "transactions",
  "items",
  "records",
  "results",
  "data",
  "responseBody",
  "transactionList",
  "transferTransactions",
  "disbursementTransactions",
  "responseBody",
  "payload",
  "result",
];

/**
 * Monnify's bulk transaction endpoint has returned the transaction list under
 * slightly different response wrappers across API versions. Walk only known
 * collection/container keys and keep a depth limit to avoid arbitrary payloads.
 */
export function unwrapMonnifyTransactionRows(payload, depth = 0) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object" || depth > 5) return [];

  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value) && value.length) return value;
  }
  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  for (const key of ROW_ARRAY_KEYS) {
    const value = payload[key];
    if (value && typeof value === "object") {
      const rows = unwrapMonnifyTransactionRows(value, depth + 1);
      if (rows.length) return rows;
    }
  }

  return [];
}

const cleanText = (value) => (typeof value === "string" || typeof value === "number")
  ? String(value).trim()
  : "";

// Provider final states used by payroll reconciliation and safe retry guards.
// normalizeMonnifyTransactionStatus maps success/failure aliases into these values.
export const MONNIFY_FINAL_PAID_STATUSES = new Set(["SUCCESS"]);
export const MONNIFY_FINAL_FAILED_STATUSES = new Set(["FAILED", "REVERSED", "EXPIRED"]);

export function monnifyTransactionReference(row) {
  const nested = row?.transaction && typeof row.transaction === "object" ? row.transaction : {};
  for (const value of [
    row?.reference,
    row?.paymentReference,
    row?.transactionReference,
    row?.transactionRef,
    row?.transactionReferenceNo,
    row?.paymentRef,
    row?.referenceNo,
    row?.transferReference,
    row?.sourceReference,
    row?.originalReference,
    row?.transactionReferenceId,
    nested.reference,
    nested.paymentReference,
    nested.transactionReference,
    nested.transactionRef,
    nested.transactionReferenceNo,
    nested.transferReference,
    row?.data?.reference,
    row?.data?.paymentReference,
    row?.data?.transactionReference,
    row?.responseBody?.reference,
    row?.responseBody?.paymentReference,
    row?.responseBody?.transactionReference,
    row?.result?.reference,
    row?.result?.paymentReference,
  ]) {
    const reference = cleanText(value);
    if (reference) return reference;
  }
  return "";
}

const SUCCESS_STATUS_ALIASES = new Set([
  "SUCCESS", "SUCCEEDED", "SUCCESSFUL", "COMPLETED", "PAID", "TRANSFER_SUCCESSFUL",
  "TRANSFER_SUCCEEDED", "TRANSFER_COMPLETED", "TRANSACTION_SUCCESSFUL", "TRANSACTION_SUCCEEDED",
  "TRANSACTION_COMPLETED", "SUCCESSFUL_TRANSFER", "SUCCESSFUL_TRANSACTION", "SUCCESSFULLY_COMPLETED",
]);
const FAILURE_STATUS_ALIASES = new Set([
  "FAILED", "FAILURE", "REJECTED", "TRANSFER_FAILED", "TRANSACTION_FAILED",
  "FAILED_TRANSACTION", "CANCELLED", "CANCELED",
]);

export function normalizeMonnifyTransactionStatus(value) {
  const status = cleanText(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (SUCCESS_STATUS_ALIASES.has(status)) return "SUCCESS";
  if (FAILURE_STATUS_ALIASES.has(status)) return "FAILED";
  return status;
}

export function monnifyTransactionStatus(row) {
  const nestedRows = [row, row?.transaction, row?.data, row?.responseBody, row?.result];
  for (const source of nestedRows) {
    if (!source || typeof source !== "object") continue;
    for (const value of [
      source?.status,
      source?.transactionStatus,
      source?.paymentStatus,
      source?.transferStatus,
      source?.disbursementStatus,
      source?.transferState,
    ]) {
      const status = normalizeMonnifyTransactionStatus(value);
      if (status) return status;
    }
  }
  return "";
}

export function monnifyTransactionFailureReason(row, status) {
  if (!["FAILED", "EXPIRED", "REVERSED"].includes(String(status || "").toUpperCase())) return null;
  for (const value of [
    row?.comment,
    row?.failureReason,
    row?.responseMessage,
    row?.errorMessage,
    row?.message,
    row?.statusMessage,
    row?.responseDescription,
    row?.transactionDescription,
    row?.description,
    row?.transaction?.responseMessage,
    row?.transaction?.comment,
  ]) {
    const message = cleanText(value);
    if (message && !["success", "successful", "transaction successful"].includes(message.toLowerCase())) {
      return message.slice(0, 500);
    }
  }
  return status === "REVERSED"
    ? "Monnify reversed this transfer; the funds were returned to the disbursement wallet."
    : `Monnify reported this transfer as ${status}.`;
}

export function normalizeMonnifyTransactionMap(providerResponse) {
  const candidates = [
    providerResponse?._emsTransactionMap,
    providerResponse?.response?._emsTransactionMap,
    providerResponse?.providerResponse?._emsTransactionMap,
    providerResponse?.data?._emsTransactionMap,
  ];
  const source = candidates.find((candidate) => candidate && typeof candidate === "object" && Object.keys(candidate).length)
    || candidates.find((candidate) => candidate && typeof candidate === "object");
  if (!source) return {};

  if (Array.isArray(source)) {
    return Object.fromEntries(source
      .filter((item) => item && typeof item === "object")
      .map((item) => [cleanText(item.reference), cleanText(item.disbursementId)])
      .filter(([reference, disbursementId]) => reference && disbursementId));
  }

  return Object.fromEntries(Object.entries(source)
    .map(([reference, disbursementId]) => [cleanText(reference), cleanText(disbursementId)])
    .filter(([reference, disbursementId]) => reference && disbursementId));
}

/**
 * A pending employee may be paid as a single transfer only when no accepted or
 * uncertain Monnify batch contains that employee. Batches with a missing map
 * fail closed unless Monnify explicitly rejected the whole batch and EMS marked
 * that rejection as safe for individual fallback.
 */
export function isMonnifySinglePaymentSafeForPendingDisbursement(disbursementId, batches = []) {
  const id = cleanText(disbursementId);
  if (!id || !Array.isArray(batches)) return false;

  for (const batch of batches) {
    const status = cleanText(batch?.providerStatus).toUpperCase();
    const explicitlyRejected = status === "SUBMISSION_REJECTED"
      && batch?.providerResponse?.singleFallbackAllowed === true;
    if (status === "SUBMISSION_REJECTED") {
      if (!explicitlyRejected) return false;
      continue;
    }

    const transactionMap = normalizeMonnifyTransactionMap(batch?.providerResponse);
    if (!Object.keys(transactionMap).length) return false;
    if (Object.values(transactionMap).includes(id)) return false;
  }

  return true;
}

export function isMonnifyBatchFullyReconciled(batch, disbursements = []) {
  const expected = Number(batch?.totalTransactions || 0);
  if (!Number.isInteger(expected) || expected <= 0 || disbursements.length !== expected) return false;
  return disbursements.every((row) => ["PAID", "FAILED"].includes(String(row?.status || "").toUpperCase()));
}

/**
 * Select references whose employee payouts still need a provider status query.
 * This intentionally does not accept or inspect the aggregate batch status:
 * Monnify can leave a batch at AWAITING_PROCESSING after OTP while individual
 * transfers have already reached SUCCESS or FAILED.
 */
export function getUnresolvedMonnifyReferences(mappedRows, updatesByDisbursement) {
  return mappedRows.filter(([, disbursementId]) => {
    const update = updatesByDisbursement.get(disbursementId);
    return !update || !["PAID", "FAILED"].includes(String(update?.data?.status || "").toUpperCase());
  });
}

/**
 * A previous batch is safe to release for another submission only when every
 * transaction expected by Monnify is mapped to an EMS payout and that payout
 * has a final local status. Missing reference-map entries must fail closed.
 */
export function areMonnifyBatchTransfersFinal(totalTransactions, mappedIds = [], disbursements = []) {
  const expected = Number(totalTransactions);
  if (!Number.isInteger(expected) || expected <= 0) return false;
  if (!Array.isArray(mappedIds) || mappedIds.length !== expected) return false;
  if (!Array.isArray(disbursements) || disbursements.length !== expected) return false;
  return disbursements.every((row) => ["PAID", "FAILED"].includes(String(row?.status || "").toUpperCase()));
}
