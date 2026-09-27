import * as service from "./payment.service.js";
import { initializePaymentSchema, verifyPaymentSchema, paymentQuerySchema, validateBody, validateQuery } from "./payment.validation.js";

const companyId = (req) => req.tenant?.companyId || req.user?.companyId;

export const initialize = async (req, res) => {
  const result = await service.initializePayment(companyId(req), validateBody(initializePaymentSchema, req.body));
  return res.status(201).json({ success: true, message: "Payment initialized successfully", data: result });
};

export const verify = async (req, res) => {
  const { reference } = validateBody(verifyPaymentSchema, req.body);
  const result = await service.verifyPayment(companyId(req), reference);
  return res.json({ success: true, message: "Payment verification completed", data: result });
};

export const list = async (req, res) => {
  const result = await service.listPayments(companyId(req), validateQuery(paymentQuerySchema, req.query));
  return res.json({ success: true, data: result.data, pagination: result.pagination });
};

export const getOne = async (req, res) => res.json({ success: true, data: await service.getPayment(companyId(req), req.params.id) });

export const paystackWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  return res.json(await service.processPaystackWebhook(rawBody, req.headers["x-paystack-signature"], JSON.parse(rawBody.toString("utf8"))));
};

export const flutterwaveWebhook = async (req, res) =>
  res.json(await service.processFlutterwaveWebhook(req.headers["verif-hash"], req.body));
