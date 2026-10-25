import axios from "axios";

const client = axios.create({
  baseURL: process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com/v3",
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured on the server.");
  config.headers.Authorization = `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`;
  return config;
});

export async function initiateFlutterwaveTransfer({ amount, accountNumber, bankCode, accountName, reference, narration }) {
  const value = Number(Number(amount).toFixed(2));
  if (!Number.isFinite(value) || value <= 0) throw new Error("Salary amount must be greater than zero.");
  const response = await client.post("/transfers", {
    account_bank: bankCode,
    account_number: accountNumber,
    amount: value,
    currency: "NGN",
    debit_currency: "NGN",
    reference,
    narration,
    beneficiary_name: accountName,
  });
  return response.data;
}

export async function verifyFlutterwaveTransfer(transferId) {
  const response = await client.get(`/transfers/${encodeURIComponent(String(transferId))}`);
  return response.data;
}
