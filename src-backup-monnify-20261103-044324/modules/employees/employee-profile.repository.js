import prisma from "../../config/database.js";

export const findEmployee = (employeeId, companyId, db = prisma) => db.employee.findFirst({ where: { id: employeeId, companyId } });
export const createBankAccount = (data, db = prisma) => db.employeeBankAccount.create({ data });
export const findBankAccount = (id, employeeId, db = prisma) => db.employeeBankAccount.findFirst({ where: { id, employeeId } });
export const listBankAccounts = (employeeId, db = prisma) => db.employeeBankAccount.findMany({ where: { employeeId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] });
export const updateBankAccount = (id, employeeId, data, db = prisma) => db.employeeBankAccount.updateMany({ where: { id, employeeId }, data });
export const deleteBankAccount = (id, employeeId, db = prisma) => db.employeeBankAccount.deleteMany({ where: { id, employeeId } });
export const clearPrimaryBankAccounts = (employeeId, db = prisma) => db.employeeBankAccount.updateMany({ where: { employeeId, isPrimary: true }, data: { isPrimary: false } });

export const createEducation = (data, db = prisma) => db.employeeEducation.create({ data });
export const findEducation = (id, employeeId, db = prisma) => db.employeeEducation.findFirst({ where: { id, employeeId } });
export const listEducation = (employeeId, db = prisma) => db.employeeEducation.findMany({ where: { employeeId }, orderBy: { startDate: "desc" } });
export const updateEducation = (id, employeeId, data, db = prisma) => db.employeeEducation.updateMany({ where: { id, employeeId }, data });
export const deleteEducation = (id, employeeId, db = prisma) => db.employeeEducation.deleteMany({ where: { id, employeeId } });

export const createExperience = (data, db = prisma) => db.employeeExperience.create({ data });
export const findExperience = (id, employeeId, db = prisma) => db.employeeExperience.findFirst({ where: { id, employeeId } });
export const listExperience = (employeeId, db = prisma) => db.employeeExperience.findMany({ where: { employeeId }, orderBy: { startDate: "desc" } });
export const updateExperience = (id, employeeId, data, db = prisma) => db.employeeExperience.updateMany({ where: { id, employeeId }, data });
export const deleteExperience = (id, employeeId, db = prisma) => db.employeeExperience.deleteMany({ where: { id, employeeId } });

export const createDocument = (data, db = prisma) => db.employeeDocument.create({ data });
export const findDocument = (id, employeeId, db = prisma) => db.employeeDocument.findFirst({ where: { id, employeeId } });
export const listDocuments = (employeeId, db = prisma) => db.employeeDocument.findMany({ where: { employeeId, isActive: true }, orderBy: { uploadedAt: "desc" } });
export const deleteDocument = (id, employeeId, db = prisma) => db.employeeDocument.deleteMany({ where: { id, employeeId } });
export const updateEmployeePhoto = (employeeId, companyId, data, db = prisma) => db.employee.updateMany({ where: { id: employeeId, companyId }, data });
