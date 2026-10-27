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

export async function getFlutterwaveAvailableBalance() {
  const response = await client.get("/balances");
  const body = response.data;
  if (body?.status !== "success" || !Array.isArray(body?.data)) {
    const error = new Error(body?.message || "Flutterwave could not return the integration balance.");
    error.providerResponse = body;
    throw error;
  }
  const ngn = body.data.find((item) => String(item.currency || "").toUpperCase() === "NGN");
  if (!ngn || !Number.isFinite(Number(ngn.available_balance))) {
    throw new Error("Flutterwave did not return an available NGN balance.");
  }
  // The v3 balances endpoint expresses available_balance in the wallet currency units.
  return { availableBalance: Number(ngn.available_balance), currency: "NGN", raw: body };
}

export async function getFlutterwaveTransferFee(amount) {
  const response = await client.get("/transfers/fee", {
    params: { amount: Number(amount), currency: "NGN", type: "account" },
  });
  const body = response.data;
  if (body?.status !== "success" || body?.data == null) {
    const error = new Error(body?.message || "Flutterwave could not estimate the NGN bank-transfer fee.");
    error.providerResponse = body;
    throw error;
  }
  const feeRows = Array.isArray(body.data) ? body.data : [body.data];
  const fees = feeRows.map((item) => Number(item?.fee_amount_in_fiat_currency ?? item?.fee)).filter(Number.isFinite);
  if (!fees.length || fees.some((fee) => fee < 0)) throw new Error("Flutterwave returned an invalid bank-transfer fee quote.");
  return { fee: Math.max(...fees), currency: "NGN", raw: body };
}

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
