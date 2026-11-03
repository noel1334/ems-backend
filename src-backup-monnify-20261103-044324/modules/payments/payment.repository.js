import prisma from "../../config/database.js";

export const createPayment = (data, db = prisma) => db.payment.create({ data });

export const findPaymentByIdempotencyKey = (companyId, idempotencyKey, db = prisma) => db.payment.findUnique({ where: { companyId_idempotencyKey: { companyId, idempotencyKey } } });

export const findPaymentByReference = (companyId, reference, db = prisma) =>
  db.payment.findUnique({ where: { companyId_reference: { companyId, reference } } });

export const findPaymentByReferenceFromAnyCompany = (reference, db = prisma) =>
  db.payment.findFirst({ where: { reference } });

export const findPaymentByProviderReference = (provider, providerReference, db = prisma) =>
  db.payment.findFirst({ where: { provider, providerReference } });

export const findPaymentById = (companyId, id, db = prisma) =>
  db.payment.findFirst({ where: { id, ...(companyId ? { companyId } : {}) } });

export const updatePayment = (id, data, db = prisma) =>
  db.payment.update({ where: { id }, data });

export const listPayments = (companyId, { skip, take, where }, db = prisma) =>
  db.payment.findMany({ where: { companyId, ...where }, orderBy: { createdAt: "desc" }, skip, take });

export const countPayments = (companyId, where = {}, db = prisma) =>
  db.payment.count({ where: { companyId, ...where } });

export const findCompanyPaymentConfig = (companyId, db = prisma) =>
  db.company.findUnique({
    where: { id: companyId },
    select: { id: true, currency: true, paystackSubaccountId: true, flutterwaveSubaccountId: true },
  });
