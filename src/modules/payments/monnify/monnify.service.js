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
  const employeeReferences = Array.isArray(input.employeeReferences) ? input.employeeReferences : null;
  const saved = await prisma.companyMonnifyBatch.create({ data: { companyId, payrollPeriodId, batchReference, totalAmount, totalTransactions: transactionList.length, submittedBy: userId, providerStatus: "SUBMITTING", ...(employeeReferences ? { providerResponse: { employeeReferences } } : {}) } });
  try { const response = await monnifyEndpoints.submitBatch(row, { title: String(input.title || "EMS Salary Payroll").slice(0, 80), batchReference, narration: String(input.narration || "EMS salary disbursement").slice(0, 80), sourceAccountNumber: row.sourceAccountNumber, onValidationFailure: "CONTINUE", notificationInterval: 25, transactionList });
    const status = String(response.batchStatus || "PENDING_AUTHORIZATION"); await prisma.companyMonnifyBatch.update({ where: { id: saved.id }, data: { providerStatus: status, providerResponse: { ...response, ...(employeeReferences ? { employeeReferences } : {}) } } }); return { id: saved.id, batchReference, status, totalAmount, totalTransactions: transactionList.length, requiresOtp: status === "PENDING_AUTHORIZATION" };
  } catch (error) { await prisma.companyMonnifyBatch.update({ where: { id: saved.id }, data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { errorCode: error.code || "UPSTREAM_ERROR", message: error.message, ...(employeeReferences ? { employeeReferences } : {}) } } }); throw new AppError("Monnify submission outcome is uncertain. Do not submit this payroll again until the batch reference is checked with Monnify.", 502, { code: "MONNIFY_SUBMISSION_UNKNOWN", batchReference }); }
}
export async function authorizeBatch(companyId, batchId, otp) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); if (batch.providerStatus !== "PENDING_AUTHORIZATION") throw new AppError(`This batch is not awaiting OTP authorization (status: ${batch.providerStatus}).`, 409); if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter a valid OTP.", 400); const connection = await requiredConnection(companyId); const result = await monnifyEndpoints.authorizeBatch(connection, batch.batchReference, otp); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: result.batchStatus || "AWAITING_PROCESSING", providerResponse: { ...result, ...(batch.providerResponse?.employeeReferences ? { employeeReferences: batch.providerResponse.employeeReferences } : {}) }, authorizedAt: new Date() } }); return { batchReference: batch.batchReference, status: result.batchStatus || "AWAITING_PROCESSING" }; }
export async function refreshBatch(companyId, batchId) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); const connection = await requiredConnection(companyId); const [summary, transactions] = await Promise.all([monnifyEndpoints.batchStatus(connection, batch.batchReference), monnifyEndpoints.batchTransactions(connection, batch.batchReference)]); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: summary.batchStatus || batch.providerStatus, providerResponse: { summary, transactions, ...(batch.providerResponse?.employeeReferences ? { employeeReferences: batch.providerResponse.employeeReferences } : {}) }, lastCheckedAt: new Date() } }); return { batchReference: batch.batchReference, summary, transactions }; }
export async function listBatches(companyId) { return prisma.companyMonnifyBatch.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, totalAmount: true, totalTransactions: true, authorizedAt: true, lastCheckedAt: true, createdAt: true } }); }


const normalizeBankName = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\b(nigeria|plc|limited|ltd|microfinance|mfb|bank)\b/g, " ")
  .replace(/[^a-z0-9]/g, "");
