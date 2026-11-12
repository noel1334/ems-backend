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
    const safeParams = params ? Object.fromEntries(Object.entries(params).map(([key, value]) => [key, key.toLowerCase().includes("account") ? `••••${String(value || "").slice(-4)}` : value])) : undefined;
    const requestDiagnostic = { method: String(method).toUpperCase(), path, query: safeParams || null };
    if (error instanceof AppError) {
      error.details = { ...(error.details || {}), provider: "MONNIFY", request: requestDiagnostic };
      throw error;
    }
    const status = error?.response?.status || 502; const body = error?.response?.data;
    const providerCode = String(body?.responseCode || "MONNIFY_UPSTREAM_ERROR");
    throw new AppError(body?.responseCode ? monnifyFailureMessage(providerCode, body?.responseMessage) : (error.message || "Unable to reach Monnify."), providerCode === "99" ? 502 : (status >= 400 && status < 500 ? status : 502), { code: providerCode, details: { provider: "MONNIFY", providerCode, providerMessage: body?.responseMessage || null, request: requestDiagnostic, providerResponse: body && typeof body === "object" ? { requestSuccessful: body.requestSuccessful ?? null, responseCode: body.responseCode ?? null, responseMessage: body.responseMessage ?? null } : null } });
  }
}
export const monnifyEndpoints = {
  initializeTransaction: (connection, payload) => monnifyRequest(connection, "POST", "/api/v1/merchant/transactions/init-transaction", { data: payload }),
  verifyTransaction: (connection, paymentReference) => monnifyRequest(connection, "GET", "/api/v2/merchant/transactions/query", { params: { paymentReference } }),
  // Monnify's authenticated Get Banks endpoint is exactly GET /api/v1/banks.
  // Do not append a provider-specific query parameter; consume its responseBody codes.
  banks: (connection) => monnifyRequest(connection, "GET", "/api/v1/banks"),
  validateAccount: async (connection, accountNumber, bankCode) => {
    try {
      return await monnifyRequest(connection, "GET", "/api/v2/disbursements/account/validate", { params: { accountNumber, bankCode } });
    } catch (error) {
      // Monnify code 99 is an unexpected provider error, not proof of an invalid
      // beneficiary. Retry this read-only Name Enquiry once before surfacing it.
      if (String(error?.code || error?.details?.providerCode || "").toUpperCase() !== "99") throw error;
      return monnifyRequest(connection, "GET", "/api/v2/disbursements/account/validate", { params: { accountNumber, bankCode } });
    }
  },
  balance: (connection, accountNumber) => monnifyRequest(connection, "GET", "/api/v2/disbursements/wallet-balance", { params: { accountNumber } }),
  settlementDetail: (connection, reference) => monnifyRequest(connection, "GET", "/api/v1/settlement-detail", { params: { reference } }),
  transactionsBySettlement: (connection, reference, page = 0, size = 50) => monnifyRequest(connection, "GET", "/api/v1/transactions/find-by-settlement-reference", { params: { reference, page, size } }),
  submitBatch: (connection, payload) => monnifyRequest(connection, "POST", "/api/v2/disbursements/batch", { data: payload }),
  submitSingle: (connection, payload) => monnifyRequest(connection, "POST", "/api/v2/disbursements/single", { data: payload }),
  authorizeSingle: (connection, reference, authorizationCode) => monnifyRequest(connection, "POST", "/api/v2/disbursements/single/validate-otp", { data: { reference, authorizationCode } }),
  singleStatus: (connection, reference) => monnifyRequest(connection, "GET", "/api/v2/disbursements/single/summary", { params: { reference } }),
  authorizeBatch: (connection, reference, authorizationCode) => monnifyRequest(connection, "POST", "/api/v2/disbursements/batch/validate-otp", { data: { reference, authorizationCode } }),
  resendBatchOtp: (connection, reference) => monnifyRequest(connection, "POST", "/api/v2/disbursements/single/resend-otp", { data: { reference } }),
  batchStatus: (connection, reference) => monnifyRequest(connection, "GET", "/api/v2/disbursements/bulk/summary", { params: { batchReference: reference } }),
  batchTransactions: async (connection, reference, pageNo = 0, pageSize = 100) => {
    const all = [];
    let page = pageNo;
    let totalPages = null;
    // Bulk transaction history is paginated. Reconcile every page so a large payroll
    // does not leave employees beyond the first 100 stuck in PROCESSING.
    do {
      // Monnify's Get Bulk Transfer Transactions endpoint places the batch reference
      // in the URL path: /bulk/{batchReference}/transactions?pageNo=0&pageSize=100.
      const payload = await monnifyRequest(connection, "GET", `/api/v2/disbursements/bulk/${encodeURIComponent(reference)}/transactions`, { params: { pageNo: page, pageSize } });
      const rows = Array.isArray(payload) ? payload : (payload?.content || payload?.transactions || payload?.items || payload?.data?.content || []);
      if (Array.isArray(rows)) all.push(...rows);
      const pages = Number(payload?.totalPages ?? payload?.data?.totalPages ?? payload?.page?.totalPages);
      if (Number.isFinite(pages) && pages > 0) totalPages = pages;
      if (totalPages !== null) {
        page += 1;
      } else {
        if (!Array.isArray(rows) || rows.length < pageSize) break;
        page += 1;
      }
      if (page - pageNo >= 50) break;
    } while (totalPages === null || page < totalPages);
    return { content: all, totalElements: all.length, totalPages: totalPages ?? (all.length ? Math.ceil(all.length / pageSize) : 0) };
  },
};
