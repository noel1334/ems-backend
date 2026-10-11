import fs from "node:fs";
import path from "node:path";

const required = [
  "src/middleware/auth.middleware.js",
  "src/middleware/tenant.middleware.js",
  "src/common/utils/audit.js",
  "src/modules/payments/payment.service.js",
  "src/modules/wallet/wallet.service.js",
  "src/modules/biometrics/biometric.service.js",
  "src/modules/auth/auth.service.js",
];
for (const file of required) {
  if (!fs.existsSync(path.resolve(file))) throw new Error(`Missing security component: ${file}`);
}
const schema = fs.readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
for (const marker of ["model AuthToken", "idempotencyKey String?", "model AuditLog", "model UserSession"]) {
  if (!schema.includes(marker)) throw new Error(`Missing schema security marker: ${marker}`);
}
console.log("Stage 18 security implementation check: PASS");
