import fs from "node:fs";
import assert from "node:assert/strict";
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const service = read("../src/modules/payments/monnify/monnify.service.js");
const controller = read("../src/modules/payments/monnify/monnify.controller.js");
const client = read("../src/modules/payments/monnify/monnify.client.js");
const routes = read("../src/modules/payments/monnify/monnify.routes.js");
const payrollService = read("../src/modules/payroll/payroll.service.js");
for (const name of ["previewPayroll", "submitPayroll", "refreshPayrollBatch"]) {
  assert.match(service, new RegExp(`export async function ${name}\\(`), `Missing Monnify payroll service ${name}`);
  assert.ok(controller.includes(`service.${name}(`), `Controller is not wired to ${name}`);
}
for (const text of ["payrollDisbursement.findMany", "bankAccounts", "previewFingerprint", "MONNIFY_PREVIEW_STALE", "disbursementBalance", "MONNIFY_INSUFFICIENT_BALANCE", "destinationAccountName", 'onValidationFailure: "CONTINUE"', "_emsTransactionMap", 'data.status = "PAID"']) {
  assert.ok(service.includes(text), `Missing payroll automation safeguard: ${text}`);
}
for (const text of ["/api/v2/disbursements/batch", "/api/v2/disbursements/batch/validate-otp", "/api/v2/disbursements/single/resend-otp", "/api/v2/disbursements/bulk/summary", "resendBatchOtp"]) {
  assert.ok(client.includes(text), `Missing Monnify endpoint ${text}`);
}
assert.match(client, /`\/api\/v2\/disbursements\/bulk\/\$\{encodeURIComponent\(reference\)\}\/transactions`/);
assert.doesNotMatch(client, /"\/api\/v2\/disbursements\/bulk\/"/);
assert.match(routes, /router\.post\("\/payroll\/:periodId\/preview"/);
assert.match(routes, /router\.post\("\/payroll\/:periodId\/submit"/);
assert.match(routes, /router\.post\("\/batches\/:id\/resend-otp"/);
assert.ok(service.includes("export async function resendBatchOtp("), "Missing OTP resend service");
assert.match(payrollService, /preparePayrollDisbursements/);
console.log("OK payroll-backed Monnify preview, submission, OTP authorization and transaction reconciliation are wired.");
