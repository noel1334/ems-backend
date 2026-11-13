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
import { monnifyEndpoints } from "./monnify/monnify.client.js";
import { decryptMonnifySecret } from "./monnify/monnify.crypto.js";
import { createFlutterwaveSubaccount } from "./flutterwave/flutterwave.client.js";
import { validateProviderBankCode } from "./bank-directory.service.js";

const money = (value) => new Decimal(value).toDecimalPlaces(2);
const generateReference = () => `PAY-${Date.now()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
const paymentFingerprint = (input, gatewayOwner) => JSON.stringify({
  provider: input.provider,
  fundingDestination: input.fundingDestination || "EMS_INTERNAL_WALLET",
  gatewayOwner,
  email: String(input.email || "").trim().toLowerCase(),
  amount: money(input.amount).toFixed(2),
  callbackUrl: input.callbackUrl || null,
  metadata: input.metadata || null,
});

const getProviderService = (provider) => {
  if (provider === PAYMENT_PROVIDER.PAYSTACK) return paystack;
  if (provider === PAYMENT_PROVIDER.FLUTTERWAVE) return flutterwave;
  if (provider === PAYMENT_PROVIDER.MONNIFY) return null;
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

export const getFlutterwaveSubaccountConfig = async (companyId) => {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { flutterwaveSubaccountId: true } });
  if (!company) throw new AppError("Company not found", 404);
  const value = String(company.flutterwaveSubaccountId || "");
  return { configured: Boolean(value), maskedId: value ? `••••${value.slice(-4)}` : null };
};

export const createCompanyFlutterwaveSubaccount = async (companyId, input) => {
  if (!process.env.FLUTTERWAVE_SECRET_KEY) throw new AppError("Flutterwave is not configured on the EMS merchant account.", 503, { code: "FLUTTERWAVE_NOT_CONFIGURED" });
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, legalName: true, email: true, flutterwaveSubaccountId: true },
  });
  if (!company) throw new AppError("Company not found", 404);
  if (company.flutterwaveSubaccountId) throw new AppError("This company already has a Flutterwave subaccount linked.", 409, { code: "FLUTTERWAVE_SUBACCOUNT_ALREADY_CONFIGURED" });

  const bank = await validateProviderBankCode("FLUTTERWAVE", input.accountBank);
  const accountNumber = String(input.accountNumber || "").trim();
  const businessMobile = String(input.businessMobile || "").trim();
  const businessName = String(company.legalName || company.name || "").trim();
  if (!businessName) throw new AppError("Add the company's legal/business name before creating a Flutterwave subaccount.", 409, { code: "COMPANY_BUSINESS_NAME_REQUIRED" });

  const response = await createFlutterwaveSubaccount({
    account_bank: bank.bankCode,
    account_number: accountNumber,
    business_name: businessName.slice(0, 100),
    country: "NG",
    split_type: "percentage",
    split_value: 1,
    business_mobile: businessMobile,
    ...(company.email ? { business_email: company.email } : {}),
    business_contact: businessName.slice(0, 100),
    business_contact_mobile: businessMobile,
    meta: [{ meta_name: "emsCompanyId", meta_value: companyId }],
  });
  const subaccountId = String(response?.data?.subaccount_id || "").trim();
  if (String(response?.status || "").toLowerCase() !== "success" || !/^RS_[A-Za-z0-9]+$/.test(subaccountId)) {
    throw new AppError("Flutterwave did not return a valid company subaccount ID. No EMS subaccount link was saved.", 502, { code: "FLUTTERWAVE_SUBACCOUNT_CREATE_INVALID_RESPONSE" });
  }

  const saved = await prisma.company.updateMany({
    where: { id: companyId, flutterwaveSubaccountId: null },
    data: { flutterwaveSubaccountId: subaccountId },
  });
  if (saved.count !== 1) {
    throw new AppError("A Flutterwave subaccount was created, but another request linked a subaccount first. Contact EMS support before retrying to avoid creating duplicates.", 409, { code: "FLUTTERWAVE_SUBACCOUNT_LINK_RACE", details: { createdSubaccountId: `••••${subaccountId.slice(-4)}` } });
  }
  return { configured: true, maskedId: `••••${subaccountId.slice(-4)}`, bankName: bank.bankName };
};

export const setFlutterwaveSubaccount = async (companyId, subaccountId) => {
  const value = String(subaccountId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value)) throw new AppError("Enter a valid Flutterwave subaccount ID copied from the company's Flutterwave account.", 400, { code: "FLUTTERWAVE_SUBACCOUNT_ID_INVALID" });
  const updated = await prisma.company.update({ where: { id: companyId }, data: { flutterwaveSubaccountId: value }, select: { flutterwaveSubaccountId: true } });
  return { configured: true, maskedId: `••••${String(updated.flutterwaveSubaccountId).slice(-4)}` };
};

export const initializePayment = async (companyId, input) => {
  if (!companyId) throw new AppError("A company context is required to fund a company wallet.", 403, { code: "WALLET_COMPANY_CONTEXT_REQUIRED" });
  const company = await repository.findCompanyPaymentConfig(companyId);
  if (!company) throw new AppError("Company not found", 404);

  const amount = money(input.amount);
  if (!amount.isFinite() || !amount.isPositive()) throw new AppError("Payment amount must be greater than zero", 400);
  const fundingDestination = String(input.fundingDestination || "EMS_INTERNAL_WALLET").trim().toUpperCase();
  if (!["EMS_INTERNAL_WALLET", "EXTERNAL_PROVIDER_PAYOUT"].includes(fundingDestination)) {
    throw new AppError("Choose EMS internal wallet or an external provider payout account.", 400, { code: "INVALID_WALLET_FUNDING_DESTINATION" });
  }
  let salaryAccount = String(input.salaryAccount || "PAYSTACK").trim().toUpperCase();
  if (fundingDestination === "EXTERNAL_PROVIDER_PAYOUT") {
    if (![PAYMENT_PROVIDER.PAYSTACK, PAYMENT_PROVIDER.MONNIFY].includes(input.provider)) {
      throw new AppError("External payout-account funding is available only through the same company's Paystack or Monnify connection. Flutterwave checkout cannot be assumed to fund either disbursement wallet.", 400, { code: "EXTERNAL_PROVIDER_FUNDING_PROVIDER_UNSUPPORTED" });
    }
    salaryAccount = input.provider;
  }
  if (!["PAYSTACK", "MONNIFY"].includes(salaryAccount)) {
    throw new AppError("Choose either the Paystack or Monnify salary account as the funding destination.", 400, { code: "INVALID_SALARY_ACCOUNT_DESTINATION" });
  }

  // Company wallet funding must settle to the tenant's own provider account.
  // Platform credentials are reserved for platform-owned products such as future subscriptions.
  let companyPaystackConnection = null;
  let companyMonnifyConnection = null;
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
  } else if (input.provider === PAYMENT_PROVIDER.MONNIFY) {
    companyMonnifyConnection = await prisma.companyMonnifyConnection.findUnique({ where: { companyId } });
    if (!companyMonnifyConnection?.isActive) {
      throw new AppError("Connect this company's Monnify account before using Monnify checkout.", 409, { code: "MONNIFY_COMPANY_CONNECTION_REQUIRED" });
    }
    gatewayOwner = "COMPANY_MONNIFY";
  } else {
    throw new AppError("Unsupported payment provider", 400, { code: "UNSUPPORTED_PAYMENT_PROVIDER" });
  }

  const fingerprint = paymentFingerprint({ ...input, fundingDestination, salaryAccount, metadata: { ...(input.metadata || {}), salaryAccount, fundingDestination } }, gatewayOwner);
  if (input.idempotencyKey) {
    const existing = await repository.findPaymentByIdempotencyKey(companyId, input.idempotencyKey);
    if (existing) {
      const existingFingerprint = existing.metadata?.__idempotencyFingerprint;
      if (existingFingerprint !== fingerprint) {
        throw new AppError("Idempotency key was already used with different or unverifiable payment details. Start a new funding request with a fresh idempotency key.", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
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
    __salaryAccount: salaryAccount,
    __fundingDestination: fundingDestination,
    ...(input.provider === PAYMENT_PROVIDER.MONNIFY
      ? { __monnifyEnvironment: companyMonnifyConnection.environment }
      : {}),
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
        if (existingFingerprint !== fingerprint) {
          throw new AppError("Idempotency key was already used with different or unverifiable payment details. Start a new funding request with a fresh idempotency key.", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
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
    } else if (input.provider === PAYMENT_PROVIDER.FLUTTERWAVE) {
      const providerApi = getProviderService(input.provider);
      providerResponse = await providerApi.initialize({
        email: input.email,
        amount: amount.toFixed(2),
        reference,
        callbackUrl,
        currency: PAYMENT_CURRENCY,
        subaccountId: company.flutterwaveSubaccountId,
        metadata: { ...(input.metadata || {}), companyId, paymentId: payment.id, purpose: PAYMENT_PURPOSE.WALLET_FUNDING, salaryAccount: salaryAccount },
      });
    } else {
      const contractCode = decryptMonnifySecret(companyMonnifyConnection.contractCodeCiphertext);
      providerResponse = await monnifyEndpoints.initializeTransaction(companyMonnifyConnection, {
        amount: Number(amount.toFixed(2)),
        customerName: String(input.metadata?.customerName || input.email).slice(0, 100),
        customerEmail: input.email,
        paymentReference: reference,
        paymentDescription: `EMS ${salaryAccount} salary account funding`.slice(0, 100),
        currencyCode: PAYMENT_CURRENCY,
        contractCode,
        redirectUrl: callbackUrl,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD", "PHONE_NUMBER"],
        metadata: { companyId, paymentId: payment.id, purpose: PAYMENT_PURPOSE.WALLET_FUNDING, salaryAccount: salaryAccount },
      });
      if (String(providerResponse?.paymentReference || "") !== reference || !providerResponse?.transactionReference) {
        throw new AppError("Monnify returned a transaction reference that does not match the initialized EMS payment.", 502, { code: "MONNIFY_INITIALIZATION_REFERENCE_MISMATCH" });
      }
      let checkoutUrl;
      try {
        checkoutUrl = new URL(String(providerResponse?.checkoutUrl || ""));
      } catch {
        throw new AppError("Monnify did not return a valid hosted checkout URL.", 502, { code: "MONNIFY_CHECKOUT_URL_INVALID" });
      }
      const trustedCheckoutHosts = ["checkout.monnify.com", "sandbox.sdk.monnify.com", "sdk.monnify.com"];
      if (checkoutUrl.protocol !== "https:" || !trustedCheckoutHosts.includes(checkoutUrl.hostname.toLowerCase())) {
        throw new AppError("Monnify returned an untrusted hosted checkout URL.", 502, { code: "MONNIFY_CHECKOUT_URL_UNTRUSTED" });
      }
    }

    const providerReference = input.provider === PAYMENT_PROVIDER.FLUTTERWAVE
      ? providerResponse?.data?.id?.toString() || null
      : input.provider === PAYMENT_PROVIDER.MONNIFY
        ? providerResponse?.transactionReference || null
        : providerResponse?.data?.reference || reference;

    const updated = await repository.updatePayment(payment.id, { providerReference, metadata: { ...(payment.metadata || {}), providerInitialization: providerResponse } });
    return { payment: mapPayment(updated), providerResponse };
  } catch (error) {
    await repository.updatePayment(payment.id, { status: PAYMENT_STATUS.FAILED, metadata: { ...(payment.metadata || {}), initializationError: String(error?.message || "Provider initialization failed").slice(0, 500) } });
    throw error;
  }
};

const assertVerifiedPayment = (payment, providerResponse) => {
  const data = payment.provider === PAYMENT_PROVIDER.MONNIFY
    ? providerResponse?.data || providerResponse
    : providerResponse?.data;
  if (!data || typeof data !== "object") throw new AppError("Provider returned an invalid verification response", 502);

  const expectedAmount = money(payment.amount);
  const expectedCurrency = payment.currency;
  const actualCurrency = String(data.currency || data.currencyCode || "").toUpperCase();
  const actualReference = payment.provider === PAYMENT_PROVIDER.PAYSTACK
    ? data.reference
    : payment.provider === PAYMENT_PROVIDER.FLUTTERWAVE
      ? data.tx_ref
      : data.paymentReference;

  if (actualReference !== payment.reference) throw new AppError("Payment reference mismatch", 400, { code: "PAYMENT_REFERENCE_MISMATCH" });
  if (actualCurrency !== expectedCurrency) throw new AppError("Payment currency mismatch", 400, { code: "PAYMENT_CURRENCY_MISMATCH" });

  const rawAmount = payment.provider === PAYMENT_PROVIDER.PAYSTACK
    ? new Decimal(data.amount).div(100)
    : payment.provider === PAYMENT_PROVIDER.MONNIFY
      ? data.amountPaid
      : data.amount;
  const actualAmount = money(rawAmount);
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

    const salaryAccount = String(payment.metadata?.__salaryAccount || "PAYSTACK").toUpperCase();
    if (!["PAYSTACK", "MONNIFY"].includes(salaryAccount)) throw new AppError("Payment has an invalid salary account destination", 409, { code: "PAYMENT_SALARY_ACCOUNT_INVALID" });
    const fundingDestination = String(payment.metadata?.__fundingDestination || "EMS_INTERNAL_WALLET").toUpperCase();
    if (!["EMS_INTERNAL_WALLET", "EXTERNAL_PROVIDER_PAYOUT"].includes(fundingDestination)) throw new AppError("Payment has an invalid funding destination", 409, { code: "PAYMENT_FUNDING_DESTINATION_INVALID" });
    if (fundingDestination === "EXTERNAL_PROVIDER_PAYOUT") {
      if (payment.provider !== salaryAccount) throw new AppError("External provider funding must use the same company provider account as the checkout gateway.", 409, { code: "EXTERNAL_PROVIDER_FUNDING_MISMATCH" });
      // Do not create an EMS ledger credit. A verified collection is not the same as
      // a provider's available disbursement balance; settlement remains provider-controlled.
    } else {
      await creditWalletInTransaction(tx, payment.companyId, {
        amount: payment.amount,
        account: salaryAccount,
        reference: `PAYMENT-${payment.reference}`,
        description: `Salary account funding via ${payment.provider} → ${salaryAccount}`,
        metadata: { paymentId: payment.id, provider: payment.provider, providerReference, salaryAccount },
      });
    }

    return repository.updatePayment(payment.id, {
      status: PAYMENT_STATUS.SUCCESSFUL,
      providerReference: providerReference || payment.providerReference,
      paidAt: new Date(),
      metadata: {
        ...(payment.metadata || {}),
        providerResponse,
        ...(fundingDestination === "EXTERNAL_PROVIDER_PAYOUT" ? { __settlementStatus: "AWAITING_PROVIDER_SETTLEMENT", __internalWalletCredited: false } : { __internalWalletCredited: true }),
      },
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
  } else if (payment.provider === PAYMENT_PROVIDER.FLUTTERWAVE) {
    const transactionId = providerTransactionId || payment.providerReference;
    if (!transactionId) throw new AppError("Flutterwave transaction ID is not available. Return from checkout and try verification again.", 409);
    providerResponse = await flutterwave.verify(transactionId);
    if (providerResponse?.data?.tx_ref !== payment.reference) throw new AppError("Payment reference mismatch", 400, { code: "PAYMENT_REFERENCE_MISMATCH" });
  } else {
    const connection = await prisma.companyMonnifyConnection.findUnique({ where: { companyId: payment.companyId } });
    if (!connection?.isActive) throw new AppError("The company's Monnify connection is unavailable. Restore the same credentials to verify this pending payment.", 409, { code: "MONNIFY_COMPANY_CONNECTION_REQUIRED_FOR_VERIFY" });
    if (payment.metadata?.__monnifyEnvironment && String(connection.environment).toLowerCase() !== String(payment.metadata.__monnifyEnvironment).toLowerCase()) {
      throw new AppError(`This pending Monnify checkout was created in ${String(payment.metadata.__monnifyEnvironment).toUpperCase()}. Restore that environment before verifying it.`, 409, { code: "MONNIFY_PAYMENT_ENVIRONMENT_MISMATCH" });
    }
    providerResponse = await monnifyEndpoints.verifyTransaction(connection, payment.reference);
  }

  const successful = payment.provider === PAYMENT_PROVIDER.PAYSTACK
    ? providerResponse?.status === true && providerResponse?.data?.status === "success"
    : payment.provider === PAYMENT_PROVIDER.FLUTTERWAVE
      ? providerResponse?.status === "success" && providerResponse?.data?.status === "successful"
      : String(providerResponse?.paymentStatus || providerResponse?.data?.paymentStatus || "").toUpperCase() === "PAID";

  if (!successful) {
    const providerStatus = payment.provider === PAYMENT_PROVIDER.MONNIFY
      ? providerResponse?.paymentStatus
      : providerResponse?.data?.status;
    const terminalFailure = ["failed", "abandoned", "reversed", "expired", "cancelled", "refunded"].includes(String(providerStatus || "").toLowerCase());
    const updated = await repository.updatePayment(payment.id, {
      ...(terminalFailure ? { status: PAYMENT_STATUS.FAILED } : {}),
      ...(providerTransactionId && !payment.providerReference ? { providerReference: String(providerTransactionId) } : {}),
      metadata: { ...(payment.metadata || {}), lastVerificationResponse: providerResponse },
    });
    return mapPayment(updated);
  }

  const verifiedData = payment.provider === PAYMENT_PROVIDER.MONNIFY ? providerResponse : providerResponse?.data;
  return mapPayment(await completeSuccessfulPayment(payment.id, verifiedData?.id?.toString() || verifiedData?.transactionReference || providerTransactionId, providerResponse));
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

export const processMonnifyWebhook = async (rawBody, signature, payload) => {
  const eventType = String(payload?.eventType || payload?.event || "").toUpperCase();
  if (eventType !== "SUCCESSFUL_TRANSACTION") return { matched: false, received: true, processed: false };

  const eventData = payload?.eventData || payload?.data || {};
  const reference = String(eventData.paymentReference || "").trim();
  if (!reference) return { matched: false, received: true, processed: false };

  const payment = await repository.findPaymentByReferenceFromAnyCompany(reference);
  if (!payment || payment.provider !== PAYMENT_PROVIDER.MONNIFY) {
    return { matched: false, received: true, processed: false };
  }
  if (payment.purpose !== PAYMENT_PURPOSE.WALLET_FUNDING) {
    return { matched: true, received: true, processed: false, reason: "PAYMENT_PURPOSE_NOT_WALLET_FUNDING" };
  }
  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return { matched: true, received: true, processed: false, duplicate: true };
  }

  const connection = await prisma.companyMonnifyConnection.findUnique({ where: { companyId: payment.companyId } });
  if (!connection?.isActive) {
    throw new AppError("The company's Monnify connection is unavailable; cannot authenticate its payment webhook.", 401, { code: "MONNIFY_COMPANY_WEBHOOK_CONNECTION_MISSING" });
  }
  if (payment.metadata?.__monnifyEnvironment && String(connection.environment).toLowerCase() !== String(payment.metadata.__monnifyEnvironment).toLowerCase()) {
    throw new AppError(`This pending Monnify checkout was created in ${String(payment.metadata.__monnifyEnvironment).toUpperCase()}. Restore that environment before processing its webhook.`, 409, { code: "MONNIFY_PAYMENT_ENVIRONMENT_MISMATCH" });
  }

  // Monnify's production transaction webhooks carry an HMAC-SHA512 signature.
  // Sandbox notifications may omit it, so sandbox events are still verified with
  // Monnify's authenticated transaction-query API before any salary balance changes.
  const receivedSignature = String(signature || "").trim().toLowerCase();
  if (receivedSignature) {
    if (!Buffer.isBuffer(rawBody) || !rawBody.length) {
      throw new AppError("Monnify webhook raw body is unavailable for signature verification.", 400, { code: "MONNIFY_WEBHOOK_RAW_BODY_MISSING" });
    }
    const secret = decryptMonnifySecret(connection.apiSecretCiphertext);
    const expectedSignature = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    const receivedBuffer = Buffer.from(receivedSignature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      throw new AppError("Invalid Monnify webhook signature.", 401, { code: "MONNIFY_WEBHOOK_SIGNATURE_INVALID" });
    }
  } else if (String(connection.environment || "sandbox").toLowerCase() !== "sandbox") {
    throw new AppError("Monnify production webhook signature is missing.", 401, { code: "MONNIFY_WEBHOOK_SIGNATURE_MISSING" });
  }

  // Never credit from webhook fields alone. Verify the reference with Monnify's API.
  const verified = await monnifyEndpoints.verifyTransaction(connection, reference);
  const verifiedData = verified?.data || verified;
  if (String(verifiedData?.paymentStatus || "").toUpperCase() !== "PAID") {
    return { matched: true, received: true, processed: false, providerStatus: verifiedData?.paymentStatus || "UNKNOWN" };
  }
  const updated = await completeSuccessfulPayment(
    payment.id,
    verifiedData?.transactionReference || null,
    verified,
  );
  return { matched: true, received: true, processed: true, payment: mapPayment(updated) };
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
