import fs from "node:fs";
import path from "node:path";

const required = [
  "src/modules/attendance-engine/attendance-engine.service.js",
  "src/modules/attendance-engine/attendance-engine.controller.js",
  "src/modules/attendance-engine/attendance-engine.routes.js",
  "src/modules/attendance-engine/attendance-engine.validation.js",
  "prisma/migrations/20260920110000_attendance_engine_hardening/migration.sql",
];

const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error("Stage 24 check failed:", missing);
  process.exit(1);
}

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
for (const field of ["earlyDepartureMinutes Int @default(0)", "overtimeMinutes Int @default(0)"]) {
  if (!schema.includes(field)) throw new Error(`Missing attendance field: ${field}`);
}

const routes = fs.readFileSync("src/route/index.js", "utf8");
if (!routes.includes('/attendance-engine')) throw new Error("Attendance engine route is not mounted");

console.log("Stage 24 attendance engine check: PASS");
