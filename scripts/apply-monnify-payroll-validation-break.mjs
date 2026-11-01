import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/modules/payments/monnify/monnify.service.js");
if (!fs.existsSync(file)) {
  throw new Error("Run this script from the EMS backend repository root. Monnify service file was not found.");
}

let source = fs.readFileSync(file, "utf8");
const breakSetting = /onValidationFailure\s*:\s*["']BREAK["']/;
const continueSetting = /onValidationFailure\s*:\s*["']CONTINUE["']/g;

if (breakSetting.test(source)) {
  console.log('OK Monnify payroll batch already uses onValidationFailure: "BREAK".');
  process.exit(0);
}

const matches = source.match(continueSetting) || [];
if (matches.length !== 1) {
  throw new Error(`Expected exactly one CONTINUE setting in ${path.relative(process.cwd(), file)}; found ${matches.length}. No changes were saved.`);
}

source = source.replace(continueSetting, 'onValidationFailure: "BREAK"');
fs.writeFileSync(file, source);

if (!breakSetting.test(source)) {
  throw new Error("The Monnify batch validation setting could not be verified after writing.");
}
console.log('OK Changed Monnify payroll batch validation from CONTINUE to BREAK.');
