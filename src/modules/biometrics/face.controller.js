import { z } from "zod";
import * as service from "./face.service.js";

const descriptorSchema = z.array(z.number().finite().min(-2).max(2)).length(128);
const enrollmentSchema = z.object({
  employeeId: z.string().uuid(),
  descriptor: descriptorSchema,
  consentConfirmed: z.literal(true),
  deviceReference: z.string().trim().max(200).optional().nullable(),
});
const recognitionSchema = z.object({
  descriptor: descriptorSchema,
  action: z.enum(["CHECK_IN", "CHECK_OUT"]).default("CHECK_IN"),
  deviceReference: z.string().trim().max(200).optional().nullable(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
});

const companyId = (req) => req.tenant?.companyId ?? req.user?.companyId;

export const enroll = async (req, res, next) => {
  try {
    const input = enrollmentSchema.parse(req.body);
    const data = await service.enrollFace(
      companyId(req),
      req.user?.userId,
      input.employeeId,
      input.descriptor,
      input.consentConfirmed,
      input.deviceReference,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

export const recognizeAndAttend = async (req, res, next) => {
  try {
    const input = recognitionSchema.parse(req.body);
    const data = await service.recognizeAndAttend(companyId(req), req.user?.userId, input.descriptor, input, {
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      latitude: input.latitude,
      longitude: input.longitude,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};
