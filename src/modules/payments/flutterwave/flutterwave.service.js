import { initializeFlutterwaveTransaction, verifyFlutterwaveTransaction } from "./flutterwave.client.js";

export const initialize = initializeFlutterwaveTransaction;
export const verify = verifyFlutterwaveTransaction;

export const verifyWebhookSignature = (signature) => {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!expected || !signature) return false;
  return String(signature) === String(expected);
};
