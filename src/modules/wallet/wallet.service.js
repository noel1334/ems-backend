import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import * as repository from "./wallet.repository.js";
import {
  DEFAULT_WALLET_CURRENCY,
  WALLET_TRANSACTION_STATUS,
  WALLET_TRANSACTION_TYPE,
} from "./wallet.constants.js";
import { writeAudit } from "../../common/utils/audit.js";
import { mapWallet, mapWalletTransaction, mapWalletTransactions } from "./wallet.mapper.js";

const money = (value) => new Decimal(value).toDecimalPlaces(2);
const decimal = (value) => new Prisma.Decimal(value.toFixed(2));
const normalizeAccount = (value) => {
  const account = String(value || "GENERAL").trim().toUpperCase();
  if (!["GENERAL", "PAYSTACK", "MONNIFY"].includes(account)) {
    throw new AppError("Wallet account must be GENERAL, PAYSTACK or MONNIFY", 400, { code: "INVALID_WALLET_ACCOUNT" });
  }
  return account;
};
const accountBalance = (wallet, account) => wallet[account === "PAYSTACK" ? "paystackBalance" : account === "MONNIFY" ? "monnifyBalance" : "balance"] ?? 0;
const updateAccount = async (wallet, account, value, companyId, db) => {
  await repository.updateWalletAccountBalance(wallet.id, account, decimal(value), db);
  await repository.updateCompanyWalletBalance(companyId, decimal(
    account === "GENERAL"
      ? money(value).plus(money(wallet.paystackBalance || 0)).plus(money(wallet.monnifyBalance || 0))
      : money(wallet.balance || 0).plus(account === "PAYSTACK" ? money(value) : money(wallet.paystackBalance || 0)).plus(account === "MONNIFY" ? money(value) : money(wallet.monnifyBalance || 0))
  ), db);
};
const reference = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

export const getWallet = async (companyId, db = prisma) => {
  const wallet = await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  return mapWallet(await repository.findWallet(companyId, db) || wallet);
};

const executeCredit = async (db, companyId, { amount, reference: ref, description, metadata, account: accountInput, salaryAccount }) => {
  const creditAmount = money(amount);
  if (!creditAmount.isFinite() || !creditAmount.isPositive()) {
    throw new AppError("Wallet credit amount must be greater than zero", 400);
  }

  const transactionReference = ref || reference("WALLET-CR");
  const account = normalizeAccount(salaryAccount || accountInput || "GENERAL");

  await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  const wallet = await repository.lockWallet(companyId, db);
  if (!wallet) throw new AppError("Company wallet could not be locked", 500);
  if (!wallet.isActive) throw new AppError("Company wallet is inactive", 400);

  const existing = await repository.findLedgerByReference(transactionReference, db);
  if (existing) {
    if (existing.wallet.companyId !== companyId) {
      throw new AppError("Wallet transaction reference belongs to another company", 409);
    }
    if ((existing.account || "GENERAL") !== account) throw new AppError("Wallet transaction reference was already used for a different salary account", 409, { code: "WALLET_REFERENCE_ACCOUNT_MISMATCH" });
    return { duplicate: true, wallet: { ...wallet }, transaction: existing };
  }

  const before = money(accountBalance(wallet, account));
  const after = before.plus(creditAmount);
  const transaction = await repository.createLedgerEntry({
    walletId: wallet.id,
    type: WALLET_TRANSACTION_TYPE.CREDIT,
    account,
    status: WALLET_TRANSACTION_STATUS.COMPLETED,
    amount: decimal(creditAmount),
    balanceBefore: decimal(before),
    balanceAfter: decimal(after),
    reference: transactionReference,
    description: description || null,
    metadata: metadata || undefined,
  }, db);

  await updateAccount(wallet, account, after, companyId, db);

  return {
    duplicate: false,
    wallet: { ...wallet, [account === "PAYSTACK" ? "paystackBalance" : account === "MONNIFY" ? "monnifyBalance" : "balance"]: decimal(after) },
    transaction: { ...transaction, companyId },
  };
};

const executeDebit = async (db, companyId, { amount, reference: ref, description, metadata, account: accountInput, salaryAccount }) => {
  const debitAmount = money(amount);
  if (!debitAmount.isFinite() || !debitAmount.isPositive()) {
    throw new AppError("Wallet debit amount must be greater than zero", 400);
  }

  const transactionReference = ref || reference("WALLET-DR");
  const account = normalizeAccount(salaryAccount || accountInput || "GENERAL");

  await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  const wallet = await repository.lockWallet(companyId, db);
  if (!wallet) throw new AppError("Company wallet could not be locked", 500);
  if (!wallet.isActive) throw new AppError("Company wallet is inactive", 400);

  const existing = await repository.findLedgerByReference(transactionReference, db);
  if (existing) {
    if (existing.wallet.companyId !== companyId) {
      throw new AppError("Wallet transaction reference belongs to another company", 409);
    }
    if ((existing.account || "GENERAL") !== account) throw new AppError("Wallet transaction reference was already used for a different salary account", 409, { code: "WALLET_REFERENCE_ACCOUNT_MISMATCH" });
    return { duplicate: true, wallet: { ...wallet }, transaction: existing };
  }

  const before = money(accountBalance(wallet, account));
  if (debitAmount.greaterThan(before)) throw new AppError(`Insufficient ${account} wallet balance`, 400, { code: "INSUFFICIENT_WALLET_ACCOUNT_BALANCE", details: { account, available: before.toFixed(2), required: debitAmount.toFixed(2) } });
  const after = before.minus(debitAmount);

  const transaction = await repository.createLedgerEntry({
    walletId: wallet.id,
    type: WALLET_TRANSACTION_TYPE.DEBIT,
    account,
    status: WALLET_TRANSACTION_STATUS.COMPLETED,
    amount: decimal(debitAmount),
    balanceBefore: decimal(before),
    balanceAfter: decimal(after),
    reference: transactionReference,
    description: description || null,
    metadata: metadata || undefined,
  }, db);

  await updateAccount(wallet, account, after, companyId, db);

  return {
    duplicate: false,
    wallet: { ...wallet, [account === "PAYSTACK" ? "paystackBalance" : account === "MONNIFY" ? "monnifyBalance" : "balance"]: decimal(after) },
    transaction: { ...transaction, companyId },
  };
};

