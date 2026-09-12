import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
    activateRole,
    createRole,
    deactivateRole,
    getRole,
    getRoleUsers,
    listPermissions,
    listRoles,
    updateRole
} from "./rbac.controller.js";

const router = Router();

router.use(
    authMiddleware,
    tenantMiddleware
);

router.get(
    "/roles",
    requirePermission(
        "rbac",
        "roles",
        "READ"
    ),
    asyncHandler(listRoles)
);

router.post(
    "/roles",
    requirePermission(
        "rbac",
        "roles",
        "CREATE"
    ),
    asyncHandler(createRole)
);

router.get(
    "/roles/:id",
    requirePermission(
        "rbac",
        "roles",
        "READ"
    ),
    asyncHandler(getRole)
);

router.patch(
    "/roles/:id",
    requirePermission(
        "rbac",
        "roles",
        "UPDATE"
    ),
    asyncHandler(updateRole)
);

router.post(
    "/roles/:id/activate",
    requirePermission(
        "rbac",
        "roles",
        "MANAGE"
    ),
    asyncHandler(activateRole)
);

router.post(
    "/roles/:id/deactivate",
    requirePermission(
        "rbac",
        "roles",
        "MANAGE"
    ),
    asyncHandler(deactivateRole)
);

router.get(
    "/roles/:id/users",
    requirePermission(
        "rbac",
        "roles",
        "READ"
    ),
    asyncHandler(getRoleUsers)
);

router.get(
    "/permissions",
    requirePermission(
        "rbac",
        "permissions",
        "READ"
    ),
    asyncHandler(listPermissions)
);

export default router;