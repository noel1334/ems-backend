import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";

const ACTIONS = new Set(["LOGIN","LOGOUT","TOKEN_REFRESH","TOKEN_REUSE_DETECTED","PASSWORD_CHANGE","PASSWORD_RESET_REQUEST","PASSWORD_RESET","CREATE","UPDATE","DELETE","APPROVE","REJECT","EXPORT","LOGIN_FAILED","ACCOUNT_LOCKED","ACCOUNT_UNLOCKED","FINALIZE"]);
const toDate = (value, end = false) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("Invalid audit date filter", 400, "INVALID_DATE_FILTER");
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) date.setUTCHours(23,59,59,999);
  return date;
};
const int = (value, fallback, max) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), max);

export async function listAuditLogs({ companyId, query = {} }) {
  const page = int(query.page, 1, 1000000);
  const limit = int(query.limit, 25, 100);
  const where = { companyId };
  if (query.action) {
    const action = String(query.action).toUpperCase();
    if (!ACTIONS.has(action)) throw new AppError("Invalid audit action", 400, "INVALID_AUDIT_ACTION");
    where.action = action;
  }
  if (query.module) where.module = String(query.module).slice(0, 100);
  if (query.resource) where.resource = String(query.resource).slice(0, 100);
  if (query.userId) where.userId = String(query.userId);
  if (query.resourceId) where.resourceId = String(query.resourceId);
  const from = toDate(query.from);
  const to = toDate(query.to, true);
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (query.search) {
    const search = String(query.search).trim().slice(0, 120);
    if (search) where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { resource: { contains: search, mode: "insensitive" } },
      { resourceId: { contains: search, mode: "insensitive" } },
      { module: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { firstName: { contains: search, mode: "insensitive" } } },
      { user: { lastName: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, action: true, module: true, resource: true, resourceId: true,
        description: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true, requestId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getAuditLog({ companyId, id }) {
  const item = await prisma.auditLog.findFirst({
    where: { id, companyId },
    select: { id:true, action:true, module:true, resource:true, resourceId:true, description:true, ipAddress:true, userAgent:true, metadata:true, createdAt:true, requestId:true, user:{select:{id:true,firstName:true,lastName:true,email:true}} },
  });
  if (!item) throw new AppError("Audit record not found", 404, "AUDIT_LOG_NOT_FOUND");
  return item;
}
