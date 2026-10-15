import { describe, expect, it } from "vitest";
import { INDUSTRY_ROLE_TEMPLATES, permissionMatchesRules } from "../../src/modules/platform/role-template-definitions.js";

const tenantPermission = (module, resource, action) => ({ module, resource, action, isActive: true });

describe("versioned industry role templates", () => {
  it("uses stable unique template keys and covers multiple industries", () => {
    const keys = INDUSTRY_ROLE_TEMPLATES.map(({ key }) => key);
    expect(keys.length).toBeGreaterThanOrEqual(40);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(INDUSTRY_ROLE_TEMPLATES.map(({ industry }) => industry)).size).toBeGreaterThanOrEqual(15);
  });

  it("matches only the specified module, resource, and allowed actions", () => {
    const rules = [{ module: "inventory", resource: "transactions", actions: ["READ", "APPROVE"] }];
    expect(permissionMatchesRules(tenantPermission("inventory", "transactions", "READ"), rules)).toBe(true);
    expect(permissionMatchesRules(tenantPermission("inventory", "transactions", "APPROVE"), rules)).toBe(true);
    expect(permissionMatchesRules(tenantPermission("inventory", "transactions", "DELETE"), rules)).toBe(false);
    expect(permissionMatchesRules(tenantPermission("platform", "tenants", "DELETE"), rules)).toBe(false);
  });
});
