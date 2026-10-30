import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { creditWalletInTransaction, debitWalletInTransaction, getWallet } from "../wallet/wallet.service.js";
import {
  createPaystackTransferRecipient,
  getPaystackAvailableBalance,
  initiatePaystackTransfer,
  verifyPaystackTransfer,
} from "../payments/paystack/paystack.transfer.client.js";
import { verifyFlutterwaveTransfer } from "../payments/flutterwave/flutterwave.transfer.client.js";
import {
  makePayrollPayoutReference,
  normalizePayrollPayoutStatus,
  isDefinitiveTransferFailure,
  makePayoutWebhookEventKey,
} from "./payroll.payout.utils.js";
import {
  assertPayrollPayoutProviderConfiguration,
  assertPayrollPayoutProviderCredentials,
  getPayrollPayoutMode,
} from "./payroll.payout.config.js";
import { estimatePayrollPayoutFee, providerReportedPayoutFee } from "./payroll.payout.fees.js";
import { resolveBankAccount } from "../employees/bank-directory.service.js";

const money = (value) => new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 };
const isProvider = (provider) => ["PAYSTACK", "FLUTTERWAVE"].includes(String(provider || "").toUpperCase());
const asText = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const mapWithConcurrency = async (items, concurrency, mapper) => {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
};
const normalizeNameTokens = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 1);
const accountNamesCompatible = (savedName, resolvedName) => {
  const saved = [...new Set(normalizeNameTokens(savedName))];
  const resolved = [...new Set(normalizeNameTokens(resolvedName))];
  if (!saved.length || !resolved.length) return false;
  if (saved.join(" ") === resolved.join(" ")) return true;
  // Accept account-name variants with extra middle names, but do not accept a single shared
  // first-name token when the surname or other meaningful tokens differ.
  if (Math.min(saved.length, resolved.length) < 2) return false;
  const shorter = saved.length <= resolved.length ? saved : resolved;
  const longer = saved.length <= resolved.length ? resolved : saved;
  return shorter.every((token) => longer.includes(token));
};

export const getPayrollPayoutConfiguration = async () => ({
  enabled: String(process.env.PAYROLL_PAYOUTS_ENABLED || "false").trim().toLowerCase() === "true",
  mode: getPayrollPayoutMode(),
  currency: "NGN",
  liveConfirmationRequired: getPayrollPayoutMode() === "live",
  providers: {
    PAYSTACK: {
      configured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      payoutsEnabled: true,
      role: "PRIMARY_SALARY_PAYOUT",
      balancePreflight: true,
      feeEstimate: "configurable-tier-estimate",
    },
    FLUTTERWAVE: {
      configured: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
      payoutsEnabled: false,
      role: "WALLET_FUNDING_ONLY",
      note: "Flutterwave remains available for wallet funding and verification of previously submitted legacy transfers; new payroll payouts use Paystack.",
    },
  },
  safeguards: {
    livePaymentsDisabledByDefault: String(process.env.PAYROLL_PAYOUTS_ENABLED || "false").trim().toLowerCase() !== "true",
    webhookReconciliation: true,
    duplicateBatchProtection: true,
  },
});

const disbursementInclude = {
  employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, email: true } },
  payrollItem: { select: { id: true, netSalary: true, status: true } },
  attempts: { orderBy: { attemptNumber: "asc" } },
};

const selectedBankAccount = (employee, provider) => {
  const accounts = [...(employee?.bankAccounts || [])].filter((account) => account.isActive);
  accounts.sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  if (!accounts.length) return { error: "No active bank account is recorded." };
  // Prefer the primary account only when it is supported by the selected provider.
  // Otherwise, automatically use the most recently updated active account that has
  // this provider's bank code and a valid Nigerian account number.
  const codeFor = (account) => String(provider === "PAYSTACK" ? account.paystackBankCode ?? "" : account.flutterwaveBankCode ?? "").trim();
  const eligible = accounts.find((account) => /^\d{2,12}$/.test(codeFor(account)) && /^\d{10}$/.test(String(account.accountNumber || "")) && String(account.accountName || "").trim().length >= 2);
  if (!eligible) {
    const hasAccountNumber = accounts.some((account) => /^\d{10}$/.test(String(account.accountNumber || "")));
    if (!hasAccountNumber) return { error: "No active bank account has a valid 10-digit account number." };
    return { error: "No active bank account has a valid Paystack bank code. Update the employee bank details before preparing this salary payout." };
  }
  return { account: eligible, bankCode: codeFor(eligible) };
};

