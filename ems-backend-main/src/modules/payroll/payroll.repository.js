import prisma from "../../config/database.js";

export const findStructure = (companyId, id, tx = prisma) =>
  tx.payrollStructure.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      components: true,
    },
  });

export const findEmployee = (companyId, employeeId, tx = prisma) =>
  tx.employee.findFirst({
    where: {
      id: employeeId,
      companyId,
    },
  });

export const findPeriod = (companyId, periodId, tx = prisma) =>
  tx.payrollPeriod.findFirst({
    where: {
      id: periodId,
      companyId,
    },
  });

export const findEmployeeSalary = (
  companyId,
  employeeId,
  periodEnd,
  tx = prisma
) =>
  tx.employeeSalary.findFirst({
    where: {
      companyId,
      employeeId,
      status: "ACTIVE",
      effectiveFrom: {
        lte: periodEnd,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: periodEnd,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
    include: {
      structure: {
        include: {
          components: {
            where: {
              isActive: true,
            },
          },
        },
      },
    },
  });
