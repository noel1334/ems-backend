import axios from "axios";

const client = axios.create({
  baseURL: process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com/v3",

  timeout: 15000,

  headers: {
    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,

    "Content-Type": "application/json",
  },
});

export const initializeFlutterwaveTransaction = async ({
  email,
  amount,
  reference,
  callbackUrl,
  metadata,
}) => {
  const response = await client.post("/payments", {
    tx_ref: reference,

    amount: Number(amount),

    currency: "NGN",

    redirect_url: callbackUrl,

    customer: {
      email,
    },

    meta: metadata,
  });

  return response.data;
};

export const verifyFlutterwaveTransaction = async (transactionId) => {
  const response = await client.get(
    `/transactions/${encodeURIComponent(transactionId)}/verify`
  );

  return response.data;
};
