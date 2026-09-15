import { Prisma } from "@prisma/client";

import prisma from "../../config/database.js";
import {
  DEFAULT_WALLET_CURRENCY,
  WALLET_TRANSACTION_STATUS,
} from "./wallet.constants.js";

const walletInclude = {
  transactions: {
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  },
};

export const findWallet = async (companyId, db = prisma) => {
  return db.wallet.findUnique({
    where: {
      companyId,
    },
    include: walletInclude,
  });
};

export const createWallet = async (
  companyId,
  currency = DEFAULT_WALLET_CURRENCY,
  db = prisma
) => {
  return db.wallet.create({
    data: {
      companyId,
      currency,
      balance: new Prisma.Decimal(0),
    },
  });
};

/**
 * Creates the company wallet if it does not exist.
 *
 * The unique companyId constraint protects against two requests
 * trying to create the same wallet simultaneously.
 */
export const findOrCreateWallet = async (
  companyId,
  currency = DEFAULT_WALLET_CURRENCY,
  db = prisma
) => {
  const existingWallet = await db.wallet.findUnique({
    where: {
      companyId,
    },
  });

  if (existingWallet) {
    return existingWallet;
  }

  try {
    return await db.wallet.create({
      data: {
        companyId,
        currency,
        balance: new Prisma.Decimal(0),
      },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return db.wallet.findUnique({
        where: {
          companyId,
        },
      });
    }

    throw error;
  }
};

/**
 * Locks the wallet row for the duration of the transaction.
 *
 * This is the ONLY place in Stage 13 where we use PostgreSQL SQL.
 *
 * The service layer never sees SQL.
 */
export const lockWallet = async (companyId, db) => {
  const rows = await db.$queryRaw`
                                                                                                                                                                                                                                         SELECT *
                                                                                                                                                                                                                                             FROM "Wallet"
                                                                                                                                                                                                                                                 WHERE "companyId" = ${companyId}
                                                                                                                                                                                                                                                     FOR UPDATE
                                                                                                                                                                                                                                                       `;

  return rows[0] ?? null;
};

export const findWalletTransactionByReference = async (
  companyId,
  reference,
  db = prisma
) => {
  return db.walletTransaction.findUnique({
    where: {
      companyId_reference: {
        companyId,
        reference,
      },
    },
  });
};

export const createWalletTransaction = async (data, db = prisma) => {
  return db.walletTransaction.create({
    data,
  });
};

export const updateWalletBalance = async (walletId, balance, db) => {
  return db.wallet.update({
    where: {
      id: walletId,
    },
    data: {
      balance,
    },
  });
};

export const updateCompanyWalletBalance = async (companyId, balance, db) => {
  return db.company.update({
    where: {
      id: companyId,
    },
    data: {
      walletBalance: balance,
    },
  });
};

export const listWalletTransactions = async (
  companyId,
  { skip, take, where },
  db = prisma
) => {
  return db.walletTransaction.findMany({
    where: {
      companyId,
      ...where,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take,
  });
};

export const countWalletTransactions = async (
  companyId,
  where = {},
  db = prisma
) => {
  return db.walletTransaction.count({
    where: {
      companyId,
      ...where,
    },
  });
};

export const getWalletSummary = async (companyId, db = prisma) => {
  const [wallet, completedCredits, completedDebits] = await Promise.all([
    db.wallet.findUnique({
      where: {
        companyId,
      },
      select: {
        id: true,
        companyId: true,
        balance: true,
        currency: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),

    db.walletTransaction.aggregate({
      where: {
        companyId,
        type: "CREDIT",
        status: WALLET_TRANSACTION_STATUS.COMPLETED,
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    }),

    db.walletTransaction.aggregate({
      where: {
        companyId,
        type: "DEBIT",
        status: WALLET_TRANSACTION_STATUS.COMPLETED,
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  return {
    wallet,
    completedCredits,
    completedDebits,
  };
};

export const getCompletedTransactionBalance = async (
  companyId,
  db = prisma
) => {
  const result = await db.walletTransaction.aggregate({
    where: {
      companyId,
      status: WALLET_TRANSACTION_STATUS.COMPLETED,
    },
    _sum: {
      amount: true,
    },
  });

  return result;
};
