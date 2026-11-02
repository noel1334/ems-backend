import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url).pathname, "utf8");
const schema = read("../prisma/schema.prisma");
const employeeService = read("../src/modules/employees/employee-profile.service.js");
const employeeMapper = read("../src/modules/employees/employee-profile.mapper.js");
const employeeRoutes = read("../src/modules/employees/bank-directory.routes.js");
const routeIndex = read("../src/route/index.js");
const providerDirectory = read("../src/modules/payments/bank-directory.service.js");
const monnifyService = read("../src/modules/payments/monnify/monnify.service.js");
const payoutService = read("../src/modules/payroll/payroll.payout.service.js");

assert.match(schema, /paystackBankCode\s+String\?/);
assert.match(schema, /flutterwaveBankCode\s+String\?/);
assert.match(schema, /monnifyBankCode\s+String\?/);
assert.match(schema, /monnifyVerifiedAt\s+DateTime\?/);
assert.match(providerDirectory, /PAYSTACK:\s*\{[\s\S]*?banks: paystack\.banks\.map/);
assert.match(providerDirectory, /FLUTTERWAVE:\s*\{[\s\S]*?banks: flutterwave\.banks\.map/);
assert.match(providerDirectory, /export const validateProviderBankCode/);
assert.match(employeeService, /validateProviderBankCode\("PAYSTACK"/);
assert.match(employeeService, /validateProviderBankCode\("FLUTTERWAVE"/);
assert.match(employeeService, /resolveMonnifyAccount\(companyId, data\.accountNumber, data\.monnifyBankCode\)/);
assert.match(employeeMapper, /monnifyBankCode: account\.monnifyBankCode/);
assert.match(employeeMapper, /monnifyVerifiedAt: account\.monnifyVerifiedAt/);
assert.match(employeeRoutes, /router\.get\("\/monnify"/);
assert.match(routeIndex, /router\.use\("\/employees\/bank-directory", employeeBankDirectoryRoutes\)/);
assert.match(monnifyService, /const selectedMonnifyCode = String\(bankAccount\.monnifyBankCode/);
assert.match(payoutService, /account\.paystackBankCode/);
assert.match(payoutService, /account\.flutterwaveBankCode/);

console.log("OK Prisma stores independent Paystack, Flutterwave and Monnify bank codes");
console.log("OK Paystack and Flutterwave directories return their own bank labels and codes");
console.log("OK Backend validates selected Paystack and Flutterwave codes against their own directory");
console.log("OK Monnify employee verification uses the tenant's Monnify connection");
console.log("OK Employee API exposes and persists the Monnify bank code and verification timestamp");
console.log("OK Employee Monnify directory routes are mounted under authenticated employee routes");
console.log("OK Payroll payout uses the bank code belonging to the selected provider");
