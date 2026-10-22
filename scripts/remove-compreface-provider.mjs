import { rm } from "node:fs/promises";

const legacyFile = new URL("../src/modules/biometrics/face-recognition.provider.js", import.meta.url);
await rm(legacyFile, { force: true });
console.log("Removed the unused CompreFace provider. The face-api.js browser integration is now used instead.");
