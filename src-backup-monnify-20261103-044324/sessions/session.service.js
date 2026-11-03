import crypto from "node:crypto";
import { createSessionRepository } from "./session.repository.js";

export function createSessionService(prisma) {
  const repository = createSessionRepository(prisma);

  return {
    async create({ userId, expiresAt, ipAddress, userAgent, deviceName }) {
      const refreshToken = crypto.randomBytes(48).toString("base64url");
      const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      const session = await repository.create({
        userId,
        refreshTokenHash,
        expiresAt,
        ipAddress,
        userAgent,
        deviceName,
      });

      return { session, refreshToken };
    },

    async list(userId) {
      return repository.findActiveByUser(userId);
    },

    async revoke(id, userId) {
      return repository.revoke(id, userId);
    },

    async revokeAll(userId) {
      return repository.revokeAllForUser(userId);
    },

    async cleanupExpired() {
      return prisma.userSession.updateMany({
        where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
        data: { status: "EXPIRED" },
      });
    },
  };
}
