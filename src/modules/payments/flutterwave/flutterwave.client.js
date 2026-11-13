import axios from "axios";
import AppError from "../../../common/errors/AppError.js";

const client = axios.create({
  baseURL: process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com/v3",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`;
  return config;
});

const providerError = (error) => new AppError(
  error?.response?.data?.message || error?.message || "Flutterwave request failed",
  error?.response?.status >= 400 ? 502 : 500,
  { code: "FLUTTERWAVE_ERROR" }
);

export const initializeFlutterwaveTransaction = async ({ email, amount, reference, callbackUrl, metadata, currency = "NGN", subaccountId }) => {
  try {
    const response = await client.post("/payments", {
      tx_ref: reference,
      amount: Number(amount),
      currency,
      redirect_url: callbackUrl,
      customer: { email },
      meta: metadata,
      // The company subaccount is configured with a 100% settlement split.
      // A zero `flat` platform commission leaves the post-provider-fee remainder
      // with that subaccount; a transaction_charge equal to amount would retain
      // the entire amount for the platform instead.
      ...(subaccountId ? { subaccounts: [{ id: subaccountId, transaction_charge_type: "flat", transaction_charge: 0 }] } : {}),
    });
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
};

export const createFlutterwaveSubaccount = async (details) => {
  try {
    const response = await client.post("/subaccounts", details);
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
};

export const verifyFlutterwaveTransaction = async (transactionId) => {
  try {
    const response = await client.get(`/transactions/${encodeURIComponent(transactionId)}/verify`);
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
};
