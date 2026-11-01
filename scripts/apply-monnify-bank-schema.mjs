import fs from "node:fs";
import path from "node:path";

const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
if (!fs.existsSync(schemaPath)) throw new Error("Run this script from the EMS backend repository root.");
let schema = fs.readFileSync(schemaPath, "utf8");
const modelMatch = schema.match(/model EmployeeBankAccount \{[\s\S]*?\n\}/);
if (!modelMatch) throw new Error("Could not find model EmployeeBankAccount in prisma/schema.prisma.");
let model = modelMatch[0];
const additions = [];
if (!/\bmonnifyBankCode\s+String\?/.test(model)) additions.push("  monnifyBankCode     String?");
if (!/\bmonnifyVerifiedAt\s+DateTime\?/.test(model)) additions.push("  monnifyVerifiedAt   DateTime?");
if (!additions.length) {
  console.log("OK Monnify employee bank fields already exist; schema unchanged.");
  process.exit(0);
}
const anchor = /(^\s*flutterwaveBankCode\s+String\?\s*$)/m;
if (!anchor.test(model)) throw new Error("Could not find flutterwaveBankCode field in EmployeeBankAccount; schema left unchanged.");
model = model.replace(anchor, (line) => `${line}\n${additions.join("\n")}`);
schema = schema.replace(modelMatch[0], model);
fs.writeFileSync(schemaPath, schema);
console.log(`OK Added ${additions.map((line) => line.trim().split(/\s+/)[0]).join(" and ")} to EmployeeBankAccount.`);
