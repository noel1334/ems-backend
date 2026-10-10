import Decimal from "decimal.js";

const decimalToString = (value) => new Decimal(value ?? 0).toFixed(2);
const date = (value) => (value ? new Date(value).toISOString() : null);

export const mapWallet = (wallet) => wallet ? ({
  id: wallet.id,
  companyId: wallet.companyId,
  balance: decimalToString(wallet.balance),
  currency: wallet.currency,
  isActive: wallet.isActive,
  transactionCount: wallet._count?.ledgerEntries,
  totals: wallet.totals ? {
    credits: decimalToString(wallet.totals.credits),
    debits: decimalToString(wallet.totals.debits),
  } : undefined,
  createdAt: date(wallet.createdAt),
  updatedAt: date(wallet.updatedAt),
}) : null;

export const mapWalletTransaction = (transaction) => transaction ? ({
  id: transaction.id,
  companyId: transaction.companyId || transaction.wallet?.companyId,
  walletId: transaction.walletId,
  type: transaction.type,
  status: transaction.status,
  amount: decimalToString(transaction.amount),
  balanceBefore: decimalToString(transaction.balanceBefore),
  balanceAfter: decimalToString(transaction.balanceAfter),
  reference: transaction.reference,
  description: transaction.description ?? null,
  metadata: transaction.metadata ?? null,
  createdAt: date(transaction.createdAt),
}) : null;

export const mapWalletTransactions = (rows) => rows.map(mapWalletTransaction);
