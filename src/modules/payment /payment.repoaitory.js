import prisma from "../../config/database.js";

export const createPayment = async (data, db = prisma) => {
  return db.payment.create({
    data,
  });
};

export const findPaymentByReference = async (
  companyId,
  reference,
  db = prisma
) => {
  return db.payment.findUnique({
    where: {
      companyId_reference: {
        companyId,
        reference,
      },
    },
  });
};

export const findPaymentByReferenceFromAnyCompany = async (
  reference,
  db = prisma
) => {
  return db.payment.findFirst({
    where: {
      reference,
    },
  });
};

export const findPaymentByProviderReference = async (
  provider,
  providerReference,
  db = prisma
) => {
  return db.payment.findFirst({
    where: {
      provider,
      providerReference,
    },
  });
};
export const findPaymentById = async (companyId, id, db = prisma) => {
  return db.payment.findFirst({
    where: {
      id,
      ...(companyId ? { companyId } : {}),
    },
  });
};

export const updatePayment = async (id, data, db = prisma) => {
  return db.payment.update({
    where: {
      id,
    },
    data,
  });
};

export const listPayments = async (
  companyId,
  { skip, take, where },
  db = prisma
) => {
  return db.payment.findMany({
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

export const countPayments = async (companyId, where = {}, db = prisma) => {
  return db.payment.count({
    where: {
      companyId,
      ...where,
    },
  });
};
