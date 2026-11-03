import axios from "axios";
import AppError from "../../../common/errors/AppError.js";

const client = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${process.env.PAYSTACK_SECRET_KEY}`;
  return config;
});

const providerError = (error) => {
  const message = error?.response?.data?.message || error?.message || "Paystack request failed";
  return new AppError(message, error?.response?.status >= 400 ? 502 : 500, { code: "PAYSTACK_ERROR" });
};

export const initializePaystackTransaction = async ({ email, amount, reference, callbackUrl, metadata, currency = "NGN", subaccount }) => {
  try {
    const response = await client.post("/transaction/initialize", {
      email,
      amount,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: JSON.stringify(metadata || {}),
      ...(subaccount ? { subaccount } : {}),
    });
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
};

export const verifyPaystackTransaction = async (reference) => {
  try {
    const response = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
};
