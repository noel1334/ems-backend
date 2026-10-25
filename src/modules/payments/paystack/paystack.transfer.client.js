import axios from "axios";

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
  const amountInKobo = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(amountInKobo) || amountInKobo <= 0) throw new Error("Salary amount is outside Paystack's supported range.");
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
