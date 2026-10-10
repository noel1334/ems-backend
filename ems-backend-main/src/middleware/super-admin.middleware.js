import { AppError } from "../common/errors/AppError.js";
import prisma from "../config/database.js";

export const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user?.userId) throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, status: true, companyId: true, roles: { where: { role: { isActive: true, scope: "SYSTEM", name: "SUPER_ADMIN" } }, select: { roleId: true } } },
    });
    if (!user || user.status !== "ACTIVE" || !user.roles.length || user.companyId !== null) {
      throw new AppError("Platform administrator access required", 403, "SUPER_ADMIN_REQUIRED");
    }
    req.platform = { userId: user.id };
    next();
  } catch (error) { next(error); }
};
