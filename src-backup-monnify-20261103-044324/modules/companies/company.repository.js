import prisma from "../../config/database.js";

export const createCompany = async (data, tx = prisma) => {
  return tx.company.create({
    data,
  });
};

export const findCompanyById = async (companyId, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      id: companyId,
    },
  });
};

export const findCompanyBySlug = async (slug, tx = prisma) => {
  return tx.company.findUnique({
    where: {
      slug,
    },
  });
};

export const findCompanyByEmail = async (email, tx = prisma) => {
  return tx.company.findFirst({
    where: {
      email: email.toLowerCase(),
    },
  });
};

export const updateCompany = async (companyId, data, tx = prisma) => {
  return tx.company.update({
    where: {
      id: companyId,
    },
    data,
  });
};

export const deleteCompany = async (companyId, tx = prisma) => {
  return tx.company.delete({
    where: {
      id: companyId,
    },
  });
};
