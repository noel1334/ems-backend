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

export const deleteStructurePermanently = async (companyId, structureId) => {
  const structure = await prisma.payrollStructure.findFirst({
    where: { id: structureId, companyId },
    select: { id: true, name: true },
  });
  if (!structure) throw new AppError("Payroll structure not found.", 404);

  const assignmentCount = await prisma.employeeSalary.count({
    where: { companyId, structureId },
  });
  if (assignmentCount > 0) {
    throw new AppError(
      `Cannot permanently delete “${structure.name}” because ${assignmentCount} employee salary assignment(s) reference it. Deactivate the structure instead to preserve salary and payroll history.`,
      409,
    );
  }

  try {
    // Components cascade with the structure; salary-linked structures are protected above
    // and by the database's Restrict foreign key as a second line of defence.
    return await prisma.payrollStructure.delete({ where: { id: structureId } });
  } catch (error) {
    if (error?.code === "P2003" || error?.code === "P2025") {
      throw new AppError("This structure is referenced by financial history and cannot be permanently deleted.", 409);
    }
    throw error;
  }
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
export const listEmployeeSalaries = async (companyId, query = {}) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const where = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.structureId ? { structureId: query.structureId } : {}),
    ...(query.departmentId ? { employee: { is: { departmentId: query.departmentId } } } : {}),
    ...(query.search ? {
      OR: [
        { employee: { is: { employeeNumber: { contains: query.search, mode: "insensitive" } } } },
        { employee: { is: { firstName: { contains: query.search, mode: "insensitive" } } } },
        { employee: { is: { lastName: { contains: query.search, mode: "insensitive" } } } },
        { structure: { is: { name: { contains: query.search, mode: "insensitive" } } } },
        { structure: { is: { code: { contains: query.search, mode: "insensitive" } } } },
      ],
    } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.employeeSalary.findMany({
      where,
      include: {
        employee: { include: { department: true, designation: true } },
        structure: { include: { components: true } },
      },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employeeSalary.count({ where }),
  ]);

  return {
    items: rows.map(mapEmployeeSalary),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

const intervalOverlaps = (startA, endA, startB, endB) => {
  const aStart = startOfDay(new Date(startA)).getTime();
  const bStart = startOfDay(new Date(startB)).getTime();
  const aEnd = endA ? startOfDay(new Date(endA)).getTime() : Number.POSITIVE_INFINITY;
  const bEnd = endB ? startOfDay(new Date(endB)).getTime() : Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
};

export const updateSalaryStatus = async (companyId, salaryId, nextStatus) => {
  const salary = await prisma.employeeSalary.findFirst({
    where: { id: salaryId, companyId },
    include: { payrollItems: { select: { id: true } } },
  });
  if (!salary) throw new AppError("Employee salary assignment not found.", 404);
  if (salary.status === nextStatus) return mapEmployeeSalary(salary);

  if (nextStatus === "ACTIVE") {
    const activeSalaries = await prisma.employeeSalary.findMany({
      where: { companyId, employeeId: salary.employeeId, status: "ACTIVE", id: { not: salaryId } },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
    const conflict = activeSalaries.find((item) => intervalOverlaps(
      salary.effectiveFrom, salary.effectiveTo, item.effectiveFrom, item.effectiveTo,
    ));
    if (conflict) {
      throw new AppError("This salary cannot be activated because its effective dates overlap another active salary assignment for the employee.", 409);
    }
  }

  const updated = await prisma.employeeSalary.update({
    where: { id: salaryId },
    data: { status: nextStatus },
    include: { employee: { include: { department: true, designation: true } }, structure: { include: { components: true } } },
  });
  return mapEmployeeSalary(updated);
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
    where: { id: data.structureId, companyId, isActive: true },
    include: { components: true },
  });

  if (!structure) {
    throw new AppError("Payroll structure not found.", 404);
  }

  const componentsByCode = new Map((structure.components ?? []).map((component) => [component.code, component]));
  for (const [code, override] of Object.entries(data.componentOverrides ?? {})) {
    const component = componentsByCode.get(code);
    if (!component) throw new AppError(`Component override “${code}” does not belong to the selected payroll structure.`, 400);
    if (override.amount !== undefined && component.calculation !== "FIXED") {
      throw new AppError(`Component “${component.name}” does not use a fixed amount and cannot have an amount override.`, 400);
    }
    if (override.percentage !== undefined && !["PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS"].includes(component.calculation)) {
      throw new AppError(`Component “${component.name}” does not use a percentage calculation and cannot have a percentage override.`, 400);
    }
  }

  return prisma.$transaction(async (tx) => {
    const effectiveFrom = dateOnly(data.effectiveFrom);
    const effectiveTo = data.effectiveTo ? dateOnly(data.effectiveTo) : null;
    const existingActive = await tx.employeeSalary.findMany({
      where: { companyId, employeeId: data.employeeId, status: "ACTIVE" },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
    for (const existing of existingActive) {
      if (!intervalOverlaps(effectiveFrom, effectiveTo, existing.effectiveFrom, existing.effectiveTo)) continue;
      const existingStart = startOfDay(new Date(existing.effectiveFrom)).getTime();
      const newStart = effectiveFrom.getTime();
      if (existingStart > newStart) {
        throw new AppError("A future active salary assignment overlaps this effective period. Review the scheduled assignment first.", 409);
      }
      if (existingStart < newStart) {
        await tx.employeeSalary.update({
          where: { id: existing.id },
          data: { status: "INACTIVE", effectiveTo: addDays(effectiveFrom, -1) },
        });
      } else {
        await tx.employeeSalary.update({ where: { id: existing.id }, data: { status: "INACTIVE" } });
      }
    }

    return tx.employeeSalary.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        structureId: data.structureId,
        basicSalary: money(data.basicSalary).toFixed(2),
        componentOverrides: data.componentOverrides ?? {},
        effectiveFrom,
        effectiveTo,
      },
      include: {
        employee: { include: { department: true, designation: true } },
        structure: { include: { components: true } },
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

export const updatePeriod = async (companyId, periodId, data, actorId = null) => {
  const startDate = dateOnly(data.startDate);
  const endDate = dateOnly(data.endDate);
  if (endDate < startDate) throw new AppError("End date cannot be before start date.", 400);
  const requestedPayDate = data.payDate ? dateOnly(data.payDate) : null;

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) throw new AppError("Payroll period not found.", 404);
    if (["PROCESSING", "CANCELLED"].includes(period.status)) {
      throw new AppError("This payroll period cannot be edited while processing or after cancellation.", 409);
    }

    const [itemCount, disbursementCount, batchCount] = await Promise.all([
      tx.payrollItem.count({ where: { companyId, periodId } }),
      tx.payrollDisbursement.count({ where: { companyId, periodId } }),
      tx.payrollPayoutBatch.count({ where: { companyId, periodId } }),
    ]);
    const hasFinancialRecords = itemCount > 0 || disbursementCount > 0 || batchCount > 0;
    const dateRangeChanged = startDate.getTime() !== period.startDate.getTime() || endDate.getTime() !== period.endDate.getTime();
    const payDateChanged = (requestedPayDate?.getTime() ?? null) !== (period.payDate?.getTime() ?? null);

    if (hasFinancialRecords && dateRangeChanged) {
      throw new AppError("This period already has payroll or payment records. Its date range is locked to protect financial history.", 409);
    }
    if ((disbursementCount || batchCount) && payDateChanged) {
      throw new AppError("This period has payment records. Its planned pay date is locked; you can still correct the period name.", 409);
    }

    const duplicateConditions = [];
    if (data.name.trim() !== period.name) duplicateConditions.push({ name: data.name.trim() });
    if (!hasFinancialRecords && dateRangeChanged) duplicateConditions.push({ startDate, endDate });
    if (duplicateConditions.length) {
      const duplicate = await tx.payrollPeriod.findFirst({
        where: { companyId, id: { not: periodId }, OR: duplicateConditions },
        select: { id: true, name: true },
      });
      if (duplicate) throw new AppError("Another payroll period already uses this name or date range.", 409);
    }

    const updated = await tx.payrollPeriod.update({
      where: { id: periodId },
      data: {
        name: data.name.trim(),
        startDate: hasFinancialRecords ? period.startDate : startDate,
        endDate: hasFinancialRecords ? period.endDate : endDate,
        payDate: disbursementCount || batchCount ? period.payDate : requestedPayDate,
      },
    });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_period", resourceId: periodId, metadata: { event: "PERIOD_DETAILS_UPDATED", previousName: period.name, name: updated.name, startDate: updated.startDate, endDate: updated.endDate, payDate: updated.payDate, hadFinancialRecords: hasFinancialRecords } });
    return updated;
  }, transactionOptions);
};

export const setPeriodActive = async (companyId, periodId, isActive, actorId = null) => prisma.$transaction(async (tx) => {
  const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  if (period.isActive === isActive) return period;
  if (period.status === "PROCESSING") throw new AppError("A payroll period cannot be deactivated while processing is in progress.", 409);

  const [pendingDisbursementCount, activeBatch] = await Promise.all([
    tx.payrollDisbursement.count({ where: { companyId, periodId, status: { in: ["PENDING", "PROCESSING"] } } }),
    tx.payrollPayoutBatch.findFirst({ where: { companyId, periodId, status: { in: ["PROCESSING", "SUBMITTING", "SUBMITTED"] } }, select: { id: true, status: true } }),
  ]);
  if (!isActive && (pendingDisbursementCount || activeBatch)) {
    throw new AppError("This period has transfers still processing. Verify their status before deactivating the period.", 409);
  }

  const updated = await tx.payrollPeriod.update({ where: { id: periodId }, data: { isActive } });
  await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_period", resourceId: periodId, metadata: { event: isActive ? "PERIOD_ACTIVATED" : "PERIOD_DEACTIVATED", previousIsActive: period.isActive, isActive, status: period.status } });
  return updated;
}, transactionOptions);

export const deletePeriod = async (companyId, periodId, actorId = null) => prisma.$transaction(async (tx) => {
  const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  if (period.status !== "DRAFT") throw new AppError("Only draft payroll periods can be deleted. Processed payroll is retained for audit history.", 409);

  const [itemCount, disbursementCount, batchCount] = await Promise.all([
    tx.payrollItem.count({ where: { companyId, periodId } }),
    tx.payrollDisbursement.count({ where: { companyId, periodId } }),
    tx.payrollPayoutBatch.count({ where: { companyId, periodId } }),
  ]);
  if (itemCount || disbursementCount || batchCount) {
    throw new AppError("This payroll period has payroll or payment records and cannot be deleted.", 409);
  }

  await writeAudit(tx, { companyId, actorUserId: actorId, action: "DELETE", module: "payroll", resource: "payroll_period", resourceId: periodId, metadata: { name: period.name, startDate: period.startDate, endDate: period.endDate, payDate: period.payDate } });
  await tx.payrollPeriod.delete({ where: { id: periodId } });
  return { id: periodId, deleted: true };
}, transactionOptions);

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
    if (period.isActive === false) throw new AppError("Activate this payroll period before calculating payroll.", 409);

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

      for (const baseComponent of salary.structure.components) {
        const override = salary.componentOverrides?.[baseComponent.code] ?? {};
        if (override.isActive === false) continue;
        const component = {
          ...baseComponent,
          amount: override.amount ?? baseComponent.amount,
          percentage: override.percentage ?? baseComponent.percentage,
        };
        if (component.type !== "EARNING") continue;

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

      for (const baseComponent of salary.structure.components) {
        const override = salary.componentOverrides?.[baseComponent.code] ?? {};
        if (override.isActive === false) continue;
        const component = {
          ...baseComponent,
          amount: override.amount ?? baseComponent.amount,
          percentage: override.percentage ?? baseComponent.percentage,
        };
        if (component.type !== "DEDUCTION") continue;

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
    if (period.isActive === false) throw new AppError("Activate this payroll period before approving payroll.", 409);

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
    if (period.isActive === false) throw new AppError("Activate this payroll period before finalizing payroll.", 409);

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
      disbursement: { select: { status: true, amount: true, paidAt: true, externalReference: true, providerStatus: true, failureReason: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

export { getCompanyId };


/**
 * Reopen an approved/finalized payroll for correction before any disbursement is prepared.
 * A reason is mandatory and the transition is audit-logged. Paid/partially paid payroll
 * is never reopened; use a separate adjustment in a future payroll instead.
 */
export const reopenPayrollForCorrection = async (companyId, periodId, actorId, reason) => {
  const normalizedReason = String(reason ?? "").trim();
  if (normalizedReason.length < 8) throw new AppError("Please provide a correction reason of at least 8 characters.", 400);

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) throw new AppError("Payroll period not found.", 404);
    if (!["APPROVED", "FINALIZED"].includes(period.status)) {
      throw new AppError("Only approved or finalized payroll can be reopened for correction.", 400);
    }
    const existingDisbursements = await tx.payrollDisbursement.count({ where: { companyId, periodId } });
    if (existingDisbursements > 0) {
      throw new AppError("This payroll already has a disbursement batch. Do not edit paid or prepared payroll; record a correction in the next payroll instead.", 409);
    }

    await tx.payrollItem.updateMany({
      where: { companyId, periodId },
      data: { status: "CALCULATED", approvedAt: null },
    });
    const updated = await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "CALCULATED" } });
    await writeAudit(tx, {
      companyId, actorUserId: actorId, action: "UPDATE", module: "payroll",
      resource: "payroll_period", resourceId: periodId,
      metadata: { event: "REOPENED_FOR_CORRECTION", previousStatus: period.status, reason: normalizedReason },
    });
    return updated;
  }, transactionOptions);
};

const disbursementInclude = {
  employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, email: true } },
  payrollItem: { select: { id: true, netSalary: true, status: true } },
};

