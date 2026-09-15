// src/modules/attendance/attendance.controller.js

import asyncHandler from "../../common/utils/asyncHandler.js";

import {
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    getAttendance,
    getEmployeeAttendance,
    listAttendance,
    correctAttendance,
    approveAttendance,
    generateEmployeeAttendance,
    getAttendanceReport,
} from "./attendance.service.js";

export const checkInController =
    asyncHandler(async (req, res) => {
        const employeeId =
            req.body.employeeId ??
            req.user.employeeId;

        const attendance = await checkIn({
            companyId: req.user.companyId,
            employeeId,

            occurredAt:
                req.body.occurredAt
                    ? new Date(
                        req.body.occurredAt,
                    )
                    : new Date(),

            source: req.body.source,
            deviceId: req.body.deviceId,

            latitude:
                req.body.latitude,

            longitude:
                req.body.longitude,

            notes: req.body.notes,

            ipAddress:
                req.ip,

            userAgent:
                req.get("user-agent"),
        });

        return res.status(200).json({
            success: true,
            message: "Attendance check-in successful",
            data: attendance,
        });
    });

export const checkOutController =
    asyncHandler(async (req, res) => {
        const employeeId =
            req.body.employeeId ??
            req.user.employeeId;

        const attendance =
            await checkOut({
                companyId: req.user.companyId,
                employeeId,

                occurredAt:
                    req.body.occurredAt
                        ? new Date(
                            req.body.occurredAt,
                        )
                        : new Date(),

                source: req.body.source,
                deviceId: req.body.deviceId,

                latitude:
                    req.body.latitude,

                longitude:
                    req.body.longitude,

                notes: req.body.notes,

                ipAddress:
                    req.ip,

                userAgent:
                    req.get("user-agent"),
            });

        return res.status(200).json({
            success: true,
            message: "Attendance check-out successful",
            data: attendance,
        });
    });

export const startBreakController =
    asyncHandler(async (req, res) => {
        const result =
            await startBreak({
                companyId:
                    req.user.companyId,

                attendanceId:
                    req.params.id,

                breakName:
                    req.body.breakName,

                occurredAt:
                    req.body.occurredAt
                        ? new Date(
                            req.body.occurredAt,
                        )
                        : new Date(),

                source:
                    req.body.source,
            });

        return res.status(200).json({
            success: true,
            message: "Break started",
            data: result,
        });
    });

export const endBreakController =
    asyncHandler(async (req, res) => {
        const result =
            await endBreak({
                companyId:
                    req.user.companyId,

                attendanceId:
                    req.params.id,

                occurredAt:
                    req.body.occurredAt
                        ? new Date(
                            req.body.occurredAt,
                        )
                        : new Date(),

                source:
                    req.body.source,
            });

        return res.status(200).json({
            success: true,
            message: "Break ended",
            data: result,
        });
    });

export const getAttendanceController =
    asyncHandler(async (req, res) => {
        const result =
            await getAttendance({
                companyId:
                    req.user.companyId,

                id: req.params.id,
            });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

export const listAttendanceController =
    asyncHandler(async (req, res) => {
        const result =
            await listAttendance({
                companyId:
                    req.user.companyId,

                ...req.query,

                page: Number(
                    req.query.page ?? 1,
                ),

                limit: Number(
                    req.query.limit ?? 20,
                ),

                from: req.query.from
                    ? new Date(
                        req.query.from,
                    )
                    : undefined,

                to: req.query.to
                    ? new Date(
                        req.query.to,
                    )
                    : undefined,
            });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

export const getEmployeeAttendanceController =
    asyncHandler(async (req, res) => {
        const from = req.query.from
            ? new Date(req.query.from)
            : new Date();

        const to = req.query.to
            ? new Date(req.query.to)
            : new Date();

        const result =
            await getEmployeeAttendance({
                companyId:
                    req.user.companyId,

                employeeId:
                    req.params.employeeId,

                from,
                to,
            });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });

export const correctAttendanceController =
    asyncHandler(async (req, res) => {
        const result =
            await correctAttendance({
                companyId:
                    req.user.companyId,

                id: req.params.id,

                data: req.body,

                userId:
                    req.user.id,
            });

        return res.status(200).json({
            success: true,
            message:
                "Attendance corrected successfully",
            data: result,
        });
    });

export const approveAttendanceController =
    asyncHandler(async (req, res) => {
        const result =
            await approveAttendance({
                companyId:
                    req.user.companyId,

                id: req.params.id,

                approved:
                    req.body.approved,

                notes:
                    req.body.notes,
            });

        return res.status(200).json({
            success: true,
            message: req.body.approved
                ? "Attendance approved and locked"
                : "Attendance rejected",

            data: result,
        });
    });

export const generateAttendanceController =
    asyncHandler(async (req, res) => {
        const result =
            await generateEmployeeAttendance({
                companyId:
                    req.user.companyId,

                employeeId:
                    req.params.employeeId,

                from: new Date(
                    req.query.from,
                ),

                to: new Date(
                    req.query.to,
                ),
            });

        return res.status(200).json({
            success: true,
            message:
                "Attendance calendar generated",
            data: result,
        });
    });

export const attendanceReportController =
    asyncHandler(async (req, res) => {
        const result =
            await getAttendanceReport({
                companyId:
                    req.user.companyId,

                from: new Date(
                    req.query.from,
                ),

                to: new Date(
                    req.query.to,
                ),

                employeeId:
                    req.query.employeeId,

                departmentId:
                    req.query.departmentId,

                status:
                    req.query.status,
            });

        return res.status(200).json({
            success: true,
            data: result,
        });
    });