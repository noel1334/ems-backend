import crypto from "node:crypto";
import prisma from "../../../config/database.js";
import AppError from "../../../common/errors/AppError.js";
import { encryptMonnifySecret, decryptMonnifySecret } from "./monnify.crypto.js";
import { monnifyEndpoints } from "./monnify.client.js";

const safe = (row) => row ? ({ connected: true, environment: row.environment, sourceAccountNumber: row.sourceAccountNumber, isActive: row.isActive, lastTestedAt: row.lastTestedAt, updatedAt: row.updatedAt }) : ({ connected: false });
export async function getConnection(companyId) { return safe(await prisma.companyMonnifyConnection.findUnique({ where: { companyId } })); }
export async function saveConnection(companyId, input) {
  const { apiKey, apiSecret, contractCode, sourceAccountNumber, environment = "sandbox" } = input;
  if (![apiKey, apiSecret, contractCode].every((v) => typeof v === "string" && v.trim()) || !/^\d{10}$/.test(String(sourceAccountNumber || ""))) throw new AppError("API key, API secret, contract code and a 10-digit source account number are required.", 400);
  if (!["sandbox", "live"].includes(environment)) throw new AppError("Environment must be sandbox or live.", 400);
  const data = { apiKeyCiphertext: encryptMonnifySecret(apiKey.trim()), apiSecretCiphertext: encryptMonnifySecret(apiSecret.trim()), contractCodeCiphertext: encryptMonnifySecret(contractCode.trim()), sourceAccountNumber, environment, isActive: true };
  const row = await prisma.companyMonnifyConnection.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
  return safe(row);
}
export async function removeConnection(companyId) { await prisma.companyMonnifyConnection.deleteMany({ where: { companyId } }); return { connected: false }; }
async function requiredConnection(companyId) { const row = await prisma.companyMonnifyConnection.findUnique({ where: { companyId } }); if (!row?.isActive) throw new AppError("Connect this company's Monnify account first.", 409, { code: "MONNIFY_NOT_CONNECTED" }); return row; }
export async function testConnection(companyId) { const row = await requiredConnection(companyId); const balance = await monnifyEndpoints.balance(row, row.sourceAccountNumber); await prisma.companyMonnifyConnection.update({ where: { companyId }, data: { lastTestedAt: new Date() } }); return { connected: true, environment: row.environment, sourceAccountNumber: row.sourceAccountNumber, balance }; }
export async function listBanks(companyId) { const row = await requiredConnection(companyId); return monnifyEndpoints.banks(row); }
export async function validateAccount(companyId, accountNumber, bankCode) { if (!/^\d{10}$/.test(String(accountNumber || "")) || !String(bankCode || "").trim()) throw new AppError("A valid 10-digit account number and Monnify bank code are required.", 400); const row = await requiredConnection(companyId); return monnifyEndpoints.validateAccount(row, accountNumber, bankCode); }
export async function submitBatch(companyId, payrollPeriodId, userId, input) {
  const row = await requiredConnection(companyId);
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(String(payrollPeriodId || ""))) throw new AppError("Invalid payroll period reference.", 400);
  if (!Array.isArray(input?.transactions) || !input.transactions.length || input.transactions.length > 5000) throw new AppError("Provide between 1 and 5,000 salary transactions.", 400);
  const batchReference = `EMS-${crypto.randomUUID()}`; const seen = new Set(); let totalAmount = 0;
  const transactionList = input.transactions.map((tx, i) => {
    const reference = String(tx.reference || `EMS-${crypto.randomUUID()}`); if (seen.has(reference)) throw new AppError("Duplicate employee payment reference in batch.", 400); seen.add(reference);
    if (!/^\d{10}$/.test(String(tx.accountNumber || "")) || !/^\d{2,10}$/.test(String(tx.bankCode || "")) || !String(tx.accountName || "").trim() || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) throw new AppError(`Invalid beneficiary details at transaction ${i + 1}.`, 400);
    totalAmount += Number(tx.amount); return { amount: Number(Number(tx.amount).toFixed(2)), reference, narration: String(tx.narration || `Salary payment`).slice(0, 80), destinationBankCode: String(tx.bankCode), destinationAccountNumber: String(tx.accountNumber), destinationAccountName: String(tx.accountName).trim(), currency: "NGN" };
  });
  // Persist a SUBMITTING lock before the provider call to prevent duplicate batch submission.
  const saved = await prisma.companyMonnifyBatch.create({ data: { companyId, payrollPeriodId, batchReference, totalAmount, totalTransactions: transactionList.length, submittedBy: userId, providerStatus: "SUBMITTING" } });
  try { const response = await monnifyEndpoints.submitBatch(row, { title: String(input.title || "EMS Salary Payroll").slice(0, 80), batchReference, narration: String(input.narration || "EMS salary disbursement").slice(0, 80), sourceAccountNumber: row.sourceAccountNumber, onValidationFailure: "CONTINUE", notificationInterval: 25, transactionList });
    const status = String(response.batchStatus || "PENDING_AUTHORIZATION"); await prisma.companyMonnifyBatch.update({ where: { id: saved.id }, data: { providerStatus: status, providerResponse: response } }); return { id: saved.id, batchReference, status, totalAmount, totalTransactions: transactionList.length, requiresOtp: status === "PENDING_AUTHORIZATION" };
  } catch (error) { await prisma.companyMonnifyBatch.update({ where: { id: saved.id }, data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { errorCode: error.code || "UPSTREAM_ERROR", message: error.message } } }); throw new AppError("Monnify submission outcome is uncertain. Do not submit this payroll again until the batch reference is checked with Monnify.", 502, { code: "MONNIFY_SUBMISSION_UNKNOWN", batchReference }); }
}
export async function authorizeBatch(companyId, batchId, otp) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); if (batch.providerStatus !== "PENDING_AUTHORIZATION") throw new AppError(`This batch is not awaiting OTP authorization (status: ${batch.providerStatus}).`, 409); if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter a valid OTP.", 400); const connection = await requiredConnection(companyId); const result = await monnifyEndpoints.authorizeBatch(connection, batch.batchReference, otp); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: result.batchStatus || "AWAITING_PROCESSING", providerResponse: { ...result, ...(batch.providerResponse?.employeeReferences ? { employeeReferences: batch.providerResponse.employeeReferences } : {}) }, authorizedAt: new Date() } }); return { batchReference: batch.batchReference, status: result.batchStatus || "AWAITING_PROCESSING" }; }
export async function refreshBatch(companyId, batchId) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); const connection = await requiredConnection(companyId); const [summary, transactions] = await Promise.all([monnifyEndpoints.batchStatus(connection, batch.batchReference), monnifyEndpoints.batchTransactions(connection, batch.batchReference)]); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: summary.batchStatus || batch.providerStatus, providerResponse: { summary, transactions, ...(batch.providerResponse?.employeeReferences ? { employeeReferences: batch.providerResponse.employeeReferences } : {}) }, lastCheckedAt: new Date() } }); return { batchReference: batch.batchReference, summary, transactions }; }
export async function listBatches(companyId) { return prisma.companyMonnifyBatch.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, totalAmount: true, totalTransactions: true, authorizedAt: true, lastCheckedAt: true, createdAt: true } }); }