const unwrapList = (value) => Array.isArray(value) ? value : Array.isArray(value?.content) ? value.content : Array.isArray(value?.banks) ? value.banks : [];
const pickBankCode = (bank) => String(bank?.code ?? bank?.bankCode ?? bank?.bank_code ?? "").trim();
const pickBankName = (bank) => String(bank?.name ?? bank?.bankName ?? bank?.bank_name ?? "").trim();
const employeeLabel = (employee) => [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ") || employee?.fullName || employee?.name || employee?.employeeNumber || employee?.id || "Employee";
const monnifyAccountError = (error, { employee, account, bankCode, environment }) => {
  const providerMessage = String(error?.message || "Monnify could not validate this account.").trim();
  const normalized = providerMessage.toLowerCase();
  const guidance = normalized.includes("invalid account details") || normalized.includes("invalid account number") || normalized.includes("invalid bank code")
    ? "Confirm the employee's 10-digit account number and selected bank. In SANDBOX, use a Monnify-supported sandbox beneficiary account; ordinary live bank accounts may not be recognized by sandbox test data."
    : "Confirm the employee's saved bank and account number, then retry validation.";
  return {
    code: error?.code || "MONNIFY_NAME_ENQUIRY_FAILED",
    message: `${providerMessage}${error?.code ? ` (Monnify code: ${error.code})` : ""} Employee: ${employeeLabel(employee)}; bank: ${account?.bankName || "unknown"}; account ending ${String(account?.accountNumber || "").slice(-4) || "—"}; Monnify bank code: ${bankCode || "unresolved"}; environment: ${String(environment || "unknown").toUpperCase()}. ${guidance}`,
  };
};

/** Preflight a finalized payroll against this tenant's own Monnify disbursement wallet. */
export async function previewPayroll(companyId, payrollPeriodId) {
  const connection = await requiredConnection(companyId);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, companyId, deletedAt: null } });
  if (!period || period.status !== "FINALIZED") throw new AppError("Only a finalized payroll period can be paid through Monnify.", 409);
  const otherProviderBatch = await prisma.payrollPayoutBatch.findFirst({
    where: { companyId, periodId: payrollPeriodId, status: { in: ["APPROVED", "PROCESSING", "REQUIRES_REVIEW"] } },
    select: { provider: true, status: true },
  });
  if (otherProviderBatch) throw new AppError(`This payroll already has a ${otherProviderBatch.provider} payout batch in ${otherProviderBatch.status} status. Reconcile that batch before switching providers, to prevent duplicate salary transfers.`, 409, { code: "OTHER_PROVIDER_BATCH_ACTIVE", provider: otherProviderBatch.provider, status: otherProviderBatch.status });
  const existing = await prisma.companyMonnifyBatch.findFirst({ where: { companyId, payrollPeriodId, providerStatus: { not: "FAILED_ON_ACCOUNTS_VALIDATION" } } });
  if (existing) throw new AppError("A Monnify batch already exists for this payroll period. Refresh or authorize that batch; do not create another.", 409, { batchReference: existing.batchReference, status: existing.providerStatus });
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId: payrollPeriodId, status: "PENDING" }, include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } }, payrollItem: { select: { netSalary: true, status: true } } }, orderBy: { createdAt: "asc" } });
  if (!rows.length) throw new AppError("There are no pending salary payments in this payroll period.", 409);

  let banks = [];
  let bankDirectoryError = null;
  try { banks = unwrapList(await monnifyEndpoints.banks(connection)); }
  catch (error) { bankDirectoryError = String(error?.message || "Monnify bank directory could not be loaded."); }
  if (!banks.length && !bankDirectoryError) bankDirectoryError = "Monnify returned an empty bank directory. Check the connected account and try again.";

  const employees = [];
  const errors = [];
  let salaryTotal = 0;
  for (const row of rows) {
    const employee = row.employee;
    const accountList = employee?.bankAccounts || [];
    const account = accountList.find((item) => item.isPrimary) || accountList[0] || null;
    const itemErrors = [];
    let bankCode = "";
    let verifiedAccountName = "";
    const amount = Number(row.amount);
    if (!account || !/^\d{10}$/.test(String(account?.accountNumber || ""))) {
      itemErrors.push("No active 10-digit employee bank account is saved. Update the employee's bank details.");
    }
    if (!row.payrollItem || amount !== Number(row.payrollItem.netSalary)) {
      itemErrors.push("The payment register amount does not match the finalized payroll net salary. Re-prepare the register after a documented correction.");
    }
    if (!Number.isFinite(amount) || amount <= 0) itemErrors.push("The salary amount must be a positive valid amount.");
    if (bankDirectoryError) itemErrors.push(bankDirectoryError);

    if (account && /^\d{10}$/.test(String(account.accountNumber || "")) && !bankDirectoryError) {
      const key = normalizeBankName(account.bankName);
      const matches = banks.filter((bank) => normalizeBankName(pickBankName(bank)) === key && pickBankCode(bank));
      const uniqueMatches = [...new Map(matches.map((bank) => [pickBankCode(bank), bank])).values()];
      if (uniqueMatches.length !== 1) {
        itemErrors.push(uniqueMatches.length ? `The bank name "${account.bankName}" matches more than one Monnify bank code. Update the bank name to match Monnify's bank directory.` : `The bank "${account.bankName}" is not uniquely present in Monnify's supported bank directory. Select the correct bank for this account.`);
      } else {
        bankCode = pickBankCode(uniqueMatches[0]);
        try {
          const resolved = await monnifyEndpoints.validateAccount(connection, String(account.accountNumber), bankCode);
          verifiedAccountName = String(resolved.accountName ?? resolved.account_name ?? resolved.destinationAccountName ?? "").trim();
          if (!verifiedAccountName) itemErrors.push("Monnify returned no verified account name for this beneficiary.");
        } catch (error) {
          const detail = monnifyAccountError(error, { employee, account, bankCode, environment: connection.environment });
          itemErrors.push(detail.message);
        }
      }
    }

    if (itemErrors.length) {
      errors.push({ code: "EMPLOYEE_VALIDATION_FAILED", employeeId: row.employeeId, employee: employeeLabel(employee), message: itemErrors.join(" ") });
    } else {
      salaryTotal += amount;
    }
    employees.push({
      disbursementId: row.id,
      employeeId: row.employeeId,
      employee: employeeLabel(employee),
      employeeName: employeeLabel(employee),
      bankName: account?.bankName || null,
      accountNumberLast4: account?.accountNumber ? String(account.accountNumber).slice(-4) : null,
      bankCode: bankCode || null,
      accountName: verifiedAccountName || null,
      amount: Number.isFinite(amount) ? amount.toFixed(2) : "0.00",
      validation: itemErrors.length ? "BLOCKED" : "VALID",
      errors: itemErrors,
    });
  }

  let available = 0;
  let balanceError = null;
  try {
    const balance = await monnifyEndpoints.balance(connection, connection.sourceAccountNumber);
    available = Number(balance.availableBalance ?? 0);
    if (!Number.isFinite(available)) throw new Error("Monnify returned an invalid available balance.");
  } catch (error) {
    balanceError = String(error?.message || "Monnify disbursement balance could not be verified.");
    errors.push({ code: "MONNIFY_BALANCE_UNAVAILABLE", message: balanceError });
  }
  if (!balanceError && available < salaryTotal && errors.length === 0) {
    errors.push({ code: "INSUFFICIENT_MONNIFY_BALANCE", message: `Monnify disbursement balance is insufficient. Available: ₦${available.toLocaleString("en-NG")}; eligible salaries: ₦${salaryTotal.toLocaleString("en-NG")}.` });
  }

  const validCount = employees.filter((item) => item.validation === "VALID").length;
  return {
    ready: errors.length === 0 && validCount === rows.length,
    environment: connection.environment,
    sourceAccountNumber: connection.sourceAccountNumber,
    employeeCount: validCount,
    pendingEmployeeCount: rows.length,
    blockedEmployeeCount: rows.length - validCount,
    salaryTotal: salaryTotal.toFixed(2),
    monnifyAvailableBalance: Number.isFinite(available) ? available.toFixed(2) : "0.00",
    errors,
    employees,
  };
}

