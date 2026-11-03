import prisma from "../../config/database.js";

export const createShift = async (data, tx = prisma) => {
    return tx.shift.create({
        data,
        include: {
            breaks: true,
        },
    });
};

export const findShiftById = async (id, companyId, tx = prisma) => {
    return tx.shift.findFirst({
        where: {
            id,
            companyId,
        },
        include: {
            breaks: {
                orderBy: {
                    startTime: "asc",
                },
            },
        },
    });
};

export const findShiftByName = async (
    name,
    companyId,
    excludeId = null,
    tx = prisma
) => {
    return tx.shift.findFirst({
        where: {
            companyId,
            name: {
                equals: name,
                mode: "insensitive",
            },
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
    });
};

export const findShiftByCode = async (
    code,
    companyId,
    excludeId = null,
    tx = prisma
) => {
    return tx.shift.findFirst({
        where: {
            companyId,
            code: {
                equals: code,
                mode: "insensitive",
            },
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
    });
};

export const listShifts = async ({
    companyId,
    page,
    limit,
    search,
    isActive,
}) => {
    const where = {
        companyId,

        ...(typeof isActive === "boolean"
            ? {
                isActive,
            }
            : {}),

        ...(search
            ? {
                OR: [
                    {
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        code: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {}),
    };

    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
        prisma.shift.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
            include: {
                breaks: {
                    orderBy: {
                        startTime: "asc",
                    },
                },
            },
        }),

        prisma.shift.count({
            where,
        }),
    ]);

    return {
        items,
        total,
    };
};

export const updateShift = async (id, companyId, data, tx = prisma) => {
    return tx.shift.updateMany({
        where: {
            id,
            companyId,
        },
        data,
    });
};

export const deleteShift = async (id, companyId, tx = prisma) => {
    return tx.shift.deleteMany({
        where: {
            id,
            companyId,
        },
    });
};

export const countShiftAssignments = async (
    shiftId,
    companyId,
    tx = prisma
) => {
    return tx.employeeShiftAssignment.count({
        where: {
            shiftId,
            employee: {
                companyId,
            },
            isActive: true,
        },
    });
};

export const createBreak = async (data, tx = prisma) => {
    return tx.shiftBreak.create({
        data,
    });
};

export const findBreakById = async (breakId, shiftId, tx = prisma) => {
    return tx.shiftBreak.findFirst({
        where: {
            id: breakId,
            shiftId,
        },
    });
};

export const updateBreak = async (breakId, shiftId, data, tx = prisma) => {
    return tx.shiftBreak.updateMany({
        where: {
            id: breakId,
            shiftId,
        },
        data,
    });
};

export const deleteBreak = async (breakId, shiftId, tx = prisma) => {
    return tx.shiftBreak.deleteMany({
        where: {
            id: breakId,
            shiftId,
        },
    });
};

export const setShiftHasBreak = async (shiftId, hasBreak, tx = prisma) => {
    return tx.shift.update({
        where: {
            id: shiftId,
        },
        data: {
            hasBreak,
        },
    });
};