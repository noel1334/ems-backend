import { AppError } from "../common/errors/AppError.js";
import { verifyAccessToken } from "../common/utils/jwt.js";

export const authMiddleware = (req, res, next) => {
  try {
    let token = null;
    const authorization = req.headers.authorization;

    if (authorization?.startsWith("Bearer ")) {
      token = authorization.slice(7).trim();
    }

    if (!token && req.cookies?.ems_access_token) {
      token = req.cookies.ems_access_token;
    }

    if (!token) {
      throw new AppError("Authentication required", 401, {
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const payload = verifyAccessToken(token);

    if (!payload?.userId || !payload?.companyId || !payload?.sessionId) {
      throw new AppError("Invalid authentication token", 401, {
        code: "INVALID_ACCESS_TOKEN",
      });
    }

    req.user = payload;
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(
      new AppError("Invalid or expired access token", 401, {
        code: "INVALID_ACCESS_TOKEN",
      })
    );
  }
};

export const authenticate = authMiddleware;
export default authMiddleware;
