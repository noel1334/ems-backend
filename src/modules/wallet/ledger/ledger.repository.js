import prisma from "../../../config/database.js";

export const findByReference = (reference, db = prisma) => db.walletLedgerEntry.findUnique({ where: { reference } });
export const list = (companyId, { skip = 0, take = 20, where = {} }, db = prisma) => db.walletLedgerEntry.findMany({
  where: { wallet: { companyId }, ...where },
  include: { wallet: { select: { companyId: true } } },
  orderBy: { createdAt: "desc" }, skip, take,
});
export const count = (companyId, where = {}, db = prisma) => db.walletLedgerEntry.count({ where: { wallet: { companyId }, ...where } });
