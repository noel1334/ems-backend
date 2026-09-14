// src/modules/attendance/attendance.service.js

import {
    addDays,
    differenceInMinutes,
    endOfDay,
    format,
    isAfter,
    isBefore,
    isEqual,
    startOfDay,
} from "date-fns";

import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";

import {
    findEmployeeById,
    findAttendanceByEmployeeAndDate,
    findAttendanceById,
    createAttendance,
    updateAttendance,
    createAttendanceEvent,
    createAttendanceBreak,
    updateAttendanceBreak,
    findOpenBreak,
    listAttendances,
    findAttendanceForEmployeeRange,
    findAttendanceRange,
} from "./attendance.repository.js";

const DEFAULT_GRACE_MINUTES = 0;

const DAY_MAP = {
    SUNDAY: "SUNDAY",
    MONDAY: "MONDAY",
    TUESDAY: "TUESDAY",
    WEDNESDAY: "WEDNESDAY",
    THURSDAY: "THURSDAY",
    FRIDAY: "FRIDAY",
    SATURDAY: "SATURDAY",
};

const getDayName = (date) =>
    format(date, "EEEE").toUpperCase();

const parseTime = (date, time) => {
    if (!time) {
        return null;
    }

    const [hours, minutes] = String(time)
        .split(":")
        .map(Number);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        throw new AppError(
            `Invalid shift time: ${time}`,
            500,
        );
    }

    const result = new Date(date);

    result.setHours(hours, minutes, 0, 0);

    return result;
};

const getEffectiveScheduleAssignment = async (
    employeeId,
    attendanceDate,
    tx = prisma,
) => {
    return tx.employeeScheduleAssignment.findFirst({
        where: {
            employeeId,
            isActive: true,

            effectiveFrom: {
                lte: endOfDay(attendanceDate),
            },

            OR: [
                {
                    effectiveTo: null,
                },
                {
                    effectiveTo: {
                        gte: startOfDay(attendanceDate),
                    },
                },
            ],
        },

        include: {
            schedule: {
                include: {
                    days: true,
                },
            },
        },

        orderBy: {
            effectiveFrom: "desc",
        },
    });
};

const findScheduleDay = (
    assignment,
    attendanceDate,
) => {
    if (!assignment?.schedule?.days) {
        return null;
    }

    const dayName = getDayName(attendanceDate);

    return (
        assignment.schedule.days.find(
            (day) => String(day.dayOfWeek).toUpperCase() === dayName,
        ) ?? null
    );
};

const isHoliday = async (
    companyId,
    attendanceDate,
    tx = prisma,
) => {
    const exactHoliday = await tx.holiday.findFirst({
        where: {
            companyId,
            isActive: true,
            date: {
                gte: startOfDay(attendanceDate),
                lte: endOfDay(attendanceDate),
            },
        },
    });

    if (exactHoliday) {
        return exactHoliday;
    }

    const recurringHolidays = await tx.holiday.findMany({
        where: {
            companyId,
            isActive: true,
            isRecurring: true,
        },
    });

    const month = attendanceDate.getMonth() + 1;
    const day = attendanceDate.getDate();

    return (
        recurringHolidays.find((holiday) => {
            const holidayDate = new Date(holiday.date);

            return (
                holidayDate.getMonth() + 1 === month &&
                holidayDate.getDate() === day
            );
        }) ?? null
    );
};

const buildShiftWindow = (
    attendanceDate,
    scheduleDay,
) => {
    if (!scheduleDay?.shift) {
        return null;
    }

    const shift = scheduleDay.shift;

    const startTime =
        scheduleDay.startTime ?? shift.startTime;

    const endTime =
        scheduleDay.endTime ?? shift.endTime;

    if (!startTime || !endTime) {
        return null;
    }

    const scheduledStartAt = parseTime(
        attendanceDate,
        startTime,
    );

    let scheduledEndAt = parseTime(
        attendanceDate,
        endTime,
    );

    if (
        shift.isOvernight ||
        scheduledEndAt <= scheduledStartAt
    ) {
        scheduledEndAt = addDays(
            scheduledEndAt,
            1,
        );
    }

    return {
        shift,
        scheduledStartAt,
        scheduledEndAt,
    };
};

