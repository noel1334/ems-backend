import fs from "node:fs";
import assert from "node:assert/strict";
const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

const client = read("../src/modules/payments/monnify/monnify.client.js");
const service = read("../src/modules/payments/monnify/monnify.service.js");
const controller = read("../src/modules/payments/monnify/monnify.controller.js");
const fundingRoute = read("../src/modules/payroll/payroll.funding-route.service.js");

assert.ok(client.includes('"/api/v2/disbursements/batch"'), "Bulk transfer submit endpoint is missing");
assert.ok(client.includes('"/api/v2/disbursements/batch/validate-otp"'), "Bulk transfer OTP authorization endpoint is missing");
assert.ok(client.includes('"/api/v2/disbursements/single/resend-otp"'), "Documented bulk OTP resend endpoint is missing");
assert.ok(!client.includes('"/api/v2/disbursements/batch/resend-otp"'), "Do not use the undocumented batch/resend-otp endpoint");
assert.ok(client.includes('"/api/v2/disbursements/single"'), "Individual transfer endpoint is missing");
assert.ok(client.includes('"/api/v2/disbursements/single/validate-otp"'), "Individual transfer OTP authorization endpoint is missing");

for (const marker of [
  "monnify_payroll_batch_submit_started",
  "monnify_payroll_batch_pre_submit_failed",
  "monnify_payroll_batch_provider_submission_failed",
  "monnify_batch_accepted_ems_persistence_failed",
  "SUBMISSION_REJECTED",
  "SUBMISSION_UNKNOWN",
  "providerResponse",
  "PENDING_BATCH_AUTHORIZATION",
]) assert.ok(service.includes(marker), `Missing server-side recovery marker: ${marker}`);

assert.ok(service.includes('providerCode === "D02"'), "Definitive missing-batch reconciliation handling is missing");
assert.ok(service.includes('new Set(["D03", "D04", "D06"])'), "Only safe documented provider rejection codes may be classified as definitive rejection");
assert.ok(service.includes('new Set(["D03", "D04"])'), "IP whitelist rejections must not unlock single-payment fallback");
assert.ok(service.includes('batch.providerResponse?.singleFallbackAllowed === true'), "Single fallback must require a separate safe-fallback flag");
assert.ok(service.includes('DEFINITIVE_MONNIFY_REJECTION_CODES.has(code)'), "Duplicate-reference and duplicate-request responses must remain ambiguous");
assert.ok(service.includes("monnify_batch_status_confirmed_transaction_history_failed"), "Confirmed provider batch state must survive a transaction-history lookup failure");
assert.ok(service.includes('providerCode === "D02" && error?.details?.provider === "MONNIFY"'), "Confirmed missing single-transfer reference recovery is missing");
assert.ok(service.includes('every((batch) => String(batch.providerStatus || "").toUpperCase() === "SUBMISSION_REJECTED"'), "Single fallback is not guarded by rejection of every Monnify batch for the period");
assert.ok(service.includes('&& batch.providerResponse?.singleFallbackAllowed === true'), "Single fallback must require explicit backend permission for every rejected batch");
assert.ok(service.includes("MONNIFY_SINGLE_INSUFFICIENT_BALANCE"), "Single-transfer live balance check is missing");
assert.ok(service.includes("MONNIFY_SINGLE_SUBMISSION_UNKNOWN"), "Uncertain single transfers must be blocked from blind retry");
assert.ok(controller.includes("req.requestId || null"), "Request ID is not propagated into Monnify batch logs");
assert.ok(fundingRoute.includes("isUncommittedPreview"), "Unfunded/unexecuted legacy preview route fix is missing");

console.log("OK: documented Monnify API paths, safe provider diagnostics, rejection-only single-transfer fallback, and payroll funding-route guards are present.");
