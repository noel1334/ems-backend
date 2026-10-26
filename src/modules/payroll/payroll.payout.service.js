import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { creditWalletInTransaction, debitWalletInTransaction } from "../wallet/wallet.service.js";
import { createPaystackTransferRecipient, initiatePaystackTransfer, verifyPaystackTransfer } from "../payments/paystack/paystack.transfer.client.js";
import { initiateFlutterwaveTransfer, verifyFlutterwaveTransfer } from "../payments/flutterwave/flutterwave.transfer.client.js";
import { makePayrollPayoutReference, normalizePayrollPayoutStatus, isDefinitiveTransferFailure } from "./payroll.payout.utils.js";

const money = (value) => new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 };

export const getPayrollPayoutConfiguration = async () => ({
  enabled: String(process.env.PAYROLL_PAYOUTS_ENABLED || "false").toLowerCase() === "true",
  currency: "NGN",
  providers: {
    PAYSTACK: { configured: Boolean(process.env.PAYSTACK_SECRET_KEY) },
    FLUTTERWAVE: { configured: Boolean(process.env.FLUTTERWAVE_SECRET_KEY), wholeNairaAmountsOnly: true },
  },
});

const assertPayoutEnabled = (provider) => {
  if (String(process.env.PAYROLL_PAYOUTS_ENABLED || "false").toLowerCase() !== "true") {
    throw new AppError("Automated salary payouts are disabled. Set PAYROLL_PAYOUTS_ENABLED=true on the backend only after completing provider test-mode checks.", 503, { code: "PAYROLL_PAYOUTS_DISABLED" });
  }
  if (provider === "PAYSTACK" && !process.env.PAYSTACK_SECRET_KEY) throw new AppError("Paystack payouts are not configured: PAYSTACK_SECRET_KEY is missing on the backend.", 503);
  if (provider === "FLUTTERWAVE" && !process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError("Flutterwave payouts are not configured: FLUTTERWAVE_SECRET_KEY is missing on the backend.", 503);
};

const disbursementInclude = {
  employee: { select: { id: true, employeeNumber: true, firstName: true, middleName: true, lastName: true, email: true } },
  payrollItem: { select: { id: true, netSalary: true, status: true } },
};

const payoutBankAccount = (employee, provider) => {
  const accounts = (employee.bankAccounts || []).filter((account) => account.isActive);
  accounts.sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const account = accounts[0];
  if (!account) return { error: "No active bank account is recorded." };
  const bankCode = String(provider === "PAYSTACK" ? account.paystackBankCode ?? "" : account.flutterwaveBankCode ?? "").trim();
  if (!bankCode) return { error: `The ${provider === "PAYSTACK" ? "Paystack" : "Flutterwave"} bank code is missing for the selected employee bank account.` };
  if (!/^\d{2,12}$/.test(bankCode)) return { error: `The ${provider === "PAYSTACK" ? "Paystack" : "Flutterwave"} bank code must contain 2–12 digits.` };
  if (!/^\d{10}$/.test(String(account.accountNumber || ""))) return { error: "The employee account number must contain exactly 10 digits for a Nigerian NGN bank transfer." };
  if (!account.accountName || account.accountName.trim().length < 2) return { error: "The employee account name is missing." };
  return { account, bankCode };
};

const updateStatusAfterBatch = async (tx, companyId, periodId) => {
  const statuses = await tx.payrollDisbursement.findMany({ where: { companyId, periodId }, select: { status: true } });
  if (statuses.length && statuses.every((row) => row.status === "PAID")) {
    await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "PAID" } });
    await tx.payrollItem.updateMany({ where: { companyId, periodId }, data: { status: "PAID" } });
  }
};

const recordDefinitiveFailure = async (companyId, payout, actorId, message, providerResponse = null) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
    if (!current) throw new AppError("Payroll disbursement not found.", 404);
    if (current.status === "PAID" || current.status === "FAILED") return current;

    await creditWalletInTransaction(tx, companyId, {
      amount: current.amount,
      reference: `PAYROLL-REFUND-${current.id}`,
      description: `Refund for failed salary payout ${current.id}`,
      metadata: { disbursementId: current.id, periodId: current.periodId, provider: current.provider, reason: String(message).slice(0, 400) },
    });
    const updated = await tx.payrollDisbursement.update({
      where: { id: current.id },
      data: {
        status: "FAILED",
        providerStatus: providerResponse?.data?.status ? String(providerResponse.data.status) : "FAILED",
        providerResponse: providerResponse ? { status: providerResponse.status ?? null, message: providerResponse.message ?? null, dataStatus: providerResponse.data?.status ?? null, reference: providerResponse.data?.reference ?? providerResponse.data?.tx_ref ?? null } : undefined,
        failureReason: String(message || "Provider rejected the payout.").slice(0, 500),
        verifiedAt: new Date(),
        updatedBy: actorId,
      },
    });
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { previousStatus: current.status, status: "FAILED", refundReference: `PAYROLL-REFUND-${current.id}`, provider: current.provider, reason: String(message).slice(0, 400) } });
    return updated;
  }, transactionOptions);
};

