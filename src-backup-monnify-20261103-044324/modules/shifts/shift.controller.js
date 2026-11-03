import * as shiftService from "./shift.service.js";
import {
    createShiftSchema,
    updateShiftSchema,
    createBreakSchema,
    updateBreakSchema,
} from "./shift.validation.js";

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

export const createShift = async (req, res) => {
    const input = createShiftSchema.parse(req.body);

    const shift = await shiftService.create(
        getCompanyId(req),
        input
    );

    return res.status(201).json({
        success: true,
        message: "Shift created successfully",
        data: shift,
    });
};

export const getShifts = async (req, res) => {
    const result = await shiftService.list(
        getCompanyId(req),
        req.query
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
};

export const getShift = async (req, res) => {
    const shift = await shiftService.getById(
        getCompanyId(req),
        req.params.id
    );

    return res.status(200).json({
        success: true,
        data: shift,
    });
};

export const updateShift = async (req, res) => {
    const input = updateShiftSchema.parse(
        req.body
    );

    const shift = await shiftService.update(
        getCompanyId(req),
        req.params.id,
        input
    );

    return res.status(200).json({
        success: true,
        message: "Shift updated successfully",
        data: shift,
    });
};

export const deleteShift = async (req, res) => {
    await shiftService.remove(
        getCompanyId(req),
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message: "Shift deleted successfully",
    });
};

export const addBreak = async (req, res) => {
    const input = createBreakSchema.parse(
        req.body
    );

    const breakRecord =
        await shiftService.addBreak(
            getCompanyId(req),
            req.params.id,
            input
        );

    return res.status(201).json({
        success: true,
        message: "Shift break created successfully",
        data: breakRecord,
    });
};

export const updateBreak = async (req, res) => {
    const input = updateBreakSchema.parse(
        req.body
    );

    const breakRecord =
        await shiftService.updateBreakById(
            getCompanyId(req),
            req.params.id,
            req.params.breakId,
            input
        );

    return res.status(200).json({
        success: true,
        message: "Shift break updated successfully",
        data: breakRecord,
    });
};

export const deleteBreak = async (req, res) => {
    await shiftService.removeBreak(
        getCompanyId(req),
        req.params.id,
        req.params.breakId
    );

    return res.status(200).json({
        success: true,
        message: "Shift break deleted successfully",
    });
};