import { Router } from "express";
import {
    authHealth,
    getCurrentUser,
    login,
    logout,
    logoutAllSessions,
    refresh,
    registerCompany, requestPasswordReset, resetPassword, changePassword, requestEmailVerification, verifyEmail
} from "./auth.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { authRateLimit } from "../../middleware/rate-limit.middleware.js";

const router = Router();

router.get(
    "/health",
    authHealth
);

router.post(
    "/register-company",
    registerCompany
);

router.post("/password-reset/request", authRateLimit, requestPasswordReset);
router.post("/password-reset/confirm", authRateLimit, resetPassword);
router.post("/email/verify", authRateLimit, verifyEmail);

router.post(
    "/login",
    authRateLimit,
    login
);

router.post(
    "/refresh",
    authRateLimit,
    refresh
);

router.post(
    "/logout",
    authMiddleware,
    logout
);

router.post(
    "/logout-all",
    authMiddleware,
    logoutAllSessions
);

router.post("/password/change", authMiddleware, authRateLimit, changePassword);
router.post("/email/verification-request", authMiddleware, authRateLimit, requestEmailVerification);

router.get(
    "/me",
    authMiddleware,
    getCurrentUser
);

export default router;