const calculateLateMinutes = (
    checkInAt,
    scheduledStartAt,
    graceMinutes = DEFAULT_GRACE_MINUTES,
) => {
    if (!checkInAt || !scheduledStartAt) {
        return 0;
    }

    const effectiveStart = new Date(
        scheduledStartAt,
    );

    effectiveStart.setMinutes(
        effectiveStart.getMinutes() + graceMinutes,
    );

    if (
        isBefore(checkInAt, effectiveStart) ||
        isEqual(checkInAt, effectiveStart)
    ) {
        return 0;
    }

    return Math.max(
        0,
        differenceInMinutes(
            checkInAt,
            effectiveStart,
        ),
    );
};

const calculateEarlyDepartureMinutes = (
    checkOutAt,
    scheduledEndAt,
    allowedEarlyMinutes = 0,
) => {
    if (!checkOutAt || !scheduledEndAt) {
        return 0;
    }

    const earliestAllowedEnd = new Date(
        scheduledEndAt,
    );

    earliestAllowedEnd.setMinutes(
        earliestAllowedEnd.getMinutes() -
        allowedEarlyMinutes,
    );

    if (
        isAfter(checkOutAt, earliestAllowedEnd) ||
        isEqual(checkOutAt, earliestAllowedEnd)
    ) {
        return 0;
    }

    return Math.max(
        0,
        differenceInMinutes(
            earliestAllowedEnd,
            checkOutAt,
        ),
    );
};

const calculateBreakMinutes = (breaks = []) =>
    breaks.reduce((total, item) => {
        if (!item.breakEndAt) {
            return total;
        }

        return (
            total +
            Math.max(
                0,
                differenceInMinutes(
                    new Date(item.breakEndAt),
                    new Date(item.breakStartAt),
                ),
            )
        );
    }, 0);

const calculateWorkedMinutes = (
    checkInAt,
    checkOutAt,
    breakMinutes,
) => {
    if (!checkInAt || !checkOutAt) {
        return 0;
    }

    const grossMinutes = differenceInMinutes(
        new Date(checkOutAt),
        new Date(checkInAt),
    );

    return Math.max(
        0,
        grossMinutes - breakMinutes,
    );
};

const determineStatus = ({
    checkInAt,
    checkOutAt,
    lateMinutes,
    workedMinutes,
    scheduledMinutes,
}) => {
    if (!checkInAt) {
        return "ABSENT";
    }

    if (!checkOutAt) {
        return "INCOMPLETE";
    }

    if (
        scheduledMinutes &&
        workedMinutes < Math.floor(scheduledMinutes / 2)
    ) {
        return "HALF_DAY";
    }

    if (lateMinutes > 0) {
        return "LATE";
    }

    return "PRESENT";
};

const getAttendanceContext = async (
    companyId,
    employeeId,
    attendanceDate,
    tx = prisma,
) => {
    const employee = await findEmployeeById(
        employeeId,
        companyId,
        tx,
    );

    if (!employee) {
        throw new AppError(
            "Employee not found",
            404,
        );
    }

    const holiday = await isHoliday(
        companyId,
        attendanceDate,
        tx,
    );

    if (holiday) {
        return {
            employee,
            holiday,
            assignment: null,
            scheduleDay: null,
            shiftWindow: null,
        };
    }

    const assignment =
        await getEffectiveScheduleAssignment(
            employeeId,
            attendanceDate,
            tx,
        );

    if (!assignment) {
        return {
            employee,
            holiday: null,
            assignment: null,
            scheduleDay: null,
            shiftWindow: null,
        };
    }

    const scheduleDay = findScheduleDay(
        assignment,
        attendanceDate,
    );

    if (!scheduleDay) {
        return {
            employee,
            holiday: null,
            assignment,
            scheduleDay: null,
            shiftWindow: null,
        };
    }

    const shiftWindow = buildShiftWindow(
        attendanceDate,
        scheduleDay,
    );

    return {
        employee,
        holiday: null,
        assignment,
        scheduleDay,
        shiftWindow,
    };
};

const resolveAttendanceDate = (
    occurredAt,
    scheduledStartAt,
) => {
    if (!scheduledStartAt) {
        return startOfDay(occurredAt);
    }

    /*
       * For overnight shifts, a checkout may occur
          * after midnight. The attendance record remains
             * attached to the shift's original work date.
                */
    const difference = differenceInMinutes(
        occurredAt,
        scheduledStartAt,
    );

    if (difference >= 0) {
        return startOfDay(scheduledStartAt);
    }

    return startOfDay(occurredAt);
};

