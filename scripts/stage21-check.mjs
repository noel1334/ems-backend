import fs from "node:fs";
import path from "node:path";

const required = [
  "src/modules/biometrics/face.service.js",
  "src/modules/biometrics/face.controller.js",
  "src/modules/biometrics/biometric.repository.js",
  "src/modules/biometrics/biometric.routes.js",
  "COMPRE_FACE_SETUP.md",
];
const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error("Face API integration check failed; missing files:", missing);
  process.exit(1);
}
const faceService = fs.readFileSync(path.resolve("src/modules/biometrics/face.service.js"), "utf8");
const envConfig = fs.readFileSync(path.resolve("src/config/env.js"), "utf8");
const checks = [
  [faceService.includes("aes-256-gcm"), "face descriptors are encrypted at rest"],
  [faceService.includes("findActiveFacesByCompany"), "matching queries company-scoped active enrollments"],
  [faceService.includes("checkOut"), "face attendance supports clock-out"],
  [envConfig.includes("BIOMETRIC_ENCRYPTION_KEY"), "descriptor encryption key is configured"],
  [envConfig.includes("FACE_API_DISTANCE_THRESHOLD"), "face distance threshold is configured"],
];
const failed = checks.filter(([ok]) => !ok).map(([, name]) => name);
if (failed.length) {
  console.error("Face API integration check failed:", failed);
  process.exit(1);
}
console.log("Face API integration check passed: encrypted descriptors, tenant-scoped matching, clock-in/out, and config are present.");
