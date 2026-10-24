import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
if (!fs.existsSync(path.join(root, "package.json")) ||
    !fs.existsSync(path.join(root, "prisma", "schema.prisma")) ||
    !fs.existsSync(path.join(root, "src", "modules", "payroll", "payroll.service.js"))) {
  console.error("Run from the EMS backend root (the folder containing package.json, prisma/schema.prisma, and src/modules/payroll).");
  process.exit(1);
}

const patchRoot = path.join(root, "patch-files");
const files = [
  "src/modules/payroll/payroll.validators.js",
  "src/modules/payroll/payroll.validation.js",
  "src/modules/payroll/payroll.service.js",
  "src/modules/payroll/payroll.controller.js",
  "src/modules/payroll/payroll.routes.js",
  "src/modules/payroll/payroll.mapper.js",
  "prisma/schema.prisma",
  "prisma/migrations/20261024090000_employee_salary_component_overrides/migration.sql",
  "tests/unit/payroll-employee-salaries.test.js",
  "EMPLOYEE_SALARIES_BACKEND_PHASE_V1.md",
];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(path.dirname(root), ".ems-patch-backups", `employee-salaries-phase-v1-${stamp}`);

for (const relative of files) {
  const source = path.join(patchRoot, relative);
  const target = path.join(root, relative);
  if (!fs.existsSync(source)) {
    console.error(`Patch file is missing: ${path.relative(root, source)}`);
    process.exit(1);
  }
}

for (const relative of files) {
  const source = path.join(patchRoot, relative);
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const backup = path.join(backupRoot, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }
  fs.copyFileSync(source, target);
}

console.log("EMS Employee Salaries Backend Phase V1 applied.");
console.log("Files updated:");
for (const relative of files) console.log(` - ${relative}`);
console.log(`Backups of existing files (outside the repository): ${backupRoot}`);
fs.rmSync(patchRoot, { recursive: true, force: true });
console.log("Temporary patch-files directory removed after application.");
console.log("Database migration added: prisma/migrations/20261024090000_employee_salary_component_overrides/migration.sql");