const recalculateAttendance = async (
    attendanceId,
    tx = prisma,
) => {
    const attendance =
        await tx.attendance.findUnique({
            where: {
                id: attendanceId,
            },
            include: {
                breaks: true,
            },
        });

    if (!attendance) {
        throw new AppError(
            "Attendance record not found",
            404,
        );
    }

    const breakMinutes =
        calculateBreakMinutes(
            attendance.breaks,
        );

    const workedMinutes =
        calculateWorkedMinutes(
            attendance.checkInAt,
            attendance.checkOutAt,
            breakMinutes,
        );

    const lateMinutes =
        attendance.scheduledStartAt
            ? calculateLateMinutes(
                attendance.checkInAt,
                attendance.scheduledStartAt,
                0,
            )
            : 0;

    const earlyDepartureMinutes =
        attendance.scheduledEndAt
            ? calculateEarlyDepartureMinutes(
                attendance.checkOutAt,
                attendance.scheduledEndAt,
                0,
            )
            : 0;

    const status = determineStatus({
        checkInAt: attendance.checkInAt,
        checkOutAt: attendance.checkOutAt,
        lateMinutes,
        workedMinutes,
        scheduledMinutes:
            attendance.scheduledMinutes,
    });

    return tx.attendance.update({
        where: {
            id: attendanceId,
        },

        data: {
            breakMinutes,
            workedMinutes,
            lateMinutes,
            earlyDepartureMinutes,
            status:
                attendance.status === "CORRECTED"
                    ? "CORRECTED"
                    : status,
        },

        include: {
            events: {
                orderBy: {
                    occurredAt: "asc",
                },
            },
            breaks: {
                orderBy: {
                    breakStartAt: "asc",
                },
            },
        },
    });
};

export const checkIn = async ({
    companyId,
    employeeId,
    occurredAt = new Date(),
    source = "WEB",
    deviceId,
    latitude,
    longitude,
    notes,
    ipAddress,
    userAgent,
}) => {
    return prisma.$transaction(async (tx) => {
        const context =
            await getAttendanceContext(
                companyId,
                employeeId,
                occurredAt,
                tx,
            );

        const {
            holiday,
            scheduleDay,
            shiftWindow,
        } = context;

        let attendanceDate;

        if (shiftWindow) {
            attendanceDate = startOfDay(
                shiftWindow.scheduledStartAt,
            );
        } else {
            attendanceDate = startOfDay(
                occurredAt,
            );
        }

        let attendance =
            await findAttendanceByEmployeeAndDate(
                employeeId,
                attendanceDate,
                tx,
            );

        if (attendance?.isLocked) {
            throw new AppError(
                "Attendance record is locked",
                409,
            );
        }

        if (attendance?.checkInAt) {
            throw new AppError(
                "Employee has already checked in for this attendance date",
                409,
            );
        }

        const scheduledStartAt =
            shiftWindow?.scheduledStartAt ?? null;

        const scheduledEndAt =
            shiftWindow?.scheduledEndAt ?? null;

        const scheduledMinutes =
            scheduledStartAt && scheduledEndAt
                ? Math.max(
                    0,
                    differenceInMinutes(
                        scheduledEndAt,
                        scheduledStartAt,
                    ),
                )
                : null;

        if (!attendance) {
            attendance = await createAttendance(
                {
                    companyId,
                    employeeId,
                    attendanceDate,

                    shiftId:
                        shiftWindow?.shift?.id ?? null,

                    scheduleId:
                        context.assignment?.scheduleId ??
                        null,

                    scheduledStartAt,
                    scheduledEndAt,
                    scheduledMinutes,

                    checkInAt: occurredAt,

                    status: holiday
                        ? "HOLIDAY"
                        : scheduleDay &&
                            scheduleDay.isWorkingDay === false
                            ? "REST_DAY"
                            : "INCOMPLETE",
                },
                tx,
            );
        } else {
            attendance =
                await updateAttendance(
                    attendance.id,
                    {
                        checkInAt: occurredAt,
                        scheduledStartAt,
                        scheduledEndAt,
                        scheduledMinutes,
                        shiftId:
                            shiftWindow?.shift?.id ??
                            attendance.shiftId,
                        scheduleId:
                            context.assignment?.scheduleId ??
                            attendance.scheduleId,
                    },
                    tx,
                );
        }

        await createAttendanceEvent(
            {
                attendanceId: attendance.id,
                type: "CHECK_IN",
                occurredAt,
                source,
                deviceId,
                latitude,
                longitude,
                ipAddress,
                userAgent,
                notes,
            },
            tx,
        );

        return recalculateAttendance(
            attendance.id,
            tx,
        );
    });
};

