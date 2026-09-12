import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import companyRoutes from "../modules/companies/company.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import rbacRoutes from "../modules/rbac/rbac.routes.js";

import departmentRoutes from "../modules/departments/department.routes.js";
import designationRoutes from "../modules/designations/designation.routes.js";

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

router.use(
    "/departments",
    departmentRoutes
);

router.use(
    "/designations",
    designationRoutes
);

export default router;