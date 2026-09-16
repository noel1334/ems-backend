import {
  initializeFlutterwaveTransaction,
  verifyFlutterwaveTransaction,
} from "./flutterwave.client.js";

export const initialize = async (payload) => {
  return initializeFlutterwaveTransaction(payload);
};

export const verify = async (transactionId) => {
  return verifyFlutterwaveTransaction(transactionId);
};

export const verifyWebhookSignature = (signature) => {
  const webhookHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

  if (!webhookHash || !signature) {
    return false;
  }

  return signature === webhookHash;
};
