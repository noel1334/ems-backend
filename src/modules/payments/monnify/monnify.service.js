import crypto from "node:crypto";
import prisma from "../../../config/database.js";
import AppError from "../../../common/errors/AppError.js";
import { encryptMonnifySecret, decryptMonnifySecret } from "./monnify.crypto.js";
import { monnifyEndpoints } from "./monnify.client.js";
import { canonicalMonnifyBankName, normalizeMonnifyBanks } from "./monnify.utils.js";
import {
  monnifyTransactionFailureReason,
  monnifyTransactionReference,
  monnifyTransactionStatus,
  normalizeMonnifyTransactionMap,
  unwrapMonnifyTransactionRows,
  isMonnifyBatchFullyReconciled,
} from "./monnify.reconciliation.utils.js";

const OPEN_BATCH_STATUSES = [
  "SUBMITTING",
  "SUBMISSION_UNKNOWN",
  "PENDING",
  "PENDING_AUTHORIZATION",
  "PENDING_BATCH_AUTHORIZATION",
  "OTP_EMAIL_DISPATCH_FAILED",
  "AWAITING_PROCESSING",
  "IN_PROGRESS",
];

const safe = (row) => row
  ? {
      connected: true,
      environment: row.environment,
      sourceAccountNumber: row.sourceAccountNumber,
      isActive: row.isActive,
      lastTestedAt: row.lastTestedAt,
      updatedAt: row.updatedAt,
    }
  : { connected: false };

const normalizeNameTokens = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/)
  .filter((token) => token.length > 1);

const accountNamesCompatible = (savedName, resolvedName) => {
  const saved = [...new Set(normalizeNameTokens(savedName))];
  const resolved = [...new Set(normalizeNameTokens(resolvedName))];
  if (!saved.length || !resolved.length) return false;
  if (saved.join(" ") === resolved.join(" ")) return true;
  if (Math.min(saved.length, resolved.length) < 2) return false;
  const shorter = saved.length <= resolved.length ? saved : resolved;
  const longer = saved.length <= resolved.length ? resolved : saved;
  return shorter.every((token) => longer.includes(token));
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
};

const requiredConnection = async (companyId) => {
  const row = await prisma.companyMonnifyConnection.findUnique({ where: { companyId } });
  if (!row?.isActive) throw new AppError("Connect this company's Monnify account first.", 409, { code: "MONNIFY_NOT_CONNECTED" });
  return row;
};

const findOpenBatch = async (companyId, db = prisma) => {
  const candidates = await db.companyMonnifyBatch.findMany({
    where: { companyId, providerStatus: { in: OPEN_BATCH_STATUSES } },
    orderBy: { createdAt: "asc" },
    select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, environment: true, totalTransactions: true },
  });

  for (const batch of candidates) {
    const disbursements = batch.payrollPeriodId
      ? await db.payrollDisbursement.findMany({
          where: { companyId, periodId: batch.payrollPeriodId, provider: "MONNIFY", providerTransferId: batch.batchReference },
          select: { status: true },
        })
      : [];

    // Some Monnify accounts leave the aggregate batch at AWAITING_PROCESSING
    // after every beneficiary already has a final result. Trust only a complete
    // one-to-one set of per-employee terminal outcomes, never aggregate counts.
    if (isMonnifyBatchFullyReconciled(batch, disbursements)) {
      await db.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: "COMPLETED" } });
      continue;
    }
    return batch;
  }
  return null;
};

const assertBatchEnvironment = (connection, batch) => {
  if (String(connection.environment).toLowerCase() !== String(batch.environment || "sandbox").toLowerCase()) {
    throw new AppError(
      `This batch was created in ${String(batch.environment || "sandbox").toUpperCase()}, but the current company connection is ${String(connection.environment).toUpperCase()}. Restore the matching Monnify environment and credentials before authorizing or refreshing this batch.`,
      409,
      { code: "MONNIFY_BATCH_ENVIRONMENT_MISMATCH" },
    );
  }
};

export async function getConnection(companyId) {
  return safe(await prisma.companyMonnifyConnection.findUnique({ where: { companyId } }));
}

export async function saveConnection(companyId, input) {
  const { apiKey, apiSecret, contractCode, sourceAccountNumber, environment = "sandbox" } = input;
  if (![apiKey, apiSecret, contractCode].every((value) => typeof value === "string" && value.trim()) || !/^\d{10}$/.test(String(sourceAccountNumber || ""))) {
    throw new AppError("API key, API secret, contract code and a 10-digit source account number are required.", 400);
  }
  if (!["sandbox", "live"].includes(environment)) throw new AppError("Environment must be sandbox or live.", 400);

  const existing = await prisma.companyMonnifyConnection.findUnique({ where: { companyId } });
  const openBatch = await findOpenBatch(companyId);
  if (existing && openBatch && String(existing.environment).toLowerCase() !== environment) {
    throw new AppError(
      `Cannot switch Monnify from ${String(existing.environment).toUpperCase()} to ${environment.toUpperCase()} while batch ${openBatch.batchReference} is ${openBatch.providerStatus}. Complete or reconcile that batch first.`,
      409,
      { code: "MONNIFY_ENVIRONMENT_CHANGE_BLOCKED" },
    );
  }

  const data = {
    apiKeyCiphertext: encryptMonnifySecret(apiKey.trim()),
    apiSecretCiphertext: encryptMonnifySecret(apiSecret.trim()),
    contractCodeCiphertext: encryptMonnifySecret(contractCode.trim()),
    sourceAccountNumber,
    environment,
    isActive: true,
  };
  const row = await prisma.companyMonnifyConnection.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
  return safe(row);
}

export async function removeConnection(companyId) {
  const openBatch = await findOpenBatch(companyId);
  if (openBatch) {
    throw new AppError(`Cannot disconnect Monnify while batch ${openBatch.batchReference} is ${openBatch.providerStatus}. Refresh and reconcile it first.`, 409, { code: "MONNIFY_OPEN_BATCH_EXISTS" });
  }
  await prisma.companyMonnifyConnection.deleteMany({ where: { companyId } });
  return { connected: false };
}

