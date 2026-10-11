import * as holidayService from "./holiday.service.js";

import {
    createHolidaySchema,
    updateHolidaySchema,
} from "./holiday.validation.js";

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

export const createHoliday = async (
    req,
    res
) => {
    const input =
        createHolidaySchema.parse(
            req.body
        );

    const holiday =
        await holidayService.create(
            getCompanyId(req),
            input
        );

    return res.status(201).json({
        success: true,
        message:
            "Holiday created successfully",
        data: holiday,
    });
};

export const getHolidays = async (
    req,
    res
) => {
    const result =
        await holidayService.list(
            getCompanyId(req),
            req.query
        );

    return res.status(200).json({
        success: true,
        ...result,
    });
};

export const getHoliday = async (
    req,
    res
) => {
    const holiday =
        await holidayService.getById(
            getCompanyId(req),
            req.params.id
        );

    return res.status(200).json({
        success: true,
        data: holiday,
    });
};

export const updateHoliday = async (
    req,
    res
) => {
    const input =
        updateHolidaySchema.parse(
            req.body
        );

    const holiday =
        await holidayService.update(
            getCompanyId(req),
            req.params.id,
            input
        );

    return res.status(200).json({
        success: true,
        message:
            "Holiday updated successfully",
        data: holiday,
    });
};

export const deleteHoliday = async (
    req,
    res
) => {
    await holidayService.remove(
        getCompanyId(req),
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message:
            "Holiday deleted successfully",
    });
};