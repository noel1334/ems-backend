import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { checkIn as recordCheckIn, checkOut as recordCheckOut, startBreak as recordBreakStart, endBreak as recordBreakEnd } from "../attendance/attendance.service.js";
import { addDays, endOfDay, startOfDay } from "date-fns";
import {
  checkIn as recordAttendanceCheckIn,
  checkOut as recordAttendanceCheckOut,
  startBreak as startAttendanceBreak,
  endBreak as endAttendanceBreak,
} from "../attendance/attendance.service.js";

const employeeForUser = async (userId, companyId) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { employee: { select: { id: true } } },
  });
  if (!user?.employee?.id) throw new AppError("Employee account is not linked", 404, "EMPLOYEE_ACCOUNT_NOT_LINKED");
  return user.employee.id;
};

const range = (from, to) => {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new AppError("Invalid date range", 400, "INVALID_DATE_RANGE");
  }
  return { gte: start, lte: end };
};

export const getMyProfile = async ({ userId, companyId }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: {
      id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true,
      email: true, phone: true, gender: true, dateOfBirth: true, maritalStatus: true,
      address: true, city: true, state: true, country: true, jobTitle: true,
      employeeType: true, employmentStatus: true, hireDate: true, profilePhotoUrl: true,
      department: { select: { id: true, name: true, code: true } },
      designation: { select: { id: true, name: true, code: true } },
      manager: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
  });
};

export const getMyAttendance = async ({ userId, companyId, from, to, page = 1, limit = 31 }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const where = { companyId, employeeId, attendanceDate: range(from, to) };
  const take = Math.min(Math.max(Number(limit) || 31, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const [items, total] = await prisma.$transaction([
    prisma.attendance.findMany({ where, orderBy: { attendanceDate: "desc" }, skip, take, include: { shift: { select: { id: true, name: true, code: true } }, breaks: { orderBy: { breakStartAt: "asc" } } } }),
    prisma.attendance.count({ where }),
  ]);
  return { items, pagination: { page: Math.floor(skip / take) + 1, limit: take, total, pages: Math.ceil(total / take) } };
};

export const getMySchedule = async ({ userId, companyId, from, to }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const where = { companyId, employeeId, isActive: true, effectiveFrom: { lte: to ? new Date(to) : new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from ? new Date(from) : new Date() } }] };
  const [schedules, shifts] = await prisma.$transaction([
    prisma.employeeScheduleAssignment.findMany({ where, orderBy: { effectiveFrom: "desc" }, include: { schedule: { include: { days: { include: { shift: true }, orderBy: { dayOfWeek: "asc" } } } } } }),
    prisma.employeeShiftAssignment.findMany({ where, orderBy: { effectiveFrom: "desc" }, include: { shift: { include: { breaks: true } } } }),
  ]);
  return { schedules, shifts };
};

export const getMyLeave = async ({ userId, companyId, year }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const y = Number(year) || new Date().getFullYear();
  const start = new Date(`${y}-01-01T00:00:00.000Z`);
  const end = new Date(`${y + 1}-01-01T00:00:00.000Z`);
  const [balances, requests] = await prisma.$transaction([
    prisma.leaveBalance.findMany({ where: { companyId, employeeId, year: y }, include: { leaveType: { select: { id: true, name: true, code: true } } }, orderBy: { leaveTypeId: "asc" } }),
    prisma.leaveRequest.findMany({ where: { companyId, employeeId, OR: [{ startDate: { lt: end }, endDate: { gte: start } }] }, include: { leaveType: { select: { id: true, name: true, code: true } } }, orderBy: { startDate: "desc" } }),
  ]);
  return { year: y, balances, requests };
};

export const getMyPayslips = async ({ userId, companyId, page = 1, limit = 12 }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const where = { companyId, employeeId, period: { is: { status: { in: ["FINALIZED", "PAID"] } } } };
  const [items, total] = await prisma.$transaction([
    prisma.payrollItem.findMany({ where, orderBy: { period: { startDate: "desc" } }, skip, take, include: { period: true, lines: true } }),
    prisma.payrollItem.count({ where }),
  ]);
  return { items, pagination: { page: Math.floor(skip / take) + 1, limit: take, total, pages: Math.ceil(total / take) } };
};


const myOpenAttendance = async ({ userId, companyId }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const now = new Date();
  const record = await prisma.attendance.findFirst({
    where: {
      companyId,
      employeeId,
      attendanceDate: { gte: startOfDay(addDays(now, -1)), lte: endOfDay(now) },
      checkInAt: { not: null },
      checkOutAt: null,
      isLocked: false,
    },
    orderBy: { attendanceDate: "desc" },
  });
  if (!record) throw new AppError("No open attendance session was found. Check in first.", 409, "NO_OPEN_ATTENDANCE");
  return record;
};

export const checkInMyAttendance = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordAttendanceCheckIn({ companyId, employeeId, source: "WEB", ipAddress, userAgent });
};

export const checkOutMyAttendance = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordAttendanceCheckOut({ companyId, employeeId, source: "WEB", ipAddress, userAgent });
};

export const startMyAttendanceBreak = async ({ userId, companyId, breakName }) => {
  const record = await myOpenAttendance({ userId, companyId });
  return startAttendanceBreak({ companyId, attendanceId: record.id, breakName: breakName || "Break", source: "WEB" });
};

export const endMyAttendanceBreak = async ({ userId, companyId }) => {
  const record = await myOpenAttendance({ userId, companyId });
  return endAttendanceBreak({ companyId, attendanceId: record.id, source: "WEB" });
};


// Employee clock actions resolve the linked employee from the authenticated user.
// The client never supplies an employeeId, preventing attendance spoofing across staff.
export const checkInForMe = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordCheckIn({ companyId, employeeId, occurredAt: new Date(), source: "WEB", ipAddress, userAgent });
};

export const checkOutForMe = async ({ userId, companyId, ipAddress, userAgent }) => {
  const employeeId = await employeeForUser(userId, companyId);
  return recordCheckOut({ companyId, employeeId, occurredAt: new Date(), source: "WEB", ipAddress, userAgent });
};

const assertOwnAttendance = async ({ userId, companyId, attendanceId }) => {
  const employeeId = await employeeForUser(userId, companyId);
  const attendance = await prisma.attendance.findFirst({
    where: { id: attendanceId, companyId, employeeId },
    select: { id: true },
  });
  if (!attendance) throw new AppError("Attendance record not found for your account", 404, "ATTENDANCE_NOT_FOUND");
  return attendance.id;
};

export const startMyBreak = async ({ userId, companyId, attendanceId, breakName }) => {
  const ownAttendanceId = await assertOwnAttendance({ userId, companyId, attendanceId });
  return recordBreakStart({ companyId, attendanceId: ownAttendanceId, breakName: String(breakName || "Break").slice(0, 100), occurredAt: new Date(), source: "WEB" });
};

export const endMyBreak = async ({ userId, companyId, attendanceId }) => {
  const ownAttendanceId = await assertOwnAttendance({ userId, companyId, attendanceId });
  return recordBreakEnd({ companyId, attendanceId: ownAttendanceId, occurredAt: new Date(), source: "WEB" });
};
