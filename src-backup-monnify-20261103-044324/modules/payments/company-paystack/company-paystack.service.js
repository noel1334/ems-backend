import crypto from "node:crypto";
import Decimal from "decimal.js";
import prisma from "../../../config/database.js";
import AppError from "../../../common/errors/AppError.js";
import { encryptCompanyPaystackSecret, decryptCompanyPaystackSecret } from "./company-paystack.crypto.js";
import { companyPaystackEndpoints } from "./company-paystack.client.js";
import { estimatePaystackTransferFee } from "../../payroll/payroll.payout.config.js";

const asText = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
const toKobo = (amount) => {
  const value = new Decimal(amount);
  const kobo = value.mul(100);
  if (!value.isFinite() || !value.isPositive() || !kobo.isInteger() || !Number.isSafeInteger(kobo.toNumber())) throw new AppError("Salary amount must be positive and exactly representable in kobo.", 400, { code: "PAYSTACK_INVALID_AMOUNT" });
  return kobo.toNumber();
};
const toNaira = (kobo) => Number(kobo || 0) / 100;
const environmentOf = (key) => key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : null;
const secretDigest = (key) => crypto.createHash("sha256").update(key).digest("hex").slice(0, 20);
const normalizeName = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((v) => v.length > 1);
function namesCompatible(savedName, providerName) {
  const saved = [...new Set(normalizeName(savedName))]; const resolved = [...new Set(normalizeName(providerName))];
  if (!saved.length || !resolved.length) return false;
  if (saved.join(" ") === resolved.join(" ")) return true;
  const shorter = saved.length <= resolved.length ? saved : resolved; const longer = saved.length <= resolved.length ? resolved : saved;
  return shorter.length >= 2 && shorter.every((token) => longer.includes(token));
}
const safeConnection = (row) => row ? ({ connected: true, environment: row.environment, isActive: row.isActive, lastTestedAt: row.lastTestedAt, lastKnownBalance: row.lastKnownBalance == null ? null : String(row.lastKnownBalance), maskedKey: `••••${row.keyLast4 || ""}`, updatedAt: row.updatedAt }) : ({ connected: false });

export async function getConnection(companyId) {
  return safeConnection(await prisma.companyPaystackConnection.findUnique({ where: { companyId } }));
}