const normalizeBankName = (value) => String(value || "").toLowerCase().replace(/\b(bank| plc| limited| ltd)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
const unwrapList = (value) => Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : Array.isArray(value?.banks) ? value.banks : [];
const pickBankCode = (bank) => String(bank?.code ?? bank?.bankCode ?? bank?.bank_code ?? "").trim();
const pickBankName = (bank) => String(bank?.name ?? bank?.bankName ?? bank?.bank_name ?? "").trim();

/** Preflight a finalized payroll against this tenant's own Monnify disbursement wallet. */
export async function previewPayroll(companyId, payrollPeriodId) {
  const connection = await requiredConnection(companyId);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, companyId, deletedAt: null } });
  if (!period || period.status !== "FINALIZED") throw new AppError("Only a finalized payroll period can be paid through Monnify.", 409);
  const existing = await prisma.companyMonnifyBatch.findFirst({ where: { companyId, payrollPeriodId, providerStatus: { notIn: ["FAILED", "EXPIRED"] } } });
  if (existing) throw new AppError("A Monnify batch already exists for this payroll period. Refresh or authorize that batch; do not create another.", 409, { batchReference: existing.batchReference, status: existing.providerStatus });
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId: payrollPeriodId, status: "PENDING" }, include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } }, payrollItem: { select: { netSalary: true, status: true } } }, orderBy: { createdAt: "asc" } });
  if (!rows.length) throw new AppError("There are no pending salary payments in this payroll period.", 409);
  const banks = unwrapList(await monnifyEndpoints.banks(connection));
  const output = [];
  let total = 0;
  for (const row of rows) {
    const accounts = row.employee?.bankAccounts || [];
    const account = accounts.find((item) => item.isPrimary) || accounts[0];
    if (!account || !/^\d{10}$/.test(String(account.accountNumber || ""))) throw new AppError(`Missing valid bank account for ${row.employee?.firstName || row.employeeId}.`, 422);
    if (!row.payrollItem || Number(row.amount) !== Number(row.payrollItem.netSalary)) throw new AppError(`Payroll amount mismatch for employee ${row.employeeId}. Re-prepare the register before payment.`, 409);
    const bankKey = normalizeBankName(account.bankName);
    const matches = banks.filter((item) => normalizeBankName(pickBankName(item)) === bankKey && pickBankCode(item));
    if (matches.length !== 1) throw new AppError(`Cannot uniquely match ${account.bankName} to Monnify's bank directory. Update the employee's bank details before continuing.`, 422);
    const bankCode = pickBankCode(matches[0]);
    const resolved = await monnifyEndpoints.validateAccount(connection, account.accountNumber, bankCode);
    const resolvedName = String(resolved.accountName ?? resolved.account_name ?? resolved.destinationAccountName ?? "").trim();
    if (!resolvedName) throw new AppError(`Monnify did not return a verified account name for employee ${row.employeeId}.`, 422);
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(`Invalid salary amount for employee ${row.employeeId}.`, 422);
    total += amount;
    output.push({ disbursementId: row.id, employeeId: row.employeeId, employeeName: [row.employee.firstName, row.employee.middleName, row.employee.lastName].filter(Boolean).join(" "), amount: amount.toFixed(2), bankName: account.bankName, accountName: resolvedName, accountNumberLast4: account.accountNumber.slice(-4), bankCode });
  }
  const balance = await monnifyEndpoints.balance(connection, connection.sourceAccountNumber);
  const available = Number(balance.availableBalance ?? 0);
  if (!Number.isFinite(available) || available < total) throw new AppError(`Monnify disbursement balance is insufficient. Available: ₦${available.toLocaleString("en-NG")}; salaries: ₦${total.toLocaleString("en-NG")}.`, 409, { availableBalance: available, salaryTotal: total });
  return { ready: true, environment: connection.environment, sourceAccountNumber: connection.sourceAccountNumber, employeeCount: output.length, salaryTotal: total.toFixed(2), monnifyAvailableBalance: available.toFixed(2), employees: output };
}

