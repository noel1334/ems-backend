import axios from "axios";
import { mergeProviderBankLists } from "./bank-directory.utils.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 60 * 1000;
const cache = {
  PAYSTACK: { expiresAt: 0, result: null },
  FLUTTERWAVE: { expiresAt: 0, result: null },
};

const parsePaystackRows = (body) => {
  if (body?.status !== true || !Array.isArray(body?.data)) {
    throw new Error("Unexpected Paystack bank-directory response.");
  }
  return body.data
    .filter((bank) => bank && bank.active !== false)
    .map((bank) => ({ name: bank.name, code: bank.code }))
    .filter((bank) => bank.name && bank.code !== undefined && bank.code !== null);
};

const fetchPaystackRows = async () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return { configured: false, available: false, error: "PAYSTACK_SECRET_KEY is not configured on the backend.", banks: [] };
  }

  const baseURL = (process.env.PAYSTACK_BASE_URL || "https://api.paystack.co").replace(/\/$/, "");
  const rows = [];
  // Paystack's List Banks endpoint is paginated; cap requests to prevent an API loop.
  for (let page = 1; page <= 10; page += 1) {
    const response = await axios.get(`${baseURL}/bank`, {
      params: { country: "nigeria", perPage: 100, page },
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      timeout: 15000,
    });
    const pageRows = parsePaystackRows(response.data);
    rows.push(...pageRows);
    const pageCount = Number(response.data?.meta?.pageCount ?? response.data?.meta?.page_count ?? 0);
    if ((pageCount > 0 && page >= pageCount) || pageRows.length < 100) break;
  }
  return { configured: true, available: rows.length > 0, error: null, banks: rows };
};

const parseFlutterwaveRows = (body) => {
  if (String(body?.status ?? "").toLowerCase() !== "success") {
    throw new Error("Unexpected Flutterwave bank-directory response.");
  }
  const candidates = body?.data;
  const rows = Array.isArray(candidates) ? candidates : Array.isArray(candidates?.Banks) ? candidates.Banks : [];
  return rows
    .filter((bank) => {
      const type = String(bank?.provider_type ?? bank?.type ?? "").toLowerCase();
      return !type.includes("mobile") && !type.includes("wallet");
    })
    .map((bank) => ({ name: bank.name ?? bank.Name, code: bank.code ?? bank.Code }))
    .filter((bank) => bank.name && bank.code !== undefined && bank.code !== null);
};

const fetchFlutterwaveRows = async () => {
  const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secret) {
    return { configured: false, available: false, error: "FLUTTERWAVE_SECRET_KEY is not configured on the backend.", banks: [] };
  }
  const baseURL = (process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com/v3").replace(/\/$/, "");
  const response = await axios.get(`${baseURL}/banks/NG`, {
    params: { include_provider_type: 1 },
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    timeout: 15000,
  });
  const banks = parseFlutterwaveRows(response.data);
  return { configured: true, available: banks.length > 0, error: null, banks };
};

const loadProvider = async (provider, fetcher) => {
  const current = cache[provider];
  if (current.result && current.expiresAt > Date.now()) return current.result;

  try {
    const result = await fetcher();
    current.result = result;
    current.expiresAt = Date.now() + (result.available ? CACHE_TTL_MS : ERROR_CACHE_TTL_MS);
    return result;
  } catch {
    // Never expose provider request details or credentials to the browser.
    const result = {
      configured: Boolean(provider === "PAYSTACK" ? process.env.PAYSTACK_SECRET_KEY : process.env.FLUTTERWAVE_SECRET_KEY),
      available: false,
      error: `${provider === "PAYSTACK" ? "Paystack" : "Flutterwave"} bank directory could not be loaded. Retry later or check the provider configuration.`,
      banks: [],
    };
    current.result = result;
    current.expiresAt = Date.now() + ERROR_CACHE_TTL_MS;
    return result;
  }
};

export const getBankDirectory = async () => {
  const [paystack, flutterwave] = await Promise.all([
    loadProvider("PAYSTACK", fetchPaystackRows),
    loadProvider("FLUTTERWAVE", fetchFlutterwaveRows),
  ]);
  return {
    country: "NG",
    currency: "NGN",
    banks: mergeProviderBankLists(paystack.banks, flutterwave.banks),
    providers: { PAYSTACK: { configured: paystack.configured, available: paystack.available, error: paystack.error }, FLUTTERWAVE: { configured: flutterwave.configured, available: flutterwave.available, error: flutterwave.error } },
    cacheTtlSeconds: { success: 3600, unavailable: 60 },
  };
};