export async function saveConnection(companyId, rawKey) {
  const key = asText(rawKey);
  const environment = environmentOf(key);
  if (!environment || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new AppError("Enter a valid Paystack secret key beginning with sk_test_ or sk_live_. Do not enter a public key.", 400, { code: "PAYSTACK_SECRET_KEY_INVALID" });
  const current = await prisma.companyPaystackConnection.findUnique({ where: { companyId } });
  if (current) {
    const open = await prisma.companyPaystackBatch.count({ where: { companyId, providerStatus: { in: ["SUBMITTING", "SUBMISSION_UNKNOWN", "PENDING_AUTHORIZATION", "AWAITING_VERIFICATION", "PROCESSING", "PENDING"] } } });
    if (open) throw new AppError("This company has an unresolved Paystack payroll batch. Refresh or reconcile it before replacing its secret key.", 409, { code: "PAYSTACK_OPEN_BATCHES" });
  }
  const data = { secretKeyCiphertext: encryptCompanyPaystackSecret(key), environment, keyLast4: key.slice(-4), isActive: true };
  const row = await prisma.companyPaystackConnection.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
  return safeConnection(row);
}

export async function removeConnection(companyId) {
  const open = await prisma.companyPaystackBatch.count({ where: { companyId, providerStatus: { in: ["SUBMITTING", "SUBMISSION_UNKNOWN", "PENDING_AUTHORIZATION", "AWAITING_VERIFICATION", "PROCESSING", "PENDING"] } } });
  if (open) throw new AppError("Resolve all pending Paystack batches before disconnecting this company account.", 409, { code: "PAYSTACK_OPEN_BATCHES" });
  await prisma.companyPaystackConnection.deleteMany({ where: { companyId } });
  return { connected: false };
}

async function requiredConnection(companyId) {
  const row = await prisma.companyPaystackConnection.findUnique({ where: { companyId } });
  if (!row?.isActive) throw new AppError("Connect this company's Paystack secret key first.", 409, { code: "PAYSTACK_COMPANY_NOT_CONNECTED" });
  return row;
}

function balanceDetails(response) {
  const entries = Array.isArray(response?.data) ? response.data : [];
  const ngn = entries.find((entry) => String(entry.currency || "").toUpperCase() === "NGN");
  if (!ngn || !Number.isFinite(Number(ngn.balance))) throw new AppError("Paystack did not return an NGN balance for this company account.", 502, { code: "PAYSTACK_NGN_BALANCE_MISSING" });
  return { balanceKobo: Number(ngn.balance), balance: toNaira(ngn.balance), currency: "NGN" };
}

export async function testConnection(companyId) {
  const connection = await requiredConnection(companyId);
  const balance = balanceDetails(await companyPaystackEndpoints.balance(connection));
  await prisma.companyPaystackConnection.update({ where: { companyId }, data: { lastTestedAt: new Date(), lastKnownBalance: new Decimal(balance.balance).toDecimalPlaces(2) } });
  return { connected: true, environment: connection.environment, balance: balance.balance, currency: "NGN", balanceKobo: balance.balanceKobo, source: "COMPANY_PAYSTACK_BALANCE" };
}

export async function listBanks(companyId) {
  const connection = await requiredConnection(companyId);
  const response = await companyPaystackEndpoints.banks(connection);
  return (response.data || []).map((bank) => ({ name: bank.name, code: String(bank.code), slug: bank.slug, active: bank.active !== false }));
}

const bankForEmployee = (employee) => {
  const accounts = [...(employee?.bankAccounts || [])].filter((account) => account.isActive).sort((a,b) => Number(Boolean(b.isPrimary))-Number(Boolean(a.isPrimary)) || new Date(b.updatedAt || 0)-new Date(a.updatedAt || 0));
  const account = accounts.find((item) => /^\d{10}$/.test(String(item.accountNumber || "")) && /^\d{2,10}$/.test(String(item.paystackBankCode || "")) && asText(item.accountName).length >= 2);
  if (!account) return { error: "No active employee bank account has a valid 10-digit account number, account name and Paystack bank code." };
  return { account, bankCode: String(account.paystackBankCode) };
};
const employeeName = (employee) => [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ") || employee?.employeeNumber || "Employee";

async function preparePreview(companyId, periodId) {
  const connection = await requiredConnection(companyId);
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId, deletedAt: null } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  if (period.status !== "FINALIZED") throw new AppError("Only finalized payroll periods can be sent through the company Paystack account.", 409, { code: "PAYSTACK_PERIOD_NOT_FINALIZED" });
  const rows = await prisma.payrollDisbursement.findMany({
    where: { companyId, periodId, status: "PENDING" },
    include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } }, payrollItem: { select: { id: true, netSalary: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  const response = await companyPaystackEndpoints.banks(connection);
  const supported = new Set((response.data || []).filter((bank) => bank.active !== false).map((bank) => String(bank.code)));
  const shouldResolve = connection.environment === "live" || String(process.env.PAYROLL_PAYOUT_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX || "false").toLowerCase() === "true";
  const employees = await mapWithConcurrency(rows, 4, async (row) => {
    const selected = bankForEmployee(row.employee);
    const errors = [];
    if (selected.error) errors.push(selected.error);
    if (!row.payrollItem || new Decimal(row.amount).minus(row.payrollItem.netSalary).abs().greaterThan("0.001")) errors.push("The disbursement amount does not match the finalized payroll net salary.");
    try { toKobo(row.amount); } catch (error) { errors.push(error.message); }
    if (selected.account && !supported.has(selected.bankCode)) errors.push(`Bank code ${selected.bankCode} is not in this company's Paystack NGN bank directory. Update the employee's Paystack bank selection.`);
    let resolved = null;
    if (selected.account && !errors.length && shouldResolve) {
      try {
        const result = await companyPaystackEndpoints.resolveAccount(connection, selected.account.accountNumber, selected.bankCode);
        resolved = result.data;
        if (!namesCompatible(selected.account.accountName, resolved.account_name)) errors.push(`The bank account resolves to "${resolved.account_name || "unknown name"}", which does not sufficiently match the employee's saved account name.`);
      } catch (error) { errors.push(error.message || "Paystack could not resolve this bank account."); }
    }
    let estimatedFee = 0;
    try { estimatedFee = estimatePaystackTransferFee(Number(row.amount)); }
    catch (error) { errors.push(error.message || "Paystack transfer fee could not be estimated."); }
    return { disbursementId: row.id, employee: employeeName(row.employee), employeeId: row.employeeId, bankName: selected.account?.bankName || null, accountName: selected.account?.accountName || null, resolvedAccountName: resolved?.account_name || null, accountNumberLast4: selected.account?.accountNumber ? String(selected.account.accountNumber).slice(-4) : null, amount: new Decimal(row.amount).toFixed(2), estimatedFee: new Decimal(estimatedFee).toFixed(2), valid: errors.length === 0, errors, _bankAccountId: selected.account?.id || null, _bankCode: selected.bankCode || null, _accountNumber: selected.account?.accountNumber || null, _accountName: selected.account?.accountName || null, _email: row.employee?.email || null };
  });
  if (!rows.length) throw new AppError("There are no pending disbursements in this payroll register. Refresh existing Paystack batches instead of submitting again.", 409, { code: "PAYSTACK_NO_PENDING_DISBURSEMENTS" });
  const digest = secretDigest(decryptCompanyPaystackSecret(connection.secretKeyCiphertext));
  const fingerprintSource = { companyId, periodId, environment: connection.environment, digest, rows: employees.map(({ disbursementId, amount, _bankAccountId, _bankCode, _accountNumber, _accountName }) => ({ disbursementId, amount, _bankAccountId, _bankCode, _accountNumber, _accountName })) };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(fingerprintSource)).digest("hex");
  const validCount = employees.filter((item) => item.valid).length;
  const totalAmount = employees.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const estimatedFees = employees.reduce((sum, item) => sum.plus(item.estimatedFee), new Decimal(0));
  return { connection, period, employees, fingerprint, totalAmount: totalAmount.toFixed(2), estimatedFees: estimatedFees.toFixed(2), estimatedRequiredBalance: totalAmount.plus(estimatedFees).toFixed(2), validCount, invalidCount: employees.length - validCount, balance: null };
}

export async function previewPayroll(companyId, periodId) {
  const preview = await preparePreview(companyId, periodId);
  let balance = null; let balanceError = null;
  try { balance = balanceDetails(await companyPaystackEndpoints.balance(preview.connection)); }
  catch (error) { balanceError = error.message; }
  if (balanceError) throw new AppError(`Could not confirm the company's Paystack balance: ${balanceError}`, 502, { code: "PAYSTACK_BALANCE_CHECK_FAILED" });
  const insufficientBalance = preview.connection.environment === "live" && balance.balance < Number(preview.estimatedRequiredBalance);
  return { payrollPeriodId: periodId, environment: preview.connection.environment, balance: balance.balance, balanceKobo: balance.balanceKobo, totalAmount: preview.totalAmount, estimatedFees: preview.estimatedFees, estimatedRequiredBalance: preview.estimatedRequiredBalance, totalTransactions: preview.employees.length, validCount: preview.validCount, invalidCount: preview.invalidCount, insufficientBalance, canSubmit: preview.invalidCount === 0 && !insufficientBalance, previewFingerprint: preview.fingerprint, employees: preview.employees.map(({ _bankAccountId, _bankCode, _accountNumber, _accountName, _email, ...publicItem }) => publicItem), notes: [preview.connection.environment === "test" ? "Sandbox/test mode does not move real money. Paystack test transfers are simulated." : "Live transfers use this company's Paystack NGN balance, not its ordinary bank account or the EMS internal wallet.", "Bulk transfer requires Transfers OTP to be disabled in this company's Paystack Dashboard. A single transfer may require OTP authorization.", "Bulk payroll is split into groups of at most 100 and Paystack requests are spaced by at least five seconds.", "The fee total is an estimate using the published Nigerian transfer pricing and the backend fee settings. Paystack checks the actual transfer amount plus fee before accepting each request.", "If this company has configured a Paystack Transfer Approval URL, that separate approval callback is not implemented in this version; configure and test it before using that integration."] };
}

async function getOrCreateRecipient(companyId, connection, row) {
  const key = decryptCompanyPaystackSecret(connection.secretKeyCiphertext);
  const bankAccount = await prisma.employeeBankAccount.findUnique({ where: { id: row._bankAccountId } });
  if (!bankAccount || !bankAccount.isActive || bankAccount.employeeId !== row.employeeId
    || String(bankAccount.accountNumber || "") !== String(row._accountNumber || "")
    || String(bankAccount.accountName || "") !== String(row._accountName || "")
    || String(bankAccount.paystackBankCode || "") !== String(row._bankCode || "")) {
    throw new AppError("Employee bank details changed after preview. Run payroll preview again before submitting.", 409, { code: "PAYSTACK_BANK_ACCOUNT_CHANGED" });
  }
  // Keep tenant-owned recipient records out of EmployeeBankAccount's legacy platform
  // recipient cache. This prevents either payout route from overwriting the other's code.
  const fingerprint = crypto.createHmac("sha256", key).update([companyId, connection.environment, bankAccount.id, bankAccount.accountNumber, bankAccount.accountName, bankAccount.paystackBankCode].join("|" )).digest("hex");
  const cached = await prisma.companyPaystackRecipient.findUnique({
    where: { companyId_employeeBankAccountId_environment: { companyId, employeeBankAccountId: bankAccount.id, environment: connection.environment } },
  });
  if (cached && cached.fingerprint === fingerprint) return cached.recipientCode;
  const result = await companyPaystackEndpoints.createRecipient(connection, { type: "nuban", name: row._accountName, account_number: row._accountNumber, bank_code: row._bankCode, currency: "NGN", ...(row._email ? { email: row._email } : {}) });
  const recipientCode = result?.data?.recipient_code;
  if (!recipientCode) throw new AppError("Paystack did not return a transfer recipient code.", 502, { code: "PAYSTACK_RECIPIENT_CODE_MISSING" });
  await prisma.companyPaystackRecipient.upsert({
    where: { companyId_employeeBankAccountId_environment: { companyId, employeeBankAccountId: bankAccount.id, environment: connection.environment } },
    create: { companyId, employeeBankAccountId: bankAccount.id, environment: connection.environment, recipientCode, fingerprint },
    update: { recipientCode, fingerprint },
  });
  return recipientCode;
}

function newReference() { return `ems_${crypto.randomUUID().replace(/-/g, "")}`; }
function paystackStatus(data) { return String(data?.status || "pending").toLowerCase(); }

async function updateDisbursement(row, result, reference, environment = "live", isVerified = false) {
  const status = paystackStatus(result);
  const isSuccess = status === "success";
  const isFailure = ["failed", "reversed", "blocked", "rejected", "abandoned"].includes(status);
  const confirmedPaid = isVerified && isSuccess && environment === "live";
  const confirmedFailed = isVerified && isFailure;
  const sandboxSuccess = isSuccess && environment !== "live";
  const providerStatus = confirmedPaid ? "SUCCESS" : confirmedFailed ? status.toUpperCase() : sandboxSuccess ? "TEST_SUCCESS" : (isSuccess ? "SUCCESS_UNVERIFIED" : status.toUpperCase());
  const data = {
    provider: "PAYSTACK_COMPANY", method: "PAYSTACK_COMPANY_DIRECT", externalReference: reference,
    providerTransferId: result?.transfer_code ? String(result.transfer_code) : (result?.id ? String(result.id) : undefined),
    providerStatus, status: confirmedPaid ? "PAID" : confirmedFailed ? "FAILED" : "PROCESSING",
    providerResponse: result, failureReason: confirmedFailed ? (result?.reason || result?.message || `Paystack transfer status: ${status}`) : null,
    paidAt: confirmedPaid ? new Date() : null, verifiedAt: isVerified && (isSuccess || isFailure) ? new Date() : null,
  };
  if (isVerified) return prisma.payrollDisbursement.update({ where: { id: row.id }, data });
  // Do not let a delayed API response overwrite a concurrently verified webhook result.
  await prisma.payrollDisbursement.updateMany({ where: { id: row.id, verifiedAt: null }, data });
  return prisma.payrollDisbursement.findUnique({ where: { id: row.id } });
}

async function markPayrollPaidIfComplete(companyId, periodId) {
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId }, select: { id: true, status: true, payrollItemId: true } });
  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    if (rows.every((row) => row.status === "PAID")) {
      await tx.payrollItem.updateMany({ where: { id: { in: rows.map((row) => row.payrollItemId) }, companyId }, data: { status: "PAID" } });
      await tx.payrollPeriod.updateMany({ where: { id: periodId, companyId }, data: { status: "PAID" } });
      return;
    }
    // A previously successful transfer can later be reversed. Do not leave the
    // payroll period marked PAID once any employee's verified transfer is no longer paid.
    const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId }, select: { status: true } });
    if (period?.status === "PAID") {
      await tx.payrollPeriod.updateMany({ where: { id: periodId, companyId, status: "PAID" }, data: { status: "FINALIZED" } });
      await tx.payrollItem.updateMany({ where: { companyId, periodId, status: "PAID" }, data: { status: "FINALIZED" } });
    }
  });
}

