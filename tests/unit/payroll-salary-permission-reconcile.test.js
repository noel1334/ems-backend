import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../prisma/migrations/20261024113000_reconcile_payroll_salary_role_permissions/migration.sql", import.meta.url),
  "utf8",
);

describe("payroll salary permission reconciliation migration", () => {
  it("upserts salary READ and UPDATE and limits grants to tenant-owned roles", () => {
    expect(migration).toContain("'payroll', 'salaries', 'READ'");
    expect(migration).toContain("'payroll', 'salaries', 'UPDATE'");
    expect(migration).toContain('role."companyId" IS NOT NULL');
    expect(migration).toContain("'COMPANY'::\"RoleScope\"");
    expect(migration).toContain('ON CONFLICT ("roleId", "permissionId") DO NOTHING');
    expect(migration).not.toMatch(/INSERT INTO "role_permissions"[\s\S]{0,100}role\."companyId" IS NULL/);
  });

  it("reconciles older tenant-role snapshots from published templates without rewriting old versions", () => {
    expect(migration).toContain("'SUPERSEDED'");
    expect(migration).toContain("'PUBLISHED'");
    expect(migration).toContain('role."sourceTemplateId"');
    expect(migration).toContain('template_permission."action" IN');
  });
});
