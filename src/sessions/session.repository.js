export function createSessionRepository(prisma) {
  return {
    create(data) { return prisma.userSession.create({ data }); },
    findById(id) { return prisma.userSession.findUnique({ where: { id } }); },
    findActiveByUser(userId) { return prisma.userSession.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }); },
    revoke(id, userId) { return prisma.userSession.updateMany({ where: { id, userId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } }); },
    revokeAllForUser(userId) { return prisma.userSession.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } }); },
    touch(id) { return prisma.userSession.update({ where: { id }, data: { lastUsedAt: new Date() } }); },
  };
}
