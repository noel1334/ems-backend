import { describe, expect, it } from "vitest";
import { isReservedSystemRoleName, isTenantAssignablePermission } from "../../src/modules/rbac/rbac.policy.js";

describe("tenant RBAC policy", () => {
  it("reserves platform and seeded role names independent of case and spacing", () => {
    expect(isReservedSystemRoleName("SUPER_ADMIN")).toBe(true);
    expect(isReservedSystemRoleName("super admin")).toBe(true);
    expect(isReservedSystemRoleName("Company Admin")).toBe(true);
    expect(isReservedSystemRoleName("Nursing Manager")).toBe(false);
  });

  it("allows tenant-operational permissions from the central catalogue", () => {
    expect(isTenantAssignablePermission({ module: "employees", resource: "employees", action: "READ", isActive: true })).toBe(true);
    expect(isTenantAssignablePermission({ module: "inventory", resource: "transactions", action: "CREATE", isActive: true })).toBe(true);
  });

  it("blocks platform settings and tenant creation/deletion capabilities", () => {
    expect(isTenantAssignablePermission({ module: "system", resource: "settings", action: "UPDATE", isActive: true })).toBe(false);
    expect(isTenantAssignablePermission({ module: "company", resource: "company", action: "CREATE", isActive: true })).toBe(false);
    expect(isTenantAssignablePermission({ module: "company", resource: "company", action: "DELETE", isActive: true })).toBe(false);
    expect(isTenantAssignablePermission({ module: "employees", resource: "employees", action: "READ", isActive: false })).toBe(false);
  });
});