const displayEmployeeName = (employee) => [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ") || employee?.employeeNumber || employee?.id || "Employee";

const getProviderBalance = async (provider) => {
  if (provider !== "PAYSTACK") {
    throw new AppError("Paystack is the only enabled provider for new automated salary payouts. Flutterwave remains available for wallet funding and legacy transfer verification.", 400);
  }
  const result = await getPaystackAvailableBalance();
  return money(result.availableBalance);
};

const getPeriodAndPending = async (companyId, periodId) => {
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId, deletedAt: null } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  if (period.status !== "FINALIZED") {
    throw new AppError("Only finalized payroll that has not been fully paid can be prepared for payment.", 409);
  }
  const pending = await prisma.payrollDisbursement.findMany({
    where: { companyId, periodId, status: "PENDING" },
    include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } }, payrollItem: { select: { id: true, netSalary: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { period, pending };
};

const calculatePayoutPreview = async (companyId, periodId, provider) => {
  if (provider !== "PAYSTACK") {
    throw new AppError("Paystack is the only enabled provider for new automated salary payouts. Flutterwave remains available for wallet funding; Monnify is being evaluated as a future payout alternative.", 400);
  }
  const { period, pending } = await getPeriodAndPending(companyId, periodId);
  if (period.isActive === false) throw new AppError("Activate this payroll period before previewing or approving salary payments.", 409);
  const errors = [];
  const prepared = pending.map((row) => ({ row, bank: selectedBankAccount(row.employee, provider) }));
  const employeeResults = [];
  const mode = getPayrollPayoutMode();

  if (!pending.length) errors.push({ code: "NO_PENDING_PAYOUTS", message: "No pending salary payments remain in this register. Verify existing processing transfers instead of submitting the batch again." });
  for (const item of prepared) {
    if (!item.row.payrollItem || !money(item.row.amount).eq(money(item.row.payrollItem.netSalary))) {
      item.amountError = "The payment register amount no longer matches the finalized payroll item's net salary. Re-prepare payroll using the documented correction process.";
    }
    if (!money(item.row.amount).isFinite() || !money(item.row.amount).isPositive()) {
      item.amountError = [item.amountError, "Salary amount must be a positive valid value."].filter(Boolean).join(" ");
    }
    if (provider === "FLUTTERWAVE" && !money(item.row.amount).eq(money(item.row.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP))) {
      item.amountError = [item.amountError, "Flutterwave NGN bank transfers in this integration require whole-naira amounts."].filter(Boolean).join(" ");
    }
  }

  let providerConfigurationError = null;
  try {
    assertPayrollPayoutProviderCredentials(provider);
  } catch (error) {
    providerConfigurationError = asText(error?.message || "Provider configuration is invalid.");
    errors.push({ code: "PROVIDER_CONFIGURATION_INVALID", message: providerConfigurationError });
  }

  const fees = await mapWithConcurrency(prepared, 4, async ({ row, bank, amountError }) => {
    let bankVerification = null;
    let bankVerificationError = null;
    const shouldResolveAccount = mode === "live" || String(process.env.PAYROLL_PAYOUT_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX || "false").trim().toLowerCase() === "true";
    if (!bank.error && bank.account && shouldResolveAccount && !providerConfigurationError) {
      try {
        bankVerification = await resolveBankAccount({ provider, accountNumber: bank.account.accountNumber, bankCode: bank.bankCode });
        if (!accountNamesCompatible(bank.account.accountName, bankVerification.accountName)) {
          bankVerificationError = `The provider resolved this account as "${bankVerification.accountName}", which does not sufficiently match the saved account name. Review the bank details before payment.`;
        }
      } catch (error) {
        bankVerificationError = asText(error?.message || "The provider could not verify this bank account.");
      }
    }

    let fee = new Decimal(0);
    let feeError = null;
    if (!amountError && money(row.amount).isPositive() && !providerConfigurationError) {
      try {
        fee = money(await estimatePayrollPayoutFee(provider, row.amount));
      } catch (error) {
        feeError = asText(error?.message || "Transfer fee estimate could not be obtained.");
      }
    }
    return { row, bank, bankVerification, bankVerificationError, fee, feeError, amountError };
  });

  let providerAvailableBalance = null;
  let providerBalanceError = null;
  if (!providerConfigurationError) {
    try {
      providerAvailableBalance = await getProviderBalance(provider);
    } catch (error) {
      providerBalanceError = asText(error?.message || "The provider's available NGN balance could not be verified.");
    }
  } else {
    providerBalanceError = providerConfigurationError;
  }

  let walletBalance = new Decimal(0);
  try {
    const wallet = await getWallet(companyId);
    walletBalance = money(wallet.balance);
  } catch (error) {
    errors.push({ code: "WALLET_UNAVAILABLE", message: asText(error?.message || "Company wallet balance could not be read.") });
  }

  const salaryTotal = pending.reduce((sum, row) => sum.plus(money(row.amount)), new Decimal(0));
  const feeTotal = fees.reduce((sum, item) => sum.plus(item.fee), new Decimal(0));
  const requiredTotal = salaryTotal.plus(feeTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  for (const item of fees) {
    const itemErrors = [item.bank.error, item.bankVerificationError, item.amountError, item.feeError].filter(Boolean);
    if (itemErrors.length) {
      errors.push({ code: "EMPLOYEE_VALIDATION_FAILED", employeeId: item.row.employeeId, employee: displayEmployeeName(item.row.employee), message: itemErrors.join(" ") });
    }
    employeeResults.push({
      disbursementId: item.row.id,
      employeeId: item.row.employeeId,
      employee: displayEmployeeName(item.row.employee),
      bankName: item.bank.account?.bankName || null,
      accountName: item.bank.account?.accountName || null,
      verifiedAccountName: item.bankVerification?.accountName || null,
      accountNumberLast4: item.bank.account?.accountNumber ? String(item.bank.account.accountNumber).slice(-4) : null,
      amount: money(item.row.amount).toFixed(2),
      estimatedFee: item.fee.toFixed(2),
      validation: itemErrors.length ? "BLOCKED" : "VALID",
      errors: itemErrors,
    });
  }

  const walletSufficient = walletBalance.greaterThanOrEqualTo(requiredTotal);
  const providerSufficient = providerAvailableBalance !== null && providerAvailableBalance.greaterThanOrEqualTo(requiredTotal);
  // In provider test mode, the remote test balance may be absent or not representative.
  // In live mode, an unavailable/insufficient provider balance blocks approval.
  if (mode === "live" && providerBalanceError) errors.push({ code: "PROVIDER_BALANCE_UNAVAILABLE", message: providerBalanceError });
  if (!walletSufficient) errors.push({ code: "INSUFFICIENT_COMPANY_WALLET", message: `Company wallet has ${walletBalance.toFixed(2)} NGN, but salary plus estimated transfer fees requires ${requiredTotal.toFixed(2)} NGN.` });
  if (mode === "live" && providerAvailableBalance !== null && !providerSufficient) errors.push({ code: "INSUFFICIENT_PROVIDER_BALANCE", message: `${provider} available NGN balance is ${providerAvailableBalance.toFixed(2)}, but this batch is estimated to require ${requiredTotal.toFixed(2)} including fees.` });
  if (mode === "live" && providerAvailableBalance === null && !providerBalanceError) errors.push({ code: "PROVIDER_BALANCE_UNAVAILABLE", message: `${provider} available balance could not be confirmed.` });
  if (pending.some((row) => !money(row.amount).isFinite() || !money(row.amount).isPositive())) {
    errors.push({ code: "INVALID_SALARY_AMOUNT", message: "Every salary payment must have a positive, valid amount." });
  }

  const fingerprintSecret = String(process.env.PAYROLL_PAYOUT_RECIPIENT_FINGERPRINT_SECRET || process.env.JWT_ACCESS_SECRET || "").trim();
  if (!fingerprintSecret) throw new AppError("JWT_ACCESS_SECRET or PAYROLL_PAYOUT_RECIPIENT_FINGERPRINT_SECRET is required to protect the payroll preparation fingerprint.", 503);
  const preparationFingerprint = crypto.createHmac("sha256", fingerprintSecret).update(JSON.stringify({
    companyId, periodId, provider, mode,
    // Bind approval to payroll/bank/fee inputs, not volatile balance snapshots. Both the
    // company-wallet balance and provider balance are independently rechecked at approval
    // and execution; a balance change alone must not invalidate the reviewed employee register.
    items: fees.map((item) => ({
      disbursementId: item.row.id,
      employeeId: item.row.employeeId,
      payrollItemId: item.row.payrollItem?.id || null,
      payrollItemStatus: item.row.payrollItem?.status || null,
      amount: money(item.row.amount).toFixed(2),
      payrollNetSalary: item.row.payrollItem ? money(item.row.payrollItem.netSalary).toFixed(2) : null,
      bankAccountId: item.bank.account?.id || null,
      accountName: item.bank.account?.accountName || null,
      accountNumber: item.bank.account?.accountNumber || null,
      bankName: item.bank.account?.bankName || null,
      bankCode: item.bank.bankCode || null,
      employeeEmail: item.row.employee?.email || null,
      fee: money(item.fee).toFixed(2),
      resolvedAccountName: item.bankVerification?.accountName || null,
      accountVerificationError: item.bankVerificationError || null,
      errors: [item.bank.error, item.bankVerificationError, item.amountError, item.feeError].filter(Boolean),
    })).sort((a, b) => a.disbursementId.localeCompare(b.disbursementId)),
  })).digest("hex");

  const preview = {
    ready: errors.length === 0,
    provider,
    mode,
    providerBalanceRequired: mode === "live",
    preparationFingerprint,
    periodId,
    periodName: period.name,
    employeeCount: pending.length,
    salaryAmount: salaryTotal.toFixed(2),
    estimatedFeeAmount: feeTotal.toFixed(2),
    requiredAmount: requiredTotal.toFixed(2),
    walletBalance: walletBalance.toFixed(2),
    providerAvailableBalance: providerAvailableBalance?.toFixed(2) ?? null,
    walletSufficient,
    providerSufficient,
    providerBalanceError,
    errors,
    employees: employeeResults,
    warning: mode === "sandbox"
      ? "Sandbox provider balance and bank resolution are informational/test-environment checks. This preview is not proof of live funds availability. Provider balance is a shared integration balance, not an isolated company account; EMS's internal tenant wallet is a separate ledger."
      : "Provider balance is for the payment-provider integration, not an isolated company account. EMS's internal tenant wallet is a separate ledger. If multiple companies share one provider credential, that external balance is shared and must be managed centrally; it can also change outside EMS after preflight.",
  };
  return { preview, period, pending, prepared: fees, salaryTotal, feeTotal, requiredTotal, walletBalance, providerAvailableBalance };
};

const persistPreview = async (companyId, periodId, actorId, evaluation) => {
  const { preview, prepared, salaryTotal, feeTotal, walletBalance, providerAvailableBalance } = evaluation;
  const current = await prisma.payrollPayoutBatch.findUnique({ where: { companyId_periodId: { companyId, periodId } } });
  if (current && !["PREPARED", "APPROVED"].includes(current.status)) {
    throw new AppError("This payroll payment batch has already started. Do not rebuild it; verify existing transfers or retry only a confirmed failed transfer.", 409, { details: { batchStatus: current.status } });
  }
  if (current?.status === "APPROVED") {
    const hasReservation = await prisma.walletLedgerEntry.findUnique({ where: { reference: `PAYROLL-BATCH-${current.id}` }, select: { id: true } });
    if (hasReservation) throw new AppError("Funds have already been reserved for this approved batch. It cannot be re-previewed.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.payrollPayoutBatch.upsert({
      where: { companyId_periodId: { companyId, periodId } },
      create: {
        companyId, periodId, provider: preview.provider, status: "PREPARED", employeeCount: preview.employeeCount,
        salaryAmount: salaryTotal.toFixed(2), estimatedFeeAmount: feeTotal.toFixed(2), reservedAmount: "0.00",
        providerAvailableBalance: providerAvailableBalance === null ? null : providerAvailableBalance.toFixed(2),
        walletBalanceAtPreview: walletBalance.toFixed(2), validationResults: preview, preparationFingerprint: preview.preparationFingerprint, previewedAt: new Date(), createdBy: actorId,
      },
      update: {
        provider: preview.provider, status: "PREPARED", employeeCount: preview.employeeCount,
        salaryAmount: salaryTotal.toFixed(2), estimatedFeeAmount: feeTotal.toFixed(2), reservedAmount: "0.00",
        providerAvailableBalance: providerAvailableBalance === null ? null : providerAvailableBalance.toFixed(2),
        walletBalanceAtPreview: walletBalance.toFixed(2), validationResults: preview, preparationFingerprint: preview.preparationFingerprint, previewedAt: new Date(),
        approvedBy: null, approvedAt: null, executedAt: null,
      },
    });
    for (const item of prepared) {
      await tx.payrollDisbursement.update({
        where: { id: item.row.id },
        data: { batchId: batch.id, estimatedFeeAmount: item.fee.toFixed(2), reservedFeeAmount: "0.00", actualFeeAmount: null },
      });
    }
    await writeAudit(tx, {
      companyId, actorUserId: actorId, action: "CREATE", module: "payroll", resource: "payroll_payout_batch", resourceId: batch.id,
      metadata: { event: "PAYOUT_BATCH_PREVIEWED", periodId, provider: preview.provider, employeeCount: preview.employeeCount, salaryAmount: preview.salaryAmount, estimatedFeeAmount: preview.estimatedFeeAmount, requiredAmount: preview.requiredAmount, ready: preview.ready },
    });
    return { ...batch, preview };
  }, transactionOptions);
};

export const getPayrollPayoutBatch = async (companyId, periodId) => {
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId, deletedAt: null }, select: { id: true } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  const [batch, wallet] = await Promise.all([
    prisma.payrollPayoutBatch.findUnique({ where: { companyId_periodId: { companyId, periodId } } }),
    getWallet(companyId),
  ]);
  return { batch, walletBalance: money(wallet.balance).toFixed(2) };
};

export const previewPayrollPayoutBatch = async (companyId, periodId, actorId, providerInput) => {
  const provider = String(providerInput || "").toUpperCase();
  const evaluation = await calculatePayoutPreview(companyId, periodId, provider);
  const persisted = await persistPreview(companyId, periodId, actorId, evaluation);
  return { batch: persisted, preview: evaluation.preview };
};

