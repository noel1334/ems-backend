import { Router } from "express";

import {
    createHoliday,
    getHolidays,
    getHoliday,
    updateHoliday,
    deleteHoliday,
} from "./holiday.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

router.get(
    "/",
    requirePermission(
        "holidays",
        "holiday",
        "READ"
    ),
    getHolidays
);

router.post(
    "/",
    requirePermission(
        "holidays",
        "holiday",
        "CREATE"
    ),
    createHoliday
);

router.get(
    "/:id",
    requirePermission(
        "holidays",
        "holiday",
        "READ"
    ),
    getHoliday
);

router.patch(
    "/:id",
    requirePermission(
        "holidays",
        "holiday",
        "UPDATE"
    ),
    updateHoliday
);

router.delete(
    "/:id",
    requirePermission(
        "holidays",
        "holiday",
        "DELETE"
    ),
    deleteHoliday
);

export default router;