export async function submitPayroll(companyId, payrollPeriodId, userId) {
  const preview = await previewPayroll(companyId, payrollPeriodId);
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId: payrollPeriodId, status: "PENDING" }, include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } } }, orderBy: { createdAt: "asc" } });
  const employees = new Map(preview.employees.map((item) => [item.disbursementId, item]));
  const transactions = rows.map((row) => { const item = employees.get(row.id); const account = row.employee.bankAccounts.find((x) => x.isPrimary) || row.employee.bankAccounts[0]; if (!item || !account) throw new AppError("The payroll register changed during Monnify preparation. Run validation again.", 409); return { reference: `EMS-SAL-${row.id}`, amount: Number(row.amount), accountNumber: account.accountNumber, bankCode: item.bankCode, accountName: item.accountName, narration: `Salary ${row.employee.employeeNumber || row.employeeId}` }; });
  const result = await submitBatch(companyId, payrollPeriodId, userId, { title: `EMS Payroll ${payrollPeriodId}`.slice(0, 80), narration: "EMS salary disbursement", transactions });
  const batch = await prisma.companyMonnifyBatch.findUnique({ where: { id: result.id } });
  await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerResponse: { ...(batch.providerResponse || {}), employeeReferences: rows.map((row) => ({ disbursementId: row.id, reference: `EMS-SAL-${row.id}` })) } } });
  // Do not debit the EMS wallet: funds are held in this company's Monnify disbursement wallet.
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.payrollDisbursement.updateMany({ where: { id: row.id, companyId, status: "PENDING" }, data: { provider: "MONNIFY", providerStatus: result.status, externalReference: `EMS-SAL-${row.id}`, failureReason: null, updatedBy: userId } });
    }
  });
  return { ...result, environment: preview.environment, salaryTotal: preview.salaryTotal, employeeCount: preview.employeeCount, monnifyAvailableBalance: preview.monnifyAvailableBalance };
}

const transactionRows = (payload) => Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : Array.isArray(payload?.transactions) ? payload.transactions : [];
export async function refreshPayrollBatch(companyId, batchId) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify batch not found.", 404);
  const result = await refreshBatch(companyId, batchId);
  const refs = batch.providerResponse?.employeeReferences || [];
  const transactions = transactionRows(result.transactions);
  const byReference = new Map(transactions.map((tx) => [String(tx.reference ?? tx.transactionReference ?? ""), tx]));
  const updates = [];
  for (const link of refs) {
    const tx = byReference.get(link.reference);
    if (!tx) continue;
    const status = String(tx.status || tx.transactionStatus || "").toUpperCase();
    const success = ["SUCCESS", "COMPLETED"].includes(status);
    const failure = ["FAILED", "REVERSED", "EXPIRED"].includes(status);
    if (success) {
      await prisma.payrollDisbursement.updateMany({ where: { id: link.disbursementId, companyId, provider: "MONNIFY", status: { in: ["PENDING", "PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: "PAID", providerStatus: status, providerTransferId: String(tx.transactionId ?? tx.paymentReference ?? tx.reference ?? link.reference), providerResponse: tx, paidAt: new Date(), verifiedAt: new Date(), failureReason: null } });
    } else if (failure) {
      await prisma.payrollDisbursement.updateMany({ where: { id: link.disbursementId, companyId, provider: "MONNIFY", status: { in: ["PENDING", "PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: "FAILED", providerStatus: status, providerResponse: tx, failureReason: String(tx.message ?? tx.narration ?? `Monnify transfer ${status.toLowerCase()}`).slice(0, 500) } });
    } else {
      await prisma.payrollDisbursement.updateMany({ where: { id: link.disbursementId, companyId, provider: "MONNIFY", status: "PENDING" }, data: { status: "PROCESSING", providerStatus: status || "PENDING" } });
    }
    updates.push({ disbursementId: link.disbursementId, reference: link.reference, status: status || "PENDING" });
  }
  return { ...result, reconciled: updates.length, employeeResults: updates };
}