const recordUncertainInitiation = async (companyId, payout, actorId, error) => {
  const message = error?.response?.data?.message || error?.message || "The provider response was inconclusive.";
  return prisma.payrollDisbursement.updateMany({
    where: { id: payout.id, companyId, status: "PROCESSING" },
    data: {
      failureReason: `Provider response uncertain; wallet funds remain reserved. Verify the transfer in the provider dashboard before any further action. ${String(message).slice(0, 320)}`,
      providerResponse: { outcome: "UNCERTAIN", httpStatus: error?.response?.status ?? null, message: String(message).slice(0, 350) },
      updatedBy: actorId,
    },
  });
};

export const executePayrollPayouts = async (companyId, periodId, actorId, providerInput) => {
  const provider = String(providerInput || "").toUpperCase();
  if (!["PAYSTACK", "FLUTTERWAVE"].includes(provider)) throw new AppError("Choose Paystack or Flutterwave for salary payouts.", 400);
  assertPayoutEnabled(provider);

  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period) throw new AppError("Payroll period not found.", 404);
  if (period.status !== "FINALIZED") throw new AppError("Only finalized payroll can be paid. Complete calculation, approval and finalization first.", 409);

  const pending = await prisma.payrollDisbursement.findMany({
    where: { companyId, periodId, status: "PENDING" },
    include: { employee: { include: { bankAccounts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!pending.length) throw new AppError("No pending payouts remain in this payment register. Do not retry processing transfers; verify any PROCESSING records instead.", 409);
  if (provider === "FLUTTERWAVE") {
    const fractional = pending.filter((row) => !money(row.amount).eq(money(row.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)));
    if (fractional.length) throw new AppError("Flutterwave NGN bank transfers in this integration require whole-naira amounts. Use Paystack for fractional-kobo payroll amounts or adjust the approved payroll amounts first.", 400, { details: { disbursementIds: fractional.map((row) => row.id) } });
  }

  const prepared = pending.map((row) => ({ row, bank: payoutBankAccount(row.employee, provider) }));
  const missing = prepared.filter((entry) => entry.bank.error).map((entry) => ({ employeeId: entry.row.employeeId, employee: [entry.row.employee?.firstName, entry.row.employee?.lastName].filter(Boolean).join(" ") || entry.row.employeeId, reason: entry.bank.error }));
  if (missing.length) throw new AppError("Every pending employee must have an active bank account and a valid provider-specific bank code before any salary is sent.", 400, { details: { missingBankDetails: missing } });

  const total = pending.reduce((sum, row) => sum.plus(money(row.amount)), new Decimal(0)).toDecimalPlaces(2);
  if (!total.isFinite() || !total.isPositive()) throw new AppError("The payout register total must be greater than zero.", 400);
  const reservationReference = `PAYROLL-BATCH-${periodId}`;
  await prisma.$transaction(async (tx) => {
    const currentPeriod = await tx.payrollPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!currentPeriod || currentPeriod.status !== "FINALIZED") throw new AppError("Payroll status changed before payout reservation. Refresh and try again.", 409);
    const stillPending = await tx.payrollDisbursement.findMany({ where: { companyId, periodId, status: "PENDING" }, select: { id: true, amount: true } });
    if (stillPending.length !== pending.length || stillPending.some((entry) => !pending.some((original) => original.id === entry.id))) {
      throw new AppError("Payout register changed while it was being prepared. Refresh the page before proceeding.", 409);
    }
    const existingReservation = await tx.walletLedgerEntry.findUnique({ where: { reference: reservationReference }, select: { id: true } });
    if (existingReservation) throw new AppError("This payroll period already has a wallet reservation. Verify the existing provider transfers; a duplicate batch is blocked.", 409);
    await debitWalletInTransaction(tx, companyId, {
      amount: total.toFixed(2),
      reference: reservationReference,
      description: `Salary payout reserve — ${currentPeriod.name}`,
      metadata: { periodId, provider, disbursementIds: pending.map((row) => row.id), totalAmount: total.toFixed(2) },
    });
    for (const { row } of prepared) {
      const reference = makePayrollPayoutReference(row.id);
      await tx.payrollDisbursement.update({
        where: { id: row.id },
        data: { status: "PROCESSING", method: provider, provider, externalReference: reference, providerStatus: "SUBMITTED", providerResponse: Prisma.DbNull, failureReason: null, updatedBy: actorId },
      });
    }
    await writeAudit(tx, { companyId, actorUserId: actorId, action: "CREATE", module: "payroll", resource: "payroll_payout_batch", resourceId: periodId, metadata: { provider, count: pending.length, totalAmount: total.toFixed(2), walletReservationReference: reservationReference } });
  }, transactionOptions);

  const results = [];
  for (const { row, bank } of prepared) {
    const fresh = await prisma.payrollDisbursement.findFirst({ where: { id: row.id, companyId } });
    if (!fresh) continue;
    let recipientCreated = false;
    try {
      let response;
      if (provider === "PAYSTACK") {
        const recipientResponse = await createPaystackTransferRecipient({
          name: bank.account.accountName,
          accountNumber: bank.account.accountNumber,
          bankCode: bank.bankCode,
          email: row.employee?.email || undefined,
        });
        recipientCreated = true;
        response = await initiatePaystackTransfer({
          amount: fresh.amount,
          recipientCode: recipientResponse.data.recipient_code,
          reference: fresh.externalReference,
          reason: `EMS salary ${period.name} — ${row.employee?.employeeNumber || row.employeeId}`,
        });
      } else {
        recipientCreated = true; // Flutterwave uses the bank coordinates in the transfer request.
        response = await initiateFlutterwaveTransfer({
          amount: fresh.amount,
          accountNumber: bank.account.accountNumber,
          bankCode: bank.bankCode,
          accountName: bank.account.accountName,
          reference: fresh.externalReference,
          narration: `EMS salary ${period.name} — ${row.employee?.employeeNumber || row.employeeId}`.slice(0, 100),
        });
      }

      const failed = isDefinitiveTransferFailure(response);
      if (failed) {
        const message = response.message || response.data?.complete_message || response.data?.failures?.message || "Provider reported that the salary transfer failed.";
        const result = await recordDefinitiveFailure(companyId, fresh, actorId, message, response);
        results.push({ id: row.id, status: result.status, message: "Transfer failed and the reserved wallet amount was refunded." });
        continue;
      }
      const data = response?.data || {};
      const providerTransferId = provider === "PAYSTACK" ? (data.transfer_code || data.id || null) : (data.id !== undefined ? String(data.id) : null);
      await prisma.payrollDisbursement.update({
        where: { id: fresh.id },
        data: {
          providerTransferId: providerTransferId ? String(providerTransferId) : null,
          providerStatus: data.status ? String(data.status) : "SUBMITTED",
          providerResponse: { status: response?.status ?? null, message: response?.message ?? null, dataStatus: data.status ?? null, reference: data.reference ?? data.tx_ref ?? fresh.externalReference, transferId: providerTransferId },
          failureReason: providerTransferId ? null : "Provider accepted the request but returned no transfer ID. Wallet funds remain reserved; investigate this reference in the provider dashboard before taking further action.",
          updatedBy: actorId,
        },
      });
      results.push({ id: row.id, status: "PROCESSING", providerTransferId, reference: fresh.externalReference });
    } catch (error) {
      const httpStatus = error?.response?.status;
      const definitive = !recipientCreated || (httpStatus >= 400 && httpStatus < 500);
      const message = error?.response?.data?.message || error?.providerResponse?.message || error?.message || "The provider request failed.";
      if (definitive) {
        const result = await recordDefinitiveFailure(companyId, fresh, actorId, message, error?.providerResponse || null);
        results.push({ id: row.id, status: result.status, message: "Provider rejected the request; the wallet amount was refunded." });
      } else {
        await recordUncertainInitiation(companyId, fresh, actorId, error);
        results.push({ id: row.id, status: "PROCESSING", message: "Provider result is uncertain; reserved funds were not refunded. Verify the reference before taking action." });
      }
    }
  }

  const rows = await prisma.payrollDisbursement.findMany({ where: { companyId, periodId }, include: disbursementInclude, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  return { provider, periodId, reservedAmount: total.toFixed(2), results, disbursements: rows, summary: { submitted: results.filter((r) => r.status === "PROCESSING").length, failedAndRefunded: results.filter((r) => r.status === "FAILED").length, total: results.length } };
};

export const verifyPayrollPayout = async (companyId, disbursementId, actorId) => {
  // The kill switch blocks new transfers, not status checks for money already submitted.
  const payout = await prisma.payrollDisbursement.findFirst({ where: { id: disbursementId, companyId }, include: { employee: { include: { bankAccounts: { where: { isActive: true, isPrimary: true }, take: 1 } } } } });
  if (!payout) throw new AppError("Payroll disbursement not found.", 404);
  if (!payout.provider || !["PAYSTACK", "FLUTTERWAVE"].includes(payout.provider)) throw new AppError("This is a manual disbursement and cannot be verified through a payout provider.", 409);
  if (payout.status === "PAID") return payout;
  if (payout.status === "FAILED") throw new AppError("This transfer is marked failed and the wallet amount has been refunded. Inspect the provider dashboard before making any new payment.", 409);
  if (payout.status !== "PROCESSING") throw new AppError("Only a submitted provider transfer can be verified.", 409);

  let response;
  if (payout.provider === "PAYSTACK") {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new AppError("PAYSTACK_SECRET_KEY is not configured.", 503);
    response = await verifyPaystackTransfer(payout.externalReference);
    if (response?.status !== true || !response?.data) throw new AppError(response?.message || "Paystack could not verify this transfer yet.", 502);
    if (String(response.data.reference || "") !== String(payout.externalReference)) throw new AppError("Paystack transfer reference mismatch. Wallet funds remain reserved for investigation.", 409);
    const actualKobo = money(new Decimal(response.data.amount ?? 0).div(100));
    if (!actualKobo.eq(money(payout.amount)) || String(response.data.currency || "NGN").toUpperCase() !== "NGN") throw new AppError("Paystack transfer amount or currency mismatch. Wallet funds remain reserved for investigation.", 409);
  } else {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError("FLUTTERWAVE_SECRET_KEY is not configured.", 503);
    if (!payout.providerTransferId) throw new AppError("Flutterwave did not return a transfer ID. Find this reference in the provider dashboard and do not retry automatically.", 409);
    response = await verifyFlutterwaveTransfer(payout.providerTransferId);
    if (response?.status !== "success" || !response?.data) throw new AppError(response?.message || "Flutterwave could not verify this transfer yet.", 502);
    if (String(response.data.reference || "") !== String(payout.externalReference)) throw new AppError("Flutterwave transfer reference mismatch. Wallet funds remain reserved for investigation.", 409);
    if (!money(response.data.amount ?? 0).eq(money(payout.amount)) || String(response.data.currency || "NGN").toUpperCase() !== "NGN") throw new AppError("Flutterwave transfer amount or currency mismatch. Wallet funds remain reserved for investigation.", 409);
  }

  const rawStatus = response?.data?.status;
  const normalized = normalizePayrollPayoutStatus(payout.provider, rawStatus);
  if (normalized === "FAILED") {
    const message = response?.data?.complete_message || response?.data?.failures?.message || `Provider transfer status: ${rawStatus}`;
    await recordDefinitiveFailure(companyId, payout, actorId, message, response);
  } else if (normalized === "PAID") {
    await prisma.$transaction(async (tx) => {
      const current = await tx.payrollDisbursement.findFirst({ where: { id: payout.id, companyId } });
      if (!current) throw new AppError("Payroll disbursement not found.", 404);
      if (current.status === "PAID") return;
      if (current.status !== "PROCESSING") throw new AppError("Payout status changed while verification was running. Refresh and verify again.", 409);
      await tx.payrollDisbursement.update({ where: { id: current.id }, data: { status: "PAID", providerStatus: String(rawStatus), providerResponse: { status: response.status, message: response.message ?? null, dataStatus: rawStatus, reference: response.data.reference, transferId: response.data.id ?? current.providerTransferId }, failureReason: null, paidAt: new Date(), verifiedAt: new Date(), updatedBy: actorId } });
      await updateStatusAfterBatch(tx, companyId, current.periodId);
      await writeAudit(tx, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: current.id, metadata: { previousStatus: current.status, status: "PAID", provider: current.provider, externalReference: current.externalReference, providerStatus: rawStatus } });
    }, transactionOptions);
  } else {
    await prisma.payrollDisbursement.update({ where: { id: payout.id }, data: { providerStatus: String(rawStatus || "UNKNOWN"), providerResponse: { status: response.status ?? null, message: response.message ?? null, dataStatus: rawStatus ?? null, reference: response.data.reference ?? payout.externalReference, transferId: response.data.id ?? payout.providerTransferId }, failureReason: null, verifiedAt: new Date(), updatedBy: actorId } });
    await writeAudit(prisma, { companyId, actorUserId: actorId, action: "UPDATE", module: "payroll", resource: "payroll_disbursement", resourceId: payout.id, metadata: { status: "PROCESSING", provider: payout.provider, externalReference: payout.externalReference, providerStatus: rawStatus } });
  }

  return prisma.payrollDisbursement.findFirst({ where: { id: payout.id, companyId }, include: disbursementInclude });
};
