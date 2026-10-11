import prisma from "../../config/database.js";

export const findEmployee = (companyId, employeeId, tx = prisma) =>
  tx.employee.findFirst({ where: { id: employeeId, companyId } });

export const create = (data, tx = prisma) =>
  tx.biometricRecord.create({ data });

export const findById = (companyId, id, tx = prisma) =>
  tx.biometricRecord.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true } },
    },
  });

export const list = (companyId, where = {}, tx = prisma) =>
  tx.biometricRecord.findMany({
    where: { companyId, ...where },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true } },
    },
  });

export const update = (id, companyId, data, tx = prisma) =>
  tx.biometricRecord.updateMany({ where: { id, companyId }, data });

export const findActiveByReference = (companyId, templateReference, tx = prisma) =>
  tx.biometricRecord.findFirst({
    where: { companyId, templateReference, status: "ACTIVE" },
    include: { employee: true },
  });

export const findActiveByEmployeeType = (companyId, employeeId, type, tx = prisma) =>
  tx.biometricRecord.findFirst({ where: { companyId, employeeId, type, status: "ACTIVE" }, include: { employee: true } });

export const findByTemplateHash = (companyId, type, templateHash, tx = prisma) =>
  tx.biometricRecord.findFirst({ where: { companyId, type, templateHash, status: "ACTIVE" }, include: { employee: true } });
