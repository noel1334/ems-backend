import { describe, expect, it } from "vitest";
import { INDUSTRY_ROLE_TEMPLATES, permissionMatchesRules } from "../../src/modules/platform/role-template-definitions.js";

describe("employee salary permissions in built-in role templates", () => {
  const templates = INDUSTRY_ROLE_TEMPLATES.filter((template) =>
    template.rules.some((rule) => rule.module === "payroll" && rule.resource === "salaries" && rule.actions.includes("CREATE")),
  );

  it("includes salary read, create, and update in payroll officer templates", () => {
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      for (const action of ["READ", "CREATE", "UPDATE"]) {
        expect(permissionMatchesRules({ module: "payroll", resource: "salaries", action }, template.rules), `${template.key} is missing payroll.salaries.${action}`).toBe(true);
      }
    }
  });
});
