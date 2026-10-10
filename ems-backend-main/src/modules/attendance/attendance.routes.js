// src/modules/attendance/attendance.routes.js

import { Router } from "express";

import {
    checkInController,
    checkOutController,
    startBreakController,
    endBreakController,
    getAttendanceController,
    listAttendanceController,
    getEmployeeAttendanceController,
    correctAttendanceController,
    approveAttendanceController,
    generateAttendanceController,
    attendanceReportController,
} from "./attendance.controller.js";

import {
    checkInSchema,
    checkOutSchema,
    breakStartSchema,
    breakEndSchema,
    correctionSchema,
    approvalSchema,
} from "./attendance.validation.js";

import authMiddleware from "../../middleware/auth.middleware.js";
import permissionMiddleware from "../../middleware/permission.middleware.js";

import { validate } from "../../common/validators/zod.js";

const router = Router();

router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Employee self-service
|--------------------------------------------------------------------------
*/

router.post(
    "/check-in",
    validate(checkInSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "CREATE",
    ),
    checkInController,
);

router.post(
    "/check-out",
    validate(checkOutSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "UPDATE",
    ),
    checkOutController,
);

/*
|--------------------------------------------------------------------------
| Attendance records
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    permissionMiddleware(
        "attendance",
        "attendance",
        "READ",
    ),
    listAttendanceController,
);

router.get(
    "/report",
    permissionMiddleware(
        "attendance",
        "attendance",
        "READ",
    ),
    attendanceReportController,
);

router.get(
    "/:id",
    permissionMiddleware(
        "attendance",
        "attendance",
        "READ",
    ),
    getAttendanceController,
);

/*
|--------------------------------------------------------------------------
| Employee history
|--------------------------------------------------------------------------
*/

router.get(
    "/employee/:employeeId",
    permissionMiddleware(
        "attendance",
        "attendance",
        "READ",
    ),
    getEmployeeAttendanceController,
);

/*
|--------------------------------------------------------------------------
| Attendance calendar generation
|--------------------------------------------------------------------------
*/

router.post(
    "/employee/:employeeId/generate",
    permissionMiddleware(
        "attendance",
        "attendance",
        "MANAGE",
    ),
    generateAttendanceController,
);

/*
|--------------------------------------------------------------------------
| Break management
|--------------------------------------------------------------------------
*/

router.post(
    "/:id/break/start",
    validate(breakStartSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "UPDATE",
    ),
    startBreakController,
);

router.post(
    "/:id/break/end",
    validate(breakEndSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "UPDATE",
    ),
    endBreakController,
);

/*
|--------------------------------------------------------------------------
| HR/Admin correction
|--------------------------------------------------------------------------
*/

router.patch(
    "/:id/correct",
    validate(correctionSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "UPDATE",
    ),
    correctAttendanceController,
);

/*
|--------------------------------------------------------------------------
| Attendance approval / locking
|--------------------------------------------------------------------------
*/

router.patch(
    "/:id/approval",
    validate(approvalSchema),
    permissionMiddleware(
        "attendance",
        "attendance",
        "APPROVE",
    ),
    approveAttendanceController,
);

export default router;