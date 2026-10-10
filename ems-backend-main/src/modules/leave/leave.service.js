import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import {
  dateRange,
  dayOfWeekForPrisma,
  numberOf,
  parseDateOnly,
} from "./leave.utils.js";
import * as repo from "./leave.repository.js";

const D = (v) => new Decimal(v?.toString?.() ?? v ?? 0);
const companyId = (req) => {
  const id = req.tenant?.companyId ?? req.user?.companyId;
  if (!id) throw new AppError("Company context is required", 400);
  return id;
};
const available = (b) =>
  D(b.openingBalance)
    .plus(b.accrued)
    .plus(b.carriedForward)
    .plus(b.adjustment)
    .minus(b.used)
    .minus(b.pending);
const yearOf = (d) => d.getFullYear();

async function workingDays(companyId, employeeId, start, end, tx) {
  let total = D(0);
  for (const date of dateRange(start, end)) {
    if (await repo.isHoliday(companyId, date, tx)) continue;
    const assignment = await repo.findAssignment(
      companyId,
      employeeId,
      date,
      tx
    );
    if (!assignment) {
      const day = date.getDay();
      if (day !== 0 && day !== 6) total = total.plus(1);
      continue;
    }
    const dow = dayOfWeekForPrisma(date);
    const sd = assignment.schedule.days.find(
      (x) => Number(x.dayOfWeek) === dow
    );
    if (sd?.isWorkingDay) total = total.plus(1);
  }
  return total;
}
async function ensureBalance(companyId, employeeId, type, year, tx) {
  let b = await repo.findBalance(companyId, employeeId, type.id, year, tx);
  if (!b)
    b = await tx.leaveBalance.create({
      data: {
        companyId,
        employeeId,
        leaveTypeId: type.id,
        year,
        openingBalance: type.annualEntitlement,
        accrued: 0,
        used: 0,
        pending: 0,
        adjustment: 0,
        carriedForward: 0,
      },
    });
  return b;
}
async function noOverlap(
  companyId,
  employeeId,
  start,
  end,
  duration,
  half,
  exclude,
  tx
) {
  const rows = await repo.overlaps(
    companyId,
    employeeId,
    start,
    end,
    exclude,
    tx
  );
  for (const x of rows) {
    const same =
      x.startDate.getTime() === start.getTime() &&
      x.endDate.getTime() === end.getTime();
    if (
      same &&
      x.durationType === "HALF_DAY" &&
      duration === "HALF_DAY" &&
      x.halfDayPeriod !== half
    )
      continue;
    throw new AppError(
      `Leave overlaps existing ${x.status.toLowerCase()} request ${x.id}`,
      409
    );
  }
}

