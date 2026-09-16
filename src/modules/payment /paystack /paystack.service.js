import crypto from "node:crypto";

import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from "./paystack.client.js";

export const initialize = async (payload) => {
  return initializePaystackTransaction(payload);
};

export const verify = async (reference) => {
  return verifyPaystackTransaction(reference);
};

export const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);

  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};
