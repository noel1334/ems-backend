import Decimal from "decimal.js";

const decimalToString = (value) => {
  return new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2);
};

const dateToISO = (value) => {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
};

export const mapWallet = (wallet) => {
  if (!wallet) {
    return null;
  }

  return {
    id: wallet.id,
    companyId: wallet.companyId,
    balance: decimalToString(wallet.balance),
    currency: wallet.currency,
    isActive: wallet.isActive,
    transactionCount: wallet._count?.transactions ?? undefined,
    createdAt: dateToISO(wallet.createdAt),
    updatedAt: dateToISO(wallet.updatedAt),
  };
};

export const mapWalletTransaction = (transaction) => {
  if (!transaction) {
    return null;
  }

  return {
    id: transaction.id,
    companyId: transaction.companyId,
    walletId: transaction.walletId,

    type: transaction.type,
    status: transaction.status,

    amount: decimalToString(transaction.amount),

    balanceBefore: decimalToString(transaction.balanceBefore),

    balanceAfter: decimalToString(transaction.balanceAfter),

    reference: transaction.reference,

    description: transaction.description ?? null,

    metadata: transaction.metadata ?? null,

    createdAt: dateToISO(transaction.createdAt),

    updatedAt: dateToISO(transaction.updatedAt),
  };
};

export const mapWalletTransactions = (transactions) => {
  return transactions.map(mapWalletTransaction);
};
