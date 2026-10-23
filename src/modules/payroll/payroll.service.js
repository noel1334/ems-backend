import { Prisma } from "@prisma/client";
import { writeAudit } from "../../common/utils/audit.js";
import Decimal from "decimal.js";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { calculatePayrollAmounts } from "./payroll.calculation.js";

import {
  mapEmployeeSalary,
  mapPayrollPeriod,
  mapPayrollPeriodSummary,
  mapPayrollStructure,
  mapPayrollItem,
  mapPayslip,
  mapPayrollReport,
} from "./payroll.mapper.js";

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

const money = (value) => new Decimal(value ?? 0);

const dateOnly = (value) => {
  return startOfDay(new Date(`${value}T00:00:00`));
};

const getCompanyId = (req) => {
  const companyId = req.tenant?.companyId ?? req.user?.companyId;

  if (!companyId) {
    throw new AppError("Company context is required.", 400);
  }

  return companyId;
};

export const createStructure = async (companyId, data) => {
  const { components = [], ...structureData } = data;
  const existing = await prisma.payrollStructure.findFirst({
    where: {
      companyId,
      OR: [{ name: structureData.name }, { code: structureData.code }],
    },
  });

  if (existing) {
    throw new AppError("Payroll structure name or code already exists.", 409);
  }

  // Nested component creation is atomic: a template is never saved half-configured.
  return prisma.payrollStructure.create({
    data: {
      companyId,
      name: structureData.name,
      code: structureData.code,
      description: structureData.description,
      isActive: structureData.isActive ?? true,
      components: components.length
        ? {
            create: components.map((component) => ({
              name: component.name,
              code: component.code,
              type: component.type,
              calculation: component.calculation,
              amount: money(component.amount).toFixed(2),
              percentage:
                component.percentage === undefined || component.percentage === null
                  ? null
                  : money(component.percentage).toFixed(4),
              isTaxable: component.isTaxable,
              isPensionable: component.isPensionable,
              isActive: component.isActive,
            })),
          }
        : undefined,
    },
    include: { components: true },
  });
};
export const listStructures = async (companyId, query) => {
  const where = {
    companyId,

    ...(query.search
      ? {
          OR: [
            {
              name: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              code: {
                contains: query.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.payrollStructure.findMany({
      where,
      include: {
        components: true,
      },
      orderBy: {
        name: "asc",
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),

    prisma.payrollStructure.count({
      where,
    }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
};

export const updateStructure = async (companyId, structureId, data) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: { id: structureId, companyId },
  });
  if (!structure) throw new AppError("Payroll structure not found.", 404);

  const duplicateFields = [];
  if (data.name && data.name !== structure.name) duplicateFields.push({ name: data.name });
  if (data.code && data.code !== structure.code) duplicateFields.push({ code: data.code });
  if (duplicateFields.length) {
    const duplicate = await prisma.payrollStructure.findFirst({
      where: { companyId, id: { not: structureId }, OR: duplicateFields },
      select: { id: true },
    });
    if (duplicate) throw new AppError("Payroll structure name or code already exists.", 409);
  }

  return prisma.payrollStructure.update({
    where: { id: structureId },
    data,
    include: { components: true },
  });
};
export const deactivateStructure = async (companyId, structureId) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: {
      id: structureId,
      companyId,
    },
  });

  if (!structure) {
    throw new AppError("Payroll structure not found.", 404);
  }

  return prisma.payrollStructure.update({
    where: {
      id: structureId,
    },
    data: {
      isActive: false,
    },
  });
};

export const addComponent = async (companyId, structureId, data) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: {
      id: structureId,
      companyId,
    },
  });

  if (!structure) {
    throw new AppError("Payroll structure not found.", 404);
  }

  const existing = await prisma.payrollStructureComponent.findFirst({
    where: {
      structureId,
      code: data.code,
    },
  });

  if (existing) {
    throw new AppError("Payroll component code already exists.", 409);
  }

  return prisma.payrollStructureComponent.create({
    data: {
      structureId,
      name: data.name,
      code: data.code,
      type: data.type,
      calculation: data.calculation,
      amount: money(data.amount).toFixed(2),
      percentage:
        (data.percentage === undefined || data.percentage === null)
          ? null
          : money(data.percentage).toFixed(4),
      isTaxable: data.isTaxable,
      isPensionable: data.isPensionable,
      isActive: data.isActive,
    },
  });
};

