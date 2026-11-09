import Decimal from "decimal.js";

const decimalToString = (value) => new Decimal(value ?? 0).toFixed(2);
const date = (value) => (value ? new Date(value).toISOString() : null);

export const mapWallet = (wallet) => wallet ? ({
  id: wallet.id,
  companyId: wallet.companyId,
  // `balance` is the legacy/general account. Provider salary funds are isolated.
  balance: decimalToString(wallet.balance),
  generalBalance: decimalToString(wallet.balance),
  paystackBalance: decimalToString(wallet.paystackBalance),
  monnifyBalance: decimalToString(wallet.monnifyBalance),
  totalBalance: new Decimal(wallet.balance ?? 0).plus(wallet.paystackBalance ?? 0).plus(wallet.monnifyBalance ?? 0).toFixed(2),
  currency: wallet.currency,
  isActive: wallet.isActive,
  transactionCount: wallet._count?.ledgerEntries,
  totals: wallet.totals ? {
    credits: decimalToString(wallet.totals.credits),
    debits: decimalToString(wallet.totals.debits),
    paystackFunded: decimalToString(wallet.totals.paystackFunded),
    flutterwaveFunded: decimalToString(wallet.totals.flutterwaveFunded),
    providerFundedTotal: decimalToString(wallet.totals.providerFundedTotal),
    monnifyFunded: decimalToString(wallet.totals.monnifyFunded),
  } : undefined,
  createdAt: date(wallet.createdAt),
  updatedAt: date(wallet.updatedAt),
}) : null;

export const mapWalletTransaction = (transaction) => transaction ? ({
  id: transaction.id,
  companyId: transaction.companyId || transaction.wallet?.companyId,
  walletId: transaction.walletId,
  type: transaction.type,
  account: transaction.account || "GENERAL",
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
