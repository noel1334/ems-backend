import crypto from "node:crypto";
import Decimal from "decimal.js";
import prisma from "../../../config/database.js";
import AppError from "../../../common/errors/AppError.js";
import { encryptCompanyPaystackSecret, decryptCompanyPaystackSecret } from "./company-paystack.crypto.js";
import { companyPaystackEndpoints } from "./company-paystack.client.js";
import { canSubmitPaystackPreview, explainPaystackAccountError, isPaystackSandboxResolveLimitError, isSkippablePaystackAccountError, partitionPaystackEmployees, preparePaystackRecipients, recipientFailureSummary, shouldResolvePaystackAccounts } from "./company-paystack.utils.js";
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
  const shouldResolve = shouldResolvePaystackAccounts(connection.environment);
  const employees = await mapWithConcurrency(rows, 4, async (row) => {
    const selected = bankForEmployee(row.employee);
    const errors = [];
    if (selected.error) errors.push(selected.error);
    if (!row.payrollItem || new Decimal(row.amount).minus(row.payrollItem.netSalary).abs().greaterThan("0.001")) errors.push("The disbursement amount does not match the finalized payroll net salary.");
    try { toKobo(row.amount); } catch (error) { errors.push(error.message); }
    if (selected.account && !supported.has(selected.bankCode)) errors.push(`Bank code ${selected.bankCode} is not in this company's Paystack NGN bank directory. Update the employee's Paystack bank selection.`);
    let resolved = null;
    let sandboxResolutionDeferred = false;
    if (selected.account && !errors.length && shouldResolve) {
      try {
        const result = await companyPaystackEndpoints.resolveAccount(connection, selected.account.accountNumber, selected.bankCode);
        resolved = result.data;
        if (resolved?.account_number && String(resolved.account_number) !== String(selected.account.accountNumber)) {
          errors.push("Paystack returned a different account number than the one saved for this employee. Re-check the employee's account details before continuing.");
        }
        if (!namesCompatible(selected.account.accountName, resolved?.account_name)) errors.push(`The bank account resolves to "${resolved?.account_name || "unknown name"}", which does not sufficiently match the employee's saved account name.`);
      } catch (error) {
        if (connection.environment === "test" && isPaystackSandboxResolveLimitError(error.message)) {
          // A TEST-mode lookup quota is not evidence that an employee's bank
          // details are wrong. Defer provider acceptance to recipient creation.
          // All recipients are prepared before the first test transfer request.
          sandboxResolutionDeferred = true;
        } else if (isSkippablePaystackAccountError(error)) {
          errors.push(explainPaystackAccountError(error.message, selected.bankCode));
        } else {
          // A 401/429/5xx/network failure is not proof that this employee's
          // account is invalid. Abort preview rather than silently skip a good employee.
          throw error;
        }
      }
    }
    let estimatedFee = 0;
    try { estimatedFee = estimatePaystackTransferFee(Number(row.amount)); }
    catch (error) { errors.push(error.message || "Paystack transfer fee could not be estimated."); }
    const sandboxPreflight = connection.environment === "test" && (!shouldResolve || sandboxResolutionDeferred);
    return { disbursementId: row.id, employee: employeeName(row.employee), employeeId: row.employeeId, bankName: selected.account?.bankName || null, accountName: selected.account?.accountName || null, resolvedAccountName: resolved?.account_name || null, accountNumberLast4: selected.account?.accountNumber ? String(selected.account.accountNumber).slice(-4) : null, amount: new Decimal(row.amount).toFixed(2), estimatedFee: new Decimal(estimatedFee).toFixed(2), valid: errors.length === 0, validationStatus: errors.length ? "BLOCKED" : sandboxPreflight ? "SANDBOX_RECIPIENT_PREFLIGHT" : shouldResolve ? "PROVIDER_VERIFIED" : "LOCAL_ONLY", warnings: sandboxResolutionDeferred ? ["Paystack's TEST-mode daily live bank-lookup limit was reached. This beneficiary passed local checks only and is not bank-account verified in TEST mode."] : [], errors, _bankAccountId: selected.account?.id || null, _bankCode: selected.bankCode || null, _accountNumber: selected.account?.accountNumber || null, _accountName: selected.account?.accountName || null, _email: row.employee?.email || null };
  });
  if (!rows.length) throw new AppError("There are no pending disbursements in this payroll register. Refresh existing Paystack batches instead of submitting again.", 409, { code: "PAYSTACK_NO_PENDING_DISBURSEMENTS" });
  const digest = secretDigest(decryptCompanyPaystackSecret(connection.secretKeyCiphertext));
  const fingerprintSource = { companyId, periodId, environment: connection.environment, digest, rows: employees.map(({ disbursementId, amount, _bankAccountId, _bankCode, _accountNumber, _accountName }) => ({ disbursementId, amount, _bankAccountId, _bankCode, _accountNumber, _accountName })) };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(fingerprintSource)).digest("hex");
  const { eligible } = partitionPaystackEmployees(employees);
  const validCount = eligible.length;
  const invalidCount = employees.length - validCount;
  // Preview totals and required balance include only employees who can enter the batch.
  const totalAmount = eligible.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const estimatedFees = eligible.reduce((sum, item) => sum.plus(item.estimatedFee), new Decimal(0));
  const providerValidationComplete = validCount > 0 && eligible.every((item) => item.validationStatus === "PROVIDER_VERIFIED");
  const accountValidationMode = providerValidationComplete ? "PAYSTACK_RESOLVED" : connection.environment === "test" ? "SANDBOX_RECIPIENT_PREFLIGHT" : "LOCAL_FORMAT_ONLY";
  return { connection, period, employees, fingerprint, totalAmount: totalAmount.toFixed(2), estimatedFees: estimatedFees.toFixed(2), estimatedRequiredBalance: totalAmount.plus(estimatedFees).toFixed(2), validCount, invalidCount, accountValidationMode, providerValidationComplete, balance: null };
}

