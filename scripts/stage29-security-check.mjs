import fs from "node:fs";
import { execFileSync } from "node:child_process";

const required = [
  "src/middleware/security-hardening.middleware.js",
  "src/config/env.js",
  "src/modules/attendance-devices/device.service.js",
  "src/modules/attendance-devices/device.routes.js",
  "src/modules/attendance-devices/device.controller.js",
  "STAGE29_SECURITY.md",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const files = [];
const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${entry.name}`; if (entry.isDirectory() && !["node_modules", ".git"].includes(entry.name)) walk(p); else if (entry.isFile() && p.endsWith(".js")) files.push(p); } };
walk("src");
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "ignore" });
console.log(`Stage 29 security check passed: ${files.length} JS files syntax-checked.`);
