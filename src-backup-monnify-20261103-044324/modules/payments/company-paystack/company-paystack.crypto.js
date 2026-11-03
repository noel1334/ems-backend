import crypto from "node:crypto";
import AppError from "../../../common/errors/AppError.js";

function encryptionKey() {
  const raw = String(process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY || process.env.MONNIFY_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new AppError("Set PAYMENT_CREDENTIALS_ENCRYPTION_KEY (or retain the existing MONNIFY_CREDENTIALS_ENCRYPTION_KEY) on the backend before saving provider credentials.", 500, { code: "PAYMENT_CREDENTIALS_KEY_MISSING" });
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try { key = Buffer.from(raw, "base64"); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw new AppError("Payment credential encryption key must decode to exactly 32 bytes.", 500, { code: "PAYMENT_CREDENTIALS_KEY_INVALID" });
  return key;
}

export function encryptCompanyPaystackSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptCompanyPaystackSecret(value) {
  try {
    const [ivPart, tagPart, encryptedPart] = String(value || "").split(":");
    if (!ivPart || !tagPart || !encryptedPart) throw new Error("Invalid ciphertext format");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("The saved company Paystack key cannot be decrypted. Confirm the encryption key has not changed.", 500, { code: "PAYSTACK_CREDENTIAL_DECRYPTION_FAILED" });
  }
}
