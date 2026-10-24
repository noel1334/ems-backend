import { describe, expect, it } from "vitest";
import {
  employeeSalarySchema,
  salaryListSchema,
  salaryStatusSchema,
  listSchema,
  validate,
} from "../../src/modules/payroll/payroll.validators.js";

const employeeId = "11111111-1111-4111-8111-111111111111";
const structureId = "22222222-2222-4222-8222-222222222222";

describe("Employee salary validation", () => {
  it("accepts employee-specific component overrides", () => {
    const result = employeeSalarySchema.parse({
      employeeId,
      structureId,
      basicSalary: 250000,
      effectiveFrom: "2026-11-01",
      componentOverrides: {
        HOUSING: { percentage: 18 },
        MEAL: { amount: 12500 },
        ABSENCE: { isActive: false },
      },
    });
    expect(result.componentOverrides.HOUSING.percentage).toBe(18);
    expect(result.componentOverrides.MEAL.amount).toBe(12500);
    expect(result.componentOverrides.ABSENCE.isActive).toBe(false);
  });

  it("rejects an effective-to date before effective-from", () => {
    const result = employeeSalarySchema.safeParse({
      employeeId,
      structureId,
      basicSalary: 250000,
      effectiveFrom: "2026-11-10",
      effectiveTo: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });

  it("validates query filters and salary status transitions", () => {
    expect(salaryListSchema.parse({ page: "2", limit: "50", status: "ACTIVE" }).page).toBe(2);
    expect(salaryStatusSchema.parse({ status: "INACTIVE" }).status).toBe("INACTIVE");
    expect(salaryStatusSchema.safeParse({ status: "DELETED" }).success).toBe(false);
  });

  it("does not try to assign to Express 5's read-only req.query", () => {
    const req = {};
    Object.defineProperty(req, "query", { get: () => ({ page: "2", limit: "50" }) });
    let nextCalled = false;
    const res = {
      status() { return this; },
      json() { throw new Error("The valid query should not return a validation error."); },
    };
    validate(listSchema, "query")(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.validatedQuery.page).toBe(2);
  });
});
