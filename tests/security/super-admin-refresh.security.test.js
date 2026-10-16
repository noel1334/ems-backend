import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), "utf8");

describe("Super Admin refresh authentication", () => {
  it("allows company-less refresh only for an explicitly assigned system Super Admin", () => {
    const source = read("src/modules/auth/auth.service.js");

    expect(source).toContain('name: "SUPER_ADMIN", scope: "SYSTEM"');
    expect(source).toContain("const sessionUserIsSuperAdmin =");
    expect(source).toContain("session.user.companyId === null");
    expect(source).toContain("session.companyId === null");
    expect(source).toContain("await isSuperAdminUser(session.userId, tx)");
    expect(source).toContain("!session.user.company");
    expect(source).toContain("!sessionUserIsSuperAdmin");
    expect(source).toContain('session.user.company &&');
  });

  it("continues to reject company-less accounts without the Super Admin role", () => {
    const source = read("src/modules/auth/auth.service.js");
    expect(source).toContain('"Company account no longer exists"');
    expect(source).toContain('"COMPANY_NOT_FOUND"');
  });
});