export async function testConnection(companyId) {
  const row = await requiredConnection(companyId);
  const balance = await monnifyEndpoints.balance(row, row.sourceAccountNumber);
  await prisma.companyMonnifyConnection.update({ where: { companyId }, data: { lastTestedAt: new Date() } });
  return {
    connected: true,
    environment: row.environment,
    sourceAccountNumber: row.sourceAccountNumber,
    balance,
    note: "This is the Monnify disbursement wallet balance. It is separate from the EMS internal company wallet.",
  };
}

export async function listBanks(companyId) {
  const row = await requiredConnection(companyId);
  const payload = await monnifyEndpoints.banks(row);
  const banks = normalizeMonnifyBanks(payload);
  if (!banks.length) throw new AppError("Monnify returned no supported bank records. Refresh the directory or contact Monnify support.", 502, { code: "MONNIFY_BANK_DIRECTORY_EMPTY" });
  return { environment: row.environment, banks };
}

export async function validateAccount(companyId, accountNumber, bankCode) {
  const number = String(accountNumber || "").trim();
  const code = String(bankCode || "").trim();
  if (!/^\d{10}$/.test(number) || !/^\d{2,10}$/.test(code)) {
    throw new AppError("Enter a 10-digit account number and select a bank from Monnify's bank directory.", 400, { code: "MONNIFY_BENEFICIARY_INPUT_INVALID" });
  }

  const connection = await requiredConnection(companyId);
  const banks = normalizeMonnifyBanks(await monnifyEndpoints.banks(connection));
  const selectedBank = banks.find((bank) => bank.code === code);
  if (!selectedBank) throw new AppError("The selected bank code is not present in the current Monnify bank directory. Reload the bank list and select the bank again.", 400, { code: "MONNIFY_BANK_CODE_NOT_IN_DIRECTORY" });

  const resolved = await monnifyEndpoints.validateAccount(connection, number, selectedBank.code);
  const accountName = String(resolved?.accountName ?? resolved?.account_name ?? resolved?.name ?? "").trim();
  const resolvedNumber = String(resolved?.accountNumber ?? resolved?.account_number ?? number).trim();
  const resolvedCode = String(resolved?.bankCode ?? resolved?.bank_code ?? selectedBank.code).trim();
  if (accountName.length < 2) throw new AppError("Monnify did not return a verified account name. Do not use this account for payroll until it can be verified.", 422, { code: "MONNIFY_ACCOUNT_NAME_MISSING" });
  if (resolvedNumber !== number || resolvedCode !== selectedBank.code) {
    throw new AppError("Monnify's Name Enquiry response did not match the requested account number and bank code. Retry the enquiry before saving this beneficiary.", 422, {
      code: "MONNIFY_BENEFICIARY_RESPONSE_MISMATCH",
      details: { requested: { accountNumber: `••••${number.slice(-4)}`, bankCode: selectedBank.code }, returned: { accountNumber: `••••${resolvedNumber.slice(-4)}`, bankCode: resolvedCode } },
    });
  }

  return {
    verified: true,
    environment: connection.environment,
    bankName: String(resolved?.bankName ?? resolved?.bank_name ?? selectedBank.name),
    bankCode: selectedBank.code,
    accountNumber: resolvedNumber,
    accountName,
  };
}

// Shared employee-profile adapter: always resolves against this tenant's Monnify
// connection and returns a server-generated verification timestamp.
export async function resolveMonnifyAccount(companyId, accountNumber, bankCode) {
  const resolved = await validateAccount(companyId, accountNumber, bankCode);
  return { ...resolved, verifiedAt: new Date().toISOString() };
}

const resolveBatchBank = (transaction, banks, index) => {
  const bankName = String(transaction.bankName || "").trim();
  const suppliedCode = String(transaction.bankCode || "").trim();
  let bank = null;

  if (suppliedCode) {
    // A code explicitly selected from Monnify's own directory is authoritative.
    // The canonical bankName may legitimately differ from Monnify's display label.
    bank = banks.find((candidate) => candidate.code === suppliedCode) || null;
  } else if (bankName) {
    // Backward compatibility for older employee accounts without a saved Monnify code.
    const bankKey = bankMatchKey(bankName);
    const matches = banks.filter((candidate) => bankMatchKey(candidate.name) === bankKey);
    bank = matches.length === 1 ? matches[0] : null;
  }

  if (!bank) {
    const label = String(transaction.employeeName || transaction.employee || `transaction ${index + 1}`).trim();
    throw new AppError(`${label}: bank name is not matched in Monnify's current directory. Select the bank from the directory; do not guess or change its code.`, 422, { code: "MONNIFY_BANK_NOT_MAPPED" });
  }
  if (suppliedCode && suppliedCode !== bank.code) {
    throw new AppError(`The supplied bank code for ${transaction.employeeName || `transaction ${index + 1}`} does not match the selected bank in Monnify's directory.`, 422, { code: "MONNIFY_BANK_CODE_MISMATCH" });
  }
  return bank;
};