export const approvePayrollPayoutBatch = async (companyId, periodId, actorId) => {
  const existing = await prisma.payrollPayoutBatch.findUnique({ where: { companyId_periodId: { companyId, periodId } } });
  if (!existing) throw new AppError("Preview and validate the payroll payment batch before approving it.", 409);
  if (existing.status !== "PREPARED") throw new AppError(`This batch cannot be approved from status ${existing.status}.`, 409);

  const evaluation = await calculatePayoutPreview(companyId, periodId, existing.provider);
  const oldSalary = money(existing.salaryAmount);
  const oldFees = money(existing.estimatedFeeAmount);
  const amountsChanged = !oldSalary.eq(evaluation.salaryTotal)
    || !oldFees.eq(evaluation.feeTotal)
    || Number(existing.employeeCount) !== Number(evaluation.preview.employeeCount);
  const preparationChanged = !existing.preparationFingerprint
    || existing.preparationFingerprint !== evaluation.preview.preparationFingerprint;

  if (!evaluation.preview.ready || amountsChanged || preparationChanged) {
    const reasons = [];
    if (!evaluation.preview.ready) reasons.push("Latest preflight checks failed");
    if (amountsChanged) reasons.push("salary total, employee count or estimated fees changed");
    if (preparationChanged) reasons.push("employee bank or payroll details changed after preview");
    throw new AppError(`${reasons.join("; ")}. Refresh the preview, review the updated register, then approve again.`, 409, {
      details: { batchStatus: existing.status, preview: evaluation.preview },
    });
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollPayoutBatch.findFirst({ where: { id: existing.id, companyId, status: "PREPARED", preparationFingerprint: evaluation.preview.preparationFingerprint } });
    if (!current) throw new AppError("The payout batch changed while approval was being processed. Refresh the preview and review it again.", 409);
    const updated = await tx.payrollPayoutBatch.update({ where: { id: current.id }, data: { status: "APPROVED", approvedBy: actorId, approvedAt: new Date() } });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_payout_batch", resourceId: current.id, metadata: { event: "PAYOUT_BATCH_APPROVED", provider: current.provider, employeeCount: current.employeeCount, salaryAmount: current.salaryAmount.toString(), estimatedFeeAmount: current.estimatedFeeAmount.toString(), preparationFingerprint: current.preparationFingerprint } });
    return updated;
  }, transactionOptions);
};

const refreshBatchStatus = async (tx, companyId, batchId, periodId) => {
  if (!batchId) return;
  const rows = await tx.payrollDisbursement.findMany({ where: { companyId, batchId }, select: { status: true, failureReason: true, amount: true, reservedFeeAmount: true, actualFeeAmount: true } });
  if (!rows.length) return;
  const needsReview = rows.some((row) => row.status === "REQUIRES_REVIEW" || /fee reconciliation|required finance reconciliation/i.test(row.failureReason || ""));
  const currentReservedAmount = rows.reduce((sum, row) => {
    const status = String(row.status || "").toUpperCase();
    if (["PROCESSING", "REQUIRES_REVIEW"].includes(status)) return sum.plus(money(row.amount)).plus(money(row.reservedFeeAmount));
    if (/fee reconciliation|required finance reconciliation/i.test(row.failureReason || "")) return sum.plus(money(row.reservedFeeAmount));
    return sum;
  }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let status;
  if (needsReview) status = "REQUIRES_REVIEW";
  else if (rows.every((row) => row.status === "PAID")) status = "COMPLETED";
  else if (rows.some((row) => row.status === "PROCESSING")) status = "PROCESSING";
  else if (rows.some((row) => row.status === "PENDING")) status = "APPROVED";
  else if (rows.some((row) => row.status === "PAID")) status = "PARTIAL";
  else if (rows.every((row) => ["FAILED", "REVERSED"].includes(row.status))) status = "FAILED";
  else status = "PARTIAL";
  await tx.payrollPayoutBatch.update({ where: { id: batchId }, data: { status, reservedAmount: currentReservedAmount.toFixed(2) } });

  if (rows.every((row) => row.status === "PAID") && !needsReview) {
    await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "PAID" } });
    await tx.payrollItem.updateMany({ where: { companyId, periodId }, data: { status: "PAID" } });
  } else {
    const period = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId, deletedAt: null }, select: { status: true } });
    if (period?.status === "PAID") {
      await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "FINALIZED" } });
      await tx.payrollItem.updateMany({ where: { companyId, periodId, status: "PAID" }, data: { status: "FINALIZED" } });
    }
  }
};

const publicProviderResponse = (response, transferId, reference) => ({
  status: response?.status ?? null,
  message: asText(response?.message || response?.data?.complete_message || "", 250) || null,
  dataStatus: response?.data?.status ?? null,
  reference: response?.data?.reference ?? response?.data?.tx_ref ?? reference,
  transferId: transferId ? String(transferId) : null,
  fee: response?.data?.fee_charged ?? response?.data?.fee ?? null,
});

const recordDefinitiveFailure = async (companyId, payout, attemptNumber, actorId, message, providerResponse = null, { requestWasNotSent = false } = {}) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
    if (!current) throw new AppError("Payroll disbursement not found.", 404);
    if (["PAID", "REVERSED"].includes(current.status)) return current;
    if (current.status === "FAILED") return current;

    const attempt = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: current.id, attemptNumber, companyId } });
    const actualFee = providerReportedPayoutFee(current.provider, providerResponse);
    const salaryAmount = money(current.amount);
    const reservedFee = money(current.reservedFeeAmount);
    // Always restore a definitively failed salary. Do not release an estimated fee when the
    // provider request may have incurred an unreported fee; hold it for statement reconciliation.
    const feeToRelease = actualFee === null
      ? (requestWasNotSent ? reservedFee : new Decimal(0))
      : Decimal.max(new Decimal(0), reservedFee.minus(money(actualFee)));
    const refundAmount = salaryAmount.plus(feeToRelease).toDecimalPlaces(2);
    if (refundAmount.isPositive()) {
      await creditWalletInTransaction(tx, companyId, {
        amount: refundAmount.toFixed(2),
        reference: `PAYROLL-REFUND-${current.id}-ATT-${attemptNumber}`,
        description: `Release reserved funds for failed salary payout ${current.id}`,
        metadata: { disbursementId: current.id, periodId: current.periodId, provider: current.provider, attemptNumber, salaryRefund: salaryAmount.toFixed(2), feeReleased: feeToRelease.toFixed(2), actualProviderFee: actualFee, reason: asText(message, 400) },
      });
    }
    const feeNote = actualFee === null && !requestWasNotSent
      ? " The provider did not report its fee. Fee reconciliation is required against the provider statement; the estimated fee remains held until this check is complete."
      : (actualFee !== null && money(actualFee).greaterThan(reservedFee)
        ? ` The actual provider fee ${money(actualFee).toFixed(2)} exceeded the reserved estimate ${reservedFee.toFixed(2)}; finance reconciliation is required.`
        : "");
    const updated = await tx.payrollDisbursement.update({
      where: { id: current.id },
      data: {
        status: "FAILED",
        actualFeeAmount: actualFee === null ? current.actualFeeAmount : actualFee,
        reservedFeeAmount: requestWasNotSent ? "0.00" : (actualFee !== null && money(actualFee).lessThanOrEqualTo(reservedFee) ? money(actualFee).toFixed(2) : current.reservedFeeAmount),
        providerStatus: providerResponse?.data?.status ? String(providerResponse.data.status) : "FAILED",
        providerResponse: providerResponse ? publicProviderResponse(providerResponse, providerResponse.data?.id ?? current.providerTransferId, current.externalReference) : undefined,
        failureReason: `${asText(message || "Provider confirmed that the salary transfer failed.", 430)}${feeNote}`.slice(0, 500),
        verifiedAt: new Date(),
        updatedBy: actorId || null,
      },
    });
    if (attempt) await tx.payrollPayoutAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", actualFeeAmount: actualFee, providerResponse: providerResponse ? publicProviderResponse(providerResponse, providerResponse.data?.id, current.externalReference) : undefined, failureReason: asText(message || "Provider confirmed failure.", 500), verifiedAt: new Date() } });
    if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
    await writeAudit(tx, { companyId, actorUserId: actorId || null, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { previousStatus: current.status, status: "FAILED", attemptNumber, provider: current.provider, refundedAmount: refundAmount.toFixed(2), reason: asText(message, 400) } });
    return updated;
  }, transactionOptions);
};

const recordUncertainInitiation = async (companyId, payout, attemptNumber, actorId, error) => {
  const message = error?.response?.data?.message || error?.providerResponse?.message || error?.message || "The provider response was inconclusive.";
  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
    if (!current || ["PAID", "FAILED", "REVERSED"].includes(current.status)) return current;
    const updated = await tx.payrollDisbursement.update({
      where: { id: current.id },
      data: {
        status: "REQUIRES_REVIEW",
        failureReason: `Provider outcome is uncertain. Reserved funds remain untouched. Verify the original provider reference before any retry. ${asText(message, 300)}`.slice(0, 500),
        providerStatus: "REQUIRES_REVIEW",
        providerResponse: { outcome: "UNCERTAIN", httpStatus: error?.response?.status ?? null, message: asText(message, 350), reference: current.externalReference },
        updatedBy: actorId || null,
      },
    });
    await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: current.id, attemptNumber, companyId }, data: { status: "REQUIRES_REVIEW", failureReason: asText(message, 500), providerResponse: { outcome: "UNCERTAIN", httpStatus: error?.response?.status ?? null, message: asText(message, 350) } } });
    if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
    await writeAudit(tx, { companyId, actorUserId: actorId || null, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { status: "REQUIRES_REVIEW", attemptNumber, provider: current.provider, externalReference: current.externalReference, message: asText(message, 350) } });
    return updated;
  }, transactionOptions);
};

