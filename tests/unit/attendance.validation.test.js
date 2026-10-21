import { describe, expect, it } from "vitest";
import { attendanceEventQuerySchema, correctionSchema } from "../../src/modules/attendance/attendance.validation.js";

describe("Attendance request validation", () => {
  it("applies safe defaults to attendance event queries", () => {
    const result = attendanceEventQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortOrder).toBe("desc");
    }
  });

  it("accepts supported event filters and converts date strings", () => {
    const result = attendanceEventQuerySchema.safeParse({
      page: "2",
      limit: "50",
      from: "2026-10-01",
      to: "2026-10-21",
      type: "CHECK_IN",
      source: "WEB",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
      expect(result.data.from).toBeInstanceOf(Date);
      expect(result.data.type).toBe("CHECK_IN");
    }
  });

  it("rejects unsupported event types and excessive page sizes", () => {
    expect(attendanceEventQuerySchema.safeParse({ type: "UNKNOWN" }).success).toBe(false);
    expect(attendanceEventQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("requires a reason when correcting attendance", () => {
    expect(correctionSchema.safeParse({ reason: "Clock missed" }).success).toBe(true);
    expect(correctionSchema.safeParse({}).success).toBe(false);
  });
});
