/**
 * Assigns the working employees on one date to evenly sized shift groups.
 *
 * The existing rotation policy remains the preferred assignment. When approved or
 * automatic leave removes people from one group, the remaining employees are moved
 * only as much as necessary to keep the daily shift headcounts as even as possible.
 * Employee-level history and the consecutive-night rule are used as tie-breakers.
 */
export function assignBalancedDailyShifts({
  workRows,
  shifts,
  preferredShiftByEmployee,
  date,
  dayIndex,
  lastWorkShift,
  employeeShiftCounts,
  shiftTotals,
  preventConsecutiveNightShifts,
  preservePreferredAssignments = false,
  isNightShift,
  daysBetween,
}) {
  if (!workRows.length || !shifts.length) return { nightAdjustments: 0 };

  if (preservePreferredAssignments) {
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    for (let index = 0; index < workRows.length; index++) {
      const row = workRows[index];
      const preferredId = preferredShiftByEmployee.get(row.employeeId);
      const shift = shiftById.get(preferredId) || shifts[index % shifts.length];
      row.shiftId = shift.id;
      const previous = lastWorkShift.get(row.employeeId);
      if (previous && previous.shiftId !== shift.id) {
        // The change should only be requested by the leave-return rotation in the service.
        row.reason = row.reason || "Shift rotation after leave return";
      }
      lastWorkShift.set(row.employeeId, { date, isNight: isNightShift(shift), shiftId: shift.id });
      const history = employeeShiftCounts.get(row.employeeId) || new Map();
      history.set(shift.id, (history.get(shift.id) || 0) + 1);
      employeeShiftCounts.set(row.employeeId, history);
      shiftTotals.set(shift.id, (shiftTotals.get(shift.id) || 0) + 1);
    }
    return { nightAdjustments: 0 };
  }

  const countByPreferredShift = new Map(shifts.map((shift) => [shift.id, 0]));
  for (const row of workRows) {
    const preferredId = preferredShiftByEmployee.get(row.employeeId);
    if (preferredId && countByPreferredShift.has(preferredId)) {
      countByPreferredShift.set(preferredId, countByPreferredShift.get(preferredId) + 1);
    }
  }

  const baseline = Math.floor(workRows.length / shifts.length);
  const remainder = workRows.length % shifts.length;
  const extraOrder = [...shifts].sort((a, b) => {
    const baselineDifference = (countByPreferredShift.get(b.id) || 0) - (countByPreferredShift.get(a.id) || 0);
    if (baselineDifference) return baselineDifference;
    const totalDifference = (shiftTotals.get(a.id) || 0) - (shiftTotals.get(b.id) || 0);
    if (totalDifference) return totalDifference;
    return String(a.code || a.name || a.id).localeCompare(String(b.code || b.name || b.id));
  });

  const targetCounts = new Map(shifts.map((shift) => [shift.id, baseline]));
  for (const shift of extraOrder.slice(0, remainder)) {
    targetCounts.set(shift.id, targetCounts.get(shift.id) + 1);
  }

  // A night shift cannot be filled by an employee who worked a night shift yesterday
  // when another non-night shift is available. Transfer those slots before matching.
  const nonNightShifts = shifts.filter((shift) => !isNightShift(shift));
  const nightShifts = shifts.filter((shift) => isNightShift(shift));
  if (preventConsecutiveNightShifts && nonNightShifts.length && nightShifts.length) {
    const eligibleNightEmployees = workRows.filter((row) => {
      const previous = lastWorkShift.get(row.employeeId);
      return !(previous && daysBetween(previous.date, date) === 1 && previous.isNight);
    }).length;
    let nightSlots = nightShifts.reduce((total, shift) => total + (targetCounts.get(shift.id) || 0), 0);
    let excessNightSlots = Math.max(0, nightSlots - eligibleNightEmployees);

    // Reduce the night quotas by one at a time, preferring to preserve the night shift
    // that already has the strongest preferred assignment count.
    while (excessNightSlots > 0) {
      const reducible = nightShifts
        .filter((shift) => (targetCounts.get(shift.id) || 0) > 0)
        .sort((a, b) => (targetCounts.get(b.id) || 0) - (targetCounts.get(a.id) || 0));
      if (!reducible.length) break;
      const reducedShift = reducible[0];
      targetCounts.set(reducedShift.id, targetCounts.get(reducedShift.id) - 1);
      const receiver = [...nonNightShifts].sort((a, b) => {
        const targetDifference = (targetCounts.get(a.id) || 0) - (targetCounts.get(b.id) || 0);
        if (targetDifference) return targetDifference;
        return (countByPreferredShift.get(b.id) || 0) - (countByPreferredShift.get(a.id) || 0);
      })[0];
      targetCounts.set(receiver.id, (targetCounts.get(receiver.id) || 0) + 1);
      excessNightSlots -= 1;
    }
  }

  const originalOrder = new Map(workRows.map((row, index) => [row.employeeId, index]));
  const remaining = [...workRows];
  const assignmentOrder = [...shifts].sort((a, b) => {
    const nightDifference = Number(isNightShift(b)) - Number(isNightShift(a));
    if (nightDifference) return nightDifference;
    return (targetCounts.get(b.id) || 0) - (targetCounts.get(a.id) || 0);
  });
  let nightAdjustments = 0;

  for (const shift of assignmentOrder) {
    const required = targetCounts.get(shift.id) || 0;
    if (!required) continue;
    const candidates = [...remaining].sort((a, b) => {
      const score = (row) => {
        const previous = lastWorkShift.get(row.employeeId);
        const consecutive = previous && daysBetween(previous.date, date) === 1;
        const nightConflict = Boolean(
          preventConsecutiveNightShifts && consecutive && previous.isNight && isNightShift(shift),
        );
        const preferredId = preferredShiftByEmployee.get(row.employeeId);
        const history = employeeShiftCounts.get(row.employeeId) || new Map();
        const previousShiftPenalty = consecutive && previous.shiftId === shift.id ? 1 : 0;
        const rotatedIndex = ((originalOrder.get(row.employeeId) - (dayIndex % Math.max(1, workRows.length))) + workRows.length) % workRows.length;
        return (nightConflict ? 1_000_000_000 : 0)
          + (preferredId === shift.id ? 0 : 1_000_000)
          + ((history.get(shift.id) || 0) * 100)
          + previousShiftPenalty * 10
          + rotatedIndex / 1_000;
      };
      return score(a) - score(b);
    });

    for (const row of candidates.slice(0, required)) {
      const index = remaining.findIndex((candidate) => candidate.employeeId === row.employeeId);
      if (index !== -1) remaining.splice(index, 1);
      row.shiftId = shift.id;
      const previous = lastWorkShift.get(row.employeeId);
      const consecutive = previous && daysBetween(previous.date, date) === 1;
      if (consecutive && previous.isNight && !isNightShift(shift)) {
        row.reason = "Shift adjusted to avoid consecutive night shifts";
        nightAdjustments += 1;
      }
      lastWorkShift.set(row.employeeId, { date, isNight: isNightShift(shift), shiftId: shift.id });
      const history = employeeShiftCounts.get(row.employeeId) || new Map();
      history.set(shift.id, (history.get(shift.id) || 0) + 1);
      employeeShiftCounts.set(row.employeeId, history);
      shiftTotals.set(shift.id, (shiftTotals.get(shift.id) || 0) + 1);
    }
  }

  // Defensive fallback if an unexpected policy/shift combination leaves a slot empty.
  // It preserves data completeness; normal balanced assignments are fully matched above.
  if (remaining.length) {
    const fallbackShift = [...shifts].sort((a, b) => (shiftTotals.get(a.id) || 0) - (shiftTotals.get(b.id) || 0))[0];
    for (const row of remaining) {
      row.shiftId = fallbackShift.id;
      lastWorkShift.set(row.employeeId, { date, isNight: isNightShift(fallbackShift), shiftId: fallbackShift.id });
      const history = employeeShiftCounts.get(row.employeeId) || new Map();
      history.set(fallbackShift.id, (history.get(fallbackShift.id) || 0) + 1);
      employeeShiftCounts.set(row.employeeId, history);
      shiftTotals.set(fallbackShift.id, (shiftTotals.get(fallbackShift.id) || 0) + 1);
    }
  }

  return { nightAdjustments };
}