const recordVerifiedSuccess = async (companyId, payout, attemptNumber, actorId, response) => {
  const actualFee = providerReportedPayoutFee(payout.provider, response);
  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
    if (!current) throw new AppError("Payroll disbursement not found.", 404);
    if (current.status === "PAID") return current;
    if (!["PROCESSING", "REQUIRES_REVIEW"].includes(current.status)) throw new AppError("Payout status changed while verification was running. Refresh and verify again.", 409);
    const attempt = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: current.id, attemptNumber, companyId } });
    const reservedFee = money(current.reservedFeeAmount);
    let feeAmountAccountedInWallet = reservedFee;
    let accountingNote = null;
    if (actualFee === null) {
      accountingNote = "Salary transfer succeeded, but the provider did not return an actual fee. Fee reconciliation is required against the provider statement.";
    } else {
      const feeDifference = reservedFee.minus(money(actualFee));
      if (feeDifference.greaterThan(0)) {
        await creditWalletInTransaction(tx, companyId, {
          amount: feeDifference.toFixed(2), reference: `PAYROLL-FEE-RELEASE-${current.id}-ATT-${attemptNumber}`,
          description: `Release excess estimated payout fee for ${current.id}`,
          metadata: { disbursementId: current.id, attemptNumber, reservedFee: reservedFee.toFixed(2), actualFee },
        });
        feeAmountAccountedInWallet = money(actualFee);
      } else if (feeDifference.lessThan(0)) {
        try {
          await debitWalletInTransaction(tx, companyId, {
            amount: feeDifference.abs().toFixed(2), reference: `PAYROLL-FEE-ADJUST-${current.id}-ATT-${attemptNumber}`,
            description: `Additional provider fee for salary payout ${current.id}`,
            metadata: { disbursementId: current.id, attemptNumber, reservedFee: reservedFee.toFixed(2), actualFee },
          });
          feeAmountAccountedInWallet = money(actualFee);
        } catch {
          accountingNote = `Salary transfer succeeded, but actual provider fee ${money(actualFee).toFixed(2)} exceeded the reserved estimate ${reservedFee.toFixed(2)}. Finance reconciliation is required because the additional fee could not be debited from the company wallet.`;
        }
      } else {
        feeAmountAccountedInWallet = money(actualFee);
      }
    }
    const updated = await tx.payrollDisbursement.update({
      where: { id: current.id },
      data: {
        status: "PAID", actualFeeAmount: actualFee, reservedFeeAmount: feeAmountAccountedInWallet.toFixed(2), providerStatus: String(response?.data?.status || "SUCCESS"),
        providerResponse: publicProviderResponse(response, response?.data?.id ?? current.providerTransferId, current.externalReference),
        failureReason: accountingNote, paidAt: new Date(), verifiedAt: new Date(), updatedBy: actorId || null,
      },
    });
    if (attempt) await tx.payrollPayoutAttempt.update({ where: { id: attempt.id }, data: { status: "PAID", actualFeeAmount: actualFee, providerResponse: publicProviderResponse(response, response?.data?.id, current.externalReference), failureReason: accountingNote, verifiedAt: new Date() } });
    if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
    await writeAudit(tx, { companyId, actorUserId: actorId || null, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { previousStatus: current.status, status: "PAID", provider: current.provider, externalReference: current.externalReference, providerStatus: response?.data?.status, actualFee: actualFee === null ? null : money(actualFee).toFixed(2), feeReconciliationRequired: Boolean(accountingNote) } });
    return updated;
  }, transactionOptions);
};

const recordReversal = async (companyId, payout, attemptNumber, actorId, response) => prisma.$transaction(async (tx) => {
  const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
  if (!current) throw new AppError("Payroll disbursement not found.", 404);
  if (current.status === "REVERSED") return current;
  const attempt = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: current.id, attemptNumber, companyId } });
  // A confirmed failure already restored principal. If a late provider reversal arrives for that
  // same attempt, change the state but never credit the salary a second time.
  const principalAlreadyReleased = current.status === "FAILED";
  if (!principalAlreadyReleased) {
    await creditWalletInTransaction(tx, companyId, {
      amount: money(current.amount).toFixed(2), reference: `PAYROLL-REVERSAL-${current.id}-ATT-${attemptNumber}`,
      description: `Restore salary principal for reversed provider transfer ${current.id}`,
      metadata: { disbursementId: current.id, periodId: current.periodId, provider: current.provider, attemptNumber, externalReference: attempt?.externalReference || current.externalReference },
    });
  }
  const updated = await tx.payrollDisbursement.update({
    where: { id: current.id },
    data: {
      status: "REVERSED", providerStatus: String(response?.data?.status || "REVERSED"),
      feeReconciliationReference: null, feeReconciliationNote: null, feeReconciledAt: null,
      providerResponse: publicProviderResponse(response, response?.data?.id ?? current.providerTransferId, attempt?.externalReference || current.externalReference),
      failureReason: `Provider confirmed the transfer was reversed. ${principalAlreadyReleased ? "Salary principal had already been refunded for the confirmed failure, so no duplicate credit was posted." : "Salary principal was restored to the company wallet."} Fee reconciliation is required before retrying.`,
      verifiedAt: new Date(), updatedBy: actorId || null,
    },
  });
  if (attempt) await tx.payrollPayoutAttempt.update({ where: { id: attempt.id }, data: { status: "REVERSED", providerResponse: publicProviderResponse(response, response?.data?.id, attempt.externalReference), failureReason: "Provider confirmed reversal; fee reconciliation is required.", verifiedAt: new Date() } });
  if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
  await writeAudit(tx, { companyId, actorUserId: actorId || null, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { previousStatus: current.status, status: "REVERSED", provider: current.provider, externalReference: attempt?.externalReference || current.externalReference, principalRestored: principalAlreadyReleased ? "0.00" : money(current.amount).toFixed(2), feeReconciliationRequired: true } });
  return updated;
}, transactionOptions);

const validateVerifiedTransfer = (payout, response) => {
  const data = response?.data;
  if (!data) throw new AppError("Provider returned no transfer data. Reserved funds remain untouched.", 502);
  const expectedReference = String(payout.externalReference || "");
  const receivedReference = String(payout.provider === "PAYSTACK" ? data.reference || "" : data.reference || "");
  if (!expectedReference || receivedReference !== expectedReference) throw new AppError("Provider transfer reference mismatch. Funds remain reserved for investigation.", 409);
  const expectedAmount = money(payout.amount);
  const actualAmount = payout.provider === "PAYSTACK" ? money(new Decimal(data.amount ?? 0).div(100)) : money(data.amount ?? 0);
  if (!actualAmount.eq(expectedAmount) || String(data.currency || "").toUpperCase() !== "NGN") {
    throw new AppError("Provider transfer amount or currency mismatch. Funds remain reserved for investigation.", 409, { details: { expectedAmount: expectedAmount.toFixed(2), actualAmount: actualAmount.toFixed(2), currency: data.currency || null } });
  }
  return data;
};

const recipientFingerprint = (account, email) => {
  const secret = String(process.env.PAYROLL_PAYOUT_RECIPIENT_FINGERPRINT_SECRET || process.env.PAYSTACK_SECRET_KEY || "");
  if (!secret) throw new AppError("PAYSTACK_SECRET_KEY is required to protect cached recipient details.", 503);
  return crypto.createHmac("sha256", secret).update(JSON.stringify({
    name: String(account.accountName || "").trim(), accountNumber: String(account.accountNumber || "").trim(),
    bankCode: String(account.paystackBankCode || "").trim(), email: String(email || "").trim().toLowerCase(),
    // Recipient codes are scoped to a particular Paystack integration; rotate the cache when its key changes.
    integrationKeyFingerprint: crypto.createHash("sha256").update(String(process.env.PAYSTACK_SECRET_KEY || "")).digest("hex"),
  })).digest("hex");
};

const getOrCreatePaystackRecipient = async ({ companyId, payout, bankAccount }) => {
  const mode = getPayrollPayoutMode();
  const fingerprint = recipientFingerprint(bankAccount, payout.employee?.email);
  if (bankAccount.paystackRecipientCode && bankAccount.paystackRecipientMode === mode && bankAccount.paystackRecipientFingerprint === fingerprint) {
    return bankAccount.paystackRecipientCode;
  }
  const response = await createPaystackTransferRecipient({
    name: bankAccount.accountName, accountNumber: bankAccount.accountNumber, bankCode: bankAccount.paystackBankCode,
    email: payout.employee?.email || undefined,
  });
  const recipientCode = response?.data?.recipient_code;
  if (!recipientCode) throw new Error("Paystack did not return a recipient code.");
  await prisma.employeeBankAccount.update({
    where: { id: bankAccount.id },
    data: { paystackRecipientCode: String(recipientCode), paystackRecipientMode: mode, paystackRecipientFingerprint: fingerprint },
  });
  return String(recipientCode);
};