export async function submitBatch(companyId, payrollPeriodId, userId, input) {
  const connection = await requiredConnection(companyId);
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(String(payrollPeriodId || ""))) throw new AppError("Invalid payroll period reference.", 400);
  if (!Array.isArray(input?.transactions) || !input.transactions.length || input.transactions.length > 5000) {
    throw new AppError("Provide between 1 and 5,000 salary transactions.", 400);
  }

  const period = await prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, companyId, deletedAt: null }, select: { id: true, status: true } });
  if (!period) throw new AppError("Payroll period not found for this company.", 404);
  if (period.status !== "FINALIZED") throw new AppError("Only finalized payroll can be submitted to Monnify.", 409);

  const duplicateActiveBatch = await findOpenBatch(companyId);
  if (duplicateActiveBatch) {
    throw new AppError(`This payroll period already has a Monnify batch (${duplicateActiveBatch.batchReference}) with status ${duplicateActiveBatch.providerStatus}. Refresh and reconcile it; do not submit a duplicate batch.`, 409, { code: "MONNIFY_DUPLICATE_PAYROLL_BATCH" });
  }

  const banks = normalizeMonnifyBanks(await monnifyEndpoints.banks(connection));
  if (!banks.length) throw new AppError("Monnify's bank directory is unavailable. No batch was submitted.", 503, { code: "MONNIFY_BANK_DIRECTORY_UNAVAILABLE" });

  const references = new Set();
  const prepared = input.transactions.map((transaction, index) => {
    const reference = String(transaction.reference || `EMS-${crypto.randomUUID()}`).trim();
    if (references.has(reference)) throw new AppError("Duplicate employee payment reference in batch.", 400);
    references.add(reference);

    const employeeName = String(transaction.employeeName || transaction.employee || `Employee ${index + 1}`).trim();
    const accountNumber = String(transaction.accountNumber || "").trim();
    const accountName = String(transaction.accountName || "").trim();
    const amount = Number(transaction.amount);
    if (!/^\d{10}$/.test(accountNumber) || accountName.length < 2 || !Number.isFinite(amount) || amount <= 0) {
      throw new AppError(`${employeeName}: account number, saved account name and positive salary amount are required.`, 400, { code: "MONNIFY_BENEFICIARY_INPUT_INVALID" });
    }
    const bank = resolveBatchBank(transaction, banks, index);
    return {
      employeeName,
      bankName: bank.name,
      bankCode: bank.code,
      accountNumber,
      savedAccountName: accountName,
      amount: Number(amount.toFixed(2)),
      reference,
      narration: String(transaction.narration || `Salary payment - ${employeeName}`).slice(0, 80),
    };
  });

  // Re-run Name Enquiry on the server immediately before creating a batch. Client-side
  // validation results are never treated as authorization to disburse funds.
  const validationResults = await mapWithConcurrency(prepared, 5, async (transaction) => {
    try {
      const response = await monnifyEndpoints.validateAccount(connection, transaction.accountNumber, transaction.bankCode);
      const verifiedName = String(response?.accountName ?? response?.account_name ?? response?.name ?? "").trim();
      const verifiedAccountNumber = String(response?.accountNumber ?? response?.account_number ?? transaction.accountNumber).trim();
      const verifiedBankCode = String(response?.bankCode ?? response?.bank_code ?? transaction.bankCode).trim();
      if (verifiedName.length < 2 || verifiedAccountNumber !== transaction.accountNumber || verifiedBankCode !== transaction.bankCode) {
        throw new AppError("Monnify did not return a complete matching beneficiary record.", 422, { code: "MONNIFY_BENEFICIARY_RESPONSE_MISMATCH" });
      }
      if (!accountNamesCompatible(transaction.savedAccountName, verifiedName)) {
        throw new AppError(`The saved account name does not sufficiently match Monnify's verified name (${verifiedName}). Correct and re-verify the employee's bank details before submitting.`, 422, { code: "MONNIFY_ACCOUNT_NAME_MISMATCH" });
      }
      return { ...transaction, verifiedAccountName: verifiedName };
    } catch (error) {
      return { ...transaction, validationError: String(error?.message || "Monnify could not verify this beneficiary."), validationCode: error?.code || "MONNIFY_VALIDATION_FAILED" };
    }
  });

  const blocked = validationResults.filter((result) => result.validationError);
  if (blocked.length) {
    const details = blocked.map((result) => ({
      employee: result.employeeName,
      bank: result.bankName,
      accountEnding: result.accountNumber.slice(-4),
      code: result.validationCode,
      message: result.validationError,
    }));
    throw new AppError(
      `${blocked.length} beneficiary account(s) failed Monnify re-validation. No payroll batch was submitted. Correct or re-verify only the affected employee records, then retry.`,
      422,
      { code: "MONNIFY_BENEFICIARY_VALIDATION_FAILED", details },
    );
  }

  const transactionList = validationResults.map((transaction) => ({
    amount: transaction.amount,
    reference: transaction.reference,
    narration: transaction.narration,
    destinationBankCode: transaction.bankCode,
    destinationAccountNumber: transaction.accountNumber,
    // The provider's Name Enquiry result is authoritative for the transfer payload.
    destinationAccountName: transaction.verifiedAccountName,
    currency: "NGN",
  }));
  const totalAmount = transactionList.reduce((sum, transaction) => sum + transaction.amount, 0);
  const batchReference = `EMS-${crypto.randomUUID()}`;

  // Persist the submission lock only after every beneficiary passes server-side validation.
  const saved = await prisma.companyMonnifyBatch.create({
    data: {
      companyId,
      payrollPeriodId,
      batchReference,
      totalAmount,
      totalTransactions: transactionList.length,
      submittedBy: userId,
      providerStatus: "SUBMITTING",
      environment: connection.environment,
    },
  });

  try {
    const response = await monnifyEndpoints.submitBatch(connection, {
      title: String(input.title || "EMS Salary Payroll").slice(0, 80),
      batchReference,
      narration: String(input.narration || "EMS salary disbursement").slice(0, 80),
      sourceAccountNumber: connection.sourceAccountNumber,
      // Monnify also revalidates the destination details; BREAK prevents a partial batch
      // from proceeding if any account has changed or becomes unavailable after Name Enquiry.
      onValidationFailure: "BREAK",
      notificationInterval: 25,
      transactionList,
    });
    const status = String(response.batchStatus || "PENDING_AUTHORIZATION");
    await prisma.companyMonnifyBatch.update({ where: { id: saved.id }, data: { providerStatus: status, providerResponse: response } });
    return {
      id: saved.id,
      batchReference,
      status,
      environment: connection.environment,
      totalAmount,
      totalTransactions: transactionList.length,
      requiresOtp: status === "PENDING_AUTHORIZATION",
    };
  } catch (error) {
    await prisma.companyMonnifyBatch.update({
      where: { id: saved.id },
      data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { errorCode: error.code || "UPSTREAM_ERROR", message: error.message } },
    });
    throw new AppError("Monnify submission outcome is uncertain. Do not submit this payroll again until the batch reference is checked with Monnify.", 502, { code: "MONNIFY_SUBMISSION_UNKNOWN", details: { batchReference } });
  }
}

