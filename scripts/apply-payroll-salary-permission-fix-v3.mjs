import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const targets = [
  "prisma/seed.js",
  "src/modules/platform/role-template-definitions.js",
  "prisma/migrations/20261024113000_reconcile_payroll_salary_role_permissions/migration.sql",
  "scripts/diagnose-payroll-salary-read-permission.mjs",
];
for (const relative of targets) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing ${relative}. Extract the V3 ZIP into the EMS backend root, then rerun this script.`);
    process.exit(1);
  }
}

const edits = [
  {
    file: "prisma/seed.js",
    old: '{ module: "payroll", resource: "salaries", action: "CREATE", description: "Create employee salary records" },',
    updated: '{ module: "payroll", resource: "salaries", action: "CREATE", description: "Create employee salary records" },\n  { module: "payroll", resource: "salaries", action: "READ", description: "View employee salary assignments" },\n  { module: "payroll", resource: "salaries", action: "UPDATE", description: "Update employee salary assignments" },',
  },
  {
    file: "src/modules/platform/role-template-definitions.js",
    old: 'rule("payroll", "salaries", "CREATE")',
    updated: 'rule("payroll", "salaries", "READ", "CREATE", "UPDATE")',
  },
];

const changed = [];
for (const item of edits) {
  const full = path.join(root, item.file);
  const original = fs.readFileSync(full, "utf8");
  if (original.includes(item.updated)) {
    console.log(`Already applied: ${item.file}`);
    continue;
  }
  const count = original.split(item.old).length - 1;
  if (count !== 1) {
    console.error(`Refusing to modify ${item.file}: expected one matching permission entry, found ${count}. No changes have been written.`);
    process.exit(1);
  }
  changed.push({ file: item.file, full, content: original.replace(item.old, item.updated), original });
}

const backupRoot = path.join(os.homedir(), ".ems-patch-backups", `payroll-salary-permission-fix-v3-${new Date().toISOString().replace(/[:.]/g, "-")}`);
for (const item of changed) {
  const backup = path.join(backupRoot, item.file);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(item.full, backup);
  fs.writeFileSync(item.full, item.content, "utf8");
  console.log(`Updated ${item.file}; backup: ${backup}`);
}
console.log("V3 source updates applied. The migration reconciles permissions on active company-owned role snapshots when deployed.");
