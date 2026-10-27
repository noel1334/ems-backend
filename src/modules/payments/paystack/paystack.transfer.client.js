import axios from "axios";
import Decimal from "decimal.js";

const client = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is not configured on the server.");
  config.headers.Authorization = `Bearer ${process.env.PAYSTACK_SECRET_KEY}`;
  return config;
});

export async function getPaystackAvailableBalance() {
  const response = await client.get("/balance");
  const body = response.data;
  if (body?.status !== true || !Array.isArray(body?.data)) {
    const error = new Error(body?.message || "Paystack could not return the integration balance.");
    error.providerResponse = body;
    throw error;
  }
  const ngn = body.data.find((item) => String(item.currency || "").toUpperCase() === "NGN");
  if (!ngn || !Number.isFinite(Number(ngn.balance))) {
    throw new Error("Paystack did not return an NGN balance.");
  }
  // Paystack returns NGN balances in kobo.
  return { availableBalance: Number(ngn.balance) / 100, currency: "NGN", raw: body };
}

export async function createPaystackTransferRecipient({ name, accountNumber, bankCode, email }) {
  const response = await client.post("/transferrecipient", {
    type: "nuban",
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: "NGN",
    ...(email ? { email } : {}),
  });
  if (response.data?.status !== true || !response.data?.data?.recipient_code) {
    const error = new Error(response.data?.message || "Paystack did not return a transfer recipient code.");
    error.providerResponse = response.data;
    throw error;
  }
  return response.data;
}

export async function initiatePaystackTransfer({ amount, recipientCode, reference, reason }) {
  // Decimal arithmetic avoids binary floating point errors when converting naira to kobo.
  const amountDecimal = new Decimal(amount);
  if (!amountDecimal.isFinite() || !amountDecimal.isPositive()) throw new Error("Salary amount must be a positive valid number.");
  const amountInKoboDecimal = amountDecimal.mul(100);
  if (!amountInKoboDecimal.isInteger() || !amountInKoboDecimal.isSafeInteger()) throw new Error("Salary amount is outside Paystack's supported range.");
  const amountInKobo = amountInKoboDecimal.toNumber();
  const response = await client.post("/transfer", {
    source: "balance",
    amount: amountInKobo,
    recipient: recipientCode,
    reference,
    reason,
    currency: "NGN",
  });
  return response.data;
}

export async function verifyPaystackTransfer(reference) {
  const response = await client.get(`/transfer/verify/${encodeURIComponent(reference)}`);
  return response.data;
}
