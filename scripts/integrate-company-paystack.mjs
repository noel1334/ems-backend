import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);

const routeFile = "src/route/index.js";
let routes = read(routeFile);
if (!routes.includes('from "../modules/payments/company-paystack/company-paystack.routes.js"')) {
  const anchor = 'import monnifyRoutes from "../modules/payments/monnify/monnify.routes.js";';
  if (!routes.includes(anchor)) throw new Error("Cannot safely integrate Paystack routes: Monnify route import was not found.");
  routes = routes.replace(anchor, `${anchor}\nimport companyPaystackRoutes from "../modules/payments/company-paystack/company-paystack.routes.js";`);
}
if (!routes.includes('router.use("/payroll/paystack-company", companyPaystackRoutes);')) {
  const anchor = 'router.use("/payroll/monnify", monnifyRoutes);';
  if (!routes.includes(anchor)) throw new Error("Cannot safely mount Paystack routes: Monnify route mount was not found.");
  routes = routes.replace(anchor, `${anchor}\nrouter.use("/payroll/paystack-company", companyPaystackRoutes);`);
}
write(routeFile, routes);

const controllerFile = "src/modules/payments/payment.controller.js";
let controller = read(controllerFile);
if (!controller.includes('from "./company-paystack/company-paystack.service.js"')) {
  const anchor = 'import * as service from "./payment.service.js";';
  if (!controller.includes(anchor)) throw new Error("Cannot safely integrate Paystack webhook: payment service import was not found.");
  controller = controller.replace(anchor, `${anchor}\nimport { processCompanyPaystackWebhook } from "./company-paystack/company-paystack.service.js";`);
}
const webhookStart = controller.indexOf("export const paystackWebhook = async (req, res) => {");
if (webhookStart < 0) throw new Error("Cannot safely integrate Paystack webhook: handler was not found.");
const webhookEnd = controller.indexOf("\n};", webhookStart);
if (webhookEnd < 0) throw new Error("Cannot safely integrate Paystack webhook: handler end was not found.");
const replacement = `export const paystackWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const payload = JSON.parse(rawBody.toString("utf8"));
  // Tenant-owned transfers use the secret key saved for the company that owns the transfer.
  // Existing platform Paystack wallet/payment webhooks continue through the original handler.
  const companyResult = await processCompanyPaystackWebhook(rawBody, req.headers["x-paystack-signature"], payload);
  if (companyResult?.matched) return res.json({ success: true, data: companyResult });
  return res.json(await service.processPaystackWebhook(rawBody, req.headers["x-paystack-signature"], payload));
};`;
controller = controller.slice(0, webhookStart) + replacement + controller.slice(webhookEnd + 3);
write(controllerFile, controller);

console.log("OK Paystack payroll API route mounted at /payroll/paystack-company");
console.log("OK Shared Paystack webhook dispatches company transfers using the matching tenant key");
