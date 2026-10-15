import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

describe("Super Admin and Company Admin separation", () => {
  it("requires explicit company scope before listing or reading company users", () => {
    const source = read("src/modules/users/user.service.js");
    expect(source).toContain("const requireCompanyScope");
    expect(source).toContain("requireCompanyScope(companyId);");
    expect(source.match(/requireCompanyScope\(companyId\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps platform routes behind the Super Admin guard", () => {
    const routes = read("src/modules/platform/platform.routes.js");
    const guard = read("src/middleware/super-admin.middleware.js");
    expect(routes).toContain("router.use(authenticate, requireSuperAdmin)");
    expect(guard).toContain("user.companyId !== null");
    expect(guard).toContain('scope: "SYSTEM", name: "SUPER_ADMIN"');
  });

  it("keeps platform role recovery scoped to company-owned roles", () => {
    const service = read("src/modules/platform/platform.service.js");
    expect(service).toContain("export const assignTenantUserRoles");
    expect(service).toContain('scope: "COMPANY"');
    expect(service).toContain('name: { not: "SUPER_ADMIN" }');
  });

  it("does not recreate demo accounts in production without explicit opt-in", () => {
    const source = read("src/bootstrap/demo-bootstrap.js");
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("ALLOW_DEMO_BOOTSTRAP_IN_PRODUCTION");
  });
});
