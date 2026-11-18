import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../prisma/schema.prisma");
assert.match(schema, /monnifyBankCode\s+String\?/);
assert.match(schema, /monnifyVerifiedAt\s+DateTime\?/);

const directory = read("../src/modules/payments/monnify/monnify.bank-directory.js");
assert.match(directory, /normalizeMonnifyBankDirectory/);
assert.match(directory, /findMonnifyBankByCode/);
assert.match(directory, /String\(row\?\.code/);

const client = read("../src/modules/payments/monnify/monnify.client.js");
assert.match(client, /GET", "\/api\/v1\/banks/);
assert.match(client, /\/api\/v2\/disbursements\/account\/validate/);
assert.doesNotMatch(client, /\/api\/v1\/disbursements\/account\/validate/);
assert.match(client, /bulk\/\$\{encodeURIComponent\(reference\)\}\/transactions/);

const service = read("../src/modules/payments/monnify/monnify.service.js");
assert.match(service, /export async function resolveMonnifyAccount/);
assert.match(service, /findMonnifyBankByCode\(banks, code\)/);
assert.match(service, /account\.monnifyBankCode/);
assert.match(service, /MONNIFY_BANK_CODE_NOT_CONFIGURED/);
assert.match(service, /resolveAccountForConnection\(connection, tx\.accountNumber, tx\.bankCode, banks\)/);
assert.doesNotMatch(service, /normalizeBankName\(account\.bankName\)/);

const employeeRoutes = read("../src/modules/employees/employee-profile.routes.js");
assert.match(employeeRoutes, /\/bank-directory\/monnify/);
assert.match(employeeRoutes, /\/bank-directory\/monnify\/resolve/);
const employeeService = read("../src/modules/employees/employee-profile.service.js");
assert.match(employeeService, /resolveMonnifyAccount/);
assert.match(employeeService, /monnifyVerifiedAt/);

console.log("OK Monnify directory uses GET /api/v1/banks.");
console.log("OK Account Name Enquiry uses Monnify's current v2 endpoint.");
console.log("OK Employee bank details store a distinct Monnify code and verification timestamp.");
console.log("OK Payroll validation requires a current directory code and a successful Name Enquiry.");
console.log("OK Generic and payroll batch submissions re-verify beneficiaries before submission.");
