import { Router } from "express";

import {
    createDesignation,
    getDesignation,
    listDesignations,
    updateDesignation,
    deleteDesignation
} from "./designation.controller.js";

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
        "designations",
        "designations",
        "READ"
    ),
    listDesignations
);

router.post(
    "/",
    requirePermission(
        "designations",
        "designations",
        "CREATE"
    ),
    createDesignation
);

router.get(
    "/:id",
    requirePermission(
        "designations",
        "designations",
        "READ"
    ),
    getDesignation
);

router.patch(
    "/:id",
    requirePermission(
        "designations",
        "designations",
        "UPDATE"
    ),
    updateDesignation
);

router.delete(
    "/:id",
    requirePermission(
        "designations",
        "designations",
        "DELETE"
    ),
    deleteDesignation
);

export default router;