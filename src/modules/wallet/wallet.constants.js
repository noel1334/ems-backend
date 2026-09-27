export const WALLET_TRANSACTION_TYPE = Object.freeze({
  CREDIT: "CREDIT",
  DEBIT: "DEBIT",
});

export const WALLET_TRANSACTION_STATUS = Object.freeze({
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
});

export const DEFAULT_WALLET_CURRENCY = "NGN";

export const WALLET_REFERENCE_PREFIX = Object.freeze({
  CREDIT: "WALLET-CR",
  DEBIT: "WALLET-DR",
});
