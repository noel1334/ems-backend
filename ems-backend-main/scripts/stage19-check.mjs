import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const required = [
  "src/modules/scheduling/scheduling.validation.js",
  "src/modules/scheduling/scheduling.service.js",
  "src/modules/scheduling/scheduling.controller.js",
  "src/modules/scheduling/scheduling.routes.js",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) { console.error("Missing Stage 19 files:", missing); process.exit(1); }
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
for (const token of ["model SchedulingPolicy", "model ScheduleGeneration", "model ScheduleGenerationAssignment", "enum SchedulingMode", "enum LeaveSchedulingMode"]) {
  if (!schema.includes(token)) { console.error("Missing schema token:", token); process.exit(1); }
}
const route = fs.readFileSync(path.join(root, "src/route/index.js"), "utf8");
if (!route.includes('router.use("/scheduling", schedulingRoutes)')) { console.error("Scheduling route is not mounted"); process.exit(1); }
console.log("Stage 19 static check: PASS");