export const listPayrollDisbursements = async (companyId, periodId) => {
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId }, select: { id: true } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  return prisma.payrollDisbursement.findMany({ where: { companyId, periodId }, include: disbursementInclude, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
};

export const preparePayrollDisbursements = async (companyId, periodId, actorId) => {
  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) throw new AppError("Payroll period not found.", 404);
    if (period.isActive === false) throw new AppError("Activate this payroll period before preparing payments.", 409);
    if (period.status !== "FINALIZED") throw new AppError("Only finalized payroll can be prepared for disbursement.", 400);

    const existing = await tx.payrollDisbursement.count({ where: { companyId, periodId } });
    if (existing > 0) throw new AppError("A disbursement batch already exists for this payroll period.", 409);
    const items = await tx.payrollItem.findMany({ where: { companyId, periodId, status: "FINALIZED" }, orderBy: { employeeId: "asc" } });
    if (!items.length) throw new AppError("There are no finalized payroll items to disburse.", 400);
    const negative = items.find((item) => money(item.netSalary).isNegative());
    if (negative) throw new AppError("Payroll contains a negative net salary. Correct the payroll before preparing payments.", 400, { employeeId: negative.employeeId });
    const payable = items.filter((item) => money(item.netSalary).greaterThan(0));
    if (!payable.length) throw new AppError("No employees have a positive net salary in this period.", 400);

    await tx.payrollDisbursement.createMany({ data: payable.map((item) => ({
      companyId, periodId, payrollItemId: item.id, employeeId: item.employeeId,
      amount: money(item.netSalary).toFixed(2), currency: "NGN", status: "PENDING",
      method: "MANUAL_BANK_TRANSFER", createdBy: actorId,
    })) });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "CREATE", module: "payroll", resource: "payroll_disbursement_batch", resourceId: periodId, metadata: { count: payable.length, totalAmount: payable.reduce((sum, item) => sum.plus(item.netSalary), new Decimal(0)).toFixed(2) } });
    return tx.payrollDisbursement.findMany({ where: { companyId, periodId }, include: disbursementInclude, orderBy: { createdAt: "asc" } });
  }, transactionOptions);
};

