import fs from "node:fs";
import path from "node:path";

const required = [
  "src/modules/biometrics/face-recognition.provider.js",
  "src/modules/biometrics/face.service.js",
  "src/modules/biometrics/face.controller.js",
  "src/modules/biometrics/biometric.routes.js",
  "COMPRE_FACE_SETUP.md",
];
const missing = required.filter((f) => !fs.existsSync(path.resolve(f)));
if (missing.length) {
  console.error("Stage 21 check failed:", missing);
  process.exit(1);
}
console.log("Stage 21 check passed: facial recognition enrollment and recognition routes are present.");
