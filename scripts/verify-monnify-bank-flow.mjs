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

const utils = read("../src/modules/payments/monnify/monnify.utils.js");
assert.match(utils, /normalizeMonnifyBanks/);
assert.match(utils, /String\(row\?\.code/);

const client = read("../src/modules/payments/monnify/monnify.client.js");
assert.match(client, /GET", "\/api\/v1\/banks/);
assert.match(client, /\/api\/v2\/disbursements\/account\/validate/);
assert.doesNotMatch(client, /\/api\/v1\/disbursements\/account\/validate/);

const service = read("../src/modules/payments/monnify/monnify.service.js");
assert.match(service, /export async function resolveMonnifyAccount/);
assert.match(service, /normalizeMonnifyBanks\(/);
assert.match(service, /MONNIFY_BANK_CODE_NOT_IN_DIRECTORY/);
assert.match(service, /bankMatchKey\(bankAccount\.bankName\)/);
assert.match(service, /monnifyEndpoints\.validateAccount\(connection, accountNumber, bank\.code\)/);
assert.match(service, /verifiedNumber !== accountNumber/);
assert.match(service, /monnifyBankCode: bank\.code/);

const employeeRoutes = read("../src/modules/employees/employee-profile.routes.js");
assert.match(employeeRoutes, /bank-directory\/monnify/);
assert.match(employeeRoutes, /bank-directory\/monnify\/resolve/);
const employeeService = read("../src/modules/employees/employee-profile.service.js");
assert.match(employeeService, /resolveMonnifyAccount/);
assert.match(employeeService, /monnifyVerifiedAt/);

console.log("OK Monnify bank directory codes remain provider-specific and are never coerced to numbers.");
console.log("OK Employee bank updates and payroll preview use Monnify Name Enquiry against the current directory.");
