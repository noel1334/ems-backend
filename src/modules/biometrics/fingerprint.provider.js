import crypto from "node:crypto";
import AppError from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";

/**
 * Provider-neutral fingerprint gateway.
 *
 * The EMS never attempts to read a laptop/phone fingerprint sensor directly.
 * A certified scanner/terminal or a local device bridge performs capture and
 * matching, then sends a provider/device reference to this API.
 *
 * This adapter can optionally call a self-hosted fingerprint service. No paid
 * biometric SaaS is required by the EMS contract.
 */
const configured = Boolean(env.FINGERPRINT_PROVIDER_URL && env.FINGERPRINT_PROVIDER_API_KEY);

const assertConfigured = () => {
  if (!configured) {
    throw new AppError(
      "Fingerprint provider is not configured. Configure a scanner/device gateway or set FINGERPRINT_PROVIDER_URL and FINGERPRINT_PROVIDER_API_KEY.",
      503,
      "FINGERPRINT_PROVIDER_NOT_CONFIGURED",
    );
  }
};

const hashTemplate = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

export const hashTemplateBuffer = hashTemplate;
export const isConfigured = () => configured;

export const verifyWithProvider = async ({ template, deviceReference, type = "FINGERPRINT" }) => {
  assertConfigured();
  const response = await fetch(`${env.FINGERPRINT_PROVIDER_URL.replace(/\/$/, "")}/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.FINGERPRINT_PROVIDER_API_KEY}`,
    },
    body: JSON.stringify({
      templateBase64: template.toString("base64"),
      deviceReference,
      type,
    }),
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    throw new AppError(data?.message || "Fingerprint provider request failed", 502, "FINGERPRINT_PROVIDER_ERROR");
  }
  return data;
};
