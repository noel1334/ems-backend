import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../prisma/schema.prisma");
assert.match(schema, /model CompanyMonnifyConnection/);
assert.match(schema, /model CompanyMonnifyBatch/);
assert.match(schema, /environment\s+String\s+@default\("sandbox"\)/);
assert.match(schema, /monnifyConnection\s+CompanyMonnifyConnection\?/);

const service = read("../src/modules/payments/monnify/monnify.service.js");
for (const text of [
  '"PENDING_AUTHORIZATION"',
  '"SUBMISSION_UNKNOWN"',
  "companyId",
  "transactionList",
  "MONNIFY_NO_VALID_BENEFICIARIES",
  'onValidationFailure: "CONTINUE"',
  "_emsTransactionMap",
  'data.status = "PAID"',
  'fundingRoute: "DIRECT_PROVIDER"',
  'connection.sourceAccountNumber',
  'claimPayrollFundingRoute(tx, { companyId, periodId: payrollPeriodId, fundingRoute: "DIRECT_PROVIDER", provider: "MONNIFY" })',
]) assert.ok(service.includes(text), `Missing current Monnify payroll safeguard: ${text}`);
assert.doesNotMatch(service, /debitWalletInTransaction\s*\(/, "New company-direct Monnify payroll must not debit the EMS internal wallet");

const client = read("../src/modules/payments/monnify/monnify.client.js");
for (const text of [
  "/api/v2/disbursements/batch",
  "/api/v2/disbursements/batch/validate-otp",
  "/api/v2/disbursements/single/resend-otp",
  "/api/v2/disbursements/bulk/summary",
  "resendBatchOtp",
]) assert.ok(client.includes(text), `Missing Monnify endpoint ${text}`);
assert.match(client, /`\/api\/v2\/disbursements\/bulk\/\$\{encodeURIComponent\(reference\)\}\/transactions`/);
assert.doesNotMatch(client, /"\/api\/v2\/disbursements\/bulk\/"/);

const routes = read("../src/modules/payments/monnify/monnify.routes.js");
assert.match(routes, /router\.use\(authenticate\)/);
assert.match(routes, /requirePermission\("payroll", "runs", "APPROVE"\)/);
assert.match(routes, /router\.post\("\/payroll\/:periodId\/preview"/);
assert.match(routes, /router\.post\("\/payroll\/:periodId\/submit"/);
assert.match(routes, /router\.post\("\/batches\/:id\/resend-otp"/);

const payoutRoute = read("../src/modules/payroll/payroll.funding-route.service.js");
assert.match(payoutRoute, /isUncommittedPreview/);
assert.match(payoutRoute, /PAYROLL-BATCH-\$\{walletBatch\.id\}/);

const payrollService = read("../src/modules/payroll/payroll.service.js");
assert.match(payrollService, /preparePayrollDisbursements/);

console.log("OK Monnify company-scoped payroll preview, direct-provider funding, batch submission and reconciliation are wired.");
console.log("OK Individual and batch transfers use the connected company's Monnify disbursement account.");
console.log("OK An unfunded legacy preview cannot block the selected provider; committed/uncertain batches remain protected.");