export const updateComponent = async (companyId, structureId, componentId, data) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: { id: structureId, companyId },
    select: { id: true },
  });
  if (!structure) throw new AppError("Payroll structure not found.", 404);

  const component = await prisma.payrollStructureComponent.findFirst({
    where: { id: componentId, structureId },
  });
  if (!component) throw new AppError("Payroll component not found.", 404);

  if (data.code && data.code !== component.code) {
    const duplicate = await prisma.payrollStructureComponent.findFirst({
      where: { structureId, code: data.code, NOT: { id: componentId } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("Payroll component code already exists in this structure.", 409);
  }

  const update = { ...data };
  if (Object.hasOwn(update, "amount")) update.amount = money(update.amount).toFixed(2);
  if (Object.hasOwn(update, "percentage")) {
    update.percentage = update.percentage === null || update.percentage === undefined
      ? null
      : money(update.percentage).toFixed(4);
  }

  return prisma.payrollStructureComponent.update({
    where: { id: componentId },
    data: update,
  });
};

export const deactivateComponent = async (companyId, structureId, componentId) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: { id: structureId, companyId },
    select: { id: true },
  });
  if (!structure) throw new AppError("Payroll structure not found.", 404);

  const component = await prisma.payrollStructureComponent.findFirst({
    where: { id: componentId, structureId },
    select: { id: true, isActive: true },
  });
  if (!component) throw new AppError("Payroll component not found.", 404);
  if (!component.isActive) return component;

  // Keep the component record for auditability and historical payroll context.
  return prisma.payrollStructureComponent.update({
    where: { id: componentId },
    data: { isActive: false },
  });
};
export const assignSalary = async (companyId, data) => {
  const employee = await prisma.employee.findFirst({
    where: {
      id: data.employeeId,
      companyId,
    },
  });

  if (!employee) {
    throw new AppError("Employee not found.", 404);
  }

  const structure = await prisma.payrollStructure.findFirst({
    where: {
      id: data.structureId,
      companyId,
      isActive: true,
    },
  });

  if (!structure) {
    throw new AppError("Payroll structure not found.", 404);
  }

  return prisma.$transaction(async (tx) => {
    const effectiveFrom = dateOnly(data.effectiveFrom);

    await tx.employeeSalary.updateMany({
      where: {
        companyId,
        employeeId: data.employeeId,
        status: "ACTIVE",
        effectiveFrom: {
          lte: effectiveFrom,
        },
      },
      data: {
        status: "INACTIVE",
        effectiveTo: effectiveFrom,
      },
    });

    return tx.employeeSalary.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        structureId: data.structureId,
        basicSalary: money(data.basicSalary).toFixed(2),
        effectiveFrom,
        effectiveTo: data.effectiveTo ? dateOnly(data.effectiveTo) : null,
      },
      include: {
        employee: true,
        structure: {
          include: {
            components: true,
          },
        },
      },
    });
  }, transactionOptions);
};

export const createPeriod = async (companyId, data) => {
  const startDate = dateOnly(data.startDate);
  const endDate = dateOnly(data.endDate);

  const existing = await prisma.payrollPeriod.findFirst({
    where: {
      companyId,
      startDate,
      endDate,
    },
  });

  if (existing) {
    throw new AppError(
      "A payroll period with these dates already exists.",
      409
    );
  }

  return prisma.payrollPeriod.create({
    data: {
      companyId,
      name: data.name,
      startDate,
      endDate,
      payDate: data.payDate ? dateOnly(data.payDate) : null,
    },
  });
};