export const checkOut = async ({
    companyId,
    employeeId,
    occurredAt = new Date(),
    source = "WEB",
    deviceId,
    latitude,
    longitude,
    notes,
    ipAddress,
    userAgent,
}) => {
    return prisma.$transaction(async (tx) => {
        const today =
            startOfDay(occurredAt);

        let attendance =
            await findAttendanceByEmployeeAndDate(
                employeeId,
                today,
                tx,
            );

        /*
             * Overnight shift:
                  * If today's record does not exist, inspect
                       * yesterday's attendance for an open shift.
                            */
        if (!attendance) {
            attendance =
                await findAttendanceByEmployeeAndDate(
                    employeeId,
                    startOfDay(
                        addDays(occurredAt, -1),
                    ),
                    tx,
                );
        }

        if (!attendance) {
            throw new AppError(
                "No active attendance record found for checkout",
                404,
            );
        }

        if (attendance.isLocked) {
            throw new AppError(
                "Attendance record is locked",
                409,
            );
        }

        if (!attendance.checkInAt) {
            throw new AppError(
                "Employee has not checked in",
                409,
            );
        }

        if (attendance.checkOutAt) {
            throw new AppError(
                "Employee has already checked out",
                409,
            );
        }

        if (
            isBefore(
                occurredAt,
                new Date(attendance.checkInAt),
            )
        ) {
            throw new AppError(
                "Checkout time cannot be before check-in time",
                400,
            );
        }

        await updateAttendance(
            attendance.id,
            {
                checkOutAt: occurredAt,
            },
            tx,
        );

        await createAttendanceEvent(
            {
                attendanceId: attendance.id,
                type: "CHECK_OUT",
                occurredAt,
                source,
                deviceId,
                latitude,
                longitude,
                ipAddress,
                userAgent,
                notes,
            },
            tx,
        );

        return recalculateAttendance(
            attendance.id,
            tx,
        );
    });
};

export const startBreak = async ({
    companyId,
    attendanceId,
    breakName,
    occurredAt = new Date(),
    source = "WEB",
}) => {
    return prisma.$transaction(async (tx) => {
        const attendance =
            await findAttendanceById(
                attendanceId,
                companyId,
                tx,
            );

        if (!attendance) {
            throw new AppError(
                "Attendance record not found",
                404,
            );
        }

        if (attendance.isLocked) {
            throw new AppError(
                "Attendance record is locked",
                409,
            );
        }

        if (!attendance.checkInAt) {
            throw new AppError(
                "Employee must check in before starting a break",
                409,
            );
        }

        if (attendance.checkOutAt) {
            throw new AppError(
                "Cannot start a break after checkout",
                409,
            );
        }

        const openBreak =
            await findOpenBreak(
                attendance.id,
                tx,
            );

        if (openBreak) {
            throw new AppError(
                "Employee already has an active break",
                409,
            );
        }

        const breakRecord =
            await createAttendanceBreak(
                {
                    attendanceId: attendance.id,
                    breakName,
                    breakStartAt: occurredAt,
                },
                tx,
            );

        await createAttendanceEvent(
            {
                attendanceId: attendance.id,
                type: "BREAK_START",
                occurredAt,
                source,
            },
            tx,
        );

        return breakRecord;
    });
};

export const endBreak = async ({
    companyId,
    attendanceId,
    occurredAt = new Date(),
    source = "WEB",
}) => {
    return prisma.$transaction(async (tx) => {
        const attendance =
            await findAttendanceById(
                attendanceId,
                companyId,
                tx,
            );

        if (!attendance) {
            throw new AppError(
                "Attendance record not found",
                404,
            );
        }

        if (attendance.isLocked) {
            throw new AppError(
                "Attendance record is locked",
                409,
            );
        }

        const openBreak =
            await findOpenBreak(
                attendance.id,
                tx,
            );

        if (!openBreak) {
            throw new AppError(
                "No active break found",
                409,
            );
        }

        if (
            isBefore(
                occurredAt,
                new Date(openBreak.breakStartAt),
            )
        ) {
            throw new AppError(
                "Break end cannot be before break start",
                400,
            );
        }

        const durationMinutes =
            differenceInMinutes(
                occurredAt,
                new Date(openBreak.breakStartAt),
            );

        const updatedBreak =
            await updateAttendanceBreak(
                openBreak.id,
                {
                    breakEndAt: occurredAt,
                    durationMinutes:
                        Math.max(
                            0,
                            durationMinutes,
                        ),
                },
                tx,
            );

        await createAttendanceEvent(
            {
                attendanceId: attendance.id,
                type: "BREAK_END",
                occurredAt,
                source,
            },
            tx,
        );

        return recalculateAttendance(
            attendance.id,
            tx,
        );
    });
};

