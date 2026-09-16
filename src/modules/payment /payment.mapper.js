const decimalToString = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  return value.toString();
};

export const mapPayment = (payment) => {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id,

    companyId: payment.companyId,

    provider: payment.provider,

    purpose: payment.purpose,

    status: payment.status,

    amount: decimalToString(payment.amount),

    currency: payment.currency,

    reference: payment.reference,

    providerReference: payment.providerReference,

    email: payment.email,

    callbackUrl: payment.callbackUrl,

    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,

    metadata: payment.metadata ?? null,

    createdAt: payment.createdAt?.toISOString(),

    updatedAt: payment.updatedAt?.toISOString(),
  };
};

export const mapPayments = (payments) => {
  return payments.map(mapPayment);
};