export const executePayrollPayouts = async (companyId, periodId, actorId, providerInput) => {
  const provider = String(providerInput || "").toUpperCase();
  assertPayrollPayoutProviderConfiguration(provider);
  const batch = await prisma.payrollPayoutBatch.findUnique({ where: { companyId_periodId: { companyId, periodId } } });
  if (!batch) throw new AppError("Preview and approve the payroll payout batch before initiating transfers.", 409);
  if (batch.status !== "APPROVED") throw new AppError(`Salary transfers can only be initiated from an APPROVED batch; current status is ${batch.status}.`, 409);
  if (batch.provider !== provider) throw new AppError("The selected provider differs from the approved batch. Preview and approve the desired provider first.", 409);

  const evaluation = await calculatePayoutPreview(companyId, periodId, provider);
  const amountChanged = !money(batch.salaryAmount).eq(evaluation.salaryTotal)
    || !money(batch.estimatedFeeAmount).eq(evaluation.feeTotal)
    || Number(batch.employeeCount) !== Number(evaluation.preview.employeeCount);
  const preparationChanged = !batch.preparationFingerprint || batch.preparationFingerprint !== evaluation.preview.preparationFingerprint;
  if (!evaluation.preview.ready || amountChanged || preparationChanged) {
    // Return the batch to PREPARED but do not overwrite its approved snapshot. The user must
    // explicitly refresh the preview so the new bank/account/amount snapshot is reviewed.
    await prisma.payrollPayoutBatch.updateMany({ where: { id: batch.id, companyId, status: "APPROVED" }, data: { status: "PREPARED", approvedBy: null, approvedAt: null } });
    throw new AppError("The approved payroll or bank details changed, or a latest preflight check failed. Refresh the preview, review it and approve again; no transfers were initiated.", 409, { details: { preview: evaluation.preview } });
  }

  const reservationAmount = evaluation.requiredTotal;
  const reservationReference = `PAYROLL-BATCH-${batch.id}`;
  const prepared = evaluation.prepared;
  const pendingIds = evaluation.pending.map((row) => row.id);
  await prisma.$transaction(async (tx) => {
    const currentBatch = await tx.payrollPayoutBatch.findFirst({ where: { id: batch.id, companyId, status: "APPROVED", preparationFingerprint: batch.preparationFingerprint } });
    if (!currentBatch) throw new AppError("The approved payout batch changed before reservation. Refresh and review it again.", 409);
    const currentPeriod = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId, deletedAt: null } });
    if (!currentPeriod || currentPeriod.status !== "FINALIZED") throw new AppError("Payroll is no longer finalized and unpaid. No transfer has been initiated.", 409);
    const stillPending = await tx.payrollDisbursement.findMany({ where: { companyId, periodId, status: "PENDING" }, select: { id: true } });
    if (stillPending.length !== pendingIds.length || stillPending.some((row) => !pendingIds.includes(row.id))) throw new AppError("The payment register changed after approval. No transfer has been initiated.", 409);
    const existingReservation = await tx.walletLedgerEntry.findUnique({ where: { reference: reservationReference }, select: { id: true } });
    if (existingReservation) throw new AppError("This batch already has a wallet reservation. Duplicate payout execution is blocked.", 409);
    await debitWalletInTransaction(tx, companyId, {
      amount: reservationAmount.toFixed(2), reference: reservationReference,
      description: `Reserve salary payout batch — ${evaluation.period.name}`,
      metadata: { payoutBatchId: batch.id, periodId, provider, disbursementIds: pendingIds, salaryAmount: evaluation.salaryTotal.toFixed(2), estimatedFees: evaluation.feeTotal.toFixed(2), totalReserved: reservationAmount.toFixed(2) },
    });
    for (const item of prepared) {
      const { row, fee } = item;
      const reference = makePayrollPayoutReference(row.id, 1);
      await tx.payrollDisbursement.update({ where: { id: row.id }, data: {
        batchId: batch.id, status: "PROCESSING", method: provider, provider, externalReference: reference,
        estimatedFeeAmount: fee.toFixed(2), reservedFeeAmount: fee.toFixed(2), actualFeeAmount: null,
        providerStatus: "SUBMITTED", providerResponse: Prisma.DbNull, failureReason: null, updatedBy: actorId,
      } });
      await tx.payrollPayoutAttempt.create({ data: {
        companyId, disbursementId: row.id, attemptNumber: 1, provider, externalReference: reference,
        status: "SUBMITTED", amount: money(row.amount).toFixed(2), estimatedFeeAmount: fee.toFixed(2),
        createdBy: actorId, submittedAt: new Date(),
      } });
    }
    await tx.payrollPayoutBatch.update({ where: { id: batch.id }, data: { status: "PROCESSING", reservedAmount: reservationAmount.toFixed(2), providerAvailableBalance: evaluation.providerAvailableBalance?.toFixed(2) ?? null, executedAt: new Date() } });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_payout_batch", resourceId: batch.id, metadata: { event: "PAYOUT_BATCH_RESERVED", provider, count: pendingIds.length, salaryAmount: evaluation.salaryTotal.toFixed(2), estimatedFeeAmount: evaluation.feeTotal.toFixed(2), reservedAmount: reservationAmount.toFixed(2), walletReservationReference: reservationReference } });
  }, transactionOptions);

  const results = [];
  for (const item of prepared) {
    const row = item.row;
    const fresh = await prisma.payrollDisbursement.findFirst({ where: { id: row.id, companyId }, include: { employee: true } });
    const bank = item.bank;
    if (!fresh) continue;
    let transferRequestStarted = false;
    try {
      let response;
      const recipientCode = await getOrCreatePaystackRecipient({ companyId, payout: fresh, bankAccount: bank.account });
      transferRequestStarted = true;
      response = await initiatePaystackTransfer({
        amount: fresh.amount,
        recipientCode,
        reference: fresh.externalReference,
        reason: `EMS salary ${evaluation.period.name} — ${fresh.employee?.employeeNumber || fresh.employeeId}`,
      });
      const initiationStatus = normalizePayrollPayoutStatus(provider, response?.data?.status);
      if (initiationStatus === "REVERSED") {
        const reversed = await recordReversal(companyId, fresh, 1, actorId, response);
        results.push({ id: row.id, status: reversed.status, reference: fresh.externalReference, message: "Provider returned a reversed status; inspect fee reconciliation before any retry." });
        continue;
      }
      if (initiationStatus === "REQUIRES_REVIEW") {
        const data = response?.data || {};
        const transferId = provider === "PAYSTACK" ? data.transfer_code || data.id || null : data.id != null ? String(data.id) : null;
        await prisma.$transaction(async (tx) => {
          await tx.payrollDisbursement.updateMany({ where: { id: fresh.id, companyId, status: { in: ["PROCESSING", "REQUIRES_REVIEW"] } }, data: {
            status: "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null,
            providerStatus: String(data.status || "OTP"), providerResponse: publicProviderResponse(response, transferId, fresh.externalReference),
            failureReason: "The provider requires OTP/manual approval. EMS does not automatically bypass provider approval; complete the original transfer in the provider dashboard and verify its original reference. Do not retry it as a new payment.", updatedBy: actorId,
          } });
          await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: fresh.id, companyId, attemptNumber: 1, status: { in: ["SUBMITTED", "PROCESSING", "REQUIRES_REVIEW"] } }, data: {
            status: "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null,
            providerResponse: publicProviderResponse(response, transferId, fresh.externalReference),
            failureReason: "Provider OTP/manual approval is required; verify the same transfer reference after completing provider approval.",
          } });
          await refreshBatchStatus(tx, companyId, batch.id, periodId);
        }, transactionOptions);
        results.push({ id: row.id, status: "REQUIRES_REVIEW", reference: fresh.externalReference, message: "Provider requires OTP/manual approval. No duplicate transfer was attempted." });
        continue;
      }
      if (isDefinitiveTransferFailure(response)) {
        const message = response.message || response.data?.complete_message || response.data?.failures?.message || "Provider reported a definitive transfer failure.";
        const failed = await recordDefinitiveFailure(companyId, fresh, 1, actorId, message, response);
        results.push({ id: row.id, status: failed.status, reference: fresh.externalReference, message: "Provider confirmed failure; eligible reserved funds were released and unknown fees remain held for reconciliation." });
        continue;
      }
      const data = response?.data || {};
      const transferId = provider === "PAYSTACK" ? data.transfer_code || data.id || null : data.id !== undefined ? String(data.id) : null;
      await prisma.$transaction(async (tx) => {
        const state = await tx.payrollDisbursement.findFirst({ where: { id: fresh.id, companyId }, select: { status: true } });
        const attemptState = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: fresh.id, companyId, attemptNumber: 1 }, select: { status: true } });
        const terminal = ["PAID", "FAILED", "REVERSED"].includes(String(state?.status || "").toUpperCase())
          || ["PAID", "FAILED", "REVERSED"].includes(String(attemptState?.status || "").toUpperCase());
        if (!terminal) {
          await tx.payrollDisbursement.update({ where: { id: fresh.id }, data: {
            ...(transferId ? {} : { status: "REQUIRES_REVIEW" }),
            providerTransferId: transferId ? String(transferId) : null,
            providerStatus: transferId ? String(data.status || "SUBMITTED") : "REQUIRES_REVIEW",
            providerResponse: publicProviderResponse(response, transferId, fresh.externalReference),
            failureReason: transferId ? null : "Provider response did not include a transfer ID. Funds remain reserved; search the original reference in the provider dashboard. Do not retry until the outcome is known.",
            updatedBy: actorId,
          } });
          await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: fresh.id, companyId, attemptNumber: 1, status: { in: ["SUBMITTED", "PROCESSING"] } }, data: {
            providerTransferId: transferId ? String(transferId) : null, status: transferId ? "PROCESSING" : "REQUIRES_REVIEW",
            providerResponse: publicProviderResponse(response, transferId, fresh.externalReference), submittedAt: new Date(),
            failureReason: transferId ? null : "Provider response did not include transfer ID; manual provider reconciliation is required.",
          } });
        }
        if (!transferId || terminal) await refreshBatchStatus(tx, companyId, batch.id, periodId);
      }, transactionOptions);
      const settled = await prisma.payrollDisbursement.findFirst({ where: { id: row.id, companyId }, select: { status: true, providerTransferId: true } });
      results.push({ id: row.id, status: settled?.status || (transferId ? "PROCESSING" : "REQUIRES_REVIEW"), providerTransferId: settled?.providerTransferId || (transferId ? String(transferId) : null), reference: fresh.externalReference });
    } catch (error) {
      const httpStatus = error?.response?.status;
      const definitiveHttpRejection = Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 500 && ![408, 409, 429].includes(httpStatus);
      const providerErrorResponse = error?.providerResponse || (error?.response?.data ? { ...error.response.data, status: error.response.data.status ?? false, data: error.response.data.data ?? error.response.data } : null);
      const canSafelyRelease = !transferRequestStarted || definitiveHttpRejection || isDefinitiveTransferFailure(providerErrorResponse);
      const message = error?.response?.data?.message || providerErrorResponse?.message || error?.message || "The provider request failed.";
      if (canSafelyRelease) {
        const failed = await recordDefinitiveFailure(companyId, fresh, 1, actorId, message, providerErrorResponse, { requestWasNotSent: !transferRequestStarted || definitiveHttpRejection });
        results.push({ id: row.id, status: failed.status, reference: fresh.externalReference, message: "No transfer was accepted or the provider definitively rejected it; eligible funds were released and any unknown fee remains held for reconciliation." });
      } else {
        await recordUncertainInitiation(companyId, fresh, 1, actorId, error);
        results.push({ id: row.id, status: "REQUIRES_REVIEW", reference: fresh.externalReference, message: "Provider outcome is uncertain; funds remain reserved and no automatic retry was attempted." });
      }
    }
  }
  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId }, include: disbursementInclude, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  const latestBatch = await prisma.payrollPayoutBatch.findFirst({ where: { id: batch.id, companyId } });
  return {
    provider, periodId, batch: latestBatch,
    salaryAmount: evaluation.salaryTotal.toFixed(2), estimatedFeeAmount: evaluation.feeTotal.toFixed(2), reservedAmount: reservationAmount.toFixed(2),
    results, disbursements: rows,
    summary: { submitted: results.filter((result) => result.status === "PROCESSING").length, review: results.filter((result) => result.status === "REQUIRES_REVIEW").length, failed: results.filter((result) => result.status === "FAILED").length, total: results.length },
  };
};