const monnifyBankAliases = new Map([
  ["gtbank", "guarantytrust"], ["guarantytrustbank", "guarantytrust"], ["guarantytrust", "guarantytrust"],
  ["firstbank", "firstbank"], ["first", "firstbank"], ["firstbankofnigeria", "firstbank"],
  ["uba", "uba"], ["unitedforafrica", "uba"], ["unitedbankforafrica", "uba"],
  ["fcmb", "fcmb"], ["firstcitymonument", "fcmb"], ["firstcitymonumentbank", "fcmb"],
  ["stanbic", "stanbicibtc"], ["stanbicibtc", "stanbicibtc"],
  ["opay", "opay"], ["opaydigitalservices", "opay"],
  ["moniepoint", "moniepoint"], ["moniepointmfb", "moniepoint"], ["moniepointmicrofinance", "moniepoint"],
  ["kuda", "kuda"], ["kudamfb", "kuda"], ["kudamicrofinance", "kuda"], ["kudamicrofinancebank", "kuda"],
  ["palmpay", "palmpay"], ["palmpaymfb", "palmpay"], ["palmpaymicrofinance", "palmpay"],
]);

const bankMatchKey = (value) => {
  const key = canonicalMonnifyBankName(value);
  return monnifyBankAliases.get(key) || key;
};

const employeeDisplayName = (employee) => [employee?.firstName, employee?.middleName, employee?.lastName]
  .map((value) => String(value || "").trim()).filter(Boolean).join(" ") || employee?.employeeNumber || "Employee";

const providerErrorCode = (error) => String(
  error?.details?.providerCode || error?.details?.code || error?.code || "MONNIFY_VALIDATION_FAILED",
).toUpperCase();

