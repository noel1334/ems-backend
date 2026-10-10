import {
    createHoliday,
    findHolidayById,
    findHolidayByDate,
    listHolidays,
    updateHoliday,
    deleteHoliday,
} from "./holiday.repository.js";

class ServiceError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = "ServiceError";
    }
}

const normalizeDate = (date) => {
    const normalized = new Date(date);

    normalized.setUTCHours(
        0,
        0,
        0,
        0
    );

    return normalized;
};

export const create = async (
    companyId,
    input
) => {
    const date = normalizeDate(input.date);

    const duplicate =
        await findHolidayByDate({
            companyId,
            date,
        });

    if (duplicate) {
        throw new ServiceError(
            "A holiday already exists for this date",
            409
        );
    }

    return createHoliday({
        companyId,
        name: input.name,
        description:
            input.description ?? null,
        date,
        holidayType:
            input.holidayType ?? "COMPANY",
        isRecurring:
            input.isRecurring ?? false,
        isActive:
            input.isActive ?? true,
    });
};

export const getById = async (
    companyId,
    holidayId
) => {
    const holiday =
        await findHolidayById(
            holidayId,
            companyId
        );

    if (!holiday) {
        throw new ServiceError(
            "Holiday not found",
            404
        );
    }

    return holiday;
};

export const list = async (
    companyId,
    query
) => {
    const page = Math.max(
        Number(query.page) || 1,
        1
    );

    const limit = Math.min(
        Math.max(Number(query.limit) || 20, 1),
        100
    );

    let year;

    if (query.year !== undefined) {
        year = Number(query.year);

        if (
            !Number.isInteger(year) ||
            year < 1900 ||
            year > 2200
        ) {
            throw new ServiceError(
                "Invalid year"
            );
        }
    }

    let isActive;

    if (query.isActive !== undefined) {
        isActive =
            query.isActive === true ||
            query.isActive === "true";
    }

    const allowedTypes = [
        "PUBLIC",
        "COMPANY",
        "OPTIONAL",
        "RELIGIOUS",
        "OTHER",
    ];

    let holidayType;

    if (query.holidayType) {
        if (
            !allowedTypes.includes(
                query.holidayType
            )
        ) {
            throw new ServiceError(
                "Invalid holiday type"
            );
        }

        holidayType = query.holidayType;
    }

    const result =
        await listHolidays({
            companyId,
            page,
            limit,
            search:
                query.search?.trim() || undefined,
            year,
            holidayType,
            isActive,
        });

    return {
        data: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(
                result.total / limit
            ),
        },
    };
};

export const update = async (
    companyId,
    holidayId,
    input
) => {
    const existing =
        await findHolidayById(
            holidayId,
            companyId
        );

    if (!existing) {
        throw new ServiceError(
            "Holiday not found",
            404
        );
    }

    const date =
        input.date !== undefined
            ? normalizeDate(input.date)
            : existing.date;

    if (
        input.date !== undefined &&
        date.getTime() !==
        new Date(
            existing.date
        ).getTime()
    ) {
        const duplicate =
            await findHolidayByDate({
                companyId,
                date,
                excludeId: holidayId,
            });

        if (duplicate) {
            throw new ServiceError(
                "A holiday already exists for this date",
                409
            );
        }
    }

    const data = {
        ...(input.name !== undefined
            ? {
                name: input.name,
            }
            : {}),

        ...(input.description !== undefined
            ? {
                description: input.description,
            }
            : {}),

        ...(input.date !== undefined
            ? {
                date,
            }
            : {}),

        ...(input.holidayType !== undefined
            ? {
                holidayType:
                    input.holidayType,
            }
            : {}),

        ...(input.isRecurring !== undefined
            ? {
                isRecurring:
                    input.isRecurring,
            }
            : {}),

        ...(input.isActive !== undefined
            ? {
                isActive: input.isActive,
            }
            : {}),
    };

    await updateHoliday(
        holidayId,
        companyId,
        data
    );

    return findHolidayById(
        holidayId,
        companyId
    );
};

export const remove = async (
    companyId,
    holidayId
) => {
    const existing =
        await findHolidayById(
            holidayId,
            companyId
        );

    if (!existing) {
        throw new ServiceError(
            "Holiday not found",
            404
        );
    }

    await deleteHoliday(
        holidayId,
        companyId
    );
};
