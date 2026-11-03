import * as service from "./biometric.service.js";
import { registerSchema, idSchema, verifySchema } from "./biometric.validation.js";

const companyId = (req) => req.tenant?.companyId ?? req.user?.companyId;

export const register = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const data = await service.register(companyId(req), req.user?.userId, input);
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

export const list = async (req, res, next) => {
  try {
    const data = await service.list(companyId(req), req.query.employeeId, req.query.type);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const get = async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    res.json({ success: true, data: await service.get(companyId(req), id) });
  } catch (error) { next(error); }
};

export const revoke = async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);
    res.json({ success: true, data: await service.revoke(companyId(req), id) });
  } catch (error) { next(error); }
};

export const verifyAndAttend = async (req, res, next) => { try { const input = verifySchema.parse(req.body); const data = await service.verifyAndRecordAttendance(companyId(req), req.user?.userId, input, { occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(), latitude: req.body.latitude, longitude: req.body.longitude, ipAddress: req.ip, userAgent: req.get("user-agent") }); res.json({ success: true, data }); } catch (error) { next(error); } };

export const verify = async (req, res, next) => {
  try {
    const input = verifySchema.parse(req.body);
    res.json({ success: true, data: await service.verifyReference(companyId(req), input) });
  } catch (error) { next(error); }
};