const payrollSnapshotFingerprint = (rows) => crypto.createHash("sha256").update(JSON.stringify(rows.map((row) => ({
  id: row.id,
  employeeId: row.employeeId,
  amount: String(row.amount),
  status: row.status,
  bankAccountId: row.bankAccount?.id || null,
  bankName: row.bankAccount?.bankName || null,
  accountName: row.bankAccount?.accountName || null,
  accountNumber: row.bankAccount?.accountNumber || null,
  monnifyBankCode: row.bankAccount?.monnifyBankCode || null,
})).sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");

const payrollDisbursementRows = (companyId, periodId) => prisma.payrollDisbursement.findMany({
  where: { companyId, periodId, status: "PENDING", provider: null },
  include: {
    employee: {
      select: {
        id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true,
        bankAccounts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          take: 1,
        },
      },
    },
  },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
});

async function buildPayrollPreview(companyId, periodId) {
  const connection = await requiredConnection(companyId);
  const period = await prisma.payrollPeriod.findFirst({
    where: { id: periodId, companyId, deletedAt: null },
    select: { id: true, name: true, status: true, isActive: true, payDate: true },
  });
  if (!period) throw new AppError("Payroll period not found for this company.", 404);
  if (period.status !== "FINALIZED") throw new AppError("Only finalized payroll can be submitted to Monnify.", 409);
  if (period.isActive === false) throw new AppError("Activate this payroll period before submitting salary payments.", 409);

  const disbursements = await payrollDisbursementRows(companyId, periodId);
  if (!disbursements.length) throw new AppError("There are no pending payroll disbursements. Prepare the payment register first, or reconcile the existing Monnify batch.", 409, { code: "MONNIFY_NO_PENDING_PAYROLL" });

  const [bankPayload, walletBalancePayload] = await Promise.all([
    monnifyEndpoints.banks(connection),
    monnifyEndpoints.balance(connection, connection.sourceAccountNumber).catch(() => null),
  ]);
  const banks = normalizeMonnifyBanks(bankPayload);
  if (!banks.length) throw new AppError("Monnify's supported-bank directory is currently unavailable. No salary payments were submitted.", 503, { code: "MONNIFY_BANK_DIRECTORY_UNAVAILABLE" });
  const availableBalanceValue = walletBalancePayload?.availableBalance ?? walletBalancePayload?.availableBalanceAmount ?? walletBalancePayload?.balance;
  const availableBalance = Number(availableBalanceValue);

  const snapshotRows = disbursements.map((row) => ({ ...row, bankAccount: row.employee?.bankAccounts?.[0] || null }));
  const sourceFingerprint = payrollSnapshotFingerprint(snapshotRows);
  const employees = await mapWithConcurrency(snapshotRows, 4, async (row) => {
    const employeeName = employeeDisplayName(row.employee);
    const bankAccount = row.bankAccount;
    const amount = Number(row.amount);
    const result = {
      disbursementId: row.id,
      employeeId: row.employeeId,
      employeeName,
      employeeNumber: row.employee?.employeeNumber || null,
      bankName: bankAccount?.bankName || "Not provided",
      accountLast4: bankAccount?.accountNumber ? String(bankAccount.accountNumber).slice(-4) : null,
      amount: Number.isFinite(amount) ? amount : 0,
      status: "BLOCKED",
      validationCode: null,
      message: null,
    };

    if (!bankAccount) return { ...result, message: "No active employee bank account is saved. Add and verify the employee's bank details before payroll submission." };
    const accountNumber = String(bankAccount.accountNumber || "").trim();
    if (!/^\d{10}$/.test(accountNumber)) return { ...result, message: "The saved bank account number must contain exactly 10 digits." };
    if (!String(bankAccount.accountName || "").trim()) return { ...result, message: "The saved bank account name is missing." };
    if (!Number.isFinite(amount) || amount <= 0) return { ...result, message: "The payroll register contains an invalid or non-positive net salary." };

    const selectedMonnifyCode = String(bankAccount.monnifyBankCode || "").trim();
    let bank = null;
    if (selectedMonnifyCode) {
      bank = banks.find((candidate) => candidate.code === selectedMonnifyCode) || null;
      if (!bank) return { ...result, message: `The saved Monnify bank code “${selectedMonnifyCode}” is no longer present in the current Monnify bank directory. Re-select the bank from Monnify's directory.`, validationCode: "MONNIFY_BANK_CODE_NOT_IN_DIRECTORY" };
    } else {
      // Backward compatibility for older records created before provider-specific codes were stored.
      const wantedBank = bankMatchKey(bankAccount.bankName);
      const matchingBanks = banks.filter((candidate) => bankMatchKey(candidate.name) === wantedBank);
      if (matchingBanks.length !== 1) {
        return { ...result, message: matchingBanks.length ? "The saved bank name matches more than one Monnify bank record. Select the precise bank from Monnify's directory." : `The saved bank name “${bankAccount.bankName}” could not be matched to Monnify's current bank directory. Edit the employee account and select its Monnify bank code.`, validationCode: "MONNIFY_BANK_NOT_MAPPED" };
      }
      bank = matchingBanks[0];
    }

    try {
      const response = await monnifyEndpoints.validateAccount(connection, accountNumber, bank.code);
      const verifiedName = String(response?.accountName ?? response?.account_name ?? response?.name ?? "").trim();
      const verifiedNumber = String(response?.accountNumber ?? response?.account_number ?? accountNumber).trim();
      if (verifiedName.length < 2 || verifiedNumber !== accountNumber) {
        return { ...result, message: "Monnify did not return a complete matching beneficiary record. Retry validation or contact Monnify support.", validationCode: "MONNIFY_BENEFICIARY_RESPONSE_MISMATCH" };
      }
      if (!accountNamesCompatible(bankAccount.accountName, verifiedName)) {
        return { ...result, message: `The saved account name does not sufficiently match Monnify's verified name (${verifiedName}). Confirm the employee's bank details.`, validationCode: "MONNIFY_ACCOUNT_NAME_MISMATCH" };
      }
      return {
        ...result,
        bankName: bank.name,
        bankCode: bank.code,
        accountName: verifiedName,
        accountNumber,
        status: "VALID",
        message: "Beneficiary account verified by Monnify.",
      };
    } catch (error) {
      const code = providerErrorCode(error);
      const retryable = code === "99" || code === "MONNIFY_UPSTREAM_ERROR" || code === "ECONNABORTED";
      return {
        ...result,
        status: retryable ? "RETRY_REQUIRED" : "BLOCKED",
        validationCode: code,
        message: error?.message || "Monnify could not validate this beneficiary. Retry later or contact Monnify support.",
      };
    }
  });

  const valid = employees.filter((employee) => employee.status === "VALID");
  const blockedCount = employees.length - valid.length;
  const validatedSalaryTotal = valid.reduce((sum, employee) => sum + employee.amount, 0);
  // Bind both the database snapshot and the Name-Enquiry outcome. A transient provider
  // response changing between preview and submit must force a new human review.
  const previewFingerprint = crypto.createHash("sha256").update(JSON.stringify({
    sourceFingerprint,
    validations: employees.map((employee) => ({
      disbursementId: employee.disbursementId,
      status: employee.status,
      validationCode: employee.validationCode,
      bankCode: employee.bankCode || null,
      verifiedAccountName: employee.accountName || null,
      amount: employee.amount,
    })).sort((a, b) => a.disbursementId.localeCompare(b.disbursementId)),
  })).digest("hex");
  return {
    period: { id: period.id, name: period.name, payDate: period.payDate },
    environment: connection.environment,
    sourceAccountNumber: connection.sourceAccountNumber,
    totalEmployees: employees.length,
    validCount: valid.length,
    blockedCount,
    retryRequiredCount: employees.filter((employee) => employee.status === "RETRY_REQUIRED").length,
    validatedSalaryTotal: Number(validatedSalaryTotal.toFixed(2)),
    disbursementBalance: Number.isFinite(availableBalance) ? availableBalance : null,
    balanceCheckAvailable: Number.isFinite(availableBalance),
    employees,
    previewFingerprint,
    // This is an internal-only value used by submitPayroll; it is not returned to clients.
    _validTransactions: valid.map((employee) => {
      const source = snapshotRows.find((row) => row.id === employee.disbursementId);
      return {
        disbursementId: employee.disbursementId,
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        amount: Number(employee.amount.toFixed(2)),
        bankName: employee.bankName,
        bankCode: employee.bankCode,
        accountNumber: employee.accountNumber,
        accountName: employee.accountName,
        narration: `Salary - ${employee.employeeName}`.slice(0, 80),
        reference: `EMS-${String(source.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}-${crypto.randomUUID().slice(0, 8)}`,
      };
    }),
  };
}

export async function previewPayroll(companyId, periodId) {
  const preview = await buildPayrollPreview(companyId, periodId);
  const { _validTransactions, ...publicPreview } = preview;
  return publicPreview;
}

export async function submitPayroll(companyId, periodId, userId, previewFingerprint) {
  const fingerprint = String(previewFingerprint || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new AppError("Run a fresh Monnify payroll preview before submitting.", 400, { code: "MONNIFY_PREVIEW_REQUIRED" });

  const preview = await buildPayrollPreview(companyId, periodId);
  if (preview.previewFingerprint !== fingerprint) {
    throw new AppError("Payroll or employee bank details changed after preview. Run Preview & validate again before submitting.", 409, { code: "MONNIFY_PREVIEW_STALE" });
  }
  const transactions = preview._validTransactions;
  if (!preview.balanceCheckAvailable) throw new AppError("EMS could not read the company's Monnify disbursement balance. Test the connection and refresh the preview before submitting any salaries.", 502, { code: "MONNIFY_BALANCE_UNAVAILABLE" });
  if (preview.disbursementBalance < preview.validatedSalaryTotal) throw new AppError(`The Monnify disbursement wallet balance (${preview.disbursementBalance.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}) is below the validated salary total (${preview.validatedSalaryTotal.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}). Fund the company's Monnify wallet and preview again.`, 409, { code: "MONNIFY_INSUFFICIENT_BALANCE", details: { availableBalance: preview.disbursementBalance, requiredAmount: preview.validatedSalaryTotal } });
  if (transactions.length > 5000) throw new AppError("Monnify bulk payroll batches support a maximum of 5,000 employees. Split this payroll into separate approved batches.", 400, { code: "MONNIFY_BATCH_LIMIT_EXCEEDED" });
  if (!transactions.length) throw new AppError("No employees passed Monnify validation. Nothing was submitted.", 422, { code: "MONNIFY_NO_VALID_BENEFICIARIES", details: { employees: preview.employees } });

  const connection = await requiredConnection(companyId);
  const batchReference = `EMS-${crypto.randomUUID()}`;
  const transactionMap = Object.fromEntries(transactions.map((transaction) => [transaction.reference, transaction.disbursementId]));
  const totalAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  // Serialize the company-wallet lock check and batch creation to prevent two admins
  // from submitting overlapping batches against the same Monnify wallet concurrently.
  const savedBatch = await prisma.$transaction(async (tx) => {
    const openBatch = await findOpenBatch(companyId, tx);
    if (openBatch) throw new AppError(`This company's Monnify wallet already has an open batch (${openBatch.batchReference}, ${openBatch.providerStatus}). Reconcile it before submitting another payroll batch.`, 409, { code: "MONNIFY_DUPLICATE_PAYROLL_BATCH" });
    return tx.companyMonnifyBatch.create({
      data: {
        companyId,
        payrollPeriodId: periodId,
        batchReference,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalTransactions: transactions.length,
        submittedBy: userId,
        providerStatus: "SUBMITTING",
        environment: connection.environment,
        providerResponse: { _emsTransactionMap: transactionMap },
      },
    });
  }, { isolationLevel: "Serializable" });

  try {
    const response = await monnifyEndpoints.submitBatch(connection, {
      title: `EMS Salary - ${preview.period.name}`.slice(0, 80),
      batchReference,
      narration: `EMS payroll ${preview.period.name}`.slice(0, 80),
      sourceAccountNumber: connection.sourceAccountNumber,
      // Only Name-Enquiry-verified records are sent. CONTINUE lets good employees proceed
      // if one beneficiary becomes unavailable between Name Enquiry and provider processing.
      onValidationFailure: "CONTINUE",
      notificationInterval: 25,
      transactionList: transactions.map((transaction) => ({
        amount: transaction.amount,
        reference: transaction.reference,
        narration: transaction.narration,
        destinationBankCode: transaction.bankCode,
        destinationAccountNumber: transaction.accountNumber,
        destinationAccountName: transaction.accountName,
        currency: "NGN",
      })),
    });
    const status = String(response.batchStatus || "PENDING_AUTHORIZATION");
    await prisma.$transaction(async (tx) => {
      await tx.companyMonnifyBatch.update({
        where: { id: savedBatch.id },
        data: { providerStatus: status, providerResponse: { response, _emsTransactionMap: transactionMap } },
      });
      await Promise.all(transactions.map((transaction) => tx.payrollDisbursement.updateMany({
        where: { id: transaction.disbursementId, companyId, periodId, status: "PENDING", provider: null },
        data: {
          status: "PROCESSING",
          method: "MONNIFY_BULK_TRANSFER",
          provider: "MONNIFY",
          providerTransferId: batchReference,
          providerStatus: status,
          externalReference: transaction.reference,
          providerResponse: { batchReference, status, environment: connection.environment },
          failureReason: null,
        },
      })));
    });
    return {
      id: savedBatch.id,
      batchReference,
      status,
      environment: connection.environment,
      totalAmount: Number(totalAmount.toFixed(2)),
      totalTransactions: transactions.length,
      requiresOtp: status === "PENDING_AUTHORIZATION",
      note: "Only employees who passed server-side Monnify validation were submitted. Blocked employees remain pending in the payroll register.",
    };
  } catch (error) {
    await prisma.companyMonnifyBatch.update({
      where: { id: savedBatch.id },
      data: { providerStatus: "SUBMISSION_UNKNOWN", providerResponse: { errorCode: error.code || "UPSTREAM_ERROR", message: error.message, _emsTransactionMap: transactionMap } },
    });
    throw new AppError("Monnify submission outcome is uncertain. EMS saved the batch reference; refresh/reconcile this batch before attempting another submission.", 502, { code: "MONNIFY_SUBMISSION_UNKNOWN", details: { batchReference } });
  }
}

export async function refreshPayrollBatch(companyId, batchId) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify payroll batch not found.", 404);
  if (!batch.payrollPeriodId) throw new AppError("This Monnify batch is not linked to a payroll period and cannot update employee payroll records.", 409);

  const connection = await requiredConnection(companyId);
  assertBatchEnvironment(connection, batch);

  // A failure in one read endpoint should not prevent us from reconciling the
  // individual transfers returned by the other endpoint. Never infer individual
  // employee outcomes from aggregate batch counts alone.
  let summary = null;
  let summaryError = null;
  try {
    summary = await monnifyEndpoints.batchStatus(connection, batch.batchReference);
  } catch (error) {
    summaryError = error;
  }

  let transactionPayload = null;
  let transactionError = null;
  try {
    transactionPayload = await monnifyEndpoints.batchTransactions(connection, batch.batchReference);
  } catch (error) {
    transactionError = error;
  }

  if (!summary && !transactionPayload) {
    const sourceError = transactionError || summaryError;
    throw new AppError(
      `EMS could not retrieve Monnify's batch or individual transaction statuses. ${sourceError?.message || "Check the Monnify connection and try again."}`,
      sourceError?.status || 502,
      {
        code: "MONNIFY_RECONCILIATION_READ_FAILED",
        details: {
          batchReference: batch.batchReference,
          summaryError: summaryError?.message || null,
          transactionError: transactionError?.message || null,
          providerCode: sourceError?.details?.providerCode || sourceError?.code || null,
        },
      },
    );
  }

  const transactionRows = unwrapMonnifyTransactionRows(transactionPayload);
  const storedMap = normalizeMonnifyTransactionMap(batch.providerResponse);
  const references = [...new Set(transactionRows.map(monnifyTransactionReference).filter(Boolean))];

  // Keep a database-reference fallback. This covers older batch records where
  // providerResponse was wrapped differently or the original in-memory map was
  // not retained, while still requiring the same company, period and batch.
  const fallbackRecords = references.length
    ? await prisma.payrollDisbursement.findMany({
        where: {
          companyId,
          periodId: batch.payrollPeriodId,
          provider: "MONNIFY",
          providerTransferId: batch.batchReference,
          externalReference: { in: references },
        },
        select: { id: true, externalReference: true },
      })
    : [];
  const fallbackMap = Object.fromEntries(fallbackRecords.map((row) => [row.externalReference, row.id]));

  const summaryStatus = String(summary?.batchStatus || summary?.status || batch.providerStatus).toUpperCase();
  const updates = [];
  const unmatchedReferences = [];

  for (const transaction of transactionRows) {
    const reference = monnifyTransactionReference(transaction);
    // Prefer a live database match scoped to this company, payroll period and
    // batch. The persisted JSON map is only a fallback for older or migrated data.
    const disbursementId = (reference && fallbackMap[reference]) || (reference && storedMap[reference]);
    const status = monnifyTransactionStatus(transaction);
    if (!reference || !disbursementId || !status) {
      unmatchedReferences.push(reference || "<missing-reference>");
      continue;
    }

    const data = {
      providerStatus: status,
      providerResponse: transaction,
      failureReason: monnifyTransactionFailureReason(transaction, status),
    };

    if (["SUCCESS", "COMPLETED"].includes(status)) {
      data.status = "PAID";
      data.paidAt = new Date();
      data.verifiedAt = new Date();
    } else if (["FAILED", "EXPIRED", "REVERSED"].includes(status)) {
      // A reversal is not a successful salary payment. Keep the exact provider
      // result in providerStatus and show it as failed in the payroll register.
      data.status = "FAILED";
      data.paidAt = null;
      data.verifiedAt = new Date();
    } else {
      data.status = "PROCESSING";
      data.paidAt = null;
      data.verifiedAt = null;
    }

    updates.push({ reference, disbursementId, data });
  }

  let updatedDisbursementCount = 0;
  let finalCounts = { paid: 0, failed: 0, processing: 0, pending: 0, total: 0 };
  let fullyReconciled = false;
  let effectiveBatchStatus = batch.providerStatus;
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const result = await tx.payrollDisbursement.updateMany({
        where: {
          id: update.disbursementId,
          companyId,
          periodId: batch.payrollPeriodId,
          provider: "MONNIFY",
          providerTransferId: batch.batchReference,
        },
        data: update.data,
      });
      updatedDisbursementCount += result.count;
      if (!result.count) unmatchedReferences.push(update.reference);
    }

    const all = await tx.payrollDisbursement.findMany({
      where: { companyId, periodId: batch.payrollPeriodId },
      select: { status: true },
    });
    const batchRows = await tx.payrollDisbursement.findMany({
      where: { companyId, periodId: batch.payrollPeriodId, provider: "MONNIFY", providerTransferId: batch.batchReference },
      select: { status: true },
    });
    finalCounts = {
      paid: batchRows.filter((row) => row.status === "PAID").length,
      failed: batchRows.filter((row) => row.status === "FAILED").length,
      processing: batchRows.filter((row) => ["PROCESSING", "SUBMITTED", "INITIATED", "UNKNOWN", "REQUIRES_VERIFICATION", "REQUIRES_REVIEW"].includes(row.status)).length,
      pending: batchRows.filter((row) => row.status === "PENDING").length,
      total: batchRows.length,
    };
    fullyReconciled = isMonnifyBatchFullyReconciled(batch, batchRows);
    effectiveBatchStatus = fullyReconciled ? "COMPLETED" : (transactionRows.length ? summaryStatus : batch.providerStatus);

    await tx.companyMonnifyBatch.update({
      where: { id: batch.id },
      data: {
        providerStatus: effectiveBatchStatus,
        providerResponse: {
          ...(summary ? { summary } : {}),
          ...(transactionPayload ? { transactions: transactionPayload } : {}),
          _emsTransactionMap: storedMap,
          ...(summaryError ? { _summaryReadError: summaryError.message } : {}),
          ...(transactionError ? { _transactionReadError: transactionError.message } : {}),
          _emsReconciliation: {
            expectedTransactions: Number(batch.totalTransactions || 0),
            matchedTransactions: batchRows.length,
            paid: finalCounts.paid,
            failed: finalCounts.failed,
            fullyReconciled,
          },
        },
        lastCheckedAt: new Date(),
      },
    });

    if (all.length && all.every((row) => row.status === "PAID")) {
      await tx.payrollPeriod.updateMany({ where: { id: batch.payrollPeriodId, companyId }, data: { status: "PAID" } });
      await tx.payrollItem.updateMany({ where: { companyId, periodId: batch.payrollPeriodId }, data: { status: "PAID" } });
    } else {
      // A previously paid period must return to FINALIZED if a later provider
      // reconciliation reports a failed or reversed transfer.
      const currentPeriod = await tx.payrollPeriod.findFirst({
        where: { id: batch.payrollPeriodId, companyId },
        select: { status: true },
      });
      if (currentPeriod?.status === "PAID") {
        await tx.payrollPeriod.updateMany({ where: { id: batch.payrollPeriodId, companyId }, data: { status: "FINALIZED" } });
        await tx.payrollItem.updateMany({ where: { companyId, periodId: batch.payrollPeriodId, status: "PAID" }, data: { status: "FINALIZED" } });
      }
    }
  });

  const warningParts = [];
  if (summaryError) warningParts.push(`Batch summary unavailable: ${summaryError.message}`);
  if (transactionError) warningParts.push(`Individual transaction list unavailable: ${transactionError.message}`);
  if (unmatchedReferences.length) warningParts.push(`${unmatchedReferences.length} provider transaction(s) could not be matched to an EMS payroll record`);
  if (!transactionRows.length && summary) warningParts.push("Monnify returned the batch summary but no individual transaction rows; employee statuses were not inferred from aggregate counts");

  return {
    batchReference: batch.batchReference,
    environment: batch.environment,
    providerStatus: effectiveBatchStatus,
    summary,
    reconciledTransactions: updatedDisbursementCount,
    totalProviderTransactions: transactionRows.length,
    unmatchedTransactions: [...new Set(unmatchedReferences)],
    counts: finalCounts,
    fullyReconciled,
    warning: warningParts.length ? warningParts.join(". ") : null,
  };
}