export async function submitPayroll(companyId, payrollPeriodId, userId) {
  const preview = await previewPayroll(companyId, payrollPeriodId);
  if (!preview.ready) throw new AppError("Monnify payroll validation is not complete. Correct all blocked employee bank details and refresh the preview before submitting.", 422, { code: "MONNIFY_PAYROLL_VALIDATION_FAILED", errors: preview.errors });
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId: payrollPeriodId, status: "PENDING" }, include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } } }, orderBy: { createdAt: "asc" } });
  const employees = new Map(preview.employees.map((item) => [item.disbursementId, item]));
  const transactions = rows.map((row) => { const item = employees.get(row.id); const account = row.employee.bankAccounts.find((x) => x.isPrimary) || row.employee.bankAccounts[0]; if (!item || !account || item.validation !== "VALID") throw new AppError("The payroll register or bank details changed during Monnify preparation. Run validation again.", 409); return { reference: `EMS-SAL-${row.id}`, amount: Number(row.amount), accountNumber: String(account.accountNumber), bankCode: item.bankCode, accountName: item.accountName, narration: `Salary ${row.employee.employeeNumber || row.employeeId}` }; });
  const employeeReferences = rows.map((row) => ({ disbursementId: row.id, reference: `EMS-SAL-${row.id}` }));
  const result = await submitBatch(companyId, payrollPeriodId, userId, { title: `EMS Payroll ${payrollPeriodId}`.slice(0, 80), narration: "EMS salary disbursement", transactions, employeeReferences });
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
