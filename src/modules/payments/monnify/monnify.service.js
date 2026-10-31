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
export async function authorizeBatch(companyId, batchId, otp) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); if (batch.providerStatus !== "PENDING_AUTHORIZATION") throw new AppError(`This batch is not awaiting OTP authorization (status: ${batch.providerStatus}).`, 409); if (!/^\d{4,10}$/.test(String(otp || ""))) throw new AppError("Enter a valid OTP.", 400); const connection = await requiredConnection(companyId); const result = await monnifyEndpoints.authorizeBatch(connection, batch.batchReference, otp); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: result.batchStatus || "AWAITING_PROCESSING", providerResponse: result, authorizedAt: new Date() } }); return { batchReference: batch.batchReference, status: result.batchStatus || "AWAITING_PROCESSING" }; }
export async function refreshBatch(companyId, batchId) { const batch = await prisma.companyMonnifyBatch.findFirst({ where: { id: batchId, companyId } }); if (!batch) throw new AppError("Monnify batch not found.", 404); const connection = await requiredConnection(companyId); const [summary, transactions] = await Promise.all([monnifyEndpoints.batchStatus(connection, batch.batchReference), monnifyEndpoints.batchTransactions(connection, batch.batchReference)]); await prisma.companyMonnifyBatch.update({ where: { id: batch.id }, data: { providerStatus: summary.batchStatus || batch.providerStatus, providerResponse: { summary, transactions }, lastCheckedAt: new Date() } }); return { batchReference: batch.batchReference, summary, transactions }; }
export async function listBatches(companyId) { return prisma.companyMonnifyBatch.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, payrollPeriodId: true, batchReference: true, providerStatus: true, totalAmount: true, totalTransactions: true, authorizedAt: true, lastCheckedAt: true, createdAt: true } }); }