export const listPeriods = async (companyId, query) => {
  const where = {
    companyId,

    ...(query.status
      ? {
          status: query.status,
        }
      : {}),

    ...(query.search
      ? {
          name: {
            contains: query.search,
            mode: "insensitive",
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.payrollPeriod.findMany({
      where,
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        startDate: "desc",
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),

    prisma.payrollPeriod.count({
      where,
    }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
};

const getSalaryForPeriod = async (tx, companyId, employeeId, periodEnd) => {
  return tx.employeeSalary.findFirst({
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
};

const calculateComponent = ({ component, basicSalary, grossSalary }) => {
  switch (component.calculation) {
    case "FIXED":
      return money(component.amount);

    case "PERCENTAGE_OF_BASIC":
      return basicSalary.mul(money(component.percentage)).div(100);

    case "PERCENTAGE_OF_GROSS":
      return grossSalary.mul(money(component.percentage)).div(100);

    case "ATTENDANCE_DEDUCTION":
      return new Decimal(0);

    default:
      return new Decimal(0);
  }
};

const getAttendanceAbsenceDays = async (
  tx,
  companyId,
  employeeId,
  startDate,
  endDate
) => {
  /*
   * This intentionally reads Stage 10 attendance rather than creating
   * another attendance implementation.
   *
   * Approved leave must already be represented by Stage 11's leave-aware
   * attendance generation and therefore must not become an unpaid absence.
   */

  const records = await tx.attendance.findMany({
    where: {
      companyId,
      employeeId,
      attendanceDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      attendanceDate: true,
      status: true,
    },
  });

  return records.filter((record) => record.status === "ABSENT").length;
};

const calculateUnpaidDeduction = ({
  grossSalary,
  unpaidDays,
  periodStart,
  periodEnd,
}) => {
  const calendarDays = differenceInCalendarDays(periodEnd, periodStart) + 1;

  if (calendarDays <= 0 || unpaidDays <= 0) {
    return new Decimal(0);
  }

  return grossSalary.div(calendarDays).mul(unpaidDays);
};

export const calculatePayroll = async (companyId, periodId, actorId) => {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: {
        id: periodId,
        companyId,
      },
    });

    if (!period) {
      throw new AppError("Payroll period not found.", 404);
    }

    if (period.status === "APPROVED" || period.status === "FINALIZED") {
      throw new AppError("This payroll period cannot be recalculated.", 400);
    }

    await tx.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: "PROCESSING",
      },
    });

    const employees = await tx.employee.findMany({
      where: {
        companyId,
        employmentStatus: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    for (const employee of employees) {
      const salary = await getSalaryForPeriod(
        tx,
        companyId,
        employee.id,
        period.endDate
      );

      if (!salary) {
        continue;
      }

      const previous = await tx.payrollItem.findUnique({
        where: {
          periodId_employeeId: {
            periodId,
            employeeId: employee.id,
          },
        },
      });

      if (previous) {
        await tx.payrollItem.delete({
          where: {
            id: previous.id,
          },
        });
      }

      const basicSalary = money(salary.basicSalary);

      let totalEarnings = new Decimal(0);

      const earningLines = [];

      for (const component of salary.structure.components) {
        if (component.type !== "EARNING") {
          continue;
        }

        const amount = calculateComponent({
          component,
          basicSalary,
          grossSalary: basicSalary.plus(totalEarnings),
        });

        totalEarnings = totalEarnings.plus(amount);

        earningLines.push({
          name: component.name,
          code: component.code,
          type: "EARNING",
          amount: amount.toFixed(2),
          taxable: component.isTaxable,
          pensionable: component.isPensionable,
        });
      }

      const grossSalary = basicSalary.plus(totalEarnings);

      let totalDeductions = new Decimal(0);

      const deductionLines = [];

      const unpaidDays = await getAttendanceAbsenceDays(
        tx,
        companyId,
        employee.id,
        period.startDate,
        period.endDate
      );

      for (const component of salary.structure.components) {
        if (component.type !== "DEDUCTION") {
          continue;
        }

        let amount = calculateComponent({
          component,
          basicSalary,
          grossSalary,
        });

        if (component.calculation === "ATTENDANCE_DEDUCTION") {
          amount = calculateUnpaidDeduction({
            grossSalary,
            unpaidDays,
            periodStart: period.startDate,
            periodEnd: period.endDate,
          });
        }

        totalDeductions = totalDeductions.plus(amount);

        deductionLines.push({
          name: component.name,
          code: component.code,
          type: "DEDUCTION",
          amount: amount.toFixed(2),
          taxable: component.isTaxable,
          pensionable: component.isPensionable,
        });
      }

      const unpaidDeduction = deductionLines
        .filter((line) => line.code === "UNPAID_ATTENDANCE")
        .reduce((total, line) => total.plus(line.amount), new Decimal(0));

      const netSalary = grossSalary.minus(totalDeductions);

      await tx.payrollItem.create({
        data: {
          companyId,
          periodId,
          employeeId: employee.id,
          salaryId: salary.id,

          basicSalary: basicSalary.toFixed(2),

          totalEarnings: totalEarnings.toFixed(2),

          totalDeductions: totalDeductions.toFixed(2),

          unpaidDays: money(unpaidDays).toFixed(2),

          unpaidDeduction: unpaidDeduction.toFixed(2),

          grossSalary: grossSalary.toFixed(2),

          netSalary: netSalary.toFixed(2),

          status: "CALCULATED",

          lines: {
            create: [...earningLines, ...deductionLines],
          },
        },
      });
    }

    return tx.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: "CALCULATED",
      },
      include: {
        items: {
          include: {
            employee: true,
            lines: true,
          },
        },
      },
    });
  }, transactionOptions);
};

export const approvePayroll = async (companyId, periodId, actorId) => {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: {
        id: periodId,
        companyId,
      },
    });

    if (!period) {
      throw new AppError("Payroll period not found.", 404);
    }

    if (period.status !== "CALCULATED") {
      throw new AppError("Only calculated payroll can be approved.", 400);
    }

    await tx.payrollItem.updateMany({
      where: {
        companyId,
        periodId,
      },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    const approvedPeriod = await tx.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "APPROVED" },
      include: {
        items: {
          include: {
            employee: true,
            lines: true,
          },
        },
      },
    });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "APPROVE", module: "payroll", resource: "payroll_period", resourceId: periodId });
    return approvedPeriod;
  }, transactionOptions);
};