const getAttemptForPayout = async (payout) => {
  const attempt = await prisma.payrollPayoutAttempt.findFirst({ where: { disbursementId: payout.id, companyId: payout.companyId }, orderBy: { attemptNumber: "desc" } });
  return attempt || { attemptNumber: 1, externalReference: payout.externalReference, providerTransferId: payout.providerTransferId, status: payout.status };
};

const getVerifiedProviderResponse = async (payout, attempt) => {
  let response;
  if (payout.provider === "PAYSTACK") {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new AppError("PAYSTACK_SECRET_KEY is not configured.", 503);
    response = await verifyPaystackTransfer(attempt.externalReference || payout.externalReference);
    if (response?.status !== true || !response?.data) throw new AppError(response?.message || "Paystack could not verify this transfer yet.", 502);
  } else {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError("FLUTTERWAVE_SECRET_KEY is not configured.", 503);
    if (!attempt.providerTransferId && !payout.providerTransferId) throw new AppError("Flutterwave did not return a transfer ID. Find the original reference in the provider dashboard; automatic retry is blocked.", 409);
    response = await verifyFlutterwaveTransfer(attempt.providerTransferId || payout.providerTransferId);
    if (response?.status !== "success" || !response?.data) throw new AppError(response?.message || "Flutterwave could not verify this transfer yet.", 502);
  }
  validateVerifiedTransfer({ ...payout, externalReference: attempt.externalReference || payout.externalReference }, response);
  return response;
};

export const verifyPayrollPayout = async (companyId, disbursementId, actorId = null) => {
  const payout = await prisma.payrollDisbursement.findFirst({ where: { id: disbursementId, companyId }, include: { employee: true } });
  if (!payout) throw new AppError("Payroll disbursement not found.", 404);
  if (!payout.provider || !isProvider(payout.provider)) throw new AppError("This is a manual disbursement and cannot be verified through a payout provider.", 409);
  if (payout.status === "PAID") return payout;
  if (["FAILED", "REVERSED"].includes(payout.status)) throw new AppError(`This transfer is marked ${payout.status}. Inspect the provider dashboard before initiating any new payment.`, 409);
  if (!["PROCESSING", "REQUIRES_REVIEW"].includes(payout.status)) throw new AppError("Only submitted or review-required provider transfers can be verified.", 409);
  const attempt = await getAttemptForPayout(payout);
  const response = await getVerifiedProviderResponse(payout, attempt);
  const rawStatus = response?.data?.status;
  const normalized = normalizePayrollPayoutStatus(payout.provider, rawStatus);
  if (normalized === "FAILED") {
    const message = response?.data?.complete_message || response?.data?.failures?.message || `Provider transfer status: ${rawStatus}`;
    await recordDefinitiveFailure(companyId, payout, attempt.attemptNumber, actorId, message, response);
  } else if (normalized === "REVERSED") {
    await recordReversal(companyId, payout, attempt.attemptNumber, actorId, response);
  } else if (normalized === "PAID") {
    await recordVerifiedSuccess(companyId, payout, attempt.attemptNumber, actorId, response);
  } else {
    const nextStatus = normalized === "REQUIRES_REVIEW" ? "REQUIRES_REVIEW" : "PROCESSING";
    const reviewMessage = nextStatus === "REQUIRES_REVIEW"
      ? "The provider requires OTP/manual approval. Complete the existing transfer in the provider dashboard, then verify this original reference. Do not retry it as a new payment."
      : null;
    await prisma.$transaction(async (tx) => {
      await tx.payrollDisbursement.updateMany({ where: { id: payout.id, companyId, status: { in: ["PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: nextStatus, providerStatus: String(rawStatus || "UNKNOWN"), providerResponse: publicProviderResponse(response, response.data.id ?? payout.providerTransferId, attempt.externalReference || payout.externalReference), failureReason: reviewMessage, verifiedAt: new Date(), updatedBy: actorId || null } });
      await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: payout.id, companyId, attemptNumber: attempt.attemptNumber, status: { in: ["SUBMITTED", "PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: nextStatus, providerResponse: publicProviderResponse(response, response.data.id, attempt.externalReference), failureReason: reviewMessage, verifiedAt: new Date() } });
      if (payout.batchId) await refreshBatchStatus(tx, companyId, payout.batchId, payout.periodId);
      await writeAudit(tx, { companyId, actorUserId: actorId || null, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: payout.id, metadata: { status: nextStatus, provider: payout.provider, externalReference: payout.externalReference, providerStatus: rawStatus } });
    }, transactionOptions);
  }
  return prisma.payrollDisbursement.findFirst({ where: { id: payout.id, companyId }, include: disbursementInclude });
};

export const retryFailedPayrollPayout = async (companyId, disbursementId, actorId, providerInput) => {
  const payout = await prisma.payrollDisbursement.findFirst({ where: { id: disbursementId, companyId }, include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } } } });
  if (!payout) throw new AppError("Payroll disbursement not found.", 404);
  if (payout.status !== "FAILED" || !payout.provider) throw new AppError("Only a provider-managed transfer with a definitively FAILED status can be retried. Uncertain and reversed transfers cannot be retried automatically.", 409);
  if (/fee reconciliation|required finance reconciliation/i.test(payout.failureReason || "")) throw new AppError("Reconcile the previous provider fee against its statement before retrying this failed salary transfer.", 409);
  const provider = String(providerInput || payout.provider).toUpperCase();
  if (provider !== "PAYSTACK") {
    throw new AppError("New salary payout attempts must use Paystack. Flutterwave is retained for wallet funding and verification of previously submitted transfers.", 400);
  }
  // Cross-provider retry is permitted only from a definitively FAILED legacy transfer.
  // The checks above and below require FAILED status, a FAILED latest attempt, and reconciled fees.
  assertPayrollPayoutProviderConfiguration(provider);
  const bank = selectedBankAccount(payout.employee, provider);
  if (bank.error) throw new AppError(bank.error, 400);
  const latestAttempt = await getAttemptForPayout(payout);
  if (latestAttempt.status !== "FAILED") throw new AppError("The latest attempt has not been confirmed failed. Check the provider and reconcile before retrying.", 409);
  const mode = getPayrollPayoutMode();
  const shouldResolveAccount = mode === "live" || String(process.env.PAYROLL_PAYOUT_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX || "false").trim().toLowerCase() === "true";
  if (shouldResolveAccount) {
    const resolved = await resolveBankAccount({ provider, accountNumber: bank.account.accountNumber, bankCode: bank.bankCode });
    if (!accountNamesCompatible(bank.account.accountName, resolved.accountName)) {
      throw new AppError(`The provider resolved this account as "${resolved.accountName}", which does not sufficiently match the saved account name. Correct the bank details before retrying.`, 409);
    }
  }
  const fee = money(await estimatePayrollPayoutFee(provider, payout.amount));
  const required = money(payout.amount).plus(fee);
  let providerBalance = null;
  let providerBalanceError = null;
  try { providerBalance = await getProviderBalance(provider); }
  catch (error) { providerBalanceError = asText(error?.message || "Provider balance unavailable."); }
  // Sandbox provider balance is informational and often synthetic; live balance is mandatory.
  if (mode === "live" && providerBalanceError) throw new AppError(`${provider} available balance could not be verified: ${providerBalanceError}`, 503);
  if (mode === "live" && providerBalance && providerBalance.lessThan(required)) throw new AppError(`${provider} available balance is insufficient for this retry including estimated fee.`, 409, { details: { providerAvailableBalance: providerBalance.toFixed(2), requiredAmount: required.toFixed(2) } });
  const wallet = await getWallet(companyId);
  if (money(wallet.balance).lessThan(required)) throw new AppError("Company wallet balance is insufficient for this retry including fee.", 409, { details: { walletBalance: money(wallet.balance).toFixed(2), requiredAmount: required.toFixed(2) } });

  const attemptNumber = Number(latestAttempt.attemptNumber || 1) + 1;
  const reference = makePayrollPayoutReference(payout.id, attemptNumber);
  await prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId, status: "FAILED" } });
    if (!current) throw new AppError("Transfer status changed before retry reservation. Refresh and verify again.", 409);
    await debitWalletInTransaction(tx, companyId, { amount: required.toFixed(2), reference: `PAYROLL-RETRY-RESERVE-${payout.id}-ATT-${attemptNumber}`, description: `Reserve confirmed failed salary retry ${payout.id}`, metadata: { disbursementId: payout.id, attemptNumber, provider, salaryAmount: money(payout.amount).toFixed(2), estimatedFee: fee.toFixed(2) } });
    await tx.payrollPayoutAttempt.create({ data: { companyId, disbursementId: payout.id, attemptNumber, provider, externalReference: reference, status: "SUBMITTED", amount: money(payout.amount).toFixed(2), estimatedFeeAmount: fee.toFixed(2), createdBy: actorId, submittedAt: new Date() } });
    await tx.payrollDisbursement.update({ where: { id: payout.id }, data: { status: "PROCESSING", provider, method: provider, externalReference: reference, providerTransferId: null, providerStatus: "SUBMITTED", providerResponse: Prisma.DbNull, estimatedFeeAmount: fee.toFixed(2), reservedFeeAmount: fee.toFixed(2), actualFeeAmount: null, failureReason: null, updatedBy: actorId } });
    if (payout.batchId) await refreshBatchStatus(tx, companyId, payout.batchId, payout.periodId);
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: payout.id, metadata: { event: "FAILED_PAYOUT_RETRY_RESERVED", attemptNumber, provider, requiredAmount: required.toFixed(2), reference } });
  }, transactionOptions);

  const current = await prisma.payrollDisbursement.findFirst({ where: { id: payout.id, companyId }, include: { employee: true } });
  let transferRequestStarted = false;
  try {
    let response;
    const recipientCode = await getOrCreatePaystackRecipient({ companyId, payout: current, bankAccount: bank.account });
    transferRequestStarted = true;
    response = await initiatePaystackTransfer({
      amount: current.amount,
      recipientCode,
      reference,
      reason: `EMS salary retry ${payout.periodId} — ${current.employee?.employeeNumber || current.employeeId}`,
    });
    const retryResponseStatus = normalizePayrollPayoutStatus(provider, response?.data?.status);
    if (retryResponseStatus === "REVERSED") return recordReversal(companyId, current, attemptNumber, actorId, response);
    if (retryResponseStatus === "REQUIRES_REVIEW") {
      const data = response?.data || {};
      const transferId = provider === "PAYSTACK" ? data.transfer_code || data.id || null : data.id != null ? String(data.id) : null;
      await prisma.$transaction(async (tx) => {
        await tx.payrollDisbursement.updateMany({ where: { id: current.id, companyId, status: { in: ["PROCESSING", "REQUIRES_REVIEW"] } }, data: {
          status: "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null,
          providerStatus: String(data.status || "OTP"), providerResponse: publicProviderResponse(response, transferId, reference),
          failureReason: "The provider requires OTP/manual approval for this retry. Complete the original transfer in the provider dashboard and verify its reference; do not submit another retry.", updatedBy: actorId,
        } });
        await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: current.id, companyId, attemptNumber, status: { in: ["SUBMITTED", "PROCESSING", "REQUIRES_REVIEW"] } }, data: {
          status: "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null,
          providerResponse: publicProviderResponse(response, transferId, reference), failureReason: "Provider OTP/manual approval is required; verify the same reference after approval.",
        } });
        if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
      }, transactionOptions);
      return prisma.payrollDisbursement.findFirst({ where: { id: payout.id, companyId }, include: disbursementInclude });
    }
    if (isDefinitiveTransferFailure(response)) return recordDefinitiveFailure(companyId, current, attemptNumber, actorId, response.message || "Provider confirmed retry failure.", response);
    const transferId = provider === "PAYSTACK" ? response?.data?.transfer_code || response?.data?.id || null : response?.data?.id != null ? String(response.data.id) : null;
    await prisma.$transaction(async (tx) => {
      const state = await tx.payrollDisbursement.findFirst({ where: { id: current.id, companyId }, select: { status: true } });
      const attemptState = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: payout.id, companyId, attemptNumber }, select: { status: true } });
      const terminal = ["PAID", "FAILED", "REVERSED"].includes(String(state?.status || "").toUpperCase())
        || ["PAID", "FAILED", "REVERSED"].includes(String(attemptState?.status || "").toUpperCase());
      if (!terminal) {
        await tx.payrollDisbursement.update({ where: { id: current.id }, data: { status: transferId ? "PROCESSING" : "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null, providerStatus: String(response?.data?.status || (transferId ? "SUBMITTED" : "REQUIRES_REVIEW")), providerResponse: publicProviderResponse(response, transferId, reference), failureReason: transferId ? null : "Provider response lacks a transfer ID. Confirm the original retry reference in provider dashboard; no further retry is permitted until reconciled.", updatedBy: actorId } });
        await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: payout.id, companyId, attemptNumber, status: { in: ["SUBMITTED", "PROCESSING"] } }, data: { status: transferId ? "PROCESSING" : "REQUIRES_REVIEW", providerTransferId: transferId ? String(transferId) : null, providerResponse: publicProviderResponse(response, transferId, reference), failureReason: transferId ? null : "Provider response lacks transfer ID; manual review required." } });
      }
      if (payout.batchId) await refreshBatchStatus(tx, companyId, payout.batchId, payout.periodId);
    }, transactionOptions);
  } catch (error) {
    const status = error?.response?.status;
    const definitiveHttpRejection = Number.isInteger(status) && status >= 400 && status < 500 && ![408, 409, 429].includes(status);
    const definitive = !transferRequestStarted || definitiveHttpRejection;
    if (definitive) {
      const providerErrorResponse = error?.providerResponse || (error?.response?.data ? { ...error.response.data, status: error.response.data.status ?? false, data: error.response.data.data ?? error.response.data } : null);
      await recordDefinitiveFailure(companyId, current, attemptNumber, actorId, error?.response?.data?.message || error?.message || "Provider rejected the retry.", providerErrorResponse, { requestWasNotSent: !transferRequestStarted || definitiveHttpRejection });
    } else await recordUncertainInitiation(companyId, current, attemptNumber, actorId, error);
  }
  return prisma.payrollDisbursement.findFirst({ where: { id: payout.id, companyId }, include: disbursementInclude });
};

