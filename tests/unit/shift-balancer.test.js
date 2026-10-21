import { describe, expect, it } from "vitest";
import { assignBalancedDailyShifts } from "../../src/modules/scheduling/shift-balancer.js";

const date = new Date("2026-10-20T00:00:00.000Z");
const daysBetween = (a, b) => Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86_400_000);
const shifts = [
  { id: "day", code: "DAY", name: "Day Shift", startTime: "08:00", isOvernight: false },
  { id: "night", code: "NIGHT", name: "Night Shift", startTime: "20:00", isOvernight: true },
];
const isNightShift = (shift) => Boolean(shift.isOvernight) || String(shift.startTime || "").slice(0, 5) >= "18:00" || (!!shift.startTime && String(shift.startTime).slice(0, 5) < "06:00");

function allocate({ workEmployeeIds, preferred, lastWorkShift = new Map(), preventConsecutiveNightShifts = false, preservePreferredAssignments = false, dayIndex = 0 }) {
  const rows = workEmployeeIds.map((employeeId) => ({ employeeId, status: "WORK", shiftId: null, reason: null }));
  const shiftTotals = new Map(shifts.map((shift) => [shift.id, 0]));
  const employeeShiftCounts = new Map();
  const result = assignBalancedDailyShifts({
    workRows: rows,
    shifts,
    preferredShiftByEmployee: preferred,
    date,
    dayIndex,
    lastWorkShift,
    employeeShiftCounts,
    shiftTotals,
    preventConsecutiveNightShifts,
    preservePreferredAssignments,
    isNightShift,
    daysBetween,
  });
  return { rows, result };
}

function counts(rows) {
  return rows.reduce((acc, row) => ({ ...acc, [row.shiftId]: (acc[row.shiftId] || 0) + 1 }), {});
}

describe("balanced daily shift allocation", () => {
  it("keeps five available employees at a 3/2 distribution", () => {
    const preferred = new Map([["e1", "day"], ["e2", "day"], ["e3", "day"], ["e4", "night"], ["e5", "night"]]);
    const { rows } = allocate({ workEmployeeIds: ["e1", "e2", "e3", "e4", "e5"], preferred });
    expect(counts(rows)).toEqual({ night: 2, day: 3 });
  });

  it("keeps each employee on their preferred shift instead of moving them to rebalance leave gaps", () => {
    const preferred = new Map([["e1", "day"], ["e2", "day"], ["e3", "day"], ["e4", "night"], ["e5", "night"]]);
    const { rows } = allocate({
      workEmployeeIds: ["e1", "e2", "e3", "e4"],
      preferred,
      preservePreferredAssignments: true,
      dayIndex: 22,
    });
    expect(Object.fromEntries(rows.map((row) => [row.employeeId, row.shiftId]))).toEqual({
      e1: "day", e2: "day", e3: "day", e4: "night",
    });
    // Stable shift assignment intentionally allows 3/1 coverage rather than
    // moving a day-shift employee onto nights only to force a 2/2 balance.
    expect(counts(rows)).toEqual({ day: 3, night: 1 });
  });

  it("rebalances when one usual day-shift employee is on leave", () => {
    const preferred = new Map([["e1", "day"], ["e2", "day"], ["e3", "day"], ["e4", "night"], ["e5", "night"]]);
    const { rows } = allocate({ workEmployeeIds: ["e1", "e2", "e4", "e5"], preferred });
    expect(counts(rows)).toEqual({ night: 2, day: 2 });
  });

  it("rebalances when a usual night-shift employee is on leave", () => {
    const preferred = new Map([["e1", "day"], ["e2", "day"], ["e3", "day"], ["e4", "night"], ["e5", "night"]]);
    const { rows } = allocate({ workEmployeeIds: ["e1", "e2", "e3", "e4"], preferred });
    expect(counts(rows)).toEqual({ night: 2, day: 2 });
  });

  it("rotates the odd extra place fairly while preventing consecutive nights", () => {
    const preferred = new Map([["e1", "day"], ["e2", "day"], ["e3", "day"], ["e4", "night"], ["e5", "night"]]);
    const lastWorkShift = new Map([
      ["e1", { date: new Date("2026-10-19T00:00:00.000Z"), isNight: false, shiftId: "day" }],
      ["e2", { date: new Date("2026-10-19T00:00:00.000Z"), isNight: false, shiftId: "day" }],
      ["e3", { date: new Date("2026-10-19T00:00:00.000Z"), isNight: false, shiftId: "day" }],
      ["e4", { date: new Date("2026-10-19T00:00:00.000Z"), isNight: true, shiftId: "night" }],
      ["e5", { date: new Date("2026-10-19T00:00:00.000Z"), isNight: true, shiftId: "night" }],
    ]);
    const { rows } = allocate({ workEmployeeIds: ["e1", "e2", "e3", "e4", "e5"], preferred, lastWorkShift, preventConsecutiveNightShifts: true, dayIndex: 1 });
    expect(counts(rows)).toEqual({ night: 2, day: 3 });
    expect(rows.filter((row) => row.shiftId === "night").every((row) => !["e4", "e5"].includes(row.employeeId))).toBe(true);
  });

  it("assigns every working employee exactly once even with fewer staff than shifts", () => {
    const threeShifts = [...shifts, { id: "evening", code: "EVE", name: "Evening Shift", startTime: "14:00", isOvernight: false }];
    const rows = [{ employeeId: "e1", status: "WORK" }, { employeeId: "e2", status: "WORK" }];
    const countsBefore = rows.length;
    const result = assignBalancedDailyShifts({
      workRows: rows,
      shifts: threeShifts,
      preferredShiftByEmployee: new Map([["e1", "day"], ["e2", "night"]]),
      date,
      dayIndex: 0,
      lastWorkShift: new Map(),
      employeeShiftCounts: new Map(),
      shiftTotals: new Map(threeShifts.map((shift) => [shift.id, 0])),
      preventConsecutiveNightShifts: false,
      isNightShift,
      daysBetween,
    });
    expect(rows).toHaveLength(countsBefore);
    expect(rows.every((row) => threeShifts.some((shift) => shift.id === row.shiftId))).toBe(true);
    expect(result.nightAdjustments).toBe(0);
  });
});