export const finalizePayroll = async (companyId, periodId, actorId) => {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: {
        id: periodId,
        companyId,
      },
    });

    if (!period) {
      throw new AppError("Payroll period not found.", 404);
    }

    if (period.status !== "APPROVED") {
      throw new AppError("Payroll must be approved before finalization.", 400);
    }

    await tx.payrollItem.updateMany({
      where: {
        companyId,
        periodId,
      },
      data: {
        status: "FINALIZED",
      },
    });

    const finalizedPeriod = await tx.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "FINALIZED" },
      include: {
        items: {
          include: {
            employee: true,
            lines: true,
          },
        },
      },
    });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "APPROVE", module: "payroll", resource: "payroll_period", resourceId: periodId, metadata: { finalized: true } });
    return finalizedPeriod;
  }, transactionOptions);
};

export const getPeriod = async (companyId, periodId) => {
  const period = await prisma.payrollPeriod.findFirst({
    where: {
      id: periodId,
      companyId,
    },
    include: {
      items: {
        include: {
          employee: true,
          lines: true,
          salary: {
            include: {
              structure: true,
            },
          },
        },
      },
    },
  });

  if (!period) {
    throw new AppError("Payroll period not found.", 404);
  }

  return period;
};

export const getEmployeePayrollHistory = async (companyId, employeeId) => {
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      companyId,
    },
  });

  if (!employee) {
    throw new AppError("Employee not found.", 404);
  }

  return prisma.payrollItem.findMany({
    where: {
      companyId,
      employeeId,
    },
    include: {
      period: true,
      lines: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

export { getCompanyId };