export async function previewPayroll(companyId, periodId) {
  const preview = await preparePreview(companyId, periodId);
  let balance = null; let balanceError = null;
  try { balance = balanceDetails(await companyPaystackEndpoints.balance(preview.connection)); }
  catch (error) { balanceError = error.message; }
  if (balanceError) throw new AppError(`Could not confirm the company's Paystack balance: ${balanceError}`, 502, { code: "PAYSTACK_BALANCE_CHECK_FAILED" });
  const insufficientBalance = preview.connection.environment === "live" && balance.balance < Number(preview.estimatedRequiredBalance);
  const canSubmit = canSubmitPaystackPreview({ environment: preview.connection.environment, validCount: preview.validCount, insufficientBalance, providerValidationComplete: preview.providerValidationComplete });
  const sandboxMode = preview.connection.environment === "test";
  const hasDeferredResolve = preview.employees.some((item) => item.validationStatus === "SANDBOX_RECIPIENT_PREFLIGHT" && item.warnings?.length);
  const sandboxNote = "TEST mode: EMS skips Paystack /bank/resolve lookups by default because the TEST account has a small daily allowance for real-bank lookups. The preview performs local format and bank-directory checks only. Creating a transfer recipient is not bank-account verification; Paystack's own recipient example can return account_name=null. Paystack TEST bulk transfers are simulated and return success without real bank processing, so TEST mode cannot prove that a real employee account number and bank code will receive a live salary. Do not mark a TEST recipient as verified.";
  const notes = [sandboxMode ? sandboxNote : "Live transfers use this company's Paystack NGN balance, not its ordinary bank account or the EMS internal wallet.", preview.providerValidationComplete ? "Every eligible employee bank account was resolved by this company's Paystack integration during this preview." : sandboxMode ? (hasDeferredResolve ? "The Paystack TEST lookup quota was reached for some employees. They have only passed local checks; recipient creation does not verify the underlying account name or prove live creditability." : "Paystack bank-name resolution was intentionally skipped in TEST mode. Employees pass local format and bank-directory checks only; live account verification is unavailable from this TEST preview.") : "WARNING: provider account resolution is incomplete; live submission is disabled.", preview.invalidCount ? `${preview.invalidCount} blocked employee(s) will be skipped. They will not be included in this Paystack batch and will remain pending for correction and later payment.` : "All listed employees passed the preview checks.", "Do not replace a real employee's saved Paystack bank code with a test-only lookup code. Keep each employee's actual Paystack bank selection unchanged.", "Paystack bulk transfers require Transfers OTP to be disabled in this company's Paystack Dashboard. OTP authorization is supported for a single transfer only; multiple transfers cannot be approved with one Paystack bulk OTP.", "Bulk payroll is split into groups of at most 100 and Paystack requests are spaced by at least five seconds.", "The fee total is an estimate using the published Nigerian transfer pricing and the backend fee settings. Paystack checks the actual transfer amount plus fee before accepting each request.", "If this company has configured a Paystack Transfer Approval URL, that separate approval callback is not implemented in this version; configure and test it before using that integration."];
  return { payrollPeriodId: periodId, environment: preview.connection.environment, balance: balance.balance, balanceKobo: balance.balanceKobo, totalAmount: preview.totalAmount, estimatedFees: preview.estimatedFees, estimatedRequiredBalance: preview.estimatedRequiredBalance, totalTransactions: preview.validCount, totalEmployees: preview.employees.length, validCount: preview.validCount, invalidCount: preview.invalidCount, skippedCount: preview.invalidCount, accountValidationMode: preview.accountValidationMode, providerValidationComplete: preview.providerValidationComplete, insufficientBalance, canSubmit, previewFingerprint: preview.fingerprint, employees: preview.employees.map(({ _bankAccountId, _bankCode, _accountNumber, _accountName, _email, ...publicItem }) => publicItem), notes };
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

  const { eligible, skipped: previewSkipped } = partitionPaystackEmployees(preview.employees);
  if (!eligible.length) {
    throw new AppError("No employee passed Paystack's preview checks. No transfer batch was created. Correct the blocked bank or payroll records and preview again.", 422, {
      code: "PAYSTACK_NO_VALID_BENEFICIARIES",
      details: { skippedCount: previewSkipped.length, skippedEmployees: previewSkipped.map((row) => ({ employee: row.employee, bankName: row.bankName, accountNumberLast4: row.accountNumberLast4, code: "PAYSTACK_PREVIEW_BLOCKED", message: (row.errors || []).join(" ") || "Failed local/provider validation." })), transfersInitiated: false },
    });
  }

  const activeBatch = await prisma.companyPaystackBatch.findFirst({ where: { companyId, payrollPeriodId: periodId, providerStatus: { in: ["SUBMITTING", "SUBMISSION_UNKNOWN", "PENDING_AUTHORIZATION", "AWAITING_VERIFICATION", "PROCESSING", "PENDING"] } } });
  if (activeBatch) throw new AppError("A Paystack batch already exists for this payroll period. Refresh or reconcile it before another submission.", 409, { code: "PAYSTACK_BATCH_ALREADY_EXISTS", batchReference: activeBatch.batchReference });

  // Prepare each eligible recipient independently. A rejected bank/account is skipped,
  // while the remaining valid beneficiaries continue. No transfer endpoint is called
  // until every recipient-preparation attempt has completed.
  const recipientResult = await preparePaystackRecipients(
    eligible,
    async (row) => ({
      ...row,
      recipientCode: await getOrCreateRecipient(companyId, connection, row),
      reference: newReference(),
      amountKobo: toKobo(row.amount),
    }),
    (row, error) => ({
      ...recipientFailureSummary(row, error),
      code: error?.code || error?.details?.code || "PAYSTACK_RECIPIENT_FAILED",
      phase: "RECIPIENT_PREPARATION",
    }),
    4,
  );
  const recipientFailures = recipientResult.failed.map((result) => result.failure);
  const fatalRecipientFailures = recipientResult.fatal.map((result) => result.failure);
  const skippedEmployees = [
    ...previewSkipped.map((row) => ({
      employee: row.employee,
      bankName: row.bankName || "Unknown bank",
      accountNumberLast4: row.accountNumberLast4 || "",
      code: "PAYSTACK_PREVIEW_BLOCKED",
      phase: "PREVIEW_VALIDATION",
      message: (row.errors || []).join(" ") || "This employee did not pass Paystack preview validation.",
    })),
    ...recipientFailures,
  ];

  // Keep skipped disbursements pending and unattached to a Paystack batch so they
  // can be corrected and submitted later without affecting successful colleagues.
  for (const result of recipientResult.failed) {
    await prisma.payrollDisbursement.updateMany({
      where: { id: result.row.disbursementId, companyId, periodId, status: "PENDING", provider: null },
      data: { failureReason: `${result.failure.code}: ${result.failure.message}`.slice(0, 500) },
    });
  }

  // Do not convert operational failures (auth, rate limiting, timeout, provider
  // outage) into employee skips. No transfer batch exists yet, so safely abort.
  if (fatalRecipientFailures.length) {
    throw new AppError("Paystack recipient preparation encountered an operational error. No salary transfers were initiated. Retry after resolving the Paystack connection or provider issue.", 502, {
      code: "PAYSTACK_RECIPIENT_PREPARATION_INCOMPLETE",
      details: { transfersInitiated: false, preparedCount: recipientResult.prepared.length, skippedCount: skippedEmployees.length, skippedEmployees, operationalFailures: fatalRecipientFailures },
    });
  }

  const prepared = recipientResult.prepared;
  if (!prepared.length) {
    throw new AppError("Every otherwise eligible employee failed Paystack recipient preparation. No salary transfers were initiated; all affected employees remain pending.", 422, {
      code: "PAYSTACK_NO_PREPARED_RECIPIENTS",
      details: { skippedCount: skippedEmployees.length, skippedEmployees, transfersInitiated: false },
    });
  }

  const submittedTotal = prepared.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const submittedFees = prepared.reduce((sum, item) => sum.plus(item.estimatedFee || 0), new Decimal(0));
  const submittedRequired = submittedTotal.plus(submittedFees);
  if (connection.environment === "live") {
    const currentBalance = balanceDetails(await companyPaystackEndpoints.balance(connection));
    if (currentBalance.balance < Number(submittedRequired.toFixed(2))) {
      throw new AppError("The company's Paystack balance is lower than the eligible salary total plus estimated fees. Fund the Paystack balance and preview again. No salary transfers were initiated.", 409, {
        code: "PAYSTACK_INSUFFICIENT_BALANCE",
        balance: currentBalance.balance,
        required: submittedRequired.toFixed(2),
        totalAmount: submittedTotal.toFixed(2),
        estimatedFees: submittedFees.toFixed(2),
      });
    }
  }

  const batchReference = newReference();
  const mode = prepared.length === 1 ? "SINGLE" : "BULK";
  const skippedMetadata = { skippedEmployees, skippedCount: skippedEmployees.length, recipientFailures, transfersInitiated: false };
  // Re-check under a serializable transaction after recipient preparation so concurrent
  // admins cannot create two payroll batches for the same period.
  const batch = await prisma.$transaction(async (tx) => {
    const openBatch = await tx.companyPaystackBatch.findFirst({
      where: { companyId, payrollPeriodId: periodId, providerStatus: { in: ["SUBMITTING", "SUBMISSION_UNKNOWN", "PENDING_AUTHORIZATION", "AWAITING_VERIFICATION", "PROCESSING", "PENDING"] } },
      select: { batchReference: true, providerStatus: true },
    });
    if (openBatch) throw new AppError(`A Paystack batch already exists for this payroll period (${openBatch.batchReference}, ${openBatch.providerStatus}). Reconcile it before submitting another batch.`, 409, { code: "PAYSTACK_BATCH_ALREADY_EXISTS", batchReference: openBatch.batchReference });
    return tx.companyPaystackBatch.create({
      data: {
        companyId,
        payrollPeriodId: periodId,
        batchReference,
        providerStatus: "SUBMITTING",
        environment: connection.environment,
        transferMode: mode,
        totalAmount: submittedTotal,
        totalTransactions: prepared.length,
        submittedBy: userId,
        providerResponse: { phase: "RECIPIENTS_PREPARED", ...skippedMetadata },
      },
    });
  }, { isolationLevel: "Serializable" });

  try {
    if (mode === "SINGLE") {
      const item = prepared[0];
      const referenceMap = [{ reference: item.reference, disbursementId: item.disbursementId }];
      await prisma.payrollDisbursement.update({ where: { id: item.disbursementId }, data: { provider: "PAYSTACK_COMPANY", method: "PAYSTACK_COMPANY_DIRECT", externalReference: item.reference, status: "PROCESSING", providerStatus: "SUBMITTING", providerResponse: { phase: "SUBMITTING" }, failureReason: null } });
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerResponse: { ...skippedMetadata, transfersInitiated: true, _emsTransactionMap: referenceMap, reference: item.reference } } });
      const result = await companyPaystackEndpoints.initiateSingle(connection, { source: "balance", amount: item.amountKobo, recipient: item.recipientCode, reference: item.reference, reason: `EMS salary ${periodId}`.slice(0, 100), currency: "NGN" });
      const data = result.data || {};
      await updateDisbursement({ id: item.disbursementId }, data, item.reference, connection.environment, false);
      const status = paystackStatus(data);
      const providerStatus = status === "otp" ? "PENDING_AUTHORIZATION" : (connection.environment !== "live" && status === "success" ? "TEST_SUCCESS" : status === "success" ? "AWAITING_VERIFICATION" : "PROCESSING");
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus, providerResponse: { ...skippedMetadata, data, reference: item.reference, transferCode: data.transfer_code || null, _emsTransactionMap: referenceMap }, ...(status === "otp" ? {} : { authorizedAt: new Date() }) } });
      return {
        id: batch.id,
        batchReference,
        transferMode: mode,
        status: providerStatus,
        requiresOtp: status === "otp",
        totalAmount: Number(submittedTotal.toFixed(2)),
        totalTransactions: 1,
        skippedCount: skippedEmployees.length,
        skippedEmployees,
      };
    }

    const chunks = [];
    for (let i = 0; i < prepared.length; i += 100) chunks.push(prepared.slice(i, i + 100));
    const transactionMap = [];
    const chunkResults = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      const chunkReferences = chunk.map((item) => ({ reference: item.reference, disbursementId: item.disbursementId }));
      await prisma.payrollDisbursement.updateMany({
        where: { id: { in: chunk.map((item) => item.disbursementId) }, companyId, status: "PENDING", provider: null },
        data: { provider: "PAYSTACK_COMPANY", method: "PAYSTACK_COMPANY_DIRECT", status: "PROCESSING", providerStatus: "SUBMITTING", failureReason: null },
      });
      transactionMap.push(...chunkReferences);
      const chunkMeta = { index: chunkIndex + 1, status: "SUBMITTING", count: chunk.length, references: chunkReferences.map((item) => item.reference) };
      chunkResults.push(chunkMeta);
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: chunkIndex === 0 ? "SUBMITTING" : "PROCESSING", providerResponse: { ...skippedMetadata, _emsTransactionMap: transactionMap, chunks: chunkResults } } });
      try {
        // Persist intent immediately before the provider call. If the network drops,
        // the batch is treated as uncertain and reconciled rather than resubmitted.
        await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerResponse: { ...skippedMetadata, transfersInitiated: true, _emsTransactionMap: transactionMap, chunks: chunkResults } } });
        const transfers = chunk.map((item) => ({ amount: item.amountKobo, recipient: item.recipientCode, reference: item.reference, reason: `EMS salary ${periodId}`.slice(0, 100) }));
        const result = await companyPaystackEndpoints.initiateBulk(connection, { source: "balance", currency: "NGN", transfers });
        const returned = Array.isArray(result.data) ? result.data : Array.isArray(result.data?.transfers) ? result.data.transfers : [];
        if (returned.length !== chunk.length) throw new AppError("Paystack accepted a response that could not be matched to every employee in this batch. The batch is locked for reconciliation; do not submit it again.", 502, { code: "PAYSTACK_RESPONSE_MAPPING_INCOMPLETE" });
        for (const item of chunk) {
          const providerItem = returned.find((candidate) => candidate.reference === item.reference);
          if (!providerItem) throw new AppError("A transfer reference was missing from Paystack's bulk response. The batch is locked for reconciliation; do not submit it again.", 502, { code: "PAYSTACK_RESPONSE_REFERENCE_MISSING" });
          await updateDisbursement({ id: item.disbursementId }, providerItem, item.reference, connection.environment, false);
        }
        chunkMeta.status = "ACCEPTED";
        chunkMeta.response = returned;
        await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: "PROCESSING", providerResponse: { ...skippedMetadata, _emsTransactionMap: transactionMap, chunks: chunkResults } } });
      } catch (error) {
        const definitive = Boolean(error?.statusCode && error.statusCode >= 400 && error.statusCode < 500);
        if (definitive) {
          await prisma.payrollDisbursement.updateMany({ where: { id: { in: chunk.map((item) => item.disbursementId) }, companyId, provider: "PAYSTACK_COMPANY", providerStatus: "SUBMITTING", verifiedAt: null }, data: { provider: null, method: "MANUAL_BANK_TRANSFER", externalReference: null, providerTransferId: null, providerStatus: null, providerResponse: null, status: "PENDING", failureReason: null, paidAt: null, verifiedAt: null } });
          transactionMap.splice(transactionMap.length - chunkReferences.length, chunkReferences.length);
          chunkMeta.status = "REJECTED";
          chunkMeta.error = error.message;
          await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: transactionMap.length ? "PROCESSING" : "FAILED", providerResponse: { ...skippedMetadata, transfersInitiated: transactionMap.length > 0, _emsTransactionMap: transactionMap, chunks: chunkResults, error: error.message } } });
        } else {
          chunkMeta.status = "SUBMISSION_UNKNOWN";
          chunkMeta.error = error.message;
          await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { ...skippedMetadata, _emsTransactionMap: transactionMap, chunks: chunkResults, error: error.message } } });
        }
        const providerMessage = String(error?.message || "");
        if (/otp|one.?time password|transfer approval|two.?factor/i.test(providerMessage)) {
          throw new AppError("Paystack rejected the bulk request because Transfers OTP/approval is enabled. Paystack's bulk endpoint cannot use OTP; disable Transfers OTP in this company's Paystack Dashboard for multi-employee payroll. A single eligible employee can use the single-transfer OTP flow.", 409, { code: "PAYSTACK_BULK_OTP_ENABLED" });
        }
        throw error;
      }
      if (chunkIndex < chunks.length - 1) await sleep(5000);
    }
    const acceptedStatuses = chunkResults.flatMap((chunk) => chunk.response || []).map((item) => paystackStatus(item));
    const allSuccess = acceptedStatuses.length === prepared.length && acceptedStatuses.every((status) => status === "success");
    const finalStatus = allSuccess ? (connection.environment === "live" ? "AWAITING_VERIFICATION" : "TEST_SUCCESS") : "PROCESSING";
    await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: finalStatus, providerResponse: { ...skippedMetadata, _emsTransactionMap: transactionMap, chunks: chunkResults } } });
    return {
      id: batch.id,
      batchReference,
      transferMode: mode,
      status: finalStatus,
      requiresOtp: false,
      totalAmount: Number(submittedTotal.toFixed(2)),
      totalTransactions: prepared.length,
      chunks: chunks.length,
      skippedCount: skippedEmployees.length,
      skippedEmployees,
    };
  } catch (error) {
    const current = await prisma.companyPaystackBatch.findUnique({ where: { id: batch.id } });
    if (current?.providerStatus === "SUBMITTING") {
      const savedReferences = current.providerResponse?._emsTransactionMap || [];
      const definitive = savedReferences.length === 0 || Boolean(error?.statusCode && error.statusCode >= 400 && error.statusCode < 500);
      if (definitive && savedReferences.length) {
        await prisma.payrollDisbursement.updateMany({
          where: { companyId, id: { in: savedReferences.map((item) => item.disbursementId) }, provider: "PAYSTACK_COMPANY", providerStatus: "SUBMITTING", verifiedAt: null },
          data: { provider: null, method: "MANUAL_BANK_TRANSFER", externalReference: null, providerTransferId: null, providerStatus: null, providerResponse: null, status: "PENDING", failureReason: null, paidAt: null, verifiedAt: null },
        });
      }
      await prisma.companyPaystackBatch.update({ where: { id: batch.id }, data: { providerStatus: definitive ? "FAILED" : "SUBMISSION_UNKNOWN", providerResponse: { ...((current.providerResponse && typeof current.providerResponse === "object") ? current.providerResponse : {}), ...(definitive && savedReferences.length ? { transfersInitiated: false } : {}), error: { message: error.message, code: error?.code || "UPSTREAM_ERROR" } } } });
    }
    const providerMessage = String(error?.message || "");
    if (mode === "BULK" && /otp|one.?time password|transfer approval|two.?factor/i.test(providerMessage)) {
      throw new AppError("Paystack rejected the bulk request because Transfers OTP/approval is enabled. Paystack's bulk endpoint cannot use OTP; disable Transfers OTP in this company's Paystack Dashboard for multi-employee payroll. A single eligible employee can use the single-transfer OTP flow.", 409, { code: "PAYSTACK_BULK_OTP_ENABLED" });
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
  const storedStatus = connection.environment !== "live" && transferStatus === "success" ? "TEST_SUCCESS" : transferStatus === "success" ? "AWAITING_VERIFICATION" : "PROCESSING";
  return {
    batchReference: batch.batchReference,
    status: storedStatus,
    authorizationAccepted: true,
    finalStatusConfirmed: false,
    message: connection.environment === "live"
      ? "Paystack accepted the OTP and queued the transfer. This is not final payment confirmation; verify the transfer or wait for the transfer webhook."
      : "Paystack accepted the OTP for this TEST transfer. The result is simulated and does not mean real salary money was sent.",
  };
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
  const rows = await prisma.companyPaystackBatch.findMany({
    where: { companyId }, orderBy: { createdAt: "desc" }, take: 25,
    select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, environment: true, transferMode: true, totalAmount: true, totalTransactions: true, authorizedAt: true, lastCheckedAt: true, createdAt: true, providerResponse: true },
  });
  return rows.map(({ providerResponse, ...batch }) => {
    const references = Array.isArray(providerResponse?._emsTransactionMap) ? providerResponse._emsTransactionMap : [];
    const failures = Array.isArray(providerResponse?.recipientFailures) ? providerResponse.recipientFailures : [];
    const skipped = Array.isArray(providerResponse?.skippedEmployees) ? providerResponse.skippedEmployees : [];
    const rawError = providerResponse?.error;
    const failureMessage = typeof rawError === "string" ? rawError : rawError?.message || null;
    return { ...batch, recipientFailures: failures, skippedEmployees: skipped, skippedCount: Number(providerResponse?.skippedCount ?? skipped.length), failureMessage, canVerify: references.length > 0 };
  });
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
