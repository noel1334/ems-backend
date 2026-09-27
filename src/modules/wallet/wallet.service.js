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
const reference = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

export const getWallet = async (companyId, db = prisma) => {
  const wallet = await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  return mapWallet(await repository.findWallet(companyId, db) || wallet);
};

const executeCredit = async (db, companyId, { amount, reference: ref, description, metadata }) => {
  const creditAmount = money(amount);
  if (!creditAmount.isFinite() || !creditAmount.isPositive()) {
    throw new AppError("Wallet credit amount must be greater than zero", 400);
  }

  const transactionReference = ref || reference("WALLET-CR");

  await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  const wallet = await repository.lockWallet(companyId, db);
  if (!wallet) throw new AppError("Company wallet could not be locked", 500);
  if (!wallet.isActive) throw new AppError("Company wallet is inactive", 400);

  const existing = await repository.findLedgerByReference(transactionReference, db);
  if (existing) {
    if (existing.wallet.companyId !== companyId) {
      throw new AppError("Wallet transaction reference belongs to another company", 409);
    }
    return { duplicate: true, wallet: { ...wallet }, transaction: existing };
  }

  const before = money(wallet.balance);
  const after = before.plus(creditAmount);
  const transaction = await repository.createLedgerEntry({
    walletId: wallet.id,
    type: WALLET_TRANSACTION_TYPE.CREDIT,
    status: WALLET_TRANSACTION_STATUS.COMPLETED,
    amount: decimal(creditAmount),
    balanceBefore: decimal(before),
    balanceAfter: decimal(after),
    reference: transactionReference,
    description: description || null,
    metadata: metadata || undefined,
  }, db);

  await repository.updateWalletBalance(wallet.id, decimal(after), db);
  await repository.updateCompanyWalletBalance(companyId, decimal(after), db);

  return {
    duplicate: false,
    wallet: { ...wallet, balance: decimal(after) },
    transaction: { ...transaction, companyId },
  };
};

const executeDebit = async (db, companyId, { amount, reference: ref, description, metadata }) => {
  const debitAmount = money(amount);
  if (!debitAmount.isFinite() || !debitAmount.isPositive()) {
    throw new AppError("Wallet debit amount must be greater than zero", 400);
  }

  const transactionReference = ref || reference("WALLET-DR");

  await repository.findOrCreateWallet(companyId, DEFAULT_WALLET_CURRENCY, db);
  const wallet = await repository.lockWallet(companyId, db);
  if (!wallet) throw new AppError("Company wallet could not be locked", 500);
  if (!wallet.isActive) throw new AppError("Company wallet is inactive", 400);

  const existing = await repository.findLedgerByReference(transactionReference, db);
  if (existing) {
    if (existing.wallet.companyId !== companyId) {
      throw new AppError("Wallet transaction reference belongs to another company", 409);
    }
    return { duplicate: true, wallet: { ...wallet }, transaction: existing };
  }

  const before = money(wallet.balance);
  if (debitAmount.greaterThan(before)) throw new AppError("Insufficient wallet balance", 400);
  const after = before.minus(debitAmount);

  const transaction = await repository.createLedgerEntry({
    walletId: wallet.id,
    type: WALLET_TRANSACTION_TYPE.DEBIT,
    status: WALLET_TRANSACTION_STATUS.COMPLETED,
    amount: decimal(debitAmount),
    balanceBefore: decimal(before),
    balanceAfter: decimal(after),
    reference: transactionReference,
    description: description || null,
    metadata: metadata || undefined,
  }, db);

  await repository.updateWalletBalance(wallet.id, decimal(after), db);
  await repository.updateCompanyWalletBalance(companyId, decimal(after), db);

  return {
    duplicate: false,
    wallet: { ...wallet, balance: decimal(after) },
    transaction: { ...transaction, companyId },
  };
};

export const creditWallet = async (companyId, payload) =>
  prisma.$transaction((tx) => executeCredit(tx, companyId, payload), { isolationLevel: "Serializable" });

export const creditWalletInTransaction = (tx, companyId, payload) => executeCredit(tx, companyId, payload);

export const debitWallet = async (companyId, payload) =>
  prisma.$transaction((tx) => executeDebit(tx, companyId, payload), { isolationLevel: "Serializable" });

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
  const [wallet, credits, debits] = await Promise.all([
    repository.findWallet(companyId),
    repository.aggregateCredits(companyId),
    repository.aggregateDebits(companyId),
  ]);
  return {
    ...(wallet || (await repository.findOrCreateWallet(companyId))),
    totals: {
      credits: credits._sum.amount || new Prisma.Decimal(0),
      debits: debits._sum.amount || new Prisma.Decimal(0),
    },
  };
};

export const verifyWalletConsistency = async (companyId) => {
  const wallet = await repository.findWallet(companyId);
  if (!wallet) return { consistent: true, balance: "0.00", calculatedBalance: "0.00" };
  const entries = await prisma.walletLedgerEntry.aggregate({
    where: { wallet: { companyId }, status: WALLET_TRANSACTION_STATUS.COMPLETED },
    _sum: { amount: true },
  });
  // A full ledger balance requires signed aggregation because amount is stored positive.
  const [credits, debits] = await Promise.all([
    repository.aggregateCredits(companyId),
    repository.aggregateDebits(companyId),
  ]);
  const calculated = money(credits._sum.amount || 0).minus(money(debits._sum.amount || 0));
  return {
    consistent: money(wallet.balance).eq(calculated),
    balance: money(wallet.balance).toFixed(2),
    calculatedBalance: calculated.toFixed(2),
    entryAmountTotal: money(entries._sum.amount || 0).toFixed(2),
  };
};