export async function submitPayroll(companyId, periodId, userId, previewFingerprint) {
  const connection = await requiredConnection(companyId);
  const preview = await preparePreview(companyId, periodId);
  if (!previewFingerprint || previewFingerprint !== preview.fingerprint) throw new AppError("Payroll or bank details changed after preview. Generate a new preview before submitting.", 409, { code: "PAYSTACK_PREVIEW_STALE" });
  if (preview.invalidCount) throw new AppError("Some employees have invalid bank details. Correct the blockers before submitting the payroll.", 422, { code: "PAYSTACK_PREVIEW_HAS_ERRORS", invalidCount: preview.invalidCount });
  const currentBalance = balanceDetails(await companyPaystackEndpoints.balance(connection));
  if (connection.environment === "live" && currentBalance.balance < Number(preview.estimatedRequiredBalance)) throw new AppError("The company's Paystack balance is lower than salary principal plus the estimated transfer fees. Fund its Paystack balance and preview again.", 409, { code: "PAYSTACK_INSUFFICIENT_BALANCE", balance: currentBalance.balance, required: preview.estimatedRequiredBalance, totalAmount: preview.totalAmount, estimatedFees: preview.estimatedFees });
  const activeBatch = await prisma.companyPaystackBatch.findFirst({ where: { companyId, payrollPeriodId: periodId, providerStatus: { in: ["SUBMITTING", "SUBMISSION_UNKNOWN", "PENDING_AUTHORIZATION", "AWAITING_VERIFICATION", "PROCESSING", "PENDING"] } } });
  if (activeBatch) throw new AppError("A Paystack batch already exists for this payroll period. Refresh or reconcile it before another submission.", 409, { code: "PAYSTACK_BATCH_ALREADY_EXISTS", batchReference: activeBatch.batchReference });

  const batchReference = newReference();
  const mode = preview.employees.length === 1 ? "SINGLE" : "BULK";
  const batch = await prisma.companyPaystackBatch.create({ data: { companyId, payrollPeriodId: periodId, batchReference, providerStatus: "SUBMITTING", environment: connection.environment, transferMode: mode, totalAmount: new Decimal(preview.totalAmount), totalTransactions: preview.employees.length, submittedBy: userId } });
  try {
    // Recipient creation is one API request per uncached employee. Limit concurrency so
    // larger companies do not serialize hundreds of requests or flood Paystack's API.
    const prepared = await mapWithConcurrency(preview.employees, 4, async (row) => ({
      ...row,
      recipientCode: await getOrCreateRecipient(companyId, connection, row),
      reference: newReference(),
      amountKobo: toKobo(row.amount),
    }));
    if (mode === "SINGLE") {
      const item = prepared[0];
      await prisma.payrollDisbursement.update({ where: { id: item.disbursementId }, data: { provider: "PAYSTACK_COMPANY", method: "PAYSTACK_COMPANY_DIRECT", externalReference: item.reference, status: "PROCESSING", providerStatus: "SUBMITTING", providerResponse: { phase: "SUBMITTING" }, failureReason: null } });
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerResponse: { _emsTransactionMap: [{ reference: item.reference, disbursementId: item.disbursementId }], reference: item.reference } } });
      const result = await companyPaystackEndpoints.initiateSingle(connection, { source: "balance", amount: item.amountKobo, recipient: item.recipientCode, reference: item.reference, reason: `EMS salary ${periodId}`.slice(0, 100), currency: "NGN" });
      const data = result.data || {};
      await updateDisbursement({ id: item.disbursementId }, data, item.reference, connection.environment, false);
      const status = paystackStatus(data);
      const providerStatus = status === "otp" ? "PENDING_AUTHORIZATION" : (connection.environment !== "live" && status === "success" ? "TEST_SUCCESS" : status === "success" ? "AWAITING_VERIFICATION" : "PROCESSING");
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus, providerResponse: { data, reference: item.reference, transferCode: data.transfer_code || null, _emsTransactionMap: [{ reference: item.reference, disbursementId: item.disbursementId }] }, ...(status === "otp" ? {} : { authorizedAt: new Date() }) } });
      return { id: batch.id, batchReference, transferMode: mode, status: providerStatus, requiresOtp: status === "otp", totalAmount: preview.totalAmount, totalTransactions: 1 };
    }

    const chunks = [];
    for (let i = 0; i < prepared.length; i += 100) chunks.push(prepared.slice(i, i + 100));
    const transactionMap = [];
    const chunkResults = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const chunkReferences = chunk.map((item) => ({ reference: item.reference, disbursementId: item.disbursementId }));
      // Persist references before the provider request. If the network drops after Paystack
      // accepts a request, the webhook/reconciliation path can still identify every employee.
      await prisma.payrollDisbursement.updateMany({ where: { id: { in: chunk.map((item) => item.disbursementId) }, companyId }, data: { provider: "PAYSTACK_COMPANY", method: "PAYSTACK_COMPANY_DIRECT", status: "PROCESSING", providerStatus: "SUBMITTING", failureReason: null } });
      transactionMap.push(...chunkReferences);
      const chunkMeta = { index: chunkIndex + 1, status: "SUBMITTING", count: chunk.length, references: chunkReferences.map((item) => item.reference) };
      chunkResults.push(chunkMeta);
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: chunkIndex === 0 ? "SUBMITTING" : "PROCESSING", providerResponse: { _emsTransactionMap: transactionMap, chunks: chunkResults } } });
      try {
        const transfers = chunk.map((item) => ({ amount: item.amountKobo, recipient: item.recipientCode, reference: item.reference, reason: `EMS salary ${periodId}`.slice(0, 100) }));
        const result = await companyPaystackEndpoints.initiateBulk(connection, { source: "balance", currency: "NGN", transfers });
        const returned = Array.isArray(result.data) ? result.data : Array.isArray(result.data?.transfers) ? result.data.transfers : [];
        if (returned.length !== chunk.length) throw new AppError("Paystack accepted a response that could not be matched to every employee in this batch. The batch is locked for reconciliation; do not submit it again.", 502, { code: "PAYSTACK_RESPONSE_MAPPING_INCOMPLETE" });
        for (const item of chunk) {
          const providerItem = returned.find((candidate) => candidate.reference === item.reference);
          if (!providerItem) throw new AppError("A transfer reference was missing from Paystack's bulk response. The batch is locked for reconciliation.", 502, { code: "PAYSTACK_RESPONSE_REFERENCE_MISSING" });
          await updateDisbursement({ id: item.disbursementId }, providerItem, item.reference, connection.environment, false);
        }
        chunkMeta.status = "ACCEPTED";
        chunkMeta.response = returned;
        await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: "PROCESSING", providerResponse: { _emsTransactionMap: transactionMap, chunks: chunkResults } } });
      } catch (error) {
        const definitive = Boolean(error?.statusCode && error.statusCode >= 400 && error.statusCode < 500);
        if (definitive) {
          // A rejected request was not accepted: release only this unsent chunk so it can be
          // previewed again after the administrator corrects the account or dashboard setting.
          await prisma.payrollDisbursement.updateMany({ where: { id: { in: chunk.map((item) => item.disbursementId) }, companyId, provider: "PAYSTACK_COMPANY", providerStatus: "SUBMITTING" }, data: { provider: null, method: "MANUAL_BANK_TRANSFER", externalReference: null, providerTransferId: null, providerStatus: null, providerResponse: null, status: "PENDING", failureReason: null } });
          transactionMap.splice(transactionMap.length - chunkReferences.length, chunkReferences.length);
          chunkMeta.status = "REJECTED";
          chunkMeta.error = error.message;
          await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: transactionMap.length ? "PROCESSING" : "FAILED", providerResponse: { _emsTransactionMap: transactionMap, chunks: chunkResults, error: error.message } } });
        } else {
          chunkMeta.status = "SUBMISSION_UNKNOWN";
          chunkMeta.error = error.message;
          await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { _emsTransactionMap: transactionMap, chunks: chunkResults, error: error.message } } });
        }
        const providerMessage = String(error?.message || "");
        if (/otp|one.?time password|transfer approval|two.?factor/i.test(providerMessage)) {
          throw new AppError("Paystack rejected the bulk request because Transfers OTP/approval is enabled. For bulk payroll, the company must disable Transfers OTP in its own Paystack Dashboard, then preview and submit again. EMS cannot change this security setting.", 409, { code: "PAYSTACK_BULK_OTP_ENABLED" });
        }
        throw error;
      }
      if (chunkIndex < chunks.length - 1) await sleep(5000);
    }
    const acceptedStatuses = chunkResults.flatMap((chunk) => chunk.response || []).map((item) => paystackStatus(item));
    const allSuccess = acceptedStatuses.length === prepared.length && acceptedStatuses.every((status) => status === "success");
    const finalStatus = allSuccess ? (connection.environment === "live" ? "AWAITING_VERIFICATION" : "TEST_SUCCESS") : "PROCESSING";
    await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: finalStatus, providerResponse: { _emsTransactionMap: transactionMap, chunks: chunkResults } } });
    return { id: batch.id, batchReference, transferMode: mode, status: finalStatus, requiresOtp: false, totalAmount: preview.totalAmount, totalTransactions: prepared.length, chunks: chunks.length };

  } catch (error) {
    const current = await prisma.companyPaystackBatch.findUnique({ where: { id: batch.id } });
    if (current?.providerStatus === "SUBMITTING") {
      const savedReferences = current.providerResponse?._emsTransactionMap || [];
      // Recipient creation happens before any transfer is sent. If there is no persisted
      // transfer reference, there is no salary debit to reconcile and the batch can fail safely.
      const definitive = savedReferences.length === 0 || Boolean(error?.statusCode && error.statusCode >= 400 && error.statusCode < 500);
      if (definitive && savedReferences.length) {
        await prisma.payrollDisbursement.updateMany({
          where: { companyId, id: { in: savedReferences.map((item) => item.disbursementId) }, provider: "PAYSTACK_COMPANY", providerStatus: "SUBMITTING", verifiedAt: null },
          data: { provider: null, method: "MANUAL_BANK_TRANSFER", externalReference: null, providerTransferId: null, providerStatus: null, providerResponse: null, status: "PENDING", failureReason: null, paidAt: null, verifiedAt: null },
        });
      }
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: definitive ? "FAILED" : "SUBMISSION_UNKNOWN", providerResponse: { ...((current.providerResponse && typeof current.providerResponse === "object") ? current.providerResponse : {}), error: { message: error.message, code: error?.code || "UPSTREAM_ERROR" } } } });
    }
    const providerMessage = String(error?.message || "");
    if (mode === "BULK" && /otp|one.?time password|transfer approval|two.?factor/i.test(providerMessage)) {
      throw new AppError("Paystack rejected the bulk request because Transfers OTP/approval is enabled. For bulk payroll, the company must disable Transfers OTP in its own Paystack Dashboard, then preview and submit again. EMS cannot change this security setting.", 409, { code: "PAYSTACK_BULK_OTP_ENABLED" });
    }
    throw error;
  }
}

