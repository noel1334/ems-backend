import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

describe("Super Admin tenant resource management", () => {
  it("keeps cross-tenant employee, department and designation routes behind the platform guard", () => {
    const routes = read("src/modules/platform/platform.routes.js");
    expect(routes).toContain("router.use(authenticate, requireSuperAdmin)");
    for (const resource of ["employees", "departments", "designations"]) {
      expect(routes).toContain(`/tenants/:id/${resource}`);
    }
  });

  it("always resolves a target tenant and passes its id into tenant-scoped services", () => {
    const controller = read("src/modules/platform/platform.resources.controller.js");
    expect(controller).toContain("await platformService.getTenant(companyId)");
    expect(controller).toContain("const companyId = (req) => req.params.id");
    expect(controller).toContain("companyId: companyId(req)");
  });

  it("does not loosen normal tenant middleware for companyless platform accounts", () => {
    const middleware = read("src/middleware/tenant.middleware.js");
    expect(middleware).toContain('"TENANT_NOT_FOUND"');
    expect(middleware).toContain("if (!companyId)");
    expect(middleware).toContain("req.tenant = {");
  });
});
