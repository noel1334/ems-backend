import { Router } from "express";

import {
    createSchedule,
    getSchedules,
    getSchedule,
    updateSchedule,
    replaceDays,
    deleteSchedule,
    assignSchedule,
    getEmployeeSchedules,
    assignShift,
    getEmployeeShifts,
} from "./schedule.controller.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

/*
|--------------------------------------------------------------------------
| SCHEDULES
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    requirePermission(
        "schedules",
        "schedule",
        "READ"
    ),
    getSchedules
);

router.post(
    "/",
    requirePermission(
        "schedules",
        "schedule",
        "CREATE"
    ),
    createSchedule
);

router.get(
    "/:id",
    requirePermission(
        "schedules",
        "schedule",
        "READ"
    ),
    getSchedule
);

router.patch(
    "/:id",
    requirePermission(
        "schedules",
        "schedule",
        "UPDATE"
    ),
    updateSchedule
);

router.put(
    "/:id/days",
    requirePermission(
        "schedules",
        "schedule",
        "UPDATE"
    ),
    replaceDays
);

router.delete(
    "/:id",
    requirePermission(
        "schedules",
        "schedule",
        "DELETE"
    ),
    deleteSchedule
);

/*
|--------------------------------------------------------------------------
| EMPLOYEE SCHEDULES / SHIFTS
|--------------------------------------------------------------------------
*/

router.get(
    "/employees/:id",
    requirePermission(
        "schedules",
        "schedule",
        "READ"
    ),
    getEmployeeSchedules
);

router.post(
    "/employees/:id",
    requirePermission(
        "schedules",
        "schedule",
        "UPDATE"
    ),
    assignSchedule
);

router.get(
    "/employees/:id/shifts",
    requirePermission(
        "shifts",
        "shift",
        "READ"
    ),
    getEmployeeShifts
);

router.post(
    "/employees/:id/shifts",
    requirePermission(
        "shifts",
        "shift",
        "UPDATE"
    ),
    assignShift
);

export default router;