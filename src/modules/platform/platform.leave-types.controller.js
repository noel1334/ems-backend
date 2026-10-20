import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { writeAudit } from "../../common/utils/audit.js";
import * as platformService from "./platform.service.js";
import { leaveTypeCreateSchema, leaveTypeUpdateSchema, typeListSchema } from "../leave/leave.validators.js";

const tenantId = async (req) => {
  await platformService.getTenant(req.params.id);
  return req.params.id;
};
const parse = (schema, value, message) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(message, 400, { code: "VALIDATION_ERROR", details: result.error.issues });
  return result.data;
};
const audit = (req, action, resourceId, companyId, metadata = {}) => writeAudit(prisma, {
  companyId: null,
  actorUserId: req.user?.userId,
  action,
  module: "platform",
  resource: "tenant_leave_type",
  resourceId: resourceId ?? null,
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
  metadata: { targetCompanyId: companyId, ...metadata },
});
const notFound = () => new AppError("Leave type not found in this company", 404);

export const listTypes = asyncHandler(async (req, res) => {
  const companyId = await tenantId(req);
  const query = parse(typeListSchema, req.query, "Invalid leave type query");
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const where = {
    companyId,
    ...(query.search ? { OR: [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ] } : {}),
    ...(typeof query.isActive === "boolean" ? { isActive: query.isActive } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.leaveType.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.leaveType.count({ where }),
  ]);
  return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit), totalPages: Math.ceil(total / limit) } } });
});

export const getType = asyncHandler(async (req, res) => {
  const companyId = await tenantId(req);
  const item = await prisma.leaveType.findFirst({ where: { id: req.params.resourceId, companyId } });
  if (!item) throw notFound();
  return res.json({ success: true, data: item });
});

export const createType = asyncHandler(async (req, res) => {
  const companyId = await tenantId(req);
  const payload = parse(leaveTypeCreateSchema, req.body, "Invalid leave type");
  const code = payload.code.toUpperCase();
  const duplicate = await prisma.leaveType.findFirst({ where: { companyId, code } });
  if (duplicate) throw new AppError("Leave type code already exists in this company", 409);
  const item = await prisma.leaveType.create({ data: { companyId, ...payload, code } });
  await audit(req, "CREATE", item.id, companyId, { name: item.name, code: item.code });
  return res.status(201).json({ success: true, message: "Leave type created", data: item });
});

export const updateType = asyncHandler(async (req, res) => {
  const companyId = await tenantId(req);
  const payload = parse(leaveTypeUpdateSchema, req.body, "Invalid leave type update");
  const existing = await prisma.leaveType.findFirst({ where: { id: req.params.resourceId, companyId } });
  if (!existing) throw notFound();
  const code = payload.code?.toUpperCase();
  if (code) {
    const duplicate = await prisma.leaveType.findFirst({ where: { companyId, code, id: { not: existing.id } } });
    if (duplicate) throw new AppError("Leave type code already exists in this company", 409);
  }
  const item = await prisma.leaveType.update({ where: { id: existing.id }, data: { ...payload, ...(code ? { code } : {}) } });
  await audit(req, "UPDATE", item.id, companyId, { name: item.name, code: item.code });
  return res.json({ success: true, message: "Leave type updated", data: item });
});

export const deleteType = asyncHandler(async (req, res) => {
  const companyId = await tenantId(req);
  const existing = await prisma.leaveType.findFirst({ where: { id: req.params.resourceId, companyId } });
  if (!existing) throw notFound();
  const item = await prisma.leaveType.update({ where: { id: existing.id }, data: { isActive: false } });
  await audit(req, "UPDATE", item.id, companyId, { name: item.name, code: item.code, isActive: false });
  return res.json({ success: true, message: "Leave type deactivated", data: item });
});
