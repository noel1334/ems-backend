export async function writeAudit(prisma, {
  companyId,
  actorUserId,
  action,
  module,
  resource,
  resourceId,
  requestId,
  ipAddress,
  userAgent,
  metadata,
}) {
  return prisma.auditLog.create({
    data: {
      companyId,
      userId: actorUserId,
      action,
      module,
      resource,
      resourceId,
      requestId,
      ipAddress,
      userAgent,
      metadata,
    },
  });
}
