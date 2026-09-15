import { Router } from "express";
import {
    authHealth,
    getCurrentUser,
    login,
    logout,
    logoutAllSessions,
    refresh,
    registerCompany
} from "./auth.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

const router = Router();

router.get(
    "/health",
    authHealth
);

router.post(
    "/register-company",
    registerCompany
);

router.post(
    "/login",
    login
);

router.post(
    "/refresh",
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

router.get(
    "/me",
    authMiddleware,
    getCurrentUser
);

export default router;