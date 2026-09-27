const decimalToString = (value) => (value == null ? value : value.toString());
export const mapPayment = (payment) => payment ? ({
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
}) : null;
export const mapPayments = (payments) => payments.map(mapPayment);
