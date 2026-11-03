import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";

export const createNotification = async ({ companyId, userId, type, title, message, channel = "IN_APP", priority = "NORMAL", actionUrl = null, metadata = null }) => {
  if (!companyId || !userId || !type || !title || !message) {
    throw new AppError("Notification company, user, type, title and message are required", 400, { code: "NOTIFICATION_FIELDS_REQUIRED" });
  }
  return prisma.notification.create({ data: { companyId, userId, type, title, message, channel, priority, actionUrl, metadata } });
};

export const listNotifications = async ({ companyId, userId, status, type, page = 1, limit = 20 }) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = { companyId, userId, ...(status ? { status } : {}), ...(type ? { type } : {}) };
  const [items, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (safePage - 1) * safeLimit, take: safeLimit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { companyId, userId, status: "UNREAD" } }),
  ]);
  return { items, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }, unread };
};

export const markRead = async ({ companyId, userId, id }) => {
  const result = await prisma.notification.updateMany({ where: { id, companyId, userId }, data: { status: "READ", readAt: new Date() } });
  if (!result.count) throw new AppError("Notification not found", 404, { code: "NOTIFICATION_NOT_FOUND" });
  return prisma.notification.findFirst({ where: { id, companyId, userId } });
};

export const markAllRead = async ({ companyId, userId }) => {
  const result = await prisma.notification.updateMany({ where: { companyId, userId, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
  return { updated: result.count };
};

export const deleteNotification = async ({ companyId, userId, id }) => {
  const result = await prisma.notification.deleteMany({ where: { id, companyId, userId } });
  if (!result.count) throw new AppError("Notification not found", 404, { code: "NOTIFICATION_NOT_FOUND" });
  return { deleted: true };
};

export const notifyUsers = async ({ companyId, userIds, ...payload }) => {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return { created: 0 };
  const users = await prisma.user.findMany({ where: { id: { in: ids }, companyId, status: "ACTIVE" }, select: { id: true } });
  if (!users.length) return { created: 0 };
  const result = await prisma.notification.createMany({ data: users.map(({ id }) => ({ companyId, userId: id, ...payload })) });
  return { created: result.count };
};
