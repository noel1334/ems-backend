import Decimal from "decimal.js";
import AppError from "../../common/errors/AppError.js";
import {
  resolvePaystackBankAccount,
  getPaystackBalances,
} from "./paystack/paystack.transfer.client.js";
import {
  resolveFlutterwaveBankAccount,
  getFlutterwaveBalances,
} from "./flutterwave/flutterwave.transfer.client.js";
import { normalizeProviderBalanceNgn, normalizeResolvedBankAccount } from "./bank-account-verification.utils.js";

const asProviderError = (provider, error, operation) => {
  if (error instanceof AppError) return error;
  const message = error?.response?.data?.message || error?.message || `${provider} ${operation} failed.`;
  const providerStatus = Number(error?.response?.status || 0);
  const statusCode = providerStatus >= 400 && providerStatus < 500 ? 422 : 502;
  return new AppError(`${provider} ${operation} failed: ${String(message).slice(0, 220)}`, statusCode, {
    code: `${provider}_${operation.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED`,
  });
};

export const resolveBankAccountForProvider = async ({ provider, accountNumber, bankCode }) => {
  const normalizedProvider = String(provider || "").trim().toUpperCase();
  const number = String(accountNumber || "").trim();
  const code = String(bankCode || "").trim();
  if (!["PAYSTACK", "FLUTTERWAVE"].includes(normalizedProvider)) {
    throw new AppError("Choose Paystack or Flutterwave for bank-account verification.", 400);
  }
  if (!/^\d{10}$/.test(number)) throw new AppError("Enter a valid 10-digit Nigerian bank account number.", 400);
  if (!/^\d{2,12}$/.test(code)) throw new AppError("The selected provider's bank code must contain 2–12 digits.", 400);

  const keyName = normalizedProvider === "PAYSTACK" ? "PAYSTACK_SECRET_KEY" : "FLUTTERWAVE_SECRET_KEY";
  if (!process.env[keyName]) throw new AppError(`${keyName} is not configured on the backend.`, 503, { code: "BANK_VERIFICATION_PROVIDER_NOT_CONFIGURED" });

  try {
    const response = normalizedProvider === "PAYSTACK"
      ? await resolvePaystackBankAccount({ accountNumber: number, bankCode: code })
      : await resolveFlutterwaveBankAccount({ accountNumber: number, bankCode: code });
    try {
      return normalizeResolvedBankAccount(normalizedProvider, response, number);
    } catch (error) {
      throw new AppError(`${normalizedProvider} could not verify this account: ${String(error.message || error).slice(0, 220)}`, 422, { code: "BANK_ACCOUNT_NOT_VERIFIED" });
    }
  } catch (error) {
    throw asProviderError(normalizedProvider, error, "account verification");
  }
};

export const getProviderAvailableBalanceNgn = async (provider) => {
  const normalizedProvider = String(provider || "").trim().toUpperCase();
  if (!["PAYSTACK", "FLUTTERWAVE"].includes(normalizedProvider)) throw new AppError("Choose Paystack or Flutterwave.", 400);
  const keyName = normalizedProvider === "PAYSTACK" ? "PAYSTACK_SECRET_KEY" : "FLUTTERWAVE_SECRET_KEY";
  if (!process.env[keyName]) throw new AppError(`${keyName} is not configured on the backend.`, 503, { code: "PAYOUT_PROVIDER_NOT_CONFIGURED" });

  try {
    const response = normalizedProvider === "PAYSTACK" ? await getPaystackBalances() : await getFlutterwaveBalances();
    try {
      return new Decimal(normalizeProviderBalanceNgn(normalizedProvider, response)).toDecimalPlaces(2);
    } catch (error) {
      throw new AppError(`${normalizedProvider} balance check failed: ${String(error.message || error).slice(0, 220)}`, 502, { code: "PAYOUT_PROVIDER_BALANCE_UNAVAILABLE" });
    }
  } catch (error) {
    throw asProviderError(normalizedProvider, error, "balance check");
  }
};
