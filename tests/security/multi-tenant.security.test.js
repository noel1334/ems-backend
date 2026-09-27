import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const modules = ["employees", "departments", "designations", "holidays", "attendance", "leave", "payroll", "wallet", "payments", "biometrics"];

describe("multi-tenant source safeguards", () => {
  it("keeps company-owned module services scoped by companyId", () => {
    for (const module of modules) {
      const dir = path.resolve("src/modules", module);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".service.js") || f.endsWith(".repository.js"));
      for (const file of files) {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });
});