/**
 * Complete an explicit fee reconciliation from a verified provider statement.
 * Used when the transfer succeeded but the provider response omitted its final fee,
 * or when an extra fee could not be debited automatically at settlement.
 */
export const reconcilePayrollPayoutFee = async (companyId, disbursementId, actorId, input) => {
  const requestedFee = money(input?.actualFeeAmount);
  const statementReference = asText(input?.providerStatementReference, 120);
  const note = asText(input?.note, 500);
  if (!requestedFee.isFinite() || requestedFee.isNegative()) throw new AppError("Enter a valid non-negative actual provider fee.", 400);
  if (statementReference.length < 3) throw new AppError("Enter the provider statement or reconciliation reference.", 400);
  if (note.length < 4) throw new AppError("Explain what provider statement was checked.", 400);

  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: disbursementId, companyId } });
    if (!current) throw new AppError("Payroll disbursement not found.", 404);
    if (!current.provider || !isProvider(current.provider) || !["PAID", "FAILED", "REVERSED"].includes(current.status)) {
      throw new AppError("Fee reconciliation is only available for a provider-managed transfer with a verified terminal status.", 409);
    }
    if (!/fee reconciliation|required finance reconciliation/i.test(current.failureReason || "")) {
      throw new AppError("This payment does not have an outstanding fee-reconciliation issue.", 409);
    }
    if (current.feeReconciledAt) throw new AppError("This transfer's fee has already been reconciled.", 409);
    if (current.status === "PAID" && current.actualFeeAmount != null && !money(current.actualFeeAmount).eq(requestedFee)) {
      throw new AppError("The actual fee from provider verification differs from the fee entered. Recheck the provider statement before reconciling.", 409, {
        details: { verifiedActualFee: money(current.actualFeeAmount).toFixed(2), enteredActualFee: requestedFee.toFixed(2) },
      });
    }

    // Claim the reconciliation in the same serializable transaction before adjusting the wallet.
    // A second administrator cannot reconcile a different fee concurrently and overwrite the result.
    const reconciliationAt = new Date();
    const claim = await tx.payrollDisbursement.updateMany({
      where: { id: current.id, companyId, status: current.status, feeReconciledAt: null },
      data: { feeReconciledAt: reconciliationAt },
    });
    if (claim.count !== 1) throw new AppError("Another administrator has already reconciled this fee. Refresh the payment register.", 409);
    const latestAttempt = await tx.payrollPayoutAttempt.findFirst({ where: { disbursementId: current.id, companyId }, orderBy: { attemptNumber: "desc" } });
    const attemptNumber = Number(latestAttempt?.attemptNumber || 1);
    const reservedFee = money(current.reservedFeeAmount);
    const difference = reservedFee.minus(requestedFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (difference.greaterThan(0)) {
      await creditWalletInTransaction(tx, companyId, {
        amount: difference.toFixed(2),
        reference: `PAYROLL-FEE-RECONCILE-RELEASE-${current.id}-ATT-${attemptNumber}`,
        description: `Release excess estimated salary-transfer fee for ${current.id}`,
        metadata: { disbursementId: current.id, attemptNumber, reservedFee: reservedFee.toFixed(2), actualFee: requestedFee.toFixed(2), statementReference },
      });
    } else if (difference.lessThan(0)) {
      await debitWalletInTransaction(tx, companyId, {
        amount: difference.abs().toFixed(2),
        reference: `PAYROLL-FEE-RECONCILE-ADJUST-${current.id}-ATT-${attemptNumber}`,
        description: `Apply additional confirmed salary-transfer fee for ${current.id}`,
        metadata: { disbursementId: current.id, attemptNumber, reservedFee: reservedFee.toFixed(2), actualFee: requestedFee.toFixed(2), statementReference },
      });
    }

    const updated = await tx.payrollDisbursement.update({ where: { id: current.id }, data: {
      actualFeeAmount: requestedFee.toFixed(2), reservedFeeAmount: requestedFee.toFixed(2),
      feeReconciliationReference: statementReference, feeReconciliationNote: note, feeReconciledAt: reconciliationAt,
      failureReason: null, updatedBy: actorId,
    }, include: disbursementInclude });
    if (latestAttempt) await tx.payrollPayoutAttempt.update({ where: { id: latestAttempt.id }, data: { actualFeeAmount: requestedFee.toFixed(2), failureReason: null } });
    if (current.batchId) await refreshBatchStatus(tx, companyId, current.batchId, current.periodId);
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: {
      event: "PAYOUT_FEE_RECONCILED", provider: current.provider, externalReference: current.externalReference,
      attemptNumber, previousReservedFee: reservedFee.toFixed(2), actualFee: requestedFee.toFixed(2),
      walletAdjustment: difference.toFixed(2), statementReference, note,
    } });
    return updated;
  }, transactionOptions);
};

