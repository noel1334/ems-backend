import * as service from "./face.service.js";
import { validateUploadedFileContent } from "../../middleware/upload.middleware.js";

const companyId = (req) => req.tenant?.companyId ?? req.user?.companyId;

export const enroll = async (req, res, next) => {
  try {
    if (!validateUploadedFileContent(req.file)) {
      return res.status(400).json({ success: false, message: "Invalid image content" });
    }
    const data = await service.enrollFace(companyId(req), req.user?.userId, req.body.employeeId, req.file, req.body.deviceReference);
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

export const recognizeAndAttend = async (req, res, next) => {
  try {
    if (!validateUploadedFileContent(req.file)) {
      return res.status(400).json({ success: false, message: "Invalid image content" });
    }
    const data = await service.recognizeAndAttend(companyId(req), req.user?.userId, req.file, {
      deviceReference: req.body.deviceReference,
      occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(),
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};
