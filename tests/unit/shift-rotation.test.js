import { describe, expect, it } from "vitest";
import { completedLeaveRotations, mergeLeaveIntervals } from "../../src/modules/scheduling/shift-rotation.js";

const d = (value) => new Date(`${value}T00:00:00.000Z`);

describe("leave-triggered shift rotation", () => {
  it("does not rotate during leave and advances on the return date", () => {
    const intervals = mergeLeaveIntervals([{ start: d("2026-10-08"), end: d("2026-11-07") }]);
    expect(completedLeaveRotations(intervals, d("2026-10-21"))).toBe(0);
    expect(completedLeaveRotations(intervals, d("2026-11-07"))).toBe(0);
    expect(completedLeaveRotations(intervals, d("2026-11-08"))).toBe(1);
    expect(completedLeaveRotations(intervals, d("2026-12-01"))).toBe(1);
  });

  it("merges overlapping or adjacent leave into one rotation event", () => {
    const intervals = mergeLeaveIntervals([
      { start: d("2026-10-08"), end: d("2026-10-12") },
      { start: d("2026-10-12"), end: d("2026-10-14") },
      { start: d("2026-11-01"), end: d("2026-11-03") },
    ]);
    expect(intervals).toHaveLength(2);
    expect(completedLeaveRotations(intervals, d("2026-10-15"))).toBe(1);
    expect(completedLeaveRotations(intervals, d("2026-11-04"))).toBe(2);
  });

  it("handles a three-shift team by advancing one shift per completed leave", () => {
    const shifts = ["morning", "evening", "night"];
    const originalIndex = 2;
    expect(shifts[(originalIndex + completedLeaveRotations(mergeLeaveIntervals([{ start: d("2026-10-01"), end: d("2026-10-07") }]), d("2026-10-07"))) % 3]).toBe("night");
    expect(shifts[(originalIndex + completedLeaveRotations(mergeLeaveIntervals([{ start: d("2026-10-01"), end: d("2026-10-07") }]), d("2026-10-08"))) % 3]).toBe("morning");
  });
});
