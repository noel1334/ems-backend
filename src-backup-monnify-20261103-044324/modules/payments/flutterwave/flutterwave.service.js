import crypto from "node:crypto";
import { initializeFlutterwaveTransaction, verifyFlutterwaveTransaction } from "./flutterwave.client.js";

export const initialize = initializeFlutterwaveTransaction;
export const verify = verifyFlutterwaveTransaction;

export const verifyWebhookSignature = (signature) => {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!expected || !signature) return false;
  const expectedBytes = Buffer.from(String(expected), "utf8");
  const suppliedBytes = Buffer.from(String(signature), "utf8");
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
};
