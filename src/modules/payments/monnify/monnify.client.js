import axios from "axios";
import AppError from "../../../common/errors/AppError.js";
import { decryptMonnifySecret } from "./monnify.crypto.js";
import { monnifyFailureMessage } from "./monnify.utils.js";

const baseUrl = (environment) => environment === "live" ? "https://api.monnify.com" : "https://sandbox.monnify.com";
const unwrap = (response) => { const body = response?.data; if (!body?.requestSuccessful) { const providerCode = String(body?.responseCode || "MONNIFY_REQUEST_FAILED"); throw new AppError(monnifyFailureMessage(providerCode, body?.responseMessage), providerCode === "99" ? 502 : 422, { code: providerCode, details: { provider: "MONNIFY", providerCode, providerMessage: body?.responseMessage || null } }); } return body.responseBody ?? body; };
export async function monnifyRequest(connection, method, path, { data, params } = {}) {
  const apiKey = decryptMonnifySecret(connection.apiKeyCiphertext);
  const apiSecret = decryptMonnifySecret(connection.apiSecretCiphertext);
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const root = baseUrl(connection.environment);
  try {
    const login = await axios.post(`${root}/api/v1/auth/login`, {}, { headers: { Authorization: `Basic ${auth}` }, timeout: 20000 });
    if (!login.data?.requestSuccessful || !login.data?.responseBody?.accessToken) throw new Error(login.data?.responseMessage || "Monnify authentication failed");
    const response = await axios({ method, url: `${root}${path}`, data, params, timeout: 30000, headers: { Authorization: `Bearer ${login.data.responseBody.accessToken}`, "Content-Type": "application/json" } });
    return unwrap(response);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const status = error?.response?.status || 502; const body = error?.response?.data;
    const providerCode = String(body?.responseCode || "MONNIFY_UPSTREAM_ERROR");
    throw new AppError(body?.responseCode ? monnifyFailureMessage(providerCode, body?.responseMessage) : (error.message || "Unable to reach Monnify."), providerCode === "99" ? 502 : (status >= 400 && status < 500 ? status : 502), { code: providerCode, details: { provider: "MONNIFY", providerCode, providerMessage: body?.responseMessage || null } });
  }
}
export const monnifyEndpoints = {
  banks: (connection) => monnifyRequest(connection, "GET", "/api/v1/banks", { params: { countryCode: "NG" } }),
  validateAccount: (connection, accountNumber, bankCode) => monnifyRequest(connection, "GET", "/api/v2/disbursements/account/validate", { params: { accountNumber, bankCode } }),
  balance: (connection, accountNumber) => monnifyRequest(connection, "GET", "/api/v2/disbursements/wallet-balance", { params: { accountNumber } }),
  submitBatch: (connection, payload) => monnifyRequest(connection, "POST", "/api/v2/disbursements/batch", { data: payload }),
  authorizeBatch: (connection, reference, authorizationCode) => monnifyRequest(connection, "POST", "/api/v2/disbursements/batch/validate-otp", { data: { reference, authorizationCode } }),
  batchStatus: (connection, reference) => monnifyRequest(connection, "GET", "/api/v2/disbursements/bulk/summary", { params: { batchReference: reference } }),
  batchTransactions: (connection, reference, pageNo = 0, pageSize = 100) => monnifyRequest(connection, "GET", "/api/v2/disbursements/bulk/", { params: { batchReference: reference, pageNo, pageSize } }),
};
