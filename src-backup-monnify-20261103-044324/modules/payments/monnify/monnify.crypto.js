import crypto from "node:crypto";
import AppError from "../../../common/errors/AppError.js";

const key = () => {
  const raw = String(process.env.MONNIFY_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new AppError("MONNIFY_CREDENTIALS_ENCRYPTION_KEY is not configured.", 503, { code: "MONNIFY_ENCRYPTION_KEY_MISSING" });
  let value;
  if (/^[a-f0-9]{64}$/i.test(raw)) value = Buffer.from(raw, "hex");
  else value = Buffer.from(raw, "base64");
  if (value.length != 32) throw new AppError("Monnify encryption key must be 32 bytes (base64 or 64-character hex).", 503, { code: "MONNIFY_ENCRYPTION_KEY_INVALID" });
  return value;
};
export const encryptMonnifySecret = (value) => {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
};
export const decryptMonnifySecret = (value) => {
  try { const [iv, tag, encrypted] = String(value).split("."); const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch { throw new AppError("Stored Monnify credentials could not be decrypted. Check the encryption key.", 503, { code: "MONNIFY_CREDENTIAL_DECRYPTION_FAILED" }); }
};