export const getAttendance = async ({
    companyId,
    id,
}) => {
    const attendance =
        await findAttendanceById(
            id,
            companyId,
        );

    if (!attendance) {
        throw new AppError(
            "Attendance record not found",
            404,
        );
    }

    return attendance;
};

export const getEmployeeAttendance = async ({
    companyId,
    employeeId,
    from,
    to,
}) => {
    const employee =
        await findEmployeeById(
            employeeId,
            companyId,
        );

    if (!employee) {
        throw new AppError(
            "Employee not found",
            404,
        );
    }

    return findAttendanceForEmployeeRange(
        employeeId,
        companyId,
        startOfDay(from),
        endOfDay(to),
    );
};

export const listAttendance = async ({
    companyId,
    page = 1,
    limit = 20,
    employeeId,
    status,
    approvalStatus,
    from,
    to,
    search,
    sortOrder = "desc",
}) => {
    const where = {};

    if (employeeId) {
        where.employeeId = employeeId;
    }

    if (status) {
        where.status = status;
    }

    if (approvalStatus) {
        where.approvalStatus =
            approvalStatus;
    }

    if (from || to) {
        where.attendanceDate = {};

        if (from) {
            where.attendanceDate.gte =
                startOfDay(from);
        }

        if (to) {
            where.attendanceDate.lte =
                endOfDay(to);
        }
    }

    if (search) {
        where.employee = {
            OR: [
                {
                    firstName: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
                {
                    lastName: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
                {
                    employeeNumber: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
            ],
        };
    }

    const skip = (page - 1) * limit;

    const result =
        await listAttendances({
            companyId,
            where,
            skip,
            take: limit,
            orderBy: {
                attendanceDate: sortOrder,
            },
        });

    return {
        ...result,
        page,
        limit,
        totalPages: Math.ceil(
            result.total / limit,
        ),
    };
};

export const correctAttendance = async ({
    companyId,
    id,
    data,
    userId,
}) => {
    return prisma.$transaction(
        async (tx) => {
            const attendance =
                await findAttendanceById(
                    id,
                    companyId,
                    tx,
                );

            if (!attendance) {
                throw new AppError(
                    "Attendance record not found",
                    404,
                );
            }

            if (attendance.isLocked) {
                throw new AppError(
                    "Attendance record is locked",
                    409,
                );
            }

            const updated =
                await updateAttendance(
                    attendance.id,
                    {
                        ...(data.checkInAt !== undefined
                            ? {
                                checkInAt:
                                    data.checkInAt,
                            }
                            : {}),

                        ...(data.checkOutAt !== undefined
                            ? {
                                checkOutAt:
                                    data.checkOutAt,
                            }
                            : {}),

                        ...(data.notes !== undefined
                            ? {
                                notes: data.notes,
                            }
                            : {}),

                        status:
                            data.status ??
                            "CORRECTED",

                        approvalStatus: "PENDING",
                    },
                    tx,
                );

            await createAttendanceEvent(
                {
                    attendanceId: attendance.id,
                    type: "CORRECTION",
                    occurredAt: new Date(),
                    source: "ADMIN",
                    notes: JSON.stringify({
                        userId,
                        reason: data.reason,
                    }),
                },
                tx,
            );

            return recalculateAttendance(
                updated.id,
                tx,
            );
        },
    );
};

export const approveAttendance = async ({
    companyId,
    id,
    approved,
    notes,
}) => {
    const attendance =
        await findAttendanceById(
            id,
            companyId,
        );

    if (!attendance) {
        throw new AppError(
            "Attendance record not found",
            404,
        );
    }

    if (attendance.isLocked) {
        throw new AppError(
            "Attendance record is already locked",
            409,
        );
    }

    return updateAttendance(
        id,
        {
            approvalStatus: approved
                ? "APPROVED"
                : "REJECTED",

            isLocked: approved,

            notes:
                notes ??
                attendance.notes,
        },
    );
};

export const generateEmployeeAttendance = async ({
    companyId,
    employeeId,
    from,
    to,
}) => {
    const employee =
        await findEmployeeById(
            employeeId,
            companyId,
        );

    if (!employee) {
        throw new AppError(
            "Employee not found",
            404,
        );
    }

    const results = [];

    let current = startOfDay(from);

    const end = startOfDay(to);

    while (
        current <= end
    ) {
        const context =
            await getAttendanceContext(
                companyId,
                employeeId,
                current,
            );

        let attendance =
            await findAttendanceByEmployeeAndDate(
                employeeId,
                current,
            );

        if (!attendance) {
            if (context.holiday) {
                attendance =
                    await createAttendance({
                        companyId,
                        employeeId,
                        attendanceDate: current,
                        shiftId: null,
                        scheduleId: null,
                        scheduledStartAt: null,
                        scheduledEndAt: null,
                        scheduledMinutes: null,
                        status: "HOLIDAY",
                    });
            } else if (
                !context.scheduleDay
            ) {
                attendance =
                    await createAttendance({
                        companyId,
                        employeeId,
                        attendanceDate: current,
                        status: "REST_DAY",
                    });
            } else if (
                context.scheduleDay
                    .isWorkingDay === false
            ) {
                attendance =
                    await createAttendance({
                        companyId,
                        employeeId,
                        attendanceDate: current,
                        shiftId:
                            context.shiftWindow?.shift
                                ?.id ?? null,
                        scheduleId:
                            context.assignment
                                ?.scheduleId ?? null,
                        scheduledStartAt:
                            context.shiftWindow
                                ?.scheduledStartAt ??
                            null,
                        scheduledEndAt:
                            context.shiftWindow
                                ?.scheduledEndAt ??
                            null,
                        status: "REST_DAY",
                    });
            } else {
                attendance =
                    await createAttendance({
                        companyId,
                        employeeId,
                        attendanceDate: current,
                        shiftId:
                            context.shiftWindow?.shift
                                ?.id ?? null,
                        scheduleId:
                            context.assignment
                                ?.scheduleId ?? null,
                        scheduledStartAt:
                            context.shiftWindow
                                ?.scheduledStartAt ??
                            null,
                        scheduledEndAt:
                            context.shiftWindow
                                ?.scheduledEndAt ??
                            null,
                        scheduledMinutes:
                            context.shiftWindow
                                ?.scheduledStartAt &&
                                context.shiftWindow
                                    ?.scheduledEndAt
                                ? differenceInMinutes(
                                    context.shiftWindow
                                        .scheduledEndAt,
                                    context.shiftWindow
                                        .scheduledStartAt,
                                )
                                : null,
                        status: "ABSENT",
                    });
            }
        }

        results.push(attendance);

        current = addDays(
            current,
            1,
        );
    }

    return results;
};

export const getAttendanceReport = async ({
    companyId,
    from,
    to,
    employeeId,
    departmentId,
    status,
}) => {
    const records =
        await findAttendanceRange({
            companyId,
            from: startOfDay(from),
            to: endOfDay(to),
            employeeId,
            departmentId,
            status,
        });

    const summary = {
        total: records.length,
        present: 0,
        late: 0,
        absent: 0,
        halfDay: 0,
        onLeave: 0,
        holidays: 0,
        restDays: 0,
        incomplete: 0,
        corrected: 0,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        breakMinutes: 0,
    };

    for (const record of records) {
        summary.workedMinutes +=
            record.workedMinutes ?? 0;

        summary.lateMinutes +=
            record.lateMinutes ?? 0;

        summary.earlyDepartureMinutes +=
            record.earlyDepartureMinutes ?? 0;

        summary.breakMinutes +=
            record.breakMinutes ?? 0;

        switch (record.status) {
            case "PRESENT":
                summary.present++;
                break;

            case "LATE":
                summary.late++;
                break;

            case "ABSENT":
                summary.absent++;
                break;

            case "HALF_DAY":
                summary.halfDay++;
                break;

            case "ON_LEAVE":
                summary.onLeave++;
                break;

            case "HOLIDAY":
                summary.holidays++;
                break;

            case "REST_DAY":
                summary.restDays++;
                break;

            case "INCOMPLETE":
                summary.incomplete++;
                break;

            case "CORRECTED":
                summary.corrected++;
                break;

            default:
                break;
        }
    }

    summary.workedHours = Number(
        (
            summary.workedMinutes / 60
        ).toFixed(2),
    );

    return {
        from,
        to,
        filters: {
            employeeId,
            departmentId,
            status,
        },
        summary,
        records,
    };
};