export async function authorizeSingleTransfer(companyId, batchId, otp) {
  const batch = await prisma.companyPaystackBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Paystack payroll batch not found.", 404);
  if (batch.transferMode !== "SINGLE" || batch.providerStatus !== "PENDING_AUTHORIZATION") throw new AppError("This Paystack batch is not awaiting single-transfer OTP authorization.", 409);
  if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter the OTP sent by Paystack.", 400);
  const transferCode = batch.providerResponse?.transferCode;
  if (!transferCode) throw new AppError("Paystack transfer code is missing. Reconcile the batch before continuing.", 409);
  const connection = await requiredConnection(companyId);
  const result = await companyPaystackEndpoints.finalizeTransfer(connection, transferCode, otp);
  const data = result.data || {};
  const reference = batch.providerResponse?.reference;
  const disbursement = await prisma.payrollDisbursement.findFirst({ where: { companyId, externalReference: reference, provider: "PAYSTACK_COMPANY" } });
  if (disbursement) await updateDisbursement(disbursement, data, reference, connection.environment, false);
  const transferStatus = paystackStatus(data);
  await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: connection.environment !== "live" && transferStatus === "success" ? "TEST_SUCCESS" : transferStatus === "success" ? "AWAITING_VERIFICATION" : "PROCESSING", providerResponse: { ...batch.providerResponse, data }, authorizedAt: new Date() } });
  await markPayrollPaidIfComplete(companyId, batch.payrollPeriodId);
  return { batchReference: batch.batchReference, status: paystackStatus(data).toUpperCase() };
}

