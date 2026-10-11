import crypto from "node:crypto";
import { initializePaystackTransaction, verifyPaystackTransaction } from "./paystack.client.js";

export const initialize = initializePaystackTransaction;
export const verify = verifyPaystackTransaction;

export const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
