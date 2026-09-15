import prisma from "../../config/database.js";

import {
  createSchedule,
  findScheduleById,
  findScheduleByName,
  findScheduleByCode,
  listSchedules,
  updateSchedule,
  deleteSchedule,
  deleteScheduleDays,
  createScheduleDays,
  countScheduleAssignments,
  createEmployeeScheduleAssignment,
  findEmployee,
  findScheduleAssignmentConflict,
  findEmployeeScheduleAssignments,
  createEmployeeShiftAssignment,
  findShift,
  findShiftAssignmentConflict,
  findEmployeeShiftAssignments,
} from "./schedule.repository.js";

class ServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ServiceError";
  }
}

const validateDays = (days) => {
  const seen = new Set();

  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      throw new ServiceError(
        `Duplicate schedule day: ${day.dayOfWeek}`
      );
    }

    seen.add(day.dayOfWeek);

    if (!day.isWorkingDay) {
      continue;
    }

    if (day.shiftId) {
      continue;
    }

    if (!day.startTime || !day.endTime) {
      throw new ServiceError(
        `${day.dayOfWeek} requires startTime and endTime when no shift is selected`
      );
    }

    if (
      !day.isOvernight &&
      day.startTime >= day.endTime
    ) {
      throw new ServiceError(
        `${day.dayOfWeek} end time must be later than start time`
      );
    }
  }
};

const validateEffectiveDates = (
  effectiveFrom,
  effectiveTo
) => {
  if (
    effectiveTo &&
    effectiveTo <= effectiveFrom
  ) {
    throw new ServiceError(
      "effectiveTo must be later than effectiveFrom"
    );
  }
};

