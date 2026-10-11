import prisma from "../../config/database.js";

export async function findType(companyId, id, tx = prisma) {
  return tx.leaveType.findFirst({ where: { id, companyId } });
}
export async function findTypeByCode(companyId, code, tx = prisma) {
  return tx.leaveType.findFirst({
    where: { companyId, code: code.toUpperCase() },
  });
}
export async function listTypes(companyId, where, skip, take, tx = prisma) {
  return Promise.all([
    tx.leaveType.findMany({
      where: { companyId, ...where },
      orderBy: { name: "asc" },
      skip,
      take,
    }),
    tx.leaveType.count({ where: { companyId, ...where } }),
  ]);
}
export async function findEmployee(companyId, id, tx = prisma) {
  return tx.employee.findFirst({ where: { id, companyId } });
}
export async function findBalance(
  companyId,
  employeeId,
  leaveTypeId,
  year,
  tx = prisma
) {
  return tx.leaveBalance.findFirst({
    where: { companyId, employeeId, leaveTypeId, year },
  });
}
export async function findBalanceById(companyId, id, tx = prisma) {
  return tx.leaveBalance.findFirst({
    where: { id, companyId },
    include: {
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
        },
      },
      leaveType: { select: { id: true, name: true, code: true } },
    },
  });
}
export async function listBalances(companyId, where, skip, take, tx = prisma) {
  return Promise.all([
    tx.leaveBalance.findMany({
      where: { companyId, ...where },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }],
      skip,
      take,
    }),
    tx.leaveBalance.count({ where: { companyId, ...where } }),
  ]);
}
export async function findAssignment(companyId, employeeId, date, tx = prisma) {
  return tx.employeeScheduleAssignment.findFirst({
    where: {
      employeeId,
      isActive: true,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      employee: { companyId },
    },
    include: { schedule: { include: { days: true } } },
    orderBy: { effectiveFrom: "desc" },
  });
}
export async function isHoliday(companyId, date, tx = prisma) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const exact = await tx.holiday.findFirst({
    where: {
      companyId,
      isActive: true,
      date: { gte: start, lte: end },
      isRecurring: false,
    },
  });
  if (exact) return true;
  const recurring = await tx.holiday.findMany({
    where: { companyId, isActive: true, isRecurring: true },
    select: { date: true },
  });
  const m = date.getMonth(),
    d = date.getDate();
  return recurring.some(
    (h) => h.date.getMonth() === m && h.date.getDate() === d
  );
}
export async function overlaps(
  companyId,
  employeeId,
  startDate,
  endDate,
  excludeId,
  tx = prisma
) {
  return tx.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      durationType: true,
      halfDayPeriod: true,
      status: true,
    },
  });
}
export async function findRequest(companyId, id, tx = prisma) {
  return tx.leaveRequest.findFirst({
    where: { id, companyId },
    include: {
      leaveType: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
      },
      approvals: { orderBy: { level: "asc" } },
    },
  });
}
export async function listRequests(companyId, where, skip, take, tx = prisma) {
  return Promise.all([
    tx.leaveRequest.findMany({
      where: { companyId, ...where },
      include: {
        leaveType: {
          select: { id: true, name: true, code: true, isPaid: true },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
          },
        },
        approvals: { orderBy: { level: "asc" } },
      },
      orderBy: { submittedAt: "desc" },
      skip,
      take,
    }),
    tx.leaveRequest.count({ where: { companyId, ...where } }),
  ]);
}
export async function pendingApproval(
  companyId,
  requestId,
  level,
  tx = prisma
) {
  return tx.leaveApproval.findFirst({
    where: {
      leaveRequestId: requestId,
      level,
      status: "PENDING",
      leaveRequest: { companyId },
    },
  });
}
export async function history(companyId, employeeId, skip, take, tx = prisma) {
  return Promise.all([
    tx.leaveRequest.findMany({
      where: { companyId, employeeId },
      include: {
        leaveType: { select: { id: true, name: true, code: true } },
        approvals: { orderBy: { level: "asc" } },
      },
      orderBy: { startDate: "desc" },
      skip,
      take,
    }),
    tx.leaveRequest.count({ where: { companyId, employeeId } }),
  ]);
}
