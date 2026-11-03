import { createSessionService } from "./session.service.js";

export function createSessionController(prisma) {
  const service = createSessionService(prisma);

  return {
    list: async (req, res) => {
      const sessions = await service.list(req.user.userId);
      return res.json({ success: true, data: sessions });
    },

    revoke: async (req, res) => {
      await service.revoke(req.params.id, req.user.userId);
      return res.json({ success: true, message: "Session revoked" });
    },

    revokeAll: async (req, res) => {
      await service.revokeAll(req.user.userId);
      return res.json({ success: true, message: "All sessions revoked" });
    },
  };
}
