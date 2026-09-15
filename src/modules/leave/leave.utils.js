import { addDays, format, parseISO, startOfDay } from "date-fns";

export function parseDateOnly(value) {
  const d = parseISO(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return startOfDay(d);
}
export function dateRange(start, end) {
  const out = [];
  for (let d = startOfDay(start); d <= startOfDay(end); d = addDays(d, 1))
    out.push(d);
  return out;
}
export function dayOfWeekForPrisma(date) {
  const n = date.getDay();
  return n === 0 ? 7 : n;
}
export function dateKey(date) {
  return format(startOfDay(date), "yyyy-MM-dd");
}
export function numberOf(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}
