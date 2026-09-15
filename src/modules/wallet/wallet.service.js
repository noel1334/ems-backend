import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import * as walletRepository from "../auth/wallet.repository.js";
import {
  DEFAULT_WALLET_CURRENCY,
  WALLET_TRANSACTION_STATUS,
  WALLET_TRANSACTION_TYPE,
} from "./wallet.constants.js";
import {
  mapWallet,
  mapWalletTransaction,
  mapWalletTransactions,
} from "./wallet.mapper.js";

const money = (value) => {
  return new Decimal(value).toDecimalPlaces(2);
};

const decimalToPrisma = (value) => {
  return new Prisma.Decimal(value.toFixed(2));
};

const createReference = (prefix) => {
  const timestamp = Date.now().toString(36).toUpperCase();

  const random = Math.random().toString(36).slice(2, 10).toUpperCase();

  return `${prefix}-${timestamp}-${random}`;
};

const getCompanyWallet = async (companyId) => {
  return walletRepository.findOrCreateWallet(
    companyId,
    DEFAULT_WALLET_CURRENCY
  );
};

export const getWallet = async (companyId) => {
  const wallet = await getCompanyWallet(companyId);

  return mapWallet(wallet);
};

export const creditWallet = async (
  companyId,
  { amount, reference, description, metadata }
) => {
  const creditAmount = money(amount);

  if (!creditAmount.isPositive()) {
    throw new AppError("Wallet credit amount must be greater than zero", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const existingReference = reference
        ? await walletRepository.findWalletTransactionByReference(
            companyId,
            reference,
            tx
          )
        : null;

      if (existingReference) {
        return mapWalletTransaction(existingReference);
      }

      const wallet = await walletRepository.findOrCreateWallet(
        companyId,
        DEFAULT_WALLET_CURRENCY,
        tx
      );

      if (!wallet.isActive) {
        throw new AppError("Company wallet is inactive", 400);
      }

      const lockedWallet = await walletRepository.lockWallet(companyId, tx);

      if (!lockedWallet) {
        throw new AppError("Company wallet could not be locked", 500);
      }

      const balanceBefore = money(lockedWallet.balance);

      const balanceAfter = balanceBefore.plus(creditAmount);

      const transactionReference = reference || createReference("WALLET-CR");

      const transaction = await walletRepository.createWalletTransaction(
        {
          companyId,
          walletId: lockedWallet.id,
          type: WALLET_TRANSACTION_TYPE.CREDIT,
          status: WALLET_TRANSACTION_STATUS.COMPLETED,
          amount: decimalToPrisma(creditAmount),
          balanceBefore: decimalToPrisma(balanceBefore),
          balanceAfter: decimalToPrisma(balanceAfter),
          reference: transactionReference,
          description: description || null,
          metadata: metadata || undefined,
        },
        tx
      );

      await walletRepository.updateWalletBalance(
        lockedWallet.id,
        decimalToPrisma(balanceAfter),
        tx
      );

      await walletRepository.updateCompanyWalletBalance(
        companyId,
        decimalToPrisma(balanceAfter),
        tx
      );

      return mapWalletTransaction(transaction);
    },
    {
      isolationLevel: "Serializable",
    }
  );
};

export const debitWallet = async (
  companyId,
  { amount, reference, description, metadata }
) => {
  const debitAmount = money(amount);

  if (!debitAmount.isPositive()) {
    throw new AppError("Wallet debit amount must be greater than zero", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const existingReference = reference
        ? await walletRepository.findWalletTransactionByReference(
            companyId,
            reference,
            tx
          )
        : null;

      if (existingReference) {
        return mapWalletTransaction(existingReference);
      }

      const wallet = await walletRepository.findOrCreateWallet(
        companyId,
        DEFAULT_WALLET_CURRENCY,
        tx
      );

      if (!wallet.isActive) {
        throw new AppError("Company wallet is inactive", 400);
      }

      const lockedWallet = await walletRepository.lockWallet(companyId, tx);

      if (!lockedWallet) {
        throw new AppError("Company wallet could not be locked", 500);
      }

      const balanceBefore = money(lockedWallet.balance);

      if (debitAmount.greaterThan(balanceBefore)) {
        throw new AppError("Insufficient wallet balance", 400);
      }

      const balanceAfter = balanceBefore.minus(debitAmount);

      const transactionReference = reference || createReference("WALLET-DR");

      const transaction = await walletRepository.createWalletTransaction(
        {
          companyId,
          walletId: lockedWallet.id,
          type: WALLET_TRANSACTION_TYPE.DEBIT,
          status: WALLET_TRANSACTION_STATUS.COMPLETED,
          amount: decimalToPrisma(debitAmount),
          balanceBefore: decimalToPrisma(balanceBefore),
          balanceAfter: decimalToPrisma(balanceAfter),
          reference: transactionReference,
          description: description || null,
          metadata: metadata || undefined,
        },
        tx
      );

      await walletRepository.updateWalletBalance(
        lockedWallet.id,
        decimalToPrisma(balanceAfter),
        tx
      );

      await walletRepository.updateCompanyWalletBalance(
        companyId,
        decimalToPrisma(balanceAfter),
        tx
      );

      return mapWalletTransaction(transaction);
    },
    {
      isolationLevel: "Serializable",
    }
  );
};

export const getWalletDetails = async (companyId) => {
  const wallet = await walletRepository.findWallet(companyId);

  if (!wallet) {
    const createdWallet = await getCompanyWallet(companyId);

    return mapWallet(createdWallet);
  }

  return mapWallet(wallet);
};

export const getWalletTransactions = async (
  companyId,
  { page, limit, type, status, search, startDate, endDate }
) => {
  const skip = (page - 1) * limit;

  const where = {};

  if (type) {
    where.type = type;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      {
        reference: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};

    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }

    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const [transactions, total] = await Promise.all([
    walletRepository.listWalletTransactions(companyId, {
      skip,
      take: limit,
      where,
    }),

    walletRepository.countWalletTransactions(companyId, where),
  ]);

  return {
    data: mapWalletTransactions(transactions),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const verifyWalletConsistency = async (companyId) => {
  const wallet = await walletRepository.findWallet(companyId);

  if (!wallet) {
    throw new AppError("Company wallet not found", 404);
  }

  const summary = await walletRepository.getWalletSummary(companyId);

  const credits = money(summary.completedCredits._sum.amount || 0);

  const debits = money(summary.completedDebits._sum.amount || 0);

  const calculatedBalance = credits.minus(debits);

  const actualBalance = money(wallet.balance);

  const isConsistent = calculatedBalance.equals(actualBalance);

  return {
    consistent: isConsistent,
    walletBalance: actualBalance.toFixed(2),
    calculatedBalance: calculatedBalance.toFixed(2),
    difference: calculatedBalance.minus(actualBalance).toFixed(2),
  };
};

export const getWalletSummaryDetails = async (companyId) => {
  const summary = await walletRepository.getWalletSummary(companyId);

  if (!summary.wallet) {
    const wallet = await getCompanyWallet(companyId);

    return {
      wallet: mapWallet(wallet),
      totalCredits: "0.00",
      totalDebits: "0.00",
      creditCount: 0,
      debitCount: 0,
    };
  }

  return {
    wallet: mapWallet(summary.wallet),
    totalCredits: money(summary.completedCredits._sum.amount || 0).toFixed(2),
    totalDebits: money(summary.completedDebits._sum.amount || 0).toFixed(2),
    creditCount: summary.completedCredits._count._all,
    debitCount: summary.completedDebits._count._all,
  };
};
