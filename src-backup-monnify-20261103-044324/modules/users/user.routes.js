import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
    assignRolesToUser,
    createUser,
    deleteUser,
    getUser,
    listUsers,
    removeRoleFromUser,
    updateUser
} from "./user.controller.js";

const router = Router();

router.use(
    authMiddleware,
    tenantMiddleware
);

router.get(
    "/",
    requirePermission(
        "users",
        "users",
        "READ"
    ),
    asyncHandler(listUsers)
);

router.post(
    "/",
    requirePermission(
        "users",
        "users",
        "CREATE"
    ),
    asyncHandler(createUser)
);

router.get(
    "/:id",
    requirePermission(
        "users",
        "users",
        "READ"
    ),
    asyncHandler(getUser)
);

router.patch(
    "/:id",
    requirePermission(
        "users",
        "users",
        "UPDATE"
    ),
    asyncHandler(updateUser)
);

router.put(
    "/:id/roles",
    requirePermission(
        "rbac",
        "user-roles",
        "MANAGE"
    ),
    asyncHandler(assignRolesToUser)
);

router.delete(
    "/:id/roles/:roleId",
    requirePermission(
        "rbac",
        "user-roles",
        "MANAGE"
    ),
    asyncHandler(removeRoleFromUser)
);

router.delete(
    "/:id",
    requirePermission(
        "users",
        "users",
        "DELETE"
    ),
    asyncHandler(deleteUser)
);

export default router;