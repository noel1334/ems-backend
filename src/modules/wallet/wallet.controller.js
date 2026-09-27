import {
  creditWallet,
  debitWallet,
  getWalletDetails,
  getWalletSummaryDetails,
  getWalletTransactions,
  verifyWalletConsistency,
} from "./wallet.service.js";
import { mapWallet, mapWalletTransaction } from "./wallet.mapper.js";

const companyId = (req) => req.tenant?.companyId || req.user?.companyId;
const success = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const getWallet = async (req, res) => success(res, mapWallet(await getWalletDetails(companyId(req))));
export const getTransactions = async (req, res) => {
  const result = await getWalletTransactions(companyId(req), req.query);
  return success(res, { transactions: result.transactions.map(mapWalletTransaction), pagination: result.pagination });
};
export const credit = async (req, res) => {
  const result = await creditWallet(companyId(req), req.body);
  return success(res, { duplicate: result.duplicate, wallet: mapWallet(result.wallet), transaction: mapWalletTransaction(result.transaction) }, result.duplicate ? 200 : 201);
};
export const debit = async (req, res) => {
  const result = await debitWallet(companyId(req), req.body);
  return success(res, { duplicate: result.duplicate, wallet: mapWallet(result.wallet), transaction: mapWalletTransaction(result.transaction) }, result.duplicate ? 200 : 201);
};
export const walletConsistency = async (req, res) => success(res, await verifyWalletConsistency(companyId(req)));
export const walletSummary = async (req, res) => success(res, mapWallet(await getWalletSummaryDetails(companyId(req))));
