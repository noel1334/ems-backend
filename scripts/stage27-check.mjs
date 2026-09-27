import fs from "node:fs";
import path from "node:path";
const root = new URL("..", import.meta.url).pathname;
const required = [
  "src/modules/notifications/notification.service.js",
  "src/modules/notifications/notification.controller.js",
  "src/modules/notifications/notification.routes.js",
  "prisma/migrations/20260920120000_notifications/migration.sql",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) { console.error("Missing:", missing); process.exit(1); }
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
if (!schema.includes("model Notification") || !schema.includes("notifications Notification[]")) process.exit(1);
const routes = fs.readFileSync(path.join(root, "src/route/index.js"), "utf8");
if (!routes.includes('router.use("/notifications", notificationRoutes)')) process.exit(1);
console.log("Stage 27 notification check: PASS");