async function recordVerifiedTransfer(companyId, reference, data) {
  const row = await prisma.payrollDisbursement.findFirst({ where: { companyId, provider: "PAYSTACK_COMPANY", externalReference: reference } });
  if (!row) return false;
  const expectedAmountKobo = toKobo(row.amount);
  if (String(data?.reference || "") !== String(reference)
    || String(data?.currency || "").toUpperCase() !== "NGN"
    || !Number.isSafeInteger(Number(data?.amount))
    || Number(data.amount) !== expectedAmountKobo) {
    throw new AppError("Verified Paystack transfer does not match this employee's saved reference, NGN currency and exact salary amount. No payroll payment status was changed.", 409, { code: "PAYSTACK_VERIFY_AMOUNT_MISMATCH" });
  }
  const connection = await prisma.companyPaystackConnection.findUnique({ where: { companyId } });
  await updateDisbursement(row, data, reference, connection?.environment || "live", true);
  await markPayrollPaidIfComplete(companyId, row.periodId);
  return true;
}

export async function refreshBatch(companyId, batchId) {
  const batch = await prisma.companyPaystackBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Paystack payroll batch not found.", 404);
  const connection = await requiredConnection(companyId);
  const refs = [...new Set((batch.providerResponse?._emsTransactionMap || []).map((item) => item?.reference).filter(Boolean))];
  if (!refs.length) throw new AppError("This batch has no submitted transfer references to verify.", 409, { code: "PAYSTACK_BATCH_HAS_NO_REFERENCES" });
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId: batch.payrollPeriodId, provider: "PAYSTACK_COMPANY", externalReference: { in: refs } }, select: { id: true, externalReference: true } });
  const foundReferences = new Set(rows.map((row) => row.externalReference));
  const missingResults = refs.filter((reference) => !foundReferences.has(reference)).map((reference) => ({ reference, error: "The saved payroll transfer reference no longer matches a company disbursement record. Manual reconciliation is required." }));
  // Bounded concurrency keeps large payroll reconciliations practical without flooding Paystack.
  const checkedResults = await mapWithConcurrency(rows, 4, async (row) => {
    try {
      const response = await companyPaystackEndpoints.verifyTransfer(connection, row.externalReference);
      const data = response.data || {};
      if (String(data.reference || "") !== String(row.externalReference) || String(data.currency || "").toUpperCase() !== "NGN") {
        throw new AppError("Paystack verification did not match the saved transfer reference and NGN currency.", 409, { code: "PAYSTACK_VERIFY_MISMATCH" });
      }
      await recordVerifiedTransfer(companyId, row.externalReference, data);
      return { reference: row.externalReference, status: paystackStatus(data).toUpperCase() };
    } catch (error) { return { reference: row.externalReference, error: error.message }; }
  });
  const results = [...missingResults, ...checkedResults];
  const allTerminal = results.length > 0 && results.every((item) => !item.error && ["SUCCESS", "FAILED", "REVERSED", "BLOCKED", "REJECTED", "ABANDONED"].includes(item.status));
  const allSuccess = allTerminal && results.every((item) => item.status === "SUCCESS");
  const previousResponse = batch.providerResponse && typeof batch.providerResponse === "object" ? batch.providerResponse : {};
  const hasRejectedChunk = Array.isArray(previousResponse.chunks) && previousResponse.chunks.some((chunk) => chunk?.status === "REJECTED");
  const providerStatus = results.some((item) => item.error) ? "SUBMISSION_UNKNOWN" : allSuccess ? (hasRejectedChunk ? "COMPLETED_WITH_ERRORS" : connection.environment === "live" ? "SUCCESS" : "TEST_SUCCESS") : allTerminal ? "COMPLETED_WITH_ERRORS" : "PROCESSING";
  // Preserve the original reference map and chunk audit trail so repeated refreshes remain possible.
  await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus, providerResponse: { ...previousResponse, verification: results, lastVerifiedAt: new Date().toISOString() }, lastCheckedAt: new Date() } });
  await markPayrollPaidIfComplete(companyId, batch.payrollPeriodId);
  return { batchReference: batch.batchReference, status: providerStatus, transfers: results };
}