export async function authorizeBatch(companyId, batchId, otp) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify batch not found.", 404);
  if (!["PENDING_AUTHORIZATION", "PENDING_BATCH_AUTHORIZATION"].includes(batch.providerStatus)) throw new AppError(`This batch is not awaiting OTP authorization (status: ${batch.providerStatus}).`, 409);
  if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter a valid OTP.", 400);
  const connection = await requiredConnection(companyId);
  assertBatchEnvironment(connection, batch);
  const result = await monnifyEndpoints.authorizeBatch(connection, batch.batchReference, otp);
  const status = result.batchStatus || "AWAITING_PROCESSING";
  const transactionMap = batch.providerResponse?._emsTransactionMap || {};
  await prisma.$transaction(async (tx) => {
    await tx.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: status, providerResponse: { response: result, _emsTransactionMap: transactionMap }, authorizedAt: new Date() } });
    const disbursementIds = Object.values(transactionMap).filter((value) => typeof value === "string");
    if (disbursementIds.length) await tx.payrollDisbursement.updateMany({
      where: { companyId, provider: "MONNIFY", providerTransferId: batch.batchReference, id: { in: disbursementIds } },
      data: { providerStatus: status, status: "PROCESSING" },
    });
  });
  return { batchReference: batch.batchReference, status, environment: batch.environment };
}