export const updatePayrollDisbursement = async (companyId, disbursementId, actorId, input) => {
  const status = String(input.status ?? "").toUpperCase();
  if (!["PAID", "FAILED", "PENDING"].includes(status)) throw new AppError("Unsupported disbursement status.", 400);
  const reference = String(input.externalReference ?? "").trim();
  const note = String(input.note ?? "").trim();
  if (status === "PAID" && reference.length < 3) throw new AppError("Enter the bank/provider transaction reference before marking a payout as paid.", 400);
  if (status === "FAILED" && note.length < 4) throw new AppError("Provide a short reason for the failed payment.", 400);

  return prisma.$transaction(async (tx) => {
    const record = await tx.payrollDisbursement.findFirst({ where: { id: disbursementId, companyId } });
    if (!record) throw new AppError("Payroll disbursement not found.", 404);
    if (record.status === "PAID") throw new AppError("A recorded paid disbursement cannot be edited. Use a documented reversal/correction process.", 409);
    if (record.provider) {
      throw new AppError("Provider-managed salary transfers cannot be manually reconciled or retried. Verify the transfer status first and inspect the provider dashboard for failures.", 409);
    }
    const period = await tx.payrollPeriod.findFirst({ where: { id: record.periodId, companyId } });
    if (!period || !["FINALIZED", "PAID"].includes(period.status)) throw new AppError("Disbursement is not available for this payroll status.", 409);

    const updated = await tx.payrollDisbursement.update({
      where: { id: record.id },
      data: {
        status,
        externalReference: status === "PAID" ? reference : (input.externalReference === undefined ? record.externalReference : (reference || null)),
        note: note || record.note,
        paidAt: status === "PAID" ? new Date() : null,
        updatedBy: actorId,
      },
      include: disbursementInclude,
    });
    const all = await tx.payrollDisbursement.findMany({ where: { companyId, periodId: record.periodId }, select: { status: true } });
    if (all.length > 0 && all.every((row) => row.status === "PAID")) {
      await tx.payrollPeriod.update({ where: { id: record.periodId }, data: { status: "PAID" } });
      await tx.payrollItem.updateMany({ where: { companyId, periodId: record.periodId }, data: { status: "PAID" } });
    } else if (period.status === "PAID") {
      await tx.payrollPeriod.update({ where: { id: record.periodId }, data: { status: "FINALIZED" } });
    }
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: record.id, metadata: { previousStatus: record.status, status, externalReference: status === "PAID" ? reference : undefined, note: note || undefined } });
    return updated;
  }, transactionOptions);
};
