import * as service from "./fingerprint.service.js";
import { enrollSchema, verifyAndAttendSchema } from "./fingerprint.validation.js";

const companyId = (req) => req.tenant?.companyId ?? req.user?.companyId;

export const enroll = async (req, res, next) => {
  try {
    const input = enrollSchema.parse(req.body);
    const data = await service.enroll(companyId(req), req.user?.userId, input);
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

export const verifyAndAttend = async (req, res, next) => {
  try {
    const input = verifyAndAttendSchema.parse(req.body);
    const data = await service.verifyAndAttend(companyId(req), req.user?.userId, input, {
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      latitude: input.latitude,
      longitude: input.longitude,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};