/** Called only after the outer payment webhook handler has authenticated provider signatures. */
export const processPayrollPayoutWebhook = async (providerInput, payload) => {
  const provider = String(providerInput || "").toUpperCase();
  if (!isProvider(provider)) throw new AppError("Unsupported payout webhook provider.", 400);
  const eventType = String(payload?.event || payload?.type || "unknown");
  const data = payload?.data || payload?.transfer || {};
  const reference = String(data.reference || data.tx_ref || "").trim();
  const transferId = data.id != null ? String(data.id) : String(data.transfer_id || data.transfer_code || "");
  const eventKey = makePayoutWebhookEventKey(provider, payload);

  let payout = reference ? await prisma.payrollDisbursement.findFirst({ where: { provider, externalReference: reference } }) : null;
  let attempt = reference ? await prisma.payrollPayoutAttempt.findFirst({ where: { provider, externalReference: reference } }) : null;
  if (!payout && attempt) payout = await prisma.payrollDisbursement.findFirst({ where: { id: attempt.disbursementId, companyId: attempt.companyId } });
  if (!payout && transferId) {
    attempt = await prisma.payrollPayoutAttempt.findFirst({ where: { provider, providerTransferId: transferId } });
    if (attempt) payout = await prisma.payrollDisbursement.findFirst({ where: { id: attempt.disbursementId, companyId: attempt.companyId } });
  }
  const eventTypeLower = eventType.toLowerCase();
  if (!eventTypeLower.startsWith("transfer.")) return { received: true, processed: false, payoutEvent: false };

  try {
    await prisma.payrollPayoutWebhookEvent.create({ data: {
      companyId: payout?.companyId || attempt?.companyId || null, provider, eventKey, eventType,
      transferReference: reference || null, providerTransferId: transferId || null, status: "RECEIVED",
      message: asText(data?.complete_message || data?.narration || "", 400) || null,
      payload: {
        event: eventType,
        data: {
          reference: reference || null, tx_ref: data.tx_ref || null, id: transferId || null,
          status: data.status || null, currency: data.currency || null, amount: data.amount ?? null,
          fee: data.fee ?? data.fee_charged ?? null,
          complete_message: asText(data?.complete_message || "", 400) || null,
        },
      },
    } });
  } catch (error) {
    if (error?.code === "P2002") return { received: true, processed: false, duplicate: true, payoutEvent: true };
    throw error;
  }
  if (!payout) {
    await prisma.payrollPayoutWebhookEvent.update({ where: { provider_eventKey: { provider, eventKey } }, data: { status: "UNMATCHED", processedAt: new Date(), message: "Authenticated payout webhook could not be matched to an EMS transfer reference." } });
    return { received: true, processed: false, unmatched: true, payoutEvent: true };
  }
  if (!attempt) attempt = await getAttemptForPayout(payout);
  const latestAttempt = await prisma.payrollPayoutAttempt.findFirst({ where: { disbursementId: payout.id, companyId: payout.companyId }, orderBy: { attemptNumber: "desc" } });
  if (attempt?.attemptNumber && latestAttempt && latestAttempt.attemptNumber > attempt.attemptNumber) {
    await prisma.payrollPayoutWebhookEvent.update({ where: { provider_eventKey: { provider, eventKey } }, data: { status: "STALE_ATTEMPT", processedAt: new Date(), message: "Webhook matched an earlier transfer attempt. It was recorded but did not change the current retry or wallet ledger." } });
    return { received: true, processed: false, staleAttempt: true, payoutEvent: true };
  }

  try {
    const response = await getVerifiedProviderResponse(payout, attempt);
    const rawStatus = response?.data?.status;
    const normalized = normalizePayrollPayoutStatus(provider, rawStatus);
    if (normalized === "PAID") await recordVerifiedSuccess(payout.companyId, payout, attempt.attemptNumber, null, response);
    else if (normalized === "FAILED") await recordDefinitiveFailure(payout.companyId, payout, attempt.attemptNumber, null, response?.data?.complete_message || response?.data?.failures?.message || `Webhook verified provider status ${rawStatus}.`, response);
    else if (normalized === "REVERSED") await recordReversal(payout.companyId, payout, attempt.attemptNumber, null, response);
    else if (normalized === "REQUIRES_REVIEW") {
      await prisma.$transaction(async (tx) => {
        await tx.payrollDisbursement.updateMany({ where: { id: payout.id, companyId: payout.companyId, status: { in: ["PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: "REQUIRES_REVIEW", providerStatus: String(rawStatus || "OTP"), providerResponse: publicProviderResponse(response, transferId, attempt.externalReference || payout.externalReference), failureReason: "Provider OTP/manual approval is required. Complete the existing transfer in the provider dashboard and verify its original reference; do not retry as a new transfer." } });
        await tx.payrollPayoutAttempt.updateMany({ where: { disbursementId: payout.id, companyId: payout.companyId, attemptNumber: attempt.attemptNumber, status: { in: ["SUBMITTED", "PROCESSING", "REQUIRES_REVIEW"] } }, data: { status: "REQUIRES_REVIEW", failureReason: "Provider OTP/manual approval is required; verify the same reference after approval." } });
        if (payout.batchId) await refreshBatchStatus(tx, payout.companyId, payout.batchId, payout.periodId);
      }, transactionOptions);
    }
    await prisma.payrollPayoutWebhookEvent.update({ where: { provider_eventKey: { provider, eventKey } }, data: { status: normalized, processedAt: new Date(), message: asText(response?.message || rawStatus || "Verified", 400) } });
    return { received: true, processed: true, payoutEvent: true, status: normalized };
  } catch (error) {
    await prisma.payrollPayoutWebhookEvent.update({ where: { provider_eventKey: { provider, eventKey } }, data: { status: "REQUIRES_REVIEW", processedAt: new Date(), message: asText(error?.message || "Webhook requires manual reconciliation.", 400) } });
    return { received: true, processed: false, payoutEvent: true, reviewRequired: true };
  }
};

export const reconcilePendingPayrollPayouts = async ({ limit = 50 } = {}) => {
  const rows = await prisma.payrollDisbursement.findMany({
    where: { provider: { in: ["PAYSTACK", "FLUTTERWAVE"] }, status: { in: ["PROCESSING", "REQUIRES_REVIEW"] } },
    orderBy: { updatedAt: "asc" }, take: Math.min(200, Math.max(1, Number(limit) || 50)),
    select: { id: true, companyId: true, provider: true, providerTransferId: true, providerStatus: true, externalReference: true, updatedAt: true },
  });
  const results = [];
  for (const row of rows) {
    if (row.provider === "PAYSTACK" && String(row.providerStatus || "").toLowerCase() === "otp") {
      results.push({ id: row.id, status: "REQUIRES_REVIEW", message: "Paystack requires OTP/manual approval; verify the original reference after completing provider approval." });
      continue;
    }
    if (row.provider === "FLUTTERWAVE" && !row.providerTransferId) {
      results.push({ id: row.id, status: "REQUIRES_REVIEW", message: "No Flutterwave transfer ID; left untouched for manual reference lookup." });
      continue;
    }
    try {
      const verified = await verifyPayrollPayout(row.companyId, row.id, null);
      results.push({ id: row.id, status: verified?.status || "UNKNOWN" });
    } catch (error) {
      results.push({ id: row.id, status: "UNCHANGED", message: asText(error?.message || "Verification not available.", 250) });
    }
  }
  return { checked: results.length, results };
};

export const startPayrollPayoutReconciliationWorker = ({ intervalMs } = {}) => {
  const enabled = String(process.env.PAYROLL_PAYOUT_RECONCILIATION_ENABLED ?? "true").trim().toLowerCase() !== "false";
  if (!enabled) return () => {};
  const parsedInterval = Number(intervalMs ?? process.env.PAYROLL_PAYOUT_RECONCILIATION_INTERVAL_MS ?? 300000);
  const safeInterval = Number.isFinite(parsedInterval) ? Math.min(3600000, Math.max(60000, parsedInterval)) : 300000;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await reconcilePendingPayrollPayouts({ limit: 50 });
    } catch (error) {
      // A failed sweep must not crash the API process; individual payouts remain reserved for later review.
      console.error("EMS payroll payout reconciliation sweep failed:", error?.message || error);
    } finally {
      running = false;
    }
  }, safeInterval);
  timer.unref?.();
  return () => clearInterval(timer);
};
