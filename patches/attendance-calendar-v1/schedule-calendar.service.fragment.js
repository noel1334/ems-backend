const parseCalendarDate = (value, field) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ServiceError(`${field} must use YYYY-MM-DD format`, 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ServiceError(`${field} is not a valid calendar date`, 400);
  }
  return parsed;
};

export const getAttendanceCalendar = async (companyId, query = {}) => {
  const from = parseCalendarDate(query.from, 'from');
  const toDay = parseCalendarDate(query.to, 'to');
  const to = new Date(toDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (to < from) throw new ServiceError('The calendar end date must not precede its start date', 400);
  const dayCount = Math.floor((toDay.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > 62) throw new ServiceError('Calendar queries are limited to 62 days', 400);
  if (query.employeeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.employeeId)) {
    throw new ServiceError('employeeId must be a valid employee identifier', 400);
  }
  const data = await getAttendanceCalendarData({ companyId, from, to, employeeId: query.employeeId });
  return { ...data, from: query.from, to: query.to };
};