export async function resendBatchOtp(companyId, batchId) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify batch not found.", 404);
  if (batch.providerStatus !== "OTP_EMAIL_DISPATCH_FAILED") {
    throw new AppError(`OTP resend is only available when Monnify reports OTP_EMAIL_DISPATCH_FAILED (current status: ${batch.providerStatus}).`, 409, { code: "MONNIFY_OTP_RESEND_NOT_AVAILABLE" });
  }
  const connection = await requiredConnection(companyId);
  assertBatchEnvironment(connection, batch);
  const result = await monnifyEndpoints.resendBatchOtp(connection, batch.batchReference);
  const status = String(result.batchStatus || result.status || "PENDING_AUTHORIZATION");
  const transactionMap = batch.providerResponse?._emsTransactionMap || {};
  await prisma.$transaction(async (tx) => {
    await tx.companyMonnifyBatch.update({
      where: { id: batch.id },
      data: { providerStatus: status, providerResponse: { response: result, _emsTransactionMap: transactionMap } },
    });
    const disbursementIds = Object.values(transactionMap).filter((value) => typeof value === "string");
    if (disbursementIds.length) await tx.payrollDisbursement.updateMany({
      where: { companyId, provider: "MONNIFY", providerTransferId: batch.batchReference, id: { in: disbursementIds } },
      data: { providerStatus: status },
    });
  });
  return { batchReference: batch.batchReference, status, environment: batch.environment };
}

