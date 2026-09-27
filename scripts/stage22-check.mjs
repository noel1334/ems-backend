import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const files = [
  "src/modules/biometrics/fingerprint.provider.js",
  "src/modules/biometrics/fingerprint.service.js",
  "src/modules/biometrics/fingerprint.controller.js",
  "src/modules/biometrics/fingerprint.validation.js",
  "prisma/migrations/20260920090000_fingerprint_hardening/migration.sql",
];
for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
const routes = fs.readFileSync(path.join(root, "src/modules/biometrics/biometric.routes.js"), "utf8");
for (const route of ["/fingerprint/enroll", "/fingerprint/verify-and-attend"]) {
  if (!routes.includes(route)) throw new Error(`Missing route ${route}`);
}
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
for (const field of ["finger String?", "templateFormat String?", "qualityScore Decimal?"]) {
  if (!schema.includes(field)) throw new Error(`Missing schema field ${field}`);
}
console.log("Stage 22 check passed: fingerprint enrollment, device verification, attendance route, and schema hardening are present.");
