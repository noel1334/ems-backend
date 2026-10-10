import fs from "node:fs";
import path from "node:path";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const required = [
  "src/modules/self-service/self-service.service.js",
  "src/modules/self-service/self-service.controller.js",
  "src/modules/self-service/self-service.routes.js",
];
const missing = required.filter((p) => !fs.existsSync(path.join(root, p)));
if (missing.length) { console.error("Missing:", missing); process.exit(1); }
console.log("Stage 25 self-service check: PASS");
