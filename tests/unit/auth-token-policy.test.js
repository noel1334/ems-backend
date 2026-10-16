import { describe, expect, it } from "vitest";
import { hasValidTenantContext } from "../../src/middleware/auth-token-policy.js";

describe("access token tenant-context policy", () => {
  it("allows a company-less platform Super Admin token", () => {
    expect(hasValidTenantContext({ companyId: null, roles: ["SUPER_ADMIN"] })).toBe(true);
  });

  it("allows company users with a companyId", () => {
    expect(hasValidTenantContext({ companyId: "company-123", roles: ["COMPANY_ADMIN"] })).toBe(true);
  });

  it("rejects company-less tokens without the platform Super Admin role", () => {
    expect(hasValidTenantContext({ companyId: null, roles: ["COMPANY_ADMIN"] })).toBe(false);
    expect(hasValidTenantContext({ companyId: null, roles: [] })).toBe(false);
  });

  it("rejects malformed role claims instead of throwing", () => {
    expect(hasValidTenantContext({ companyId: null, roles: undefined })).toBe(false);
    expect(hasValidTenantContext({ companyId: null, roles: "SUPER_ADMIN" })).toBe(false);
    expect(hasValidTenantContext(null)).toBe(false);
  });
});
