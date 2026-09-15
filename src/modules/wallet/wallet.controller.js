import {
  creditWallet,
  debitWallet,
  getWalletDetails,
  getWalletSummaryDetails,
  getWalletTransactions,
  verifyWalletConsistency,
} from "./wallet.service.js";

import { mapWallet, mapWalletTransaction } from "./wallet.mapper.js";

const getCompanyId = (req) => {
  return req.tenant?.companyId ?? req.user?.companyId;
};

const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

export const getWallet = async (req, res) => {
  const companyId = getCompanyId(req);

  const wallet = await getWalletDetails(companyId);

  return success(res, mapWallet(wallet));
};

export const getTransactions = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await getWalletTransactions({
    companyId,
    ...req.query,
  });

  return success(res, {
    transactions: result.transactions.map(mapWalletTransaction),
    pagination: result.pagination,
  });
};

export const credit = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await creditWallet({
    companyId,
    amount: req.body.amount,
    description: req.body.description,
    metadata: req.body.metadata,
  });

  return success(
    res,
    {
      duplicate: result.duplicate,
      wallet: mapWallet(result.wallet),
      transaction: mapWalletTransaction(result.transaction),
    },
    result.duplicate ? 200 : 201
  );
};

export const debit = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await debitWallet({
    companyId,
    amount: req.body.amount,
    description: req.body.description,
    metadata: req.body.metadata,
  });

  return success(
    res,
    {
      duplicate: result.duplicate,
      wallet: mapWallet(result.wallet),
      transaction: mapWalletTransaction(result.transaction),
    },
    result.duplicate ? 200 : 201
  );
};

export const walletConsistency = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await verifyWalletConsistency(companyId);

  return success(res, result);
};

export const walletSummary = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await getWalletSummaryDetails(companyId);

  return success(res, mapWallet(result));
};
