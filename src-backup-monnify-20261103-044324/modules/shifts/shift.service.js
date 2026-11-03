import prisma from "../../config/database.js";
import {
    createShift,
    findShiftById,
    findShiftByName,
    findShiftByCode,
    listShifts,
    updateShift,
    deleteShift,
    countShiftAssignments,
    createBreak,
    findBreakById,
    updateBreak,
    deleteBreak,
    setShiftHasBreak,
} from "./shift.repository.js";

class ServiceError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = "ServiceError";
    }
}

const validateTimeRange = (
    startTime,
    endTime,
    isOvernight,
    messagePrefix = "Shift"
) => {
    if (isOvernight) {
        if (startTime === endTime) {
            throw new ServiceError(
                `${messagePrefix} start and end time cannot be the same`
            );
        }

        return;
    }

    if (startTime >= endTime) {
        throw new ServiceError(
            `${messagePrefix} end time must be later than start time`
        );
    }
};

export const create = async (companyId, input) => {
    const existingName = await findShiftByName(input.name, companyId);

    if (existingName) {
        throw new ServiceError(
            "A shift with this name already exists",
            409
        );
    }

    const existingCode = await findShiftByCode(input.code, companyId);

    if (existingCode) {
        throw new ServiceError(
            "A shift with this code already exists",
            409
        );
    }

    validateTimeRange(
        input.startTime,
        input.endTime,
        input.isOvernight
    );

    return createShift({
        companyId,
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        isOvernight: input.isOvernight ?? false,
        hasBreak: input.hasBreak ?? false,
        isActive: input.isActive ?? true,
    });
};

export const getById = async (companyId, shiftId) => {
    const shift = await findShiftById(shiftId, companyId);

    if (!shift) {
        throw new ServiceError("Shift not found", 404);
    }

    return shift;
};

export const list = async (companyId, query) => {
    const page = Math.max(Number(query.page) || 1, 1);

    const limit = Math.min(
        Math.max(Number(query.limit) || 20, 1),
        100
    );

    let isActive;

    if (query.isActive !== undefined) {
        isActive =
            query.isActive === true ||
            query.isActive === "true";
    }

    const result = await listShifts({
        companyId,
        page,
        limit,
        search: query.search?.trim() || undefined,
        isActive,
    });

    return {
        data: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
        },
    };
};

export const update = async (
    companyId,
    shiftId,
    input
) => {
    const existing = await findShiftById(
        shiftId,
        companyId
    );

    if (!existing) {
        throw new ServiceError("Shift not found", 404);
    }

    if (input.name) {
        const duplicate = await findShiftByName(
            input.name,
            companyId,
            shiftId
        );

        if (duplicate) {
            throw new ServiceError(
                "A shift with this name already exists",
                409
            );
        }
    }

    if (input.code) {
        const duplicate = await findShiftByCode(
            input.code,
            companyId,
            shiftId
        );

        if (duplicate) {
            throw new ServiceError(
                "A shift with this code already exists",
                409
            );
        }
    }

    const startTime =
        input.startTime ?? existing.startTime;

    const endTime =
        input.endTime ?? existing.endTime;

    const isOvernight =
        input.isOvernight ?? existing.isOvernight;

    validateTimeRange(
        startTime,
        endTime,
        isOvernight
    );

    await updateShift(
        shiftId,
        companyId,
        input
    );

    return findShiftById(
        shiftId,
        companyId
    );
};

export const remove = async (
    companyId,
    shiftId
) => {
    const existing = await findShiftById(
        shiftId,
        companyId
    );

    if (!existing) {
        throw new ServiceError("Shift not found", 404);
    }

    const assignmentCount =
        await countShiftAssignments(
            shiftId,
            companyId
        );

    if (assignmentCount > 0) {
        throw new ServiceError(
            "This shift cannot be deleted because it is assigned to employees. Deactivate it instead.",
            409
        );
    }

    await deleteShift(
        shiftId,
        companyId
    );

    return null;
};

export const addBreak = async (
    companyId,
    shiftId,
    input
) => {
    const shift = await findShiftById(
        shiftId,
        companyId
    );

    if (!shift) {
        throw new ServiceError("Shift not found", 404);
    }

    validateTimeRange(
        input.startTime,
        input.endTime,
        false,
        "Break"
    );

    const breakRecord = await prisma.$transaction(
        async (tx) => {
            const created = await createBreak(
                {
                    shiftId,
                    name: input.name,
                    startTime: input.startTime,
                    endTime: input.endTime,
                    durationMinutes:
                        input.durationMinutes ?? null,
                    isPaid: input.isPaid ?? false,
                    isActive: input.isActive ?? true,
                },
                tx
            );

            await setShiftHasBreak(
                shiftId,
                true,
                tx
            );

            return created;
        }
    );

    return breakRecord;
};

export const updateBreakById = async (
    companyId,
    shiftId,
    breakId,
    input
) => {
    const shift = await findShiftById(
        shiftId,
        companyId
    );

    if (!shift) {
        throw new ServiceError("Shift not found", 404);
    }

    const breakRecord = await findBreakById(
        breakId,
        shiftId
    );

    if (!breakRecord) {
        throw new ServiceError(
            "Shift break not found",
            404
        );
    }

    const startTime =
        input.startTime ?? breakRecord.startTime;

    const endTime =
        input.endTime ?? breakRecord.endTime;

    validateTimeRange(
        startTime,
        endTime,
        false,
        "Break"
    );

    await updateBreak(
        breakId,
        shiftId,
        input
    );

    return findBreakById(
        breakId,
        shiftId
    );
};

export const removeBreak = async (
    companyId,
    shiftId,
    breakId
) => {
    const shift = await findShiftById(
        shiftId,
        companyId
    );

    if (!shift) {
        throw new ServiceError("Shift not found", 404);
    }

    const breakRecord = await findBreakById(
        breakId,
        shiftId
    );

    if (!breakRecord) {
        throw new ServiceError(
            "Shift break not found",
            404
        );
    }

    await prisma.$transaction(
        async (tx) => {
            await deleteBreak(
                breakId,
                shiftId,
                tx
            );

            const remaining =
                await tx.shiftBreak.count({
                    where: {
                        shiftId,
                        isActive: true,
                    },
                });

            await setShiftHasBreak(
                shiftId,
                remaining > 0,
                tx
            );
        }
    );
};