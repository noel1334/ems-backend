import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const required = [
  "prisma/seed.js",
  "src/modules/platform/role-template-definitions.js",
  "prisma/migrations/20261024100000_payroll_salary_read_update_permissions/migration.sql",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing ${relative}. Extract the patch ZIP into the EMS backend root, then rerun this script.`);
    process.exit(1);
  }
}

const changes = new Map();
function patchOne(relative, oldSnippet, newSnippet, label) {
  const full = path.join(root, relative);
  const source = changes.get(relative) ?? fs.readFileSync(full, "utf8");
  if (source.includes(newSnippet)) {
    changes.set(relative, source);
    console.log(`Already applied: ${label}`);
    return;
  }
  const count = source.split(oldSnippet).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one matching source location, found ${count}. No source files have been written. Review ${relative} before retrying.`);
  }
  changes.set(relative, source.replace(oldSnippet, newSnippet));
}

try {
  patchOne(
    "prisma/seed.js",
    '{ module: "payroll", resource: "salaries", action: "CREATE", description: "Create employee salary records" },',
    '{ module: "payroll", resource: "salaries", action: "CREATE", description: "Create employee salary records" },\n  { module: "payroll", resource: "salaries", action: "READ", description: "View employee salary assignments" },\n  { module: "payroll", resource: "salaries", action: "UPDATE", description: "Update employee salary assignment status" },',
    "seed salary READ/UPDATE permissions",
  );
  patchOne(
    "src/modules/platform/role-template-definitions.js",
    'rule("payroll", "salaries", "CREATE")',
    'rule("payroll", "salaries", "READ", "CREATE", "UPDATE")',
    "payroll officer template salary permissions",
  );
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}

const changed = [...changes].filter(([relative, content]) => content !== fs.readFileSync(path.join(root, relative), "utf8"));
if (!changed.length) {
  console.log("Payroll salary permissions patch is already applied. Migration is ready to deploy.");
  process.exit(0);
}
const backupRoot = path.join(os.homedir(), ".ems-patch-backups", `payroll-salary-permission-fix-v2-${new Date().toISOString().replace(/[:.]/g, "-")}`);
for (const [relative, content] of changed) {
  const target = path.join(root, relative);
  const backup = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
  fs.writeFileSync(target, content, "utf8");
  console.log(`Updated ${relative} (backup: ${backup})`);
}
console.log("Applied payroll salary permission fix. Existing company-role snapshots and published template versions are repaired by the migration.");