export async function listBatches(companyId) {
  return prisma.companyPaystackBatch.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, environment: true, transferMode: true, totalAmount: true, totalTransactions: true, authorizedAt: true, lastCheckedAt: true, createdAt: true } });
}

export async function processCompanyPaystackWebhook(rawBody, signature, payload) {
  if (!String(payload?.event || "").toLowerCase().startsWith("transfer.")) return { matched: false };
  const reference = payload?.data?.reference;
  if (!reference) return { matched: false };
  const row = await prisma.payrollDisbursement.findFirst({ where: { provider: "PAYSTACK_COMPANY", externalReference: reference } });
  if (!row) return { matched: false };
  const connection = await prisma.companyPaystackConnection.findUnique({ where: { companyId: row.companyId } });
  if (!connection?.isActive) throw new AppError("Company Paystack connection is missing; cannot authenticate its transfer webhook.", 401, { code: "PAYSTACK_COMPANY_WEBHOOK_CONNECTION_MISSING" });
  const key = decryptCompanyPaystackSecret(connection.secretKeyCiphertext);
  const expected = crypto.createHmac("sha512", key).update(rawBody).digest("hex");
  const receivedBuffer = Buffer.from(String(signature || "")); const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) throw new AppError("Invalid company Paystack webhook signature.", 401, { code: "PAYSTACK_COMPANY_WEBHOOK_SIGNATURE_INVALID" });
  const verified = await companyPaystackEndpoints.verifyTransfer(connection, reference);
  const data = verified.data || {};
  if (String(data.reference || "") !== String(reference) || String(data.currency || "NGN").toUpperCase() !== "NGN") throw new AppError("Paystack transfer verification did not match the webhook reference and currency.", 409, { code: "PAYSTACK_COMPANY_WEBHOOK_VERIFICATION_MISMATCH" });
  await recordVerifiedTransfer(row.companyId, reference, data);
  return { matched: true, received: true, processed: true, reference, status: paystackStatus(data).toUpperCase() };
}
