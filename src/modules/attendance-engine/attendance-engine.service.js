import {
  addDays,
  endOfDay,
  startOfDay,
} from "date-fns";

import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { generateEmployeeAttendance } from "../attendance/attendance.service.js";

const dayRange = (from, to) => {
  const start = startOfDay(new Date(from));
  const end = startOfDay(new Date(to));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new AppError("Invalid attendance date range", 400);
  }
  return { start, end };
};

const approvedLeaveForDate = async (companyId, employeeId, date, tx) =>
  tx.leaveRequest.findFirst({
    where: {
      companyId,
      employeeId,
      status: "APPROVED",
      startDate: { lte: endOfDay(date) },
      endDate: { gte: startOfDay(date) },
    },
    orderBy: { startDate: "desc" },
  });

const employeesForCompany = (companyId, tx) =>
  tx.employee.findMany({
    where: { companyId, employmentStatus: "ACTIVE" },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
    orderBy: { employeeNumber: "asc" },
  });

export const processAttendanceRange = async ({ companyId, from, to, employeeId }) => {
  const { start, end } = dayRange(from, to);
  const employees = employeeId
    ? await prisma.employee.findMany({
        where: { companyId, id: employeeId, employmentStatus: "ACTIVE" },
        select: { id: true, employeeNumber: true, firstName: true, lastName: true },
      })
    : await employeesForCompany(companyId, prisma);

  if (!employees.length) {
    throw new AppError("No active employees found for this range", 404);
  }

  const results = [];
  for (const employee of employees) {
    await generateEmployeeAttendance({ companyId, employeeId: employee.id, from: start, to: end });

    let current = start;
    while (current <= end) {
      const leave = await approvedLeaveForDate(companyId, employee.id, current, prisma);
      const record = await prisma.attendance.findUnique({
        where: { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate: current } },
      });

      if (record && leave && !record.checkInAt && !record.isLocked) {
        await prisma.attendance.update({
          where: { id: record.id },
          data: { status: "ON_LEAVE", notes: record.notes ?? `Approved leave: ${leave.id}` },
        });
      }

      current = addDays(current, 1);
    }

    results.push(employee.id);
  }

  const summary = await prisma.attendance.groupBy({
    by: ["status"],
    where: { companyId, attendanceDate: { gte: start, lte: end }, ...(employeeId ? { employeeId } : {}) },
    _count: { _all: true },
    _sum: { workedMinutes: true, lateMinutes: true, earlyDepartureMinutes: true, overtimeMinutes: true, breakMinutes: true },
  });

  return {
    from: start,
    to: end,
    employeesProcessed: results.length,
    summary: summary.map((item) => ({
      status: item.status,
      count: item._count._all,
      workedMinutes: item._sum.workedMinutes ?? 0,
      lateMinutes: item._sum.lateMinutes ?? 0,
      earlyDepartureMinutes: item._sum.earlyDepartureMinutes ?? 0,
      overtimeMinutes: item._sum.overtimeMinutes ?? 0,
      breakMinutes: item._sum.breakMinutes ?? 0,
    })),
  };
};
