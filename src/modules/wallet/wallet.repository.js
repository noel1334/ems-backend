import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import { DEFAULT_WALLET_CURRENCY } from "./wallet.constants.js";

export const findWallet = async (companyId, db = prisma) =>
  db.wallet.findUnique({
    where: { companyId },
    include: { _count: { select: { ledgerEntries: true } } },
  });

export const findOrCreateWallet = async (
  companyId,
  currency = DEFAULT_WALLET_CURRENCY,
  db = prisma
) => {
  const existing = await db.wallet.findUnique({ where: { companyId } });
  if (existing) return existing;

  try {
    return await db.wallet.create({
      data: { companyId, currency, balance: new Prisma.Decimal(0) },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return db.wallet.findUnique({ where: { companyId } });
    }
    throw error;
  }
};

export const lockWallet = async (companyId, db) => {
  const rows = await db.$queryRaw`
    SELECT * FROM "wallets" WHERE "companyId" = ${companyId} FOR UPDATE
  `;
  return rows[0] ?? null;
};

export const findLedgerByReference = async (reference, db = prisma) =>
  db.walletLedgerEntry.findUnique({
    where: { reference },
    include: { wallet: { select: { companyId: true } } },
  });

export const createLedgerEntry = async (data, db = prisma) =>
  db.walletLedgerEntry.create({ data });

export const updateWalletBalance = async (walletId, balance, db) =>
  db.wallet.update({ where: { id: walletId }, data: { balance } });

export const updateCompanyWalletBalance = async (companyId, balance, db) =>
  db.company.update({ where: { id: companyId }, data: { walletBalance: balance } });

export const listLedgerEntries = async (companyId, { skip, take, where }, db = prisma) =>
  db.walletLedgerEntry.findMany({
    where: { wallet: { companyId }, ...where },
    include: { wallet: { select: { companyId: true } } },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });

export const countLedgerEntries = async (companyId, where = {}, db = prisma) =>
  db.walletLedgerEntry.count({ where: { wallet: { companyId }, ...where } });

export const aggregateCredits = async (companyId, db = prisma) =>
  db.walletLedgerEntry.aggregate({
    where: { wallet: { companyId }, type: "CREDIT", status: "COMPLETED" },
    _sum: { amount: true },
    _count: { _all: true },
  });

export const aggregateDebits = async (companyId, db = prisma) =>
  db.walletLedgerEntry.aggregate({
    where: { wallet: { companyId }, type: "DEBIT", status: "COMPLETED" },
    _sum: { amount: true },
    _count: { _all: true },
  });
