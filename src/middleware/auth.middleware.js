import { AppError } from "../common/errors/AppError.js";
import { verifyAccessToken } from "../common/utils/jwt.js";
import { hasValidTenantContext } from "./auth-token-policy.js";

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

    if (!payload?.userId || !payload?.sessionId) {
      throw new AppError("Invalid authentication token", 401, {
        code: "INVALID_ACCESS_TOKEN",
      });
    }

    // Platform users (SUPER_ADMIN) intentionally have no tenant/company.
    // Company users must always carry a companyId in their token.
    // Keep this predicate explicit: negating Array.isArray(...) before
    // optional-chaining .includes() throws a TypeError for valid role arrays.
    if (!hasValidTenantContext(payload)) {
      throw new AppError("Invalid tenant authentication token", 401, {
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