export const create = async (
  companyId,
  input
) => {
  const duplicateName =
    await findScheduleByName(
      input.name,
      companyId
    );

  if (duplicateName) {
    throw new ServiceError(
      "A schedule with this name already exists",
      409
    );
  }

  const duplicateCode =
    await findScheduleByCode(
      input.code,
      companyId
    );

  if (duplicateCode) {
    throw new ServiceError(
      "A schedule with this code already exists",
      409
    );
  }

  validateDays(input.days);

  for (const day of input.days) {
    if (day.shiftId) {
      const shift = await findShift(
        day.shiftId,
        companyId
      );

      if (!shift) {
        throw new ServiceError(
          `Shift ${day.shiftId} does not belong to this company`,
          400
        );
      }
    }
  }

  return prisma.$transaction(
    async (tx) => {
      /*
             * Only one default schedule should exist.
                    */
      if (input.isDefault) {
        await tx.workSchedule.updateMany({
          where: {
            companyId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      const schedule =
        await createSchedule(
          {
            companyId,
            name: input.name,
            code: input.code,
            description:
              input.description ?? null,
            isDefault:
              input.isDefault ?? false,
            isActive:
              input.isActive ?? true,
          },
          tx
        );

      await createScheduleDays(
        schedule.id,
        input.days,
        tx
      );

      return findScheduleById(
        schedule.id,
        companyId,
        tx
      );
    }
  );
};

export const getById = async (
  companyId,
  scheduleId
) => {
  const schedule =
    await findScheduleById(
      scheduleId,
      companyId
    );

  if (!schedule) {
    throw new ServiceError(
      "Work schedule not found",
      404
    );
  }

  return schedule;
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

  let isActive;

  if (query.isActive !== undefined) {
    isActive =
      query.isActive === true ||
      query.isActive === "true";
  }

  const result =
    await listSchedules({
      companyId,
      page,
      limit,
      search:
        query.search?.trim() || undefined,
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
  scheduleId,
  input
) => {
  const existing =
    await findScheduleById(
      scheduleId,
      companyId
    );

  if (!existing) {
    throw new ServiceError(
      "Work schedule not found",
      404
    );
  }

  if (input.name) {
    const duplicate =
      await findScheduleByName(
        input.name,
        companyId,
        scheduleId
      );

    if (duplicate) {
      throw new ServiceError(
        "A schedule with this name already exists",
        409
      );
    }
  }

  if (input.code) {
    const duplicate =
      await findScheduleByCode(
        input.code,
        companyId,
        scheduleId
      );

    if (duplicate) {
      throw new ServiceError(
        "A schedule with this code already exists",
        409
      );
    }
  }

  if (input.days) {
    validateDays(input.days);

    for (const day of input.days) {
      if (day.shiftId) {
        const shift = await findShift(
          day.shiftId,
          companyId
        );

        if (!shift) {
          throw new ServiceError(
            `Shift ${day.shiftId} does not belong to this company`
          );
        }
      }
    }
  }

  return prisma.$transaction(
    async (tx) => {
      if (input.isDefault === true) {
        await tx.workSchedule.updateMany({
          where: {
            companyId,
            isDefault: true,
            NOT: {
              id: scheduleId,
            },
          },
          data: {
            isDefault: false,
          },
        });
      }

      const scheduleData = {
        ...(input.name !== undefined
          ? { name: input.name }
          : {}),
        ...(input.code !== undefined
          ? { code: input.code }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.isDefault !== undefined
          ? { isDefault: input.isDefault }
          : {}),
        ...(input.isActive !== undefined
          ? { isActive: input.isActive }
          : {}),
      };

      if (Object.keys(scheduleData).length) {
        await updateSchedule(
          scheduleId,
          companyId,
          scheduleData,
          tx
        );
      }

      if (input.days) {
        await deleteScheduleDays(
          scheduleId,
          tx
        );

        await createScheduleDays(
          scheduleId,
          input.days,
          tx
        );
      }

      return findScheduleById(
        scheduleId,
        companyId,
        tx
      );
    }
  );
};

export const replaceDays = async (
  companyId,
  scheduleId,
  days
) => {
  const schedule =
    await findScheduleById(
      scheduleId,
      companyId
    );

  if (!schedule) {
    throw new ServiceError(
      "Work schedule not found",
      404
    );
  }

  validateDays(days);

  for (const day of days) {
    if (day.shiftId) {
      const shift = await findShift(
        day.shiftId,
        companyId
      );

      if (!shift) {
        throw new ServiceError(
          `Shift ${day.shiftId} does not belong to this company`
        );
      }
    }
  }

  return prisma.$transaction(
    async (tx) => {
      await deleteScheduleDays(
        scheduleId,
        tx
      );

      await createScheduleDays(
        scheduleId,
        days,
        tx
      );

      return findScheduleById(
        scheduleId,
        companyId,
        tx
      );
    }
  );
};

export const remove = async (
  companyId,
  scheduleId
) => {
  const schedule =
    await findScheduleById(
      scheduleId,
      companyId
    );

  if (!schedule) {
    throw new ServiceError(
      "Work schedule not found",
      404
    );
  }

  const assignments =
    await countScheduleAssignments(
      scheduleId,
      companyId
    );

  if (assignments > 0) {
    throw new ServiceError(
      "This schedule cannot be deleted because it is assigned to employees. Deactivate it instead.",
      409
    );
  }

  await deleteSchedule(
    scheduleId,
    companyId
  );
};

export const assignToEmployee = async (
  companyId,
  employeeId,
  input
) => {
  const employee =
    await findEmployee(
      employeeId,
      companyId
    );

  if (!employee) {
    throw new ServiceError(
      "Employee not found",
      404
    );
  }

  const schedule =
    await findScheduleById(
      input.scheduleId,
      companyId
    );

  if (!schedule) {
    throw new ServiceError(
      "Work schedule not found",
      404
    );
  }

  validateEffectiveDates(
    input.effectiveFrom,
    input.effectiveTo
  );

  const conflict =
    await findScheduleAssignmentConflict({
      employeeId,
      effectiveFrom:
        input.effectiveFrom,
      effectiveTo:
        input.effectiveTo,
    });

  if (conflict) {
    throw new ServiceError(
      "The employee already has an active schedule assignment that overlaps this period",
      409
    );
  }

  return prisma.$transaction(
    async (tx) => {
      if (input.isPrimary) {
        await tx.employeeScheduleAssignment.updateMany(
          {
            where: {
              employeeId,
              isActive: true,
            },
            data: {
              isPrimary: false,
            },
          }
        );
      }

      return createEmployeeScheduleAssignment(
        {
          employeeId,
          scheduleId: input.scheduleId,
          effectiveFrom:
            input.effectiveFrom,
          effectiveTo:
            input.effectiveTo ?? null,
          isPrimary:
            input.isPrimary ?? true,
          isActive:
            input.isActive ?? true,
        },
        tx
      );
    }
  );
};

export const getEmployeeSchedules = async (
  companyId,
  employeeId
) => {
  const employee =
    await findEmployee(
      employeeId,
      companyId
    );

  if (!employee) {
    throw new ServiceError(
      "Employee not found",
      404
    );
  }

  return findEmployeeScheduleAssignments(
    employeeId,
    companyId
  );
};

export const assignShiftToEmployee = async (
  companyId,
  employeeId,
  input
) => {
  const employee =
    await findEmployee(
      employeeId,
      companyId
    );

  if (!employee) {
    throw new ServiceError(
      "Employee not found",
      404
    );
  }

  const shift =
    await findShift(
      input.shiftId,
      companyId
    );

  if (!shift) {
    throw new ServiceError(
      "Shift not found",
      404
    );
  }

  validateEffectiveDates(
    input.effectiveFrom,
    input.effectiveTo
  );

  const conflict =
    await findShiftAssignmentConflict({
      employeeId,
      effectiveFrom:
        input.effectiveFrom,
      effectiveTo:
        input.effectiveTo,
    });

  if (conflict) {
    throw new ServiceError(
      "The employee already has an active shift assignment that overlaps this period",
      409
    );
  }

  return prisma.$transaction(
    async (tx) => {
      if (input.isPrimary) {
        await tx.employeeShiftAssignment.updateMany(
          {
            where: {
              employeeId,
              isActive: true,
            },
            data: {
              isPrimary: false,
            },
          }
        );
      }

      return createEmployeeShiftAssignment(
        {
          employeeId,
          shiftId: input.shiftId,
          effectiveFrom:
            input.effectiveFrom,
          effectiveTo:
            input.effectiveTo ?? null,
          isPrimary:
            input.isPrimary ?? true,
          isActive:
            input.isActive ?? true,
        },
        tx
      );
    }
  );
};

export const getEmployeeShifts = async (
  companyId,
  employeeId
) => {
  const employee =
    await findEmployee(
      employeeId,
      companyId
    );

  if (!employee) {
    throw new ServiceError(
      "Employee not found",
      404
    );
  }

  return findEmployeeShiftAssignments(
    employeeId,
    companyId
  );
};