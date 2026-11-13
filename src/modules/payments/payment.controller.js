import { getBankDirectory } from "./bank-directory.service.js";
import * as service from "./payment.service.js";
import { processCompanyPaystackWebhook } from "./company-paystack/company-paystack.service.js";
import { initializePaymentSchema, verifyPaymentSchema, paymentQuerySchema, createFlutterwaveSubaccountSchema, setFlutterwaveSubaccountSchema, validateBody, validateQuery } from "./payment.validation.js";

const companyId = (req) => req.tenant?.companyId || req.user?.companyId;

export const initialize = async (req, res) => {
  const result = await service.initializePayment(companyId(req), validateBody(initializePaymentSchema, req.body));
  return res.status(201).json({ success: true, message: "Payment initialized successfully", data: result });
};

export const verify = async (req, res) => {
  const { reference, transactionId } = validateBody(verifyPaymentSchema, req.body);
  const result = await service.verifyPayment(companyId(req), reference, transactionId);
  return res.json({ success: true, message: "Payment verification completed", data: result });
};

export const list = async (req, res) => {
  const result = await service.listPayments(companyId(req), validateQuery(paymentQuerySchema, req.query));
  return res.json({ success: true, data: result.data, pagination: result.pagination });
};

export const getOne = async (req, res) => res.json({ success: true, data: await service.getPayment(companyId(req), req.params.id) });

export const paystackWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const payload = JSON.parse(rawBody.toString("utf8"));
  // Tenant-owned transfers use the secret key saved for the company that owns the transfer.
  // Existing platform Paystack wallet/payment webhooks continue through the original handler.
  const signature = req.headers["x-paystack-signature"];
  const walletResult = await service.processCompanyPaystackWalletWebhook(rawBody, signature, payload);
  if (walletResult?.matched) return res.json({ success: true, data: walletResult });
  const companyResult = await processCompanyPaystackWebhook(rawBody, signature, payload);
  if (companyResult?.matched) return res.json({ success: true, data: companyResult });
  return res.json(await service.processPaystackWebhook(rawBody, signature, payload));
};

export const monnifyWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
  const result = await service.processMonnifyWebhook(rawBody, req.headers["monnify-signature"], req.body);
  return res.json({ success: true, data: result });
};

export const flutterwaveWebhook = async (req, res) =>
  res.json(await service.processFlutterwaveWebhook(req.headers["verif-hash"], req.body));

export const listBanks = async (req, res) => res.json({ success: true, data: await getBankDirectory() });

export const flutterwaveSubaccountConfig = async (req, res) => res.json({ success: true, data: await service.getFlutterwaveSubaccountConfig(companyId(req)) });
export const createFlutterwaveSubaccount = async (req, res) => {
  const input = validateBody(createFlutterwaveSubaccountSchema, req.body);
  return res.status(201).json({ success: true, message: "Company Flutterwave subaccount created and linked", data: await service.createCompanyFlutterwaveSubaccount(companyId(req), input) });
};

export const setFlutterwaveSubaccount = async (req, res) => {
  const { subaccountId } = validateBody(setFlutterwaveSubaccountSchema, req.body);
  return res.json({ success: true, message: "Company Flutterwave subaccount saved", data: await service.setFlutterwaveSubaccount(companyId(req), subaccountId) });
};