export async function refreshBatch(companyId, batchId) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify batch not found.", 404);
  const connection = await requiredConnection(companyId);
  assertBatchEnvironment(connection, batch);
  const [summary, transactions] = await Promise.all([
    monnifyEndpoints.batchStatus(connection, batch.batchReference),
    monnifyEndpoints.batchTransactions(connection, batch.batchReference),
  ]);
  await prisma.companyMonnifyBatch.update({
    where: { id: batch.id },
    data: { providerStatus: summary.batchStatus || batch.providerStatus, providerResponse: { summary, transactions }, lastCheckedAt: new Date() },
  });
  return { batchReference: batch.batchReference, environment: batch.environment, summary, transactions };
}

export async function listBatches(companyId) {
  const batches = await prisma.companyMonnifyBatch.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      payrollPeriodId: true,
      batchReference: true,
      providerStatus: true,
      environment: true,
      totalAmount: true,
      totalTransactions: true,
      authorizedAt: true,
      lastCheckedAt: true,
      createdAt: true,
    },
  });
  if (!batches.length) return [];

  // Attach real per-transfer counts to each batch. The batch-level provider
  // status alone cannot tell finance which employees were paid or failed.
  const references = batches.map((batch) => batch.batchReference);
  const rows = await prisma.payrollDisbursement.findMany({
    where: { companyId, provider: "MONNIFY", providerTransferId: { in: references } },
    select: { providerTransferId: true, status: true },
  });
  const countsByBatch = new Map();
  for (const row of rows) {
    if (!row.providerTransferId) continue;
    const counts = countsByBatch.get(row.providerTransferId) || { paid: 0, failed: 0, processing: 0, pending: 0, total: 0 };
    counts.total += 1;
    if (row.status === "PAID") counts.paid += 1;
    else if (["FAILED", "REVERSED"].includes(row.status)) counts.failed += 1;
    else if (["PROCESSING", "SUBMITTED", "INITIATED", "UNKNOWN", "REQUIRES_VERIFICATION", "REQUIRES_REVIEW"].includes(row.status)) counts.processing += 1;
    else counts.pending += 1;
    countsByBatch.set(row.providerTransferId, counts);
  }
  return batches.map((batch) => {
    const counts = countsByBatch.get(batch.batchReference) || { paid: 0, failed: 0, processing: 0, pending: 0, total: 0 };
    const fullyReconciled = Number(batch.totalTransactions || 0) > 0
      && counts.total === Number(batch.totalTransactions)
      && counts.paid + counts.failed === Number(batch.totalTransactions)
      && counts.processing === 0
      && counts.pending === 0;
    return {
      ...batch,
      providerStatus: fullyReconciled ? "COMPLETED" : batch.providerStatus,
      fullyReconciled,
      counts,
    };
  });
}
