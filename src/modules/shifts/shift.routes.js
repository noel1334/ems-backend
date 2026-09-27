import { Router } from "express";
import {
    createShift,
    getShifts,
    getShift,
    updateShift,
    deleteShift,
    addBreak,
    updateBreak,
    deleteBreak,
} from "./shift.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

router.get(
    "/",
    requirePermission("shifts", "shift", "READ"),
    getShifts
);

router.post(
    "/",
    requirePermission("shifts", "shift", "CREATE"),
    createShift
);

router.get(
    "/:id",
    requirePermission("shifts", "shift", "READ"),
    getShift
);

router.patch(
    "/:id",
    requirePermission("shifts", "shift", "UPDATE"),
    updateShift
);

router.delete(
    "/:id",
    requirePermission("shifts", "shift", "DELETE"),
    deleteShift
);

router.post(
    "/:id/breaks",
    requirePermission("shifts", "shift", "UPDATE"),
    addBreak
);

router.patch(
    "/:id/breaks/:breakId",
    requirePermission("shifts", "shift", "UPDATE"),
    updateBreak
);

router.delete(
    "/:id/breaks/:breakId",
    requirePermission("shifts", "shift", "UPDATE"),
    deleteBreak
);

export default router;