const DAY_MS = 86_400_000;

function asUtcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Merge overlapping/adjacent leave blocks so one continuous absence advances rotation only once. */
export function mergeLeaveIntervals(intervals = []) {
  const sorted = intervals
    .filter((range) => range?.start && range?.end)
    .map((range) => ({ start: asUtcDay(range.start), end: asUtcDay(range.end) }))
    .filter((range) => range.end >= range.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start.getTime() <= previous.end.getTime() + DAY_MS) {
      if (range.end > previous.end) previous.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Number of completed leave blocks before this date; advances shift on the return date. */
export function completedLeaveRotations(intervals = [], date) {
  const day = asUtcDay(date);
  return intervals.reduce((count, range) => count + (day > asUtcDay(range.end) ? 1 : 0), 0);
}
