import prisma from "../../config/database.js";

export const createHoliday = async (
    data,
    tx = prisma
) => {
    return tx.holiday.create({
        data,
    });
};

export const findHolidayById = async (
    id,
    companyId,
    tx = prisma
) => {
    return tx.holiday.findFirst({
        where: {
            id,
            companyId,
        },
    });
};

export const findHolidayByDate = async ({
    companyId,
    date,
    excludeId,
    tx = prisma,
}) => {
    return tx.holiday.findFirst({
        where: {
            companyId,

            date,

            ...(excludeId
                ? {
                    NOT: {
                        id: excludeId,
                    },
                }
                : {}),
        },
    });
};

export const listHolidays = async ({
    companyId,
    page,
    limit,
    search,
    year,
    holidayType,
    isActive,
}) => {
    const where = {
        companyId,

        ...(search
            ? {
                name: {
                    contains: search,
                    mode: "insensitive",
                },
            }
            : {}),

        ...(holidayType
            ? {
                holidayType,
            }
            : {}),

        ...(typeof isActive === "boolean"
            ? {
                isActive,
            }
            : {}),

        ...(year
            ? {
                date: {
                    gte: new Date(
                        `${year}-01-01T00:00:00.000Z`
                    ),
                    lt: new Date(
                        `${Number(year) + 1}-01-01T00:00:00.000Z`
                    ),
                },
            }
            : {}),
    };

    const skip = (page - 1) * limit;

    const [items, total] =
        await prisma.$transaction([
            prisma.holiday.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    date: "asc",
                },
            }),

            prisma.holiday.count({
                where,
            }),
        ]);

    return {
        items,
        total,
    };
};

export const updateHoliday = async (
    id,
    companyId,
    data,
    tx = prisma
) => {
    return tx.holiday.updateMany({
        where: {
            id,
            companyId,
        },
        data,
    });
};

export const deleteHoliday = async (
    id,
    companyId,
    tx = prisma
) => {
    return tx.holiday.deleteMany({
        where: {
            id,
            companyId,
        },
    });
};