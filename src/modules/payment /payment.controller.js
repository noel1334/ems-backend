import * as service from "./payment.service.js";

import {
  initializePaymentSchema,
  verifyPaymentSchema,
  paymentQuerySchema,
  validateBody,
  validateQuery,
} from "./payment.validators.js";

const getCompanyId = (req) => {
  return req.tenant?.companyId || req.user?.companyId;
};

export const initialize = async (req, res) => {
  const companyId = getCompanyId(req);

  const data = validateBody(initializePaymentSchema, req.body);

  const result = await service.initializePayment(companyId, data);

  res.status(201).json({
    success: true,

    message: "Payment initialized successfully",

    data: result,
  });
};

export const verify = async (req, res) => {
  const companyId = getCompanyId(req);

  const data = validateBody(verifyPaymentSchema, req.body);

  const result = await service.verifyPayment(companyId, data.reference);

  res.json({
    success: true,

    message: "Payment verification completed",

    data: result,
  });
};

export const list = async (req, res) => {
  const companyId = getCompanyId(req);

  const query = validateQuery(paymentQuerySchema, req.query);

  const result = await service.listPayments(companyId, query);

  res.json({
    success: true,

    data: result.data,

    pagination: result.pagination,
  });
};

export const getOne = async (req, res) => {
  const companyId = getCompanyId(req);

  const result = await service.getPayment(companyId, req.params.id);

  res.json({
    success: true,
    data: result,
  });
};

export const paystackWebhook = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body || {}));

  const result = await service.processPaystackWebhook(
    rawBody,
    signature,
    req.body
  );

  res.json(result);
};

export const flutterwaveWebhook = async (req, res) => {
  const signature = req.headers["verif-hash"];

  const result = await service.processFlutterwaveWebhook(signature, req.body);

  res.json(result);
};
