import { Router } from "express";

import {
    createDepartment,
    getDepartment,
    listDepartments,
    updateDepartment,
    deleteDepartment
} from "./department.controller.js";

import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(
    authMiddleware,
    tenantMiddleware
);

router.get(
    "/",
    requirePermission(
        "departments",
        "departments",
        "READ"
    ),
    listDepartments
);

router.post(
    "/",
    requirePermission(
        "departments",
        "departments",
        "CREATE"
    ),
    createDepartment
);

router.get(
    "/:id",
    requirePermission(
        "departments",
        "departments",
        "READ"
    ),
    getDepartment
);

router.patch(
    "/:id",
    requirePermission(
        "departments",
        "departments",
        "UPDATE"
    ),
    updateDepartment
);

router.delete(
    "/:id",
    requirePermission(
        "departments",
        "departments",
        "DELETE"
    ),
    deleteDepartment
);

export default router;