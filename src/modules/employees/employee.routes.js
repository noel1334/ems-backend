import { Router } from "express";

import {
    createEmployee,
    listEmployees,
    getEmployee,
    updateEmployee,
    deleteEmployee
} from "./employee.controller.js";

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
        "employees",
        "employees",
        "READ"
    ),
    listEmployees
);

router.post(
    "/",
    requirePermission(
        "employees",
        "employees",
        "CREATE"
    ),
    createEmployee
);

router.get(
    "/:id",
    requirePermission(
        "employees",
        "employees",
        "READ"
    ),
    getEmployee
);

router.patch(
    "/:id",
    requirePermission(
        "employees",
        "employees",
        "UPDATE"
    ),
    updateEmployee
);

router.delete(
    "/:id",
    requirePermission(
        "employees",
        "employees",
        "DELETE"
    ),
    deleteEmployee
);

export default router;