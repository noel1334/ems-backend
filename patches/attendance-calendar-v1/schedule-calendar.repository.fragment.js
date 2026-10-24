/**
 * Read-only, tenant-scoped data for the attendance calendar. The calendar combines
 * recurring work schedule patterns, direct shift assignments, published timetable
 * allocations, holidays and grouped attendance outcomes in one request.
 */
export const getAttendanceCalendarData = async ({ companyId, from, to, employeeId }) => {
  const dateWhere = { gte: from, lte: to };
  const employeeFilter = employeeId ? { employeeId } : {};
  const assignmentRange = {
    effectiveFrom: { lte: to },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
  };
  const attendanceWhere = {
    companyId,
    attendanceDate: dateWhere,
    ...employeeFilter,
  };

  const [scheduleAssignments, shiftAssignments, publishedAssignments, holidays, attendanceSummary, employeeAttendance] = await Promise.all([
    prisma.employeeScheduleAssignment.findMany({
      where: { companyId, isActive: true, ...employeeFilter, ...assignmentRange },
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, employmentStatus: true, departmentId: true } },
        schedule: { include: { days: { include: { shift: true } } } },
      },
      orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }],
    }),
    prisma.employeeShiftAssignment.findMany({
      where: { companyId, isActive: true, ...employeeFilter, ...assignmentRange },
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, employmentStatus: true, departmentId: true } },
        shift: { include: { breaks: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'desc' }],
    }),
    prisma.scheduleGenerationAssignment.findMany({
      where: {
        companyId,
        workDate: dateWhere,
        ...employeeFilter,
        generation: { status: 'PUBLISHED' },
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, employmentStatus: true, departmentId: true } },
        shift: true,
        generation: { select: { id: true, status: true, publishedAt: true, policy: { select: { name: true } } } },
      },
      orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
    }),
    prisma.holiday.findMany({
      where: { companyId, isActive: true, OR: [{ date: dateWhere }, { isRecurring: true }] },
      orderBy: { date: 'asc' },
    }),
    prisma.attendance.groupBy({
      by: ['attendanceDate', 'status'],
      where: attendanceWhere,
      _count: { _all: true },
    }),
    employeeId ? prisma.attendance.findMany({
      where: attendanceWhere,
      include: { employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true } } },
      orderBy: { attendanceDate: 'asc' },
    }) : Promise.resolve([]),
  ]);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    scheduleAssignments,
    shiftAssignments,
    publishedAssignments,
    holidays,
    attendanceSummary: attendanceSummary.map((row) => ({
      attendanceDate: row.attendanceDate,
      status: row.status,
      count: row._count?._all ?? 0,
    })),
    employeeAttendance,
  };
};
