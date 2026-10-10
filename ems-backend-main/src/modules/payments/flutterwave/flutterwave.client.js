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

export const initializeFlutterwaveTransaction = async ({ email, amount, reference, callbackUrl, metadata, currency = "NGN" }) => {
  try {
    const response = await client.post("/payments", {
      tx_ref: reference,
      amount: Number(amount),
      currency,
      redirect_url: callbackUrl,
      customer: { email },
      meta: metadata,
    });
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
