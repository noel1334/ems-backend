import * as paymentService from "../../payments/payment.service.js";

export const initializeFunding = (companyId, data) => paymentService.initializePayment(companyId, {
  ...data,
  purpose: "WALLET_FUNDING",
});

export const verifyFunding = (companyId, reference) => paymentService.verifyPayment(companyId, reference);
