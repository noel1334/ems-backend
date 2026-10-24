import { describe, expect, it } from "vitest";
import { getSalaryPermissionRepairPlan } from "../../src/modules/rbac/payroll-salary-permission-policy.js";

const companyRole = (overrides = {}) => ({
  id: "role-1",
  companyId: "company-1",
  name: "Payroll Officer",
  scope: "COMPANY",
  isActive: true,
  permissions: [],
  ...overrides,
});

const salaryGrant = (action, isActive = true) => ({
  permission: { module: "payroll", resource: "salaries", action, isActive },
});

describe("payroll salary permission repair policy", () => {
  it("repairs READ for active tenant roles already allowed to write salaries", () => {
    expect(getSalaryPermissionRepairPlan(companyRole({ permissions: [salaryGrant("CREATE")] })))
      .toEqual({ grantRead: true, grantUpdate: true });
    expect(getSalaryPermissionRepairPlan(companyRole({ permissions: [salaryGrant("UPDATE")] })))
      .toEqual({ grantRead: true, grantUpdate: false });
  });

  it("repairs core company and finance admin roles", () => {
    expect(getSalaryPermissionRepairPlan(companyRole({ name: "company-admin" })))
      .toEqual({ grantRead: true, grantUpdate: true });
    expect(getSalaryPermissionRepairPlan(companyRole({ name: "FINANCE_ADMIN" })))
      .toEqual({ grantRead: true, grantUpdate: true });
  });

  it("uses the latest published template's salary permissions", () => {
    expect(getSalaryPermissionRepairPlan(companyRole(), ["READ"]))
      .toEqual({ grantRead: true, grantUpdate: false });
    expect(getSalaryPermissionRepairPlan(companyRole(), ["CREATE"]))
      .toEqual({ grantRead: true, grantUpdate: true });
    expect(getSalaryPermissionRepairPlan(companyRole(), ["UPDATE"]))
      .toEqual({ grantRead: false, grantUpdate: true });
  });

  it("never grants salary permissions to global roles or inactive roles", () => {
    expect(getSalaryPermissionRepairPlan(companyRole({ companyId: null, scope: "SYSTEM" }), ["CREATE"]))
      .toEqual({ grantRead: false, grantUpdate: false });
    expect(getSalaryPermissionRepairPlan(companyRole({ isActive: false, permissions: [salaryGrant("CREATE")] })))
      .toEqual({ grantRead: false, grantUpdate: false });
    expect(getSalaryPermissionRepairPlan(companyRole({ permissions: [salaryGrant("CREATE", false)] })))
      .toEqual({ grantRead: false, grantUpdate: false });
  });

  it("does not grant salaries access to an unrelated employee role", () => {
    expect(getSalaryPermissionRepairPlan(companyRole({ name: "EMPLOYEE" })))
      .toEqual({ grantRead: false, grantUpdate: false });
  });
});
