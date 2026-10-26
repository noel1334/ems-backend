import axios from "axios";
import AppError from "../../common/errors/AppError.js";

const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
const FLUTTERWAVE_BASE_URL = process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com/v3";
const configured = () => ({ PAYSTACK: Boolean(process.env.PAYSTACK_SECRET_KEY), FLUTTERWAVE: Boolean(process.env.FLUTTERWAVE_SECRET_KEY) });

export const canonicalBankKey = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ")
  .replace(/\b(microfinance|digital|services|service|limited|ltd|plc|bank|of nigeria|nigeria)\b/g, " ")
  .replace(/[^a-z0-9]/g, "").trim();

const providerRequest = async (provider, method, path, data, params) => {
  const paystack = provider === "PAYSTACK";
  const key = paystack ? process.env.PAYSTACK_SECRET_KEY : process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new AppError(`${provider} is not configured on the server.`, 503, "BANK_PROVIDER_NOT_CONFIGURED");
  try {
    const response = await axios({ method, url: `${paystack ? PAYSTACK_BASE_URL : FLUTTERWAVE_BASE_URL}${path}`, ...(data ? { data } : {}), ...(params ? { params } : {}), timeout: 15000, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
    return response.data;
  } catch (error) {
    const message = error?.response?.data?.message;
    throw new AppError(`${provider} request failed${message ? `: ${String(message).slice(0, 180)}` : ". Check provider configuration and try again."}`, 502, "BANK_PROVIDER_REQUEST_FAILED");
  }
};

const fetchPaystackBanks = async () => {
  const payload = await providerRequest("PAYSTACK", "GET", "/bank", null, { country: "nigeria", currency: "NGN", perPage: 200 });
  if (payload?.status !== true || !Array.isArray(payload?.data)) throw new AppError("Paystack returned an invalid bank directory.", 502, "BANK_DIRECTORY_INVALID_RESPONSE");
  return payload.data.filter((bank) => bank?.name && bank?.code != null).map((bank) => ({ bankName: String(bank.name).trim(), paystackBankCode: String(bank.code), flutterwaveBankCode: null }));
};

const fetchFlutterwaveBanks = async () => {
  const payload = await providerRequest("FLUTTERWAVE", "GET", "/banks/NG");
  if (payload?.status !== "success" || !Array.isArray(payload?.data)) throw new AppError("Flutterwave returned an invalid bank directory.", 502, "BANK_DIRECTORY_INVALID_RESPONSE");
  return payload.data.filter((bank) => (bank?.name || bank?.bank_name) && (bank?.code != null || bank?.id != null)).map((bank) => ({ bankName: String(bank.name || bank.bank_name).trim(), paystackBankCode: null, flutterwaveBankCode: String(bank.code ?? bank.id) }));
};

export const listBankDirectory = async () => {
  const available = configured();
  if (!available.PAYSTACK && !available.FLUTTERWAVE) throw new AppError("Configure PAYSTACK_SECRET_KEY and/or FLUTTERWAVE_SECRET_KEY on the backend to load the live bank directory.", 503, "BANK_PROVIDERS_NOT_CONFIGURED");
  const results = await Promise.allSettled([available.PAYSTACK ? fetchPaystackBanks() : Promise.resolve([]), available.FLUTTERWAVE ? fetchFlutterwaveBanks() : Promise.resolve([])]);
  const successful = results.filter((result) => result.status === "fulfilled");
  if (!successful.length || successful.every((result) => !result.value.length)) {
    const message = results.find((result) => result.status === "rejected")?.reason?.message;
    throw new AppError(message || "No banks were returned by the configured providers.", 502, "BANK_DIRECTORY_UNAVAILABLE");
  }
  const merged = new Map();
  for (const result of successful) for (const bank of result.value) {
    const key = canonicalBankKey(bank.bankName) || bank.bankName.toLowerCase();
    const existing = merged.get(key);
    if (!existing) merged.set(key, { ...bank, providerCodesAvailable: [bank.paystackBankCode ? "PAYSTACK" : "FLUTTERWAVE"] });
    else {
      existing.paystackBankCode ||= bank.paystackBankCode;
      existing.flutterwaveBankCode ||= bank.flutterwaveBankCode;
      if (bank.paystackBankCode && !existing.providerCodesAvailable.includes("PAYSTACK")) existing.providerCodesAvailable.push("PAYSTACK");
      if (bank.flutterwaveBankCode && !existing.providerCodesAvailable.includes("FLUTTERWAVE")) existing.providerCodesAvailable.push("FLUTTERWAVE");
      if (bank.bankName.length > existing.bankName.length) existing.bankName = bank.bankName;
    }
  }
  return { banks: [...merged.values()].sort((a, b) => a.bankName.localeCompare(b.bankName)), providersAvailable: Object.keys(available).filter((provider) => available[provider]), warnings: results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || "A provider bank directory could not be loaded.") };
};

export const resolveBankAccount = async ({ provider, accountNumber, bankCode }) => {
  const normalizedProvider = String(provider || "").toUpperCase();
  if (!["PAYSTACK", "FLUTTERWAVE"].includes(normalizedProvider)) throw new AppError("Choose Paystack or Flutterwave to resolve this account.", 400, "INVALID_BANK_PROVIDER");
  const number = String(accountNumber || "").trim();
  if (!/^\d{10}$/.test(number)) throw new AppError("Enter a valid 10-digit Nigerian account number.", 400, "INVALID_ACCOUNT_NUMBER");
  if (!String(bankCode || "").trim()) throw new AppError(`The selected bank is not available through ${normalizedProvider}.`, 400, "BANK_CODE_UNAVAILABLE");
  if (normalizedProvider === "PAYSTACK") {
    const payload = await providerRequest("PAYSTACK", "GET", "/bank/resolve", null, { account_number: number, bank_code: String(bankCode) });
    if (payload?.status !== true || !payload?.data?.account_name) throw new AppError(payload?.message || "Paystack could not verify this account.", 422, "ACCOUNT_RESOLUTION_FAILED");
    return { provider: normalizedProvider, accountName: String(payload.data.account_name).trim(), accountNumber: number, bankCode: String(bankCode), verified: true };
  }
  const payload = await providerRequest("FLUTTERWAVE", "POST", "/accounts/resolve", { account_number: number, account_bank: String(bankCode) });
  if (payload?.status !== "success" || !payload?.data?.account_name) throw new AppError(payload?.message || "Flutterwave could not verify this account.", 422, "ACCOUNT_RESOLUTION_FAILED");
  return { provider: normalizedProvider, accountName: String(payload.data.account_name).trim(), accountNumber: number, bankCode: String(bankCode), verified: true };
};
