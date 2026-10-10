import * as scheduleService from "./schedule.service.js";

import {
    createScheduleSchema,
    updateScheduleSchema,
    replaceScheduleDaysSchema,
    assignScheduleSchema,
} from "./schedule.validation.js";

import { z } from "zod";

const assignShiftSchema = z.object({
    shiftId: z.string().uuid(),

    effectiveFrom: z.coerce.date(),

    effectiveTo: z
        .coerce
        .date()
        .optional()
        .nullable(),

    isPrimary: z.boolean().default(true),

    isActive: z.boolean().default(true),
});

const getCompanyId = (req) => {
    if (!req.user?.companyId) {
        const error = new Error(
            "Authenticated company context is required"
        );

        error.statusCode = 403;

        throw error;
    }

    return req.user.companyId;
};

export const createSchedule = async (
    req,
    res
) => {
    const input =
        createScheduleSchema.parse(req.body);

    const schedule =
        await scheduleService.create(
            getCompanyId(req),
            input
        );

    return res.status(201).json({
        success: true,
        message:
            "Work schedule created successfully",
        data: schedule,
    });
};

export const getSchedules = async (
    req,
    res
) => {
    const result =
        await scheduleService.list(
            getCompanyId(req),
            req.query
        );

    return res.status(200).json({
        success: true,
        ...result,
    });
};

export const getSchedule = async (
    req,
    res
) => {
    const schedule =
        await scheduleService.getById(
            getCompanyId(req),
            req.params.id
        );

    return res.status(200).json({
        success: true,
        data: schedule,
    });
};

export const updateSchedule = async (
    req,
    res
) => {
    const input =
        updateScheduleSchema.parse(
            req.body
        );

    const schedule =
        await scheduleService.update(
            getCompanyId(req),
            req.params.id,
            input
        );

    return res.status(200).json({
        success: true,
        message:
            "Work schedule updated successfully",
        data: schedule,
    });
};

export const replaceDays = async (
    req,
    res
) => {
    const { days } =
        replaceScheduleDaysSchema.parse(
            req.body
        );

    const schedule =
        await scheduleService.replaceDays(
            getCompanyId(req),
            req.params.id,
            days
        );

    return res.status(200).json({
        success: true,
        message:
            "Schedule days updated successfully",
        data: schedule,
    });
};

export const deleteSchedule = async (
    req,
    res
) => {
    await scheduleService.remove(
        getCompanyId(req),
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message:
            "Work schedule deleted successfully",
    });
};

export const assignSchedule = async (
    req,
    res
) => {
    const input =
        assignScheduleSchema.parse(
            req.body
        );

    const assignment =
        await scheduleService.assignToEmployee(
            getCompanyId(req),
            req.params.id,
            input
        );

    return res.status(201).json({
        success: true,
        message:
            "Work schedule assigned successfully",
        data: assignment,
    });
};

export const getEmployeeSchedules = async (
    req,
    res
) => {
    const assignments =
        await scheduleService.getEmployeeSchedules(
            getCompanyId(req),
            req.params.id
        );

    return res.status(200).json({
        success: true,
        data: assignments,
    });
};

export const assignShift = async (
    req,
    res
) => {
    const input =
        assignShiftSchema.parse(
            req.body
        );

    const assignment =
        await scheduleService.assignShiftToEmployee(
            getCompanyId(req),
            req.params.id,
            input
        );

    return res.status(201).json({
        success: true,
        message:
            "Shift assigned to employee successfully",
        data: assignment,
    });
};

export const getEmployeeShifts = async (
    req,
    res
) => {
    const assignments =
        await scheduleService.getEmployeeShifts(
            getCompanyId(req),
            req.params.id
        );

    return res.status(200).json({
        success: true,
        data: assignments,
    });
};