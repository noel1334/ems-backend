import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";

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
  const end = to ? new Date(to) : new Date(Date.now() + 30 * 86400000);
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
    prisma.attendance.findMany({ where, orderBy: { attendanceDate: "desc" }, skip, take, include: { shift: { select: { id: true, name: true, code: true } } } }),
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
  const where = { companyId, employeeId };
  const [items, total] = await prisma.$transaction([
    prisma.payrollItem.findMany({ where, orderBy: { period: { startDate: "desc" } }, skip, take, include: { period: true, lines: true } }),
    prisma.payrollItem.count({ where }),
  ]);
  return { items, pagination: { page: Math.floor(skip / take) + 1, limit: take, total, pages: Math.ceil(total / take) } };
};
