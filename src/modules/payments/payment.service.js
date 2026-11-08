import crypto from "node:crypto";
import Decimal from "decimal.js";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import * as repository from "./payment.repository.js";
import * as paystack from "./paystack/paystack.service.js";
import * as flutterwave from "./flutterwave/flutterwave.service.js";
import { mapPayment, mapPayments } from "./payment.mapper.js";
import { PAYMENT_PROVIDER, PAYMENT_STATUS, PAYMENT_PURPOSE, PAYMENT_CURRENCY } from "./payment.constants.js";
import { creditWalletInTransaction } from "../wallet/wallet.service.js";
import { processPayrollPayoutWebhook } from "../payroll/payroll.payout.service.js";
import { companyPaystackEndpoints } from "./company-paystack/company-paystack.client.js";
import { decryptCompanyPaystackSecret } from "./company-paystack/company-paystack.crypto.js";

const money = (value) => new Decimal(value).toDecimalPlaces(2);
const generateReference = () => `PAY-${Date.now()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
const paymentFingerprint = (input, gatewayOwner) => JSON.stringify({
  provider: input.provider,
  gatewayOwner,
  email: String(input.email || "").trim().toLowerCase(),
  amount: money(input.amount).toFixed(2),
  callbackUrl: input.callbackUrl || null,
  metadata: input.metadata || null,
});

const getProviderService = (provider) => {
  if (provider === PAYMENT_PROVIDER.PAYSTACK) return paystack;
  if (provider === PAYMENT_PROVIDER.FLUTTERWAVE) return flutterwave;
  throw new AppError("Unsupported payment provider", 400, { code: "UNSUPPORTED_PAYMENT_PROVIDER" });
};

const assertProviderConfiguration = (provider) => {
  if (provider === PAYMENT_PROVIDER.PAYSTACK && !process.env.PAYSTACK_SECRET_KEY) {
    throw new AppError("Paystack is not configured", 503, { code: "PAYSTACK_NOT_CONFIGURED" });
  }
  if (provider === PAYMENT_PROVIDER.FLUTTERWAVE && !process.env.FLUTTERWAVE_SECRET_KEY) {
    throw new AppError("Flutterwave is not configured", 503, { code: "FLUTTERWAVE_NOT_CONFIGURED" });
  }
};

export const initializePayment = async (companyId, input) => {
  if (!companyId) throw new AppError("A company context is required to fund a company wallet.", 403, { code: "WALLET_COMPANY_CONTEXT_REQUIRED" });
  const company = await repository.findCompanyPaymentConfig(companyId);
  if (!company) throw new AppError("Company not found", 404);

  const amount = money(input.amount);
  if (!amount.isFinite() || !amount.isPositive()) throw new AppError("Payment amount must be greater than zero", 400);

  // Company wallet funding must settle to the tenant's own provider account.
  // Platform credentials are reserved for platform-owned products such as future subscriptions.
  let companyPaystackConnection = null;
  let gatewayOwner = "PLATFORM_FLUTTERWAVE_SUBACCOUNT";
  if (input.provider === PAYMENT_PROVIDER.PAYSTACK) {
    companyPaystackConnection = await prisma.companyPaystackConnection.findUnique({ where: { companyId } });
    if (!companyPaystackConnection?.isActive) {
      throw new AppError("Connect this company's Paystack account in Payroll → Paystack connection before funding its wallet. EMS will not collect company wallet funds into the platform's Paystack account.", 409, { code: "PAYSTACK_COMPANY_WALLET_CONNECTION_REQUIRED" });
    }
    gatewayOwner = "COMPANY_PAYSTACK";
  } else if (input.provider === PAYMENT_PROVIDER.FLUTTERWAVE) {
    assertProviderConfiguration(PAYMENT_PROVIDER.FLUTTERWAVE);
    if (!company.flutterwaveSubaccountId) {
      throw new AppError("This company does not have a Flutterwave subaccount configured. Wallet funding is blocked rather than settling into the EMS platform account.", 409, { code: "FLUTTERWAVE_COMPANY_SUBACCOUNT_REQUIRED" });
    }
  } else {
    throw new AppError("Unsupported payment provider", 400, { code: "UNSUPPORTED_PAYMENT_PROVIDER" });
  }

  const fingerprint = paymentFingerprint(input, gatewayOwner);
  if (input.idempotencyKey) {
    const existing = await repository.findPaymentByIdempotencyKey(companyId, input.idempotencyKey);
    if (existing) {
      const existingFingerprint = existing.metadata?.__idempotencyFingerprint;
      if (existingFingerprint && existingFingerprint !== fingerprint) {
        throw new AppError("Idempotency key was already used with different payment details or a different settlement account", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
      }
      return { payment: mapPayment(existing), providerResponse: existing.metadata?.providerInitialization || null, idempotent: true };
    }
  }

  const reference = generateReference();
  const callbackBaseUrl = (process.env.APP_FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const callbackUrl = input.callbackUrl || `${callbackBaseUrl}/app/wallet`;
  const paymentMetadata = {
    ...(input.metadata || {}),
    __idempotencyFingerprint: fingerprint,
    __gatewayOwner: gatewayOwner,
    __companyId: companyId,
  };

  let payment;
  try {
    payment = await repository.createPayment({
      companyId,
      provider: input.provider,
      purpose: PAYMENT_PURPOSE.WALLET_FUNDING,
      status: PAYMENT_STATUS.PENDING,
      amount: amount.toFixed(2),
      currency: PAYMENT_CURRENCY,
      reference,
      idempotencyKey: input.idempotencyKey || null,
      email: input.email,
      callbackUrl,
      metadata: paymentMetadata,
    });
  } catch (error) {
    if (error?.code === "P2002" && input.idempotencyKey) {
      const existing = await repository.findPaymentByIdempotencyKey(companyId, input.idempotencyKey);
      if (existing) {
        const existingFingerprint = existing.metadata?.__idempotencyFingerprint;
        if (existingFingerprint && existingFingerprint !== fingerprint) {
          throw new AppError("Idempotency key was already used with different payment details or a different settlement account", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
        }
        return { payment: mapPayment(existing), providerResponse: existing.metadata?.providerInitialization || null, idempotent: true };
      }
    }
    throw error;
  }

  try {
    let providerResponse;
    if (input.provider === PAYMENT_PROVIDER.PAYSTACK) {
      providerResponse = await companyPaystackEndpoints.initializeTransaction(companyPaystackConnection, {
        email: input.email,
        amount: amount.mul(100).toFixed(0),
        reference,
        callback_url: callbackUrl,
        currency: PAYMENT_CURRENCY,
        metadata: { ...(input.metadata || {}), companyId, paymentId: payment.id, purpose: PAYMENT_PURPOSE.WALLET_FUNDING },
      });
    } else {
      const providerApi = getProviderService(input.provider);
      providerResponse = await providerApi.initialize({
        email: input.email,
        amount: amount.toFixed(2),
        reference,
        callbackUrl,
        currency: PAYMENT_CURRENCY,
        subaccountId: company.flutterwaveSubaccountId,
        metadata: { ...(input.metadata || {}), companyId, paymentId: payment.id, purpose: PAYMENT_PURPOSE.WALLET_FUNDING },
      });
    }

    const providerReference = input.provider === PAYMENT_PROVIDER.FLUTTERWAVE
      ? providerResponse?.data?.id?.toString() || null
      : providerResponse?.data?.reference || reference;

    const updated = await repository.updatePayment(payment.id, { providerReference, metadata: { ...(payment.metadata || {}), providerInitialization: providerResponse } });
    return { payment: mapPayment(updated), providerResponse };
  } catch (error) {
    await repository.updatePayment(payment.id, { status: PAYMENT_STATUS.FAILED, metadata: { ...(payment.metadata || {}), initializationError: String(error?.message || "Provider initialization failed").slice(0, 500) } });
    throw error;
  }
};

const assertVerifiedPayment = (payment, providerResponse) => {
  const data = providerResponse?.data;
  if (!data) throw new AppError("Provider returned an invalid verification response", 502);

  const expectedAmount = money(payment.amount);
  const expectedCurrency = payment.currency;
  const actualCurrency = String(data.currency || "").toUpperCase();
  const actualReference = payment.provider === PAYMENT_PROVIDER.PAYSTACK ? data.reference : data.tx_ref;

  if (actualReference !== payment.reference) {
    throw new AppError("Payment reference mismatch", 400, { code: "PAYMENT_REFERENCE_MISMATCH" });
  }
  if (actualCurrency !== expectedCurrency) {
    throw new AppError("Payment currency mismatch", 400, { code: "PAYMENT_CURRENCY_MISMATCH" });
  }

  const actualAmount = payment.provider === PAYMENT_PROVIDER.PAYSTACK
    ? money(new Decimal(data.amount).div(100))
    : money(data.amount);

  if (!actualAmount.eq(expectedAmount)) {
    throw new AppError("Payment amount mismatch", 400, { code: "PAYMENT_AMOUNT_MISMATCH", details: { expected: expectedAmount.toFixed(2), received: actualAmount.toFixed(2) } });
  }

  return data;
};

const completeSuccessfulPayment = async (paymentId, providerReference, providerResponse) => {
  return prisma.$transaction(async (tx) => {
    const payment = await repository.findPaymentById(undefined, paymentId, tx);
    if (!payment) throw new AppError("Payment not found", 404);
    if (payment.status === PAYMENT_STATUS.SUCCESSFUL) return payment;
    if (payment.status === PAYMENT_STATUS.REVERSED) throw new AppError("Payment has already been reversed", 409);

    assertVerifiedPayment(payment, providerResponse);

    if (providerReference) {
      const existingProviderPayment = await repository.findPaymentByProviderReference(payment.provider, providerReference, tx);
      if (existingProviderPayment && existingProviderPayment.id !== payment.id) {
        throw new AppError("Provider transaction is already linked to another payment", 409, { code: "PROVIDER_REFERENCE_REUSED" });
      }
    }

    if (payment.purpose !== PAYMENT_PURPOSE.WALLET_FUNDING) {
      throw new AppError("Only WALLET_FUNDING payments can credit a company wallet. Subscription payments must use the platform subscription ledger.", 409, { code: "PAYMENT_PURPOSE_CANNOT_CREDIT_WALLET" });
    }

    await creditWalletInTransaction(tx, payment.companyId, {
      amount: payment.amount,
      reference: `PAYMENT-${payment.reference}`,
      description: `Wallet funding via ${payment.provider}`,
      metadata: { paymentId: payment.id, provider: payment.provider, providerReference },
    });

    return repository.updatePayment(payment.id, {
      status: PAYMENT_STATUS.SUCCESSFUL,
      providerReference: providerReference || payment.providerReference,
      paidAt: new Date(),
      metadata: { ...(payment.metadata || {}), providerResponse },
    }, tx);
  }, { isolationLevel: "Serializable" });
};

export const verifyPayment = async (companyId, reference, providerTransactionId) => {
  const payment = await repository.findPaymentByReference(companyId, reference);
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) return mapPayment(payment);
  if (payment.purpose !== PAYMENT_PURPOSE.WALLET_FUNDING) throw new AppError("This payment purpose is not handled by company wallet verification.", 409, { code: "PAYMENT_PURPOSE_NOT_WALLET_FUNDING" });

  let providerResponse;
  if (payment.provider === PAYMENT_PROVIDER.PAYSTACK && payment.metadata?.__gatewayOwner === "COMPANY_PAYSTACK") {
    const connection = await prisma.companyPaystackConnection.findUnique({ where: { companyId: payment.companyId } });
    if (!connection?.isActive) throw new AppError("The company's Paystack connection is unavailable. Restore the same provider credentials to verify this pending wallet payment.", 409, { code: "PAYSTACK_COMPANY_CONNECTION_REQUIRED_FOR_VERIFY" });
    providerResponse = await companyPaystackEndpoints.verifyTransaction(connection, payment.reference);
  } else if (payment.provider === PAYMENT_PROVIDER.PAYSTACK) {
    // Backward compatibility: verify already-created legacy platform-collected payments
    // with the platform key. New company wallet funding never takes this route.
    providerResponse = await paystack.verify(payment.reference);
  } else {
    const transactionId = providerTransactionId || payment.providerReference;
    if (!transactionId) throw new AppError("Flutterwave transaction ID is not available. Return from checkout and try verification again.", 409);
    providerResponse = await flutterwave.verify(transactionId);
    if (providerResponse?.data?.tx_ref !== payment.reference) {
      throw new AppError("Payment reference mismatch", 400, { code: "PAYMENT_REFERENCE_MISMATCH" });
    }
  }

  const successful = payment.provider === PAYMENT_PROVIDER.PAYSTACK
    ? providerResponse?.status === true && providerResponse?.data?.status === "success"
    : providerResponse?.status === "success" && providerResponse?.data?.status === "successful";

  if (!successful) {
    const providerStatus = providerResponse?.data?.status;
    const terminalFailure = ["failed", "abandoned", "reversed"].includes(String(providerStatus || "").toLowerCase());
    const updated = await repository.updatePayment(payment.id, {
      ...(terminalFailure ? { status: PAYMENT_STATUS.FAILED } : {}),
      ...(providerTransactionId && !payment.providerReference ? { providerReference: String(providerTransactionId) } : {}),
      metadata: { ...(payment.metadata || {}), lastVerificationResponse: providerResponse },
    });
    return mapPayment(updated);
  }

  return mapPayment(await completeSuccessfulPayment(payment.id, providerResponse?.data?.id?.toString() || providerTransactionId, providerResponse));
};

export const listPayments = async (companyId, { page, limit, provider, status, purpose, search, startDate, endDate }) => {
  const where = {};
  if (provider) where.provider = provider;
  if (status) where.status = status;
  if (purpose) where.purpose = purpose;
  if (search) where.OR = [
    { reference: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
  ];
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }
  const skip = (page - 1) * limit;
  const [payments, total] = await Promise.all([
    repository.listPayments(companyId, { skip, take: limit, where }),
    repository.countPayments(companyId, where),
  ]);
  return { data: mapPayments(payments), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getPayment = async (companyId, id) => {
  const payment = await repository.findPaymentById(companyId, id);
  if (!payment) throw new AppError("Payment not found", 404);
  return mapPayment(payment);
};

export const processCompanyPaystackWalletWebhook = async (rawBody, signature, payload) => {
  if (String(payload?.event || "").toLowerCase() !== "charge.success") return { matched: false };
  const reference = payload?.data?.reference;
  if (!reference) return { matched: false };
  const payment = await repository.findPaymentByReferenceFromAnyCompany(reference);
  if (!payment || payment.provider !== PAYMENT_PROVIDER.PAYSTACK || payment.metadata?.__gatewayOwner !== "COMPANY_PAYSTACK") return { matched: false };
  if (payment.purpose !== PAYMENT_PURPOSE.WALLET_FUNDING) return { matched: true, received: true, processed: false };

  const connection = await prisma.companyPaystackConnection.findUnique({ where: { companyId: payment.companyId } });
  if (!connection?.isActive) throw new AppError("The company Paystack connection is missing; cannot authenticate its wallet-funding webhook.", 401, { code: "PAYSTACK_COMPANY_WEBHOOK_CONNECTION_MISSING" });
  const key = decryptCompanyPaystackSecret(connection.secretKeyCiphertext);
  const expected = crypto.createHmac("sha512", key).update(rawBody).digest("hex");
  const receivedBuffer = Buffer.from(String(signature || ""));
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new AppError("Invalid company Paystack wallet webhook signature.", 401, { code: "PAYSTACK_COMPANY_WEBHOOK_SIGNATURE_INVALID" });
  }
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) return { matched: true, received: true, processed: false, duplicate: true };

  const verified = await companyPaystackEndpoints.verifyTransaction(connection, reference);
  if (verified?.status !== true || verified?.data?.status !== "success") return { matched: true, received: true, processed: false };
  if (String(verified?.data?.reference || "") !== String(payment.reference)) {
    throw new AppError("Verified company Paystack charge reference did not match the saved wallet funding reference.", 409, { code: "PAYSTACK_COMPANY_PAYMENT_REFERENCE_MISMATCH" });
  }
  const updated = await completeSuccessfulPayment(payment.id, verified.data.id?.toString(), verified);
  return { matched: true, received: true, processed: true, payment: mapPayment(updated) };
};

export const processPaystackWebhook = async (rawBody, signature, payload) => {
  if (!paystack.verifyWebhookSignature(rawBody, signature)) throw new AppError("Invalid Paystack webhook signature", 401, { code: "INVALID_WEBHOOK_SIGNATURE" });
  if (String(payload?.event || "").toLowerCase().startsWith("transfer.")) {
    return processPayrollPayoutWebhook("PAYSTACK", payload);
  }
  if (payload?.event !== "charge.success") return { received: true, processed: false };

  const reference = payload?.data?.reference;
  if (!reference) return { received: true, processed: false };
  const payment = await repository.findPaymentByReferenceFromAnyCompany(reference);
  if (!payment) return { received: true, processed: false };
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) return { received: true, processed: false, duplicate: true };

  // Webhook payload is not trusted for value delivery; re-verify with Paystack first.
  const verified = await paystack.verify(reference);
  if (verified?.status !== true || verified?.data?.status !== "success") return { received: true, processed: false };
  const updated = await completeSuccessfulPayment(payment.id, verified.data.id?.toString(), verified);
  return { received: true, processed: true, payment: mapPayment(updated) };
};

export const processFlutterwaveWebhook = async (signature, payload) => {
  if (!flutterwave.verifyWebhookSignature(signature)) throw new AppError("Invalid Flutterwave webhook signature", 401, { code: "INVALID_WEBHOOK_SIGNATURE" });
  if (String(payload?.event || "").toLowerCase().startsWith("transfer.")) {
    return processPayrollPayoutWebhook("FLUTTERWAVE", payload);
  }
  if (payload?.event !== "charge.completed") return { received: true, processed: false };

  const reference = payload?.data?.tx_ref;
  const transactionId = payload?.data?.id?.toString();
  if (!reference || !transactionId) return { received: true, processed: false };

  const payment = await repository.findPaymentByReferenceFromAnyCompany(reference);
  if (!payment || payment.provider !== PAYMENT_PROVIDER.FLUTTERWAVE) return { received: true, processed: false };
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) return { received: true, processed: false, duplicate: true };

  const verified = await flutterwave.verify(transactionId);
  if (verified?.status !== "success" || verified?.data?.status !== "successful") return { received: true, processed: false };
  const updated = await completeSuccessfulPayment(payment.id, transactionId, verified);
  return { received: true, processed: true, payment: mapPayment(updated) };
};