export async function listTypes(req) {
  const cid = companyId(req),
    q = req.validated?.query ?? req.query,
    page = Number(q.page ?? 1),
    limit = Number(q.limit ?? 20);
  const where = {
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" } },
            { code: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
  };
  const [items, total] = await repo.listTypes(
    cid,
    where,
    (page - 1) * limit,
    limit
  );
  return {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export async function getType(req) {
  const x = await repo.findType(companyId(req), req.params.id);
  if (!x) throw new AppError("Leave type not found", 404);
  return x;
}
export async function createType(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  if (await repo.findTypeByCode(cid, p.code))
    throw new AppError("Leave type code already exists", 409);
  return prisma.$transaction(
    async (tx) =>
      tx.leaveType.create({
        data: { companyId: cid, ...p, code: p.code.toUpperCase() },
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function updateType(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  if (!(await repo.findType(cid, req.params.id)))
    throw new AppError("Leave type not found", 404);
  if (p.code) {
    const dup = await repo.findTypeByCode(cid, p.code);
    if (dup && dup.id !== req.params.id)
      throw new AppError("Leave type code already exists", 409);
  }
  return prisma.leaveType.update({
    where: { id: req.params.id },
    data: { ...p, ...(p.code ? { code: p.code.toUpperCase() } : {}) },
  });
}
export async function deleteType(req) {
  const cid = companyId(req),
    x = await repo.findType(cid, req.params.id);
  if (!x) throw new AppError("Leave type not found", 404);
  return prisma.leaveType.update({
    where: { id: x.id },
    data: { isActive: false },
  });
}
export async function listBalances(req) {
  const cid = companyId(req),
    q = req.validated?.query ?? req.query,
    page = Number(q.page ?? 1),
    limit = Number(q.limit ?? 20);
  const [items, total] = await repo.listBalances(
    cid,
    {
      ...(q.employeeId && { employeeId: q.employeeId }),
      ...(q.leaveTypeId && { leaveTypeId: q.leaveTypeId }),
      ...(q.year && { year: Number(q.year) }),
    },
    (page - 1) * limit,
    limit
  );
  return {
    items: items.map((x) => ({ ...x, available: available(x).toFixed(2) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export async function initializeBalance(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  return prisma.$transaction(
    async (tx) => {
      const e = await repo.findEmployee(cid, p.employeeId, tx);
      if (!e) throw new AppError("Employee not found", 404);
      const t = await repo.findType(cid, p.leaveTypeId, tx);
      if (!t) throw new AppError("Leave type not found", 404);
      if (await repo.findBalance(cid, p.employeeId, p.leaveTypeId, p.year, tx))
        throw new AppError("Leave balance already exists", 409);
      const b = await tx.leaveBalance.create({
        data: {
          companyId: cid,
          employeeId: p.employeeId,
          leaveTypeId: p.leaveTypeId,
          year: p.year,
          openingBalance: p.openingBalance ?? t.annualEntitlement,
          accrued: p.accrued ?? 0,
          used: 0,
          pending: 0,
          adjustment: p.adjustment ?? 0,
          carriedForward: p.carriedForward ?? 0,
        },
      });
      await tx.leaveBalanceTransaction.create({
        data: {
          companyId: cid,
          employeeId: p.employeeId,
          leaveTypeId: p.leaveTypeId,
          type: "ALLOCATION",
          amount: available(b),
          balanceAfter: available(b),
          note: "Initial leave allocation",
          createdById: req.user?.id ?? null,
        },
      });
      return { ...b, available: available(b).toFixed(2) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function adjustBalance(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  return prisma.$transaction(
    async (tx) => {
      const b = await repo.findBalanceById(cid, req.params.id, tx);
      if (!b) throw new AppError("Leave balance not found", 404);
      const after = available(b).plus(p.amount);
      if (after.isNegative())
        throw new AppError(
          "Adjustment would make available balance negative",
          400
        );
      const updated = await tx.leaveBalance.update({
        where: { id: b.id },
        data: { adjustment: D(b.adjustment).plus(p.amount) },
      });
      await tx.leaveBalanceTransaction.create({
        data: {
          companyId: cid,
          employeeId: b.employeeId,
          leaveTypeId: b.leaveTypeId,
          type: "ADJUSTMENT",
          amount: p.amount,
          balanceAfter: after,
          note: p.note,
          createdById: req.user?.id ?? null,
        },
      });
      return { ...updated, available: after.toFixed(2) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function listRequests(req) {
  const cid = companyId(req),
    q = req.validated?.query ?? req.query,
    page = Number(q.page ?? 1),
    limit = Number(q.limit ?? 20);
  const where = {
    ...(q.employeeId && { employeeId: q.employeeId }),
    ...(q.leaveTypeId && { leaveTypeId: q.leaveTypeId }),
    ...(q.status && { status: q.status }),
    ...(q.startDate && { endDate: { gte: parseDateOnly(q.startDate) } }),
    ...(q.endDate && { startDate: { lte: parseDateOnly(q.endDate) } }),
    ...(q.search
      ? {
          OR: [
            { reason: { contains: q.search, mode: "insensitive" } },
            {
              employee: {
                employeeNumber: { contains: q.search, mode: "insensitive" },
              },
            },
            {
              employee: {
                firstName: { contains: q.search, mode: "insensitive" },
              },
            },
            {
              employee: {
                lastName: { contains: q.search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await repo.listRequests(
    cid,
    where,
    (page - 1) * limit,
    limit
  );
  return {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export async function getRequest(req) {
  const x = await repo.findRequest(companyId(req), req.params.id);
  if (!x) throw new AppError("Leave request not found", 404);
  return x;
}
export async function createRequest(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body,
    start = parseDateOnly(p.startDate),
    end = parseDateOnly(p.endDate);
  if (yearOf(start) !== yearOf(end))
    throw new AppError("Leave requests cannot cross calendar years", 400);
  return prisma.$transaction(
    async (tx) => {
      const e = await repo.findEmployee(cid, p.employeeId, tx);
      if (!e) throw new AppError("Employee not found", 404);
      if (e.employmentStatus !== "ACTIVE")
        throw new AppError(
          "Leave can only be requested for an active employee",
          400
        );
      const t = await repo.findType(cid, p.leaveTypeId, tx);
      if (!t || !t.isActive)
        throw new AppError("Active leave type not found", 404);
      await noOverlap(
        cid,
        p.employeeId,
        start,
        end,
        p.durationType,
        p.halfDayPeriod,
        null,
        tx
      );
      let days =
        p.durationType === "HALF_DAY"
          ? D(0.5)
          : await workingDays(cid, p.employeeId, start, end, tx);
      if (days.isZero())
        throw new AppError("Leave period contains no working days", 400);
      const b = await ensureBalance(cid, p.employeeId, t, yearOf(start), tx);
      if (available(b).lt(days))
        throw new AppError(
          `Insufficient leave balance. Available: ${available(b).toFixed(2)}, requested: ${days.toFixed(2)}`,
          400
        );
      const status = t.requiresApproval ? "PENDING" : "APPROVED";
      const r = await tx.leaveRequest.create({
        data: {
          companyId: cid,
          employeeId: p.employeeId,
          leaveTypeId: p.leaveTypeId,
          startDate: start,
          endDate: end,
          durationType: p.durationType,
          halfDayPeriod: p.halfDayPeriod ?? null,
          totalDays: days,
          reason: p.reason,
          status,
          currentApprovalLevel: 1,
          ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
        },
      });
      if (status === "PENDING") {
        await tx.leaveApproval.create({
          data: { leaveRequestId: r.id, level: 1, status: "PENDING" },
        });
        await tx.leaveBalance.update({
          where: { id: b.id },
          data: { pending: D(b.pending).plus(days) },
        });
      } else {
        const nb = await tx.leaveBalance.update({
          where: { id: b.id },
          data: { used: D(b.used).plus(days) },
        });
        await tx.leaveBalanceTransaction.create({
          data: {
            companyId: cid,
            employeeId: p.employeeId,
            leaveTypeId: p.leaveTypeId,
            leaveRequestId: r.id,
            type: "DEDUCTION",
            amount: days.neg(),
            balanceAfter: available(nb),
            note: "Automatic approval",
            createdById: req.user?.id ?? null,
          },
        });
      }
      return repo.findRequest(cid, r.id, tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function updateRequest(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  return prisma.$transaction(
    async (tx) => {
      const r = await repo.findRequest(cid, req.params.id, tx);
      if (!r) throw new AppError("Leave request not found", 404);
      if (r.status !== "PENDING")
        throw new AppError("Only pending requests can be edited", 400);
      const start = parseDateOnly(
          p.startDate ?? r.startDate.toISOString().slice(0, 10)
        ),
        end = parseDateOnly(p.endDate ?? r.endDate.toISOString().slice(0, 10)),
        duration = p.durationType ?? r.durationType,
        half =
          p.halfDayPeriod !== undefined ? p.halfDayPeriod : r.halfDayPeriod;
      if (yearOf(start) !== yearOf(end))
        throw new AppError("Leave requests cannot cross calendar years", 400);
      if (duration === "HALF_DAY" && start.getTime() !== end.getTime())
        throw new AppError("Half-day leave must be one day", 400);
      if (duration === "HALF_DAY" && !half)
        throw new AppError("halfDayPeriod is required", 400);
      if (duration === "FULL_DAY" && half)
        throw new AppError(
          "halfDayPeriod is only valid for half-day leave",
          400
        );
      await noOverlap(cid, r.employeeId, start, end, duration, half, r.id, tx);
      const days =
        duration === "HALF_DAY"
          ? D(0.5)
          : await workingDays(cid, r.employeeId, start, end, tx);
      if (days.isZero())
        throw new AppError("Leave period contains no working days", 400);
      const b = await repo.findBalance(
        cid,
        r.employeeId,
        r.leaveTypeId,
        yearOf(start),
        tx
      );
      if (!b) throw new AppError("Leave balance not found", 409);
      if (available(b).plus(r.totalDays).lt(days))
        throw new AppError(
          "Insufficient leave balance for updated request",
          400
        );
      const delta = days.minus(r.totalDays);
      const u = await tx.leaveRequest.update({
        where: { id: r.id },
        data: {
          startDate: start,
          endDate: end,
          durationType: duration,
          halfDayPeriod: duration === "HALF_DAY" ? half : null,
          totalDays: days,
          ...(p.reason !== undefined ? { reason: p.reason } : {}),
        },
      });
      if (!delta.isZero())
        await tx.leaveBalance.update({
          where: { id: b.id },
          data: { pending: D(b.pending).plus(delta) },
        });
      return u;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function approveRequest(req) {
  const cid = companyId(req);
  return prisma.$transaction(
    async (tx) => {
      const r = await repo.findRequest(cid, req.params.id, tx);
      if (!r) throw new AppError("Leave request not found", 404);
      if (r.status !== "PENDING")
        throw new AppError("Only pending requests can be approved", 400);
      const a = await repo.pendingApproval(
        cid,
        r.id,
        r.currentApprovalLevel,
        tx
      );
      if (!a) throw new AppError("Current approval level is not pending", 409);
      await tx.leaveApproval.update({
        where: { id: a.id },
        data: {
          status: "APPROVED",
          approverUserId: req.user?.id ?? null,
          comment: req.body?.comment ?? null,
          actedAt: new Date(),
        },
      });
      const next = r.currentApprovalLevel + 1;
      if (next <= r.leaveType.approvalLevels) {
        await tx.leaveApproval.create({
          data: { leaveRequestId: r.id, level: next, status: "PENDING" },
        });
        const u = await tx.leaveRequest.update({
          where: { id: r.id },
          data: { currentApprovalLevel: next },
        });
        return { request: u, completed: false, nextApprovalLevel: next };
      }
      const b = await repo.findBalance(
        cid,
        r.employeeId,
        r.leaveTypeId,
        yearOf(r.startDate),
        tx
      );
      if (!b) throw new AppError("Leave balance not found", 409);
      const pending = D(b.pending).minus(r.totalDays);
      if (pending.isNegative())
        throw new AppError("Leave balance pending amount is inconsistent", 409);
      const nb = await tx.leaveBalance.update({
        where: { id: b.id },
        data: { pending, used: D(b.used).plus(r.totalDays) },
      });
      await tx.leaveBalanceTransaction.create({
        data: {
          companyId: cid,
          employeeId: r.employeeId,
          leaveTypeId: r.leaveTypeId,
          leaveRequestId: r.id,
          type: "DEDUCTION",
          amount: D(r.totalDays).neg(),
          balanceAfter: available(nb),
          note: "Leave fully approved",
          createdById: req.user?.id ?? null,
        },
      });
      const u = await tx.leaveRequest.update({
        where: { id: r.id },
        data: { status: "APPROVED", approvedAt: new Date() },
      });
      return { request: u, completed: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function rejectRequest(req) {
  const cid = companyId(req),
    p = req.validated?.body ?? req.body;
  return prisma.$transaction(
    async (tx) => {
      const r = await repo.findRequest(cid, req.params.id, tx);
      if (!r) throw new AppError("Leave request not found", 404);
      if (r.status !== "PENDING")
        throw new AppError("Only pending requests can be rejected", 400);
      const a = await repo.pendingApproval(
        cid,
        r.id,
        r.currentApprovalLevel,
        tx
      );
      if (!a) throw new AppError("Current approval level is not pending", 409);
      await tx.leaveApproval.update({
        where: { id: a.id },
        data: {
          status: "REJECTED",
          approverUserId: req.user?.id ?? null,
          comment: p.comment,
          actedAt: new Date(),
        },
      });
      const b = await repo.findBalance(
        cid,
        r.employeeId,
        r.leaveTypeId,
        yearOf(r.startDate),
        tx
      );
      if (!b) throw new AppError("Leave balance not found", 409);
      const pending = D(b.pending).minus(r.totalDays);
      if (pending.isNegative())
        throw new AppError("Leave balance pending amount is inconsistent", 409);
      const nb = await tx.leaveBalance.update({
        where: { id: b.id },
        data: { pending },
      });
      const u = await tx.leaveRequest.update({
        where: { id: r.id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: p.comment,
        },
      });
      return { request: u, balance: nb };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function cancelRequest(req) {
  const cid = companyId(req);
  return prisma.$transaction(
    async (tx) => {
      const r = await repo.findRequest(cid, req.params.id, tx);
      if (!r) throw new AppError("Leave request not found", 404);
      if (!["PENDING", "APPROVED"].includes(r.status))
        throw new AppError(
          "Only pending or approved leave can be cancelled",
          400
        );
      const b = await repo.findBalance(
        cid,
        r.employeeId,
        r.leaveTypeId,
        yearOf(r.startDate),
        tx
      );
      if (!b) throw new AppError("Leave balance not found", 409);
      let nb;
      if (r.status === "PENDING") {
        nb = await tx.leaveBalance.update({
          where: { id: b.id },
          data: { pending: D(b.pending).minus(r.totalDays) },
        });
      } else {
        const used = D(b.used).minus(r.totalDays);
        if (used.isNegative())
          throw new AppError("Leave balance is inconsistent", 409);
        nb = await tx.leaveBalance.update({
          where: { id: b.id },
          data: { used },
        });
        await tx.leaveBalanceTransaction.create({
          data: {
            companyId: cid,
            employeeId: r.employeeId,
            leaveTypeId: r.leaveTypeId,
            leaveRequestId: r.id,
            type: "RESTORATION",
            amount: r.totalDays,
            balanceAfter: available(nb),
            note: "Approved leave cancelled",
            createdById: req.user?.id ?? null,
          },
        });
      }
      const u = await tx.leaveRequest.update({
        where: { id: r.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: req.user?.id ?? null,
        },
      });
      return { request: u, balance: nb };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
export async function employeeHistory(req) {
  const cid = companyId(req),
    e = await repo.findEmployee(cid, req.params.employeeId);
  if (!e) throw new AppError("Employee not found", 404);
  const page = Number(req.query.page ?? 1),
    limit = Math.min(Number(req.query.limit ?? 20), 100);
  const [items, total] = await repo.history(
    cid,
    e.id,
    (page - 1) * limit,
    limit
  );
  return {
    employee: e,
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export async function reportSummary(req) {
  const cid = companyId(req),
    year = Number(req.query.year ?? new Date().getFullYear());
  const rows = await prisma.leaveRequest.groupBy({
    by: ["status", "leaveTypeId"],
    where: {
      companyId: cid,
      startDate: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
    _count: { _all: true },
    _sum: { totalDays: true },
  });
  const ids = [...new Set(rows.map((x) => x.leaveTypeId))];
  const types = await prisma.leaveType.findMany({
    where: { companyId: cid, id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  const map = new Map(types.map((x) => [x.id, x]));
  return {
    year,
    items: rows.map((x) => ({
      leaveType: map.get(x.leaveTypeId),
      status: x.status,
      requestCount: x._count._all,
      totalDays: numberOf(x._sum.totalDays),
    })),
  };
}
export async function isEmployeeOnApprovedLeave(
  companyId,
  employeeId,
  date,
  tx = prisma
) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return tx.leaveRequest.findFirst({
    where: {
      companyId,
      employeeId,
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: {
      id: true,
      durationType: true,
      halfDayPeriod: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
    },
  });
}
