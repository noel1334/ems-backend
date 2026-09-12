import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import companyRoutes from "../modules/companies/company.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import rbacRoutes from "../modules/rbac/rbac.routes.js";

const router = Router();

router.get(
    "/health",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message: "EMS API is healthy"
        });
    }
);

router.use(
    "/auth",
    authRoutes
);

router.use(
    "/companies",
    companyRoutes
);

router.use(
    "/users",
    userRoutes
);

router.use(
    "/rbac",
    rbacRoutes
);

export default router;