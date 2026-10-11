import * as service from "./funding.service.js";
import { initializeFundingSchema, verifyFundingSchema } from "./funding.validation.js";

const companyId = (req) => req.tenant?.companyId || req.user?.companyId;

export const initialize = async (req, res) => {
  const data = initializeFundingSchema.parse(req.body);
  res.status(201).json({ success: true, data: await service.initializeFunding(companyId(req), data) });
};

export const verify = async (req, res) => {
  const { reference } = verifyFundingSchema.parse(req.body);
  res.json({ success: true, data: await service.verifyFunding(companyId(req), reference) });
};
