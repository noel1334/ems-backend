import axios from "axios";
import AppError from "../../../common/errors/AppError.js";
import { decryptCompanyPaystackSecret } from "./company-paystack.crypto.js";

const BASE_URL = "https://api.paystack.co";

export async function companyPaystackRequest(connection, method, path, { data, params, timeout = 30000 } = {}) {
  const secretKey = decryptCompanyPaystackSecret(connection.secretKeyCiphertext);
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${path}`,
      data,
      params,
      timeout,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    });
    if (response.data?.status !== true) {
      const providerMessage = response.data?.message || "Paystack rejected the request.";
      throw new AppError(providerMessage, 422, {
        code: response.data?.code || "PAYSTACK_COMPANY_REQUEST_FAILED",
        details: { provider: "PAYSTACK", endpoint: path, providerStatus: response.status, providerMessage },
      });
    }
    return response.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const status = Number(error?.response?.status || 502);
    const message = error?.response?.data?.message || error?.message || "Unable to reach the company's Paystack account.";
    const details = error?.response?.data;
    throw new AppError(message, status >= 400 && status < 500 ? status : 502, {
      code: details?.code || (status === 401 ? "PAYSTACK_COMPANY_AUTH_FAILED" : "PAYSTACK_COMPANY_UPSTREAM_ERROR"),
      details: { provider: "PAYSTACK", endpoint: path, providerStatus: status, providerMessage: message },
    });
  }
}

export const companyPaystackEndpoints = {
  balance: (connection) => companyPaystackRequest(connection, "GET", "/balance", { params: { currency: "NGN" } }),
  banks: (connection) => companyPaystackRequest(connection, "GET", "/bank", { params: { currency: "NGN", perPage: 200 } }),
  resolveAccount: (connection, accountNumber, bankCode) => companyPaystackRequest(connection, "GET", "/bank/resolve", { params: { account_number: accountNumber, bank_code: bankCode } }),
  createRecipient: (connection, payload) => companyPaystackRequest(connection, "POST", "/transferrecipient", { data: payload }),
  initiateSingle: (connection, payload) => companyPaystackRequest(connection, "POST", "/transfer", { data: payload }),
  initiateBulk: (connection, payload) => companyPaystackRequest(connection, "POST", "/transfer/bulk", { data: payload, timeout: 45000 }),
  finalizeTransfer: (connection, transferCode, otp) => companyPaystackRequest(connection, "POST", "/transfer/finalize_transfer", { data: { transfer_code: transferCode, otp } }),
  verifyTransfer: (connection, reference) => companyPaystackRequest(connection, "GET", `/transfer/verify/${encodeURIComponent(reference)}`),
};
