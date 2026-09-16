import crypto from "node:crypto";
import Decimal from "decimal.js";

import AppError from "../../common/errors/AppError.js";

import * as repository from "./payment.repository.js";

import * as paystack from "./paystack/paystack.service.js";

import * as flutterwave from "./flutterwave/flutterwave.service.js";

import { mapPayment, mapPayments } from "./payment.mapper.js";

import {
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  PAYMENT_CURRENCY,
} from "./payment.constants.js";

import { creditWallet } from "../wallet/wallet.service.js";

const money = (value) => {
  return new Decimal(value).toDecimalPlaces(2);
};

const generateReference = () => {
  const random = crypto.randomBytes(8).toString("hex").toUpperCase();

  return `PAY-${Date.now()}-${random}`;
};

const getProviderService = (provider) => {
  switch (provider) {
    case PAYMENT_PROVIDER.PAYSTACK:
      return paystack;

    case PAYMENT_PROVIDER.FLUTTERWAVE:
      return flutterwave;

    default:
      throw new AppError("Unsupported payment provider", 400);
  }
};

export const initializePayment = async (
  companyId,
  { amount, email, purpose, provider, callbackUrl, metadata }
) => {
  const normalizedAmount = money(amount);

  if (!normalizedAmount.isPositive()) {
    throw new AppError("Payment amount must be greater than zero", 400);
  }

  const reference = generateReference();

  const payment = await repository.createPayment({
    companyId,

    provider,

    purpose,

    status: PAYMENT_STATUS.PENDING,

    amount: normalizedAmount.toFixed(2),

    currency: PAYMENT_CURRENCY,

    reference,

    email,

    callbackUrl: callbackUrl || process.env.APP_BASE_URL,

    metadata: metadata || undefined,
  });

  try {
    const providerApi = getProviderService(provider);

    const providerResponse = await providerApi.initialize({
      email,

      amount: normalizedAmount.toFixed(2),

      reference,

      callbackUrl: callbackUrl || process.env.APP_BASE_URL,

      metadata: {
        ...(metadata || {}),

        companyId,

        paymentId: payment.id,

        purpose,
      },
    });

    return {
      payment: mapPayment(payment),

      providerResponse,
    };
  } catch (error) {
    await repository.updatePayment(payment.id, {
      status: PAYMENT_STATUS.FAILED,
    });

    throw error;
  }
};

export const verifyPayment = async (companyId, reference) => {
  const payment = await repository.findPaymentByReference(companyId, reference);

  if (!payment) {
    throw new AppError("Payment not found", 404);
  }

  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return mapPayment(payment);
  }

  const providerApi = getProviderService(payment.provider);

  let providerResponse;

  if (payment.provider === PAYMENT_PROVIDER.PAYSTACK) {
    providerResponse = await providerApi.verify(payment.reference);
  } else {
    if (!payment.providerReference) {
      throw new AppError(
        "Flutterwave transaction ID is required before verification",
        400
      );
    }

    providerResponse = await providerApi.verify(payment.providerReference);
  }

  const successful =
    payment.provider === PAYMENT_PROVIDER.PAYSTACK
      ? providerResponse?.status === true &&
        providerResponse?.data?.status === "success"
      : providerResponse?.status === "success" &&
        providerResponse?.data?.status === "successful";

  if (!successful) {
    const updated = await repository.updatePayment(payment.id, {
      status: PAYMENT_STATUS.FAILED,
    });

    return mapPayment(updated);
  }

  const providerReference = providerResponse?.data?.id?.toString();

  const updated = await completeSuccessfulPayment(
    payment.id,
    providerReference,
    providerResponse
  );

  return mapPayment(updated);
};

const completeSuccessfulPayment = async (
  paymentId,
  providerReference,
  providerResponse
) => {
  const payment = await repository.findPaymentById(undefined, paymentId);

  if (!payment) {
    throw new AppError("Payment not found", 404);
  }

  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return payment;
  }

  const updated = await repository.updatePayment(paymentId, {
    status: PAYMENT_STATUS.SUCCESSFUL,

    providerReference,

    paidAt: new Date(),

    metadata: providerResponse,
  });

  /*
   * Stage 13 owns wallet operations.
   *
   * Payment does not directly modify Wallet.balance.
   */
  if (payment.purpose === PAYMENT_PURPOSE.WALLET_FUNDING) {
    await creditWallet(payment.companyId, {
      amount: payment.amount,

      reference: `PAYMENT-${payment.reference}`,

      description: `Wallet funding via ${payment.provider}`,

      metadata: {
        paymentId: payment.id,

        provider: payment.provider,

        providerReference,
      },
    });
  }

  return updated;
};

export const listPayments = async (
  companyId,
  { page, limit, provider, status, purpose, search, startDate, endDate }
) => {
  const where = {};

  if (provider) {
    where.provider = provider;
  }

  if (status) {
    where.status = status;
  }

  if (purpose) {
    where.purpose = purpose;
  }

  if (search) {
    where.OR = [
      {
        reference: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};

    if (startDate) {
      where.createdAt.gte = startDate;
    }

    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    repository.listPayments(companyId, {
      skip,
      take: limit,
      where,
    }),

    repository.countPayments(companyId, where),
  ]);

  return {
    data: mapPayments(payments),

    pagination: {
      page,
      limit,
      total,

      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getPayment = async (companyId, id) => {
  const payment = await repository.findPaymentById(companyId, id);

  if (!payment) {
    throw new AppError("Payment not found", 404);
  }

  return mapPayment(payment);
};

export const processPaystackWebhook = async (rawBody, signature, payload) => {
  const valid = paystack.verifyWebhookSignature(rawBody, signature);

  if (!valid) {
    throw new AppError("Invalid Paystack webhook signature", 401);
  }

  if (payload?.event !== "charge.success") {
    return {
      received: true,
      processed: false,
    };
  }

  const reference = payload?.data?.reference;

  if (!reference) {
    return {
      received: true,
      processed: false,
    };
  }

  const payment =
    await repository.findPaymentByReferenceFromAnyCompany(reference);

  if (!payment || payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return {
      received: true,
      processed: false,
    };
  }

  const updated = await completeSuccessfulPayment(
    payment.id,

    payload?.data?.id?.toString(),

    payload
  );

  return {
    received: true,

    processed: true,

    payment: mapPayment(updated),
  };
};

export const processFlutterwaveWebhook = async (signature, payload) => {
  if (!flutterwave.verifyWebhookSignature(signature)) {
    throw new AppError("Invalid Flutterwave webhook signature", 401);
  }

  if (payload?.event !== "charge.completed") {
    return {
      received: true,
      processed: false,
    };
  }

  const reference = payload?.data?.tx_ref;

  if (!reference) {
    return {
      received: true,
      processed: false,
    };
  }

  const payment = await repository.findPaymentByProviderReference(
    PAYMENT_PROVIDER.FLUTTERWAVE,

    payload?.data?.id?.toString()
  );

  if (!payment) {
    return {
      received: true,
      processed: false,
    };
  }

  if (payment.status === PAYMENT_STATUS.SUCCESSFUL) {
    return {
      received: true,
      processed: false,
    };
  }

  if (payment.reference !== reference) {
    throw new AppError("Payment reference mismatch", 400);
  }

  const updated = await completeSuccessfulPayment(
    payment.id,

    payload?.data?.id?.toString(),

    payload
  );

  return {
    received: true,

    processed: true,

    payment: mapPayment(updated),
  };
};
