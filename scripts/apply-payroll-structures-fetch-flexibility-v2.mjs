import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const payroll = path.join(root, "src/modules/payroll");
const required = [
  path.join(root, "package.json"),
  path.join(payroll, "payroll.validators.js"),
  path.join(payroll, "payroll.validation.js"),
  path.join(payroll, "payroll.controller.js"),
];
if (required.some((file) => !fs.existsSync(file))) {
  console.error("Run from the EMS backend root (the folder containing package.json and src/modules/payroll).");
  process.exit(1);
}

const changes = new Map();
const read = (file) => fs.readFileSync(file, "utf8");
const replaceRequired = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) throw new Error(`Could not locate safe patch anchor: ${label}`);
  return source.replace(oldText, newText);
};

for (const name of ["payroll.validators.js", "payroll.validation.js"]) {
  const file = path.join(payroll, name);
  let source = read(file);
  source = replaceRequired(
    source,
    "  req[source] = result.data;\n  next();",
    `  // Express 5 exposes req.query through a getter without a setter.\n  // Storing the parsed query separately avoids a 500 on payroll list endpoints.\n  if (source === "query") {\n    req.validatedQuery = result.data;\n  } else {\n    req[source] = result.data;\n  }\n  next();`,
    `${name}: validation target assignment`,
  );
  changes.set(file, source);
}

{
  const file = path.join(payroll, "payroll.controller.js");
  let source = read(file);
  source = replaceRequired(
    source,
    "listStructures(getCompanyId(req), req.query)",
    "listStructures(getCompanyId(req), req.validatedQuery ?? req.query)",
    "payroll controller: structures query",
  );
  source = replaceRequired(
    source,
    "listPeriods(getCompanyId(req), req.query)",
    "listPeriods(getCompanyId(req), req.validatedQuery ?? req.query)",
    "payroll controller: periods query",
  );
  changes.set(file, source);
}

const testFile = path.join(root, "tests/unit/payroll-structure-query-validation.test.js");
const testContent = `import { describe, expect, it, vi } from "vitest";
import { listSchema, validate } from "../../src/modules/payroll/payroll.validators.js";

describe("payroll list query validation on Express 5", () => {
  it("stores parsed query data without assigning to getter-only req.query", () => {
    const request = Object.create({
      get query() { return { page: "2", limit: "50", search: "Engineering" }; },
    });
    const response = {};
    const next = vi.fn();

    expect(() => validate(listSchema, "query")(request, response, next)).not.toThrow();
    expect(request.validatedQuery).toEqual({ page: 2, limit: 50, search: "Engineering" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns a 400 for invalid list parameters", () => {
    const request = Object.create({ get query() { return { page: "0", limit: "999" }; } });
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    validate(listSchema, "query")(request, response, next);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });
});
`;
if (fs.existsSync(testFile)) {
  const existing = read(testFile);
  if (!existing.includes("getter-only req.query")) changes.set(testFile, testContent);
} else {
  changes.set(testFile, testContent);
}

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ems-payroll-structures-query-v2-"));
for (const [file, content] of changes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const relative = path.relative(root, file).replaceAll(path.sep, "__");
    fs.copyFileSync(file, path.join(backupDir, relative));
  }
  fs.writeFileSync(file, content);
}
console.log("Payroll Structures fetch fix V2 applied.");
console.log("Updated:", [...changes.keys()].map((file) => path.relative(root, file)).join(", "));
console.log(`Backup copies of existing files: ${backupDir}`);
console.log("No Prisma schema changes are required for this query-validation fix.");