export const creditWallet = async (companyId, payload) =>
  prisma.$transaction((tx) => executeCredit(tx, companyId, payload), { isolationLevel: "Serializable" });

export const creditWalletInTransaction = (tx, companyId, payload) => executeCredit(tx, companyId, payload);

export const debitWallet = async (companyId, payload) =>
  prisma.$transaction((tx) => executeDebit(tx, companyId, payload), { isolationLevel: "Serializable" });

// Used only by workflows that must atomically reserve wallet funds and create
// their corresponding business records in the same database transaction.
export const debitWalletInTransaction = (tx, companyId, payload) => executeDebit(tx, companyId, payload);

export const getWalletDetails = (companyId) => getWallet(companyId);

export const getWalletTransactions = async (companyId, { page = 1, limit = 20, type, status, search, startDate, endDate }) => {
  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (search) where.OR = [
    { reference: { contains: search, mode: "insensitive" } },
    { description: { contains: search, mode: "insensitive" } },
  ];
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    repository.listLedgerEntries(companyId, { skip, take: limit, where }),
    repository.countLedgerEntries(companyId, where),
  ]);
  return {
    transactions: mapWalletTransactions(rows),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getWalletSummaryDetails = async (companyId) => {
  const [wallet, credits, debits, paystackFunding, flutterwaveFunding, monnifyFunding] = await Promise.all([
    repository.findWallet(companyId),
    repository.aggregateCredits(companyId),
    repository.aggregateDebits(companyId),
    prisma.payment.aggregate({ where: { companyId, provider: "PAYSTACK", purpose: "WALLET_FUNDING", status: "SUCCESSFUL", currency: "NGN" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { companyId, provider: "FLUTTERWAVE", purpose: "WALLET_FUNDING", status: "SUCCESSFUL", currency: "NGN" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { companyId, provider: "MONNIFY", purpose: "WALLET_FUNDING", status: "SUCCESSFUL", currency: "NGN" }, _sum: { amount: true } }),
  ]);
  const paystackAmount = paystackFunding._sum.amount || new Prisma.Decimal(0);
  const flutterwaveAmount = flutterwaveFunding._sum.amount || new Prisma.Decimal(0);
  const monnifyAmount = monnifyFunding._sum.amount || new Prisma.Decimal(0);
  return {
    ...(wallet || (await repository.findOrCreateWallet(companyId))),
    totals: {
      credits: credits._sum.amount || new Prisma.Decimal(0),
      debits: debits._sum.amount || new Prisma.Decimal(0),
      paystackFunded: paystackAmount,
      flutterwaveFunded: flutterwaveAmount,
      providerFundedTotal: paystackAmount.plus(flutterwaveAmount).plus(monnifyAmount),
      monnifyFunded: monnifyAmount,
    },
  };
};

export const verifyWalletConsistency = async (companyId) => {
  const wallet = await repository.findWallet(companyId);
  if (!wallet) return { consistent: true, balance: "0.00", calculatedBalance: "0.00", accounts: { GENERAL: "0.00", PAYSTACK: "0.00", MONNIFY: "0.00" } };
  const rows = await prisma.walletLedgerEntry.findMany({
    where: { wallet: { companyId }, status: WALLET_TRANSACTION_STATUS.COMPLETED },
    select: { account: true, type: true, amount: true },
  });
  const calculated = { GENERAL: new Decimal(0), PAYSTACK: new Decimal(0), MONNIFY: new Decimal(0) };
  for (const row of rows) {
    const account = row.account || "GENERAL";
    if (!(account in calculated)) continue;
    calculated[account] = row.type === WALLET_TRANSACTION_TYPE.CREDIT
      ? calculated[account].plus(money(row.amount))
      : calculated[account].minus(money(row.amount));
  }
  const actual = {
    GENERAL: money(wallet.balance),
    PAYSTACK: money(wallet.paystackBalance),
    MONNIFY: money(wallet.monnifyBalance),
  };
  const consistent = Object.keys(actual).every((account) => actual[account].eq(calculated[account]));
  const total = (values) => values.GENERAL.plus(values.PAYSTACK).plus(values.MONNIFY);
  return {
    consistent,
    balance: total(actual).toFixed(2),
    calculatedBalance: total(calculated).toFixed(2),
    accounts: Object.fromEntries(Object.keys(actual).map((account) => [account, actual[account].toFixed(2)])),
    calculatedAccounts: Object.fromEntries(Object.keys(calculated).map((account) => [account, calculated[account].toFixed(2)])),
  };
};
