import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const required=[
 "src/modules/attendance-devices/device.service.js",
 "src/modules/attendance-devices/device.middleware.js",
 "src/modules/attendance-devices/device.controller.js",
 "src/modules/attendance-devices/device.routes.js",
 "prisma/migrations/20260920100000_attendance_device_credentials/migration.sql",
 "DEVICE_GATEWAY_SETUP.md"
];
const missing=required.filter(x=>!fs.existsSync(path.join(root,x)));
if(missing.length){console.error("Missing:",missing);process.exit(1)}
console.log("Stage 23 device gateway check: PASS");
