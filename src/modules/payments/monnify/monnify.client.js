import axios from "axios";
import AppError from "../../../common/errors/AppError.js";
import { decryptMonnifySecret } from "./monnify.crypto.js";
import { monnifyFailureMessage } from "./monnify.utils.js";
import { unwrapMonnifyTransactionRows } from "./monnify.reconciliation.utils.js";

const baseUrl = (environment) => environment === "live" ? "https://api.monnify.com" : "https://sandbox.monnify.com";
const unwrap = (response) => {
  const body = response?.data;
  if (!body?.requestSuccessful) {
    const providerCode = String(body?.responseCode || "MONNIFY_REQUEST_FAILED");
    throw new AppError(
      monnifyFailureMessage(providerCode, body?.responseMessage),
      providerCode === "99" ? 502 : 422,
      {
        code: providerCode,
        details: {
          provider: "MONNIFY",
          providerCode,
          providerMessage: body?.responseMessage || null,
          providerResponse: {
            requestSuccessful: false,
            responseCode: providerCode,
            responseMessage: body?.responseMessage || null,
          },
        },
      },
    );
  }
  return body.responseBody ?? body;
};
export async function monnifyRequest(connection, method, path, { data, params } = {}) {
  const apiKey = decryptMonnifySecret(connection.apiKeyCiphertext);
  const apiSecret = decryptMonnifySecret(connection.apiSecretCiphertext);
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const root = baseUrl(connection.environment);
  const safeParams = params ? Object.fromEntries(Object.entries(params).map(([key, value]) => [key, key.toLowerCase().includes("account") ? `••••${String(value || "").slice(-4)}` : value])) : undefined;
  let requestDiagnostic = { method: "POST", path: "/api/v1/auth/login", query: null };
  try {
    const login = await axios.post(`${root}/api/v1/auth/login`, {}, { headers: { Authorization: `Basic ${auth}` }, timeout: 20000 });
    if (!login.data?.requestSuccessful || !login.data?.responseBody?.accessToken) {
      const providerCode = String(login.data?.responseCode || "MONNIFY_AUTHENTICATION_FAILED");
      throw new AppError(
        login.data?.responseMessage || "Monnify authentication failed or did not return an access token.",
        providerCode === "99" ? 502 : 422,
        {
          code: providerCode,
          details: {
            provider: "MONNIFY",
            providerCode,
            providerMessage: login.data?.responseMessage || null,
            request: requestDiagnostic,
            providerResponse: {
              requestSuccessful: login.data?.requestSuccessful ?? false,
              responseCode: login.data?.responseCode || null,
              responseMessage: login.data?.responseMessage || null,
            },
          },
        },
      );
    }
    requestDiagnostic = { method: String(method).toUpperCase(), path, query: safeParams || null };
    const response = await axios({ method, url: `${root}${path}`, data, params, timeout: 30000, headers: { Authorization: `Bearer ${login.data.responseBody.accessToken}`, "Content-Type": "application/json" } });
    return unwrap(response);
  } catch (error) {
    if (error instanceof AppError) {
      error.details = { ...(error.details || {}), provider: "MONNIFY", request: error.details?.request || requestDiagnostic };
      throw error;
    }
    const status = error?.response?.status || 502;
    const body = error?.response?.data;
    const providerCode = String(body?.responseCode || "MONNIFY_UPSTREAM_ERROR");
    throw new AppError(
      body?.responseCode ? monnifyFailureMessage(providerCode, body?.responseMessage) : (error.message || "Unable to reach Monnify."),
      providerCode === "99" ? 502 : (status >= 400 && status < 500 ? status : 502),
      {
        code: providerCode,
        details: {
          provider: "MONNIFY",
          providerCode,
          providerMessage: body?.responseMessage || null,
          request: requestDiagnostic,
          providerResponse: body && typeof body === "object" ? {
            requestSuccessful: body.requestSuccessful ?? null,
            responseCode: body.responseCode ?? null,
            responseMessage: body.responseMessage ?? null,
          } : null,
        },
      },
    );
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
    // Monnify documents Get Bulk Transfer Transactions at the collection URL
    // /api/v2/disbursements/bulk/ (not /bulk/{batchReference}/transactions).
    // Restrict the collection query to this batch and fetch every page.
    do {
      const payload = await monnifyRequest(connection, "GET", "/api/v2/disbursements/bulk/", {
        params: { batchReference: reference, pageNo: page, pageSize },
      });
      const rows = unwrapMonnifyTransactionRows(payload);
      if (Array.isArray(rows)) all.push(...rows);
      const pages = Number(payload?.totalPages ?? payload?.data?.totalPages ?? payload?.page?.totalPages ?? payload?.pagination?.totalPages ?? payload?.data?.page?.totalPages);
      if (Number.isFinite(pages) && pages > 0) totalPages = pages;
      if (totalPages !== null) {
        page += 1;
      } else {
        if (!Array.isArray(rows) || rows.length < pageSize) break;
        page += 1;
      }
      if (page - pageNo >= 50) break;
    } while (totalPages === null || page < totalPages);
    // Defensively retain only rows belonging to the requested batch if the
    // provider returns a wider transaction collection despite the filter.
    const matchingRows = all.filter((row) => {
      const rowBatchReference = String(row?.batchReference ?? row?.batch?.batchReference ?? row?.batch?.reference ?? "").trim();
      return !rowBatchReference || rowBatchReference === String(reference).trim();
    });
    return { content: matchingRows, totalElements: matchingRows.length, totalPages: totalPages ?? (matchingRows.length ? Math.ceil(matchingRows.length / pageSize) : 0) };
  },
};
