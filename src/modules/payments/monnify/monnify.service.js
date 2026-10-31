import crypto from "node:crypto";
import prisma from "../../../config/database.js";
import AppError from "../../../common/errors/AppError.js";
import { encryptMonnifySecret, decryptMonnifySecret } from "./monnify.crypto.js";
import { monnifyEndpoints } from "./monnify.client.js";
import { canonicalMonnifyBankName, normalizeMonnifyBanks } from "./monnify.utils.js";

const OPEN_BATCH_STATUSES = [
  "SUBMITTING",
  "SUBMISSION_UNKNOWN",
  "PENDING_AUTHORIZATION",
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

const findOpenBatch = (companyId) => prisma.companyMonnifyBatch.findFirst({
  where: { companyId, providerStatus: { in: OPEN_BATCH_STATUSES } },
  select: { id: true, batchReference: true, providerStatus: true, environment: true },
});

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
  if (accountName.length < 2) throw new AppError("Monnify did not return a verified account name. Do not use this account for payroll until it can be verified.", 422, { code: "MONNIFY_ACCOUNT_NAME_MISSING" });

  return {
    verified: true,
    environment: connection.environment,
    bankName: String(resolved?.bankName ?? resolved?.bank_name ?? selectedBank.name),
    bankCode: selectedBank.code,
    accountNumber: String(resolved?.accountNumber ?? resolved?.account_number ?? number),
    accountName,
  };
}

const resolveBatchBank = (transaction, banks, index) => {
  const bankName = String(transaction.bankName || "").trim();
  const suppliedCode = String(transaction.bankCode || "").trim();
  let bank = null;

  if (bankName) {
    const bankKey = canonicalMonnifyBankName(bankName);
    bank = banks.find((candidate) => canonicalMonnifyBankName(candidate.name) === bankKey) || null;
  } else if (suppliedCode) {
    // Backward compatibility is restricted to codes currently returned by Monnify.
    bank = banks.find((candidate) => candidate.code === suppliedCode) || null;
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

  const duplicateActiveBatch = await prisma.companyMonnifyBatch.findFirst({
    where: { companyId, payrollPeriodId, providerStatus: { in: OPEN_BATCH_STATUSES } },
    select: { id: true, batchReference: true, providerStatus: true },
  });
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

export async function authorizeBatch(companyId, batchId, otp) {
  const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } });
  if (!batch) throw new AppError("Monnify batch not found.", 404);
  if (batch.providerStatus !== "PENDING_AUTHORIZATION") throw new AppError(`This batch is not awaiting OTP authorization (status: ${batch.providerStatus}).`, 409);
  if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter a valid OTP.", 400);
  const connection = await requiredConnection(companyId);
  assertBatchEnvironment(connection, batch);
  const result = await monnifyEndpoints.authorizeBatch(connection, batch.batchReference, otp);
  await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: result.batchStatus || "AWAITING_PROCESSING", providerResponse: result, authorizedAt: new Date() } });
  return { batchReference: batch.batchReference, status: result.batchStatus || "AWAITING_PROCESSING", environment: batch.environment };
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
  return prisma.companyMonnifyBatch.findMany({
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
}
