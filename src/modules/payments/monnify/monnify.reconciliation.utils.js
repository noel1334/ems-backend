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
    nested.reference,
    nested.paymentReference,
    nested.transactionReference,
  ]) {
    const reference = cleanText(value);
    if (reference) return reference;
  }
  return "";
}

export function monnifyTransactionStatus(row) {
  for (const value of [
    row?.status,
    row?.transactionStatus,
    row?.paymentStatus,
    row?.transferStatus,
    row?.disbursementStatus,
    row?.transferState,
    row?.transaction?.status,
  ]) {
    const status = cleanText(value).toUpperCase();
    if (status) return status;
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
