import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { checkIn } from "../attendance/attendance.service.js";
import * as repository from "./biometric.repository.js";
import { hashTemplateBuffer, verifyWithProvider } from "./fingerprint.provider.js";

const publicRecord = (record) => ({
  id: record.id,
  companyId: record.companyId,
  employeeId: record.employeeId,
  type: record.type,
  provider: record.provider,
  deviceReference: record.deviceReference,
  finger: record.finger,
  templateFormat: record.templateFormat,
  qualityScore: record.qualityScore == null ? null : Number(record.qualityScore),
  status: record.status,
  enrolledAt: record.enrolledAt,
  lastVerifiedAt: record.lastVerifiedAt,
  employee: record.employee ? {
    id: record.employee.id,
    employeeNumber: record.employee.employeeNumber,
    firstName: record.employee.firstName,
    middleName: record.employee.middleName,
    lastName: record.employee.lastName,
  } : undefined,
});

const ensureDevice = async (companyId, deviceReference) => {
  if (!deviceReference) throw new AppError("deviceReference is required", 400, "DEVICE_REFERENCE_REQUIRED");
  const device = await prisma.attendanceDevice.findFirst({
    where: { companyId, deviceId: deviceReference, isActive: true },
  });
  if (!device) throw new AppError("Fingerprint device is not authorized for this company", 403, "DEVICE_NOT_AUTHORIZED");
  return device;
};

export const enroll = async (companyId, userId, input) => {
  const employee = await repository.findEmployee(companyId, input.employeeId);
  if (!employee) throw new AppError("Employee not found", 404);
  await ensureDevice(companyId, input.deviceReference);

  const template = Buffer.from(input.templateBase64, "base64");
  if (!template.length) throw new AppError("Fingerprint template is empty", 400);
  const templateHash = hashTemplateBuffer(template);

  const existingEmployee = await repository.findActiveByEmployeeType(companyId, input.employeeId, "FINGERPRINT");
  if (existingEmployee) throw new AppError("An active fingerprint is already enrolled for this employee", 409, "BIOMETRIC_ALREADY_ENROLLED");

  const duplicate = await repository.findByTemplateHash(companyId, "FINGERPRINT", templateHash);
  if (duplicate) throw new AppError("This fingerprint is already enrolled to another employee", 409, "FINGERPRINT_ALREADY_ENROLLED");

  const record = await repository.create({
    companyId,
    employeeId: input.employeeId,
    type: "FINGERPRINT",
    provider: input.provider || "DEVICE_GATEWAY",
    templateReference: input.templateReference,
    templateHash,
    deviceReference: input.deviceReference,
    finger: input.finger || null,
    templateFormat: input.templateFormat || "ISO_19794_2",
    qualityScore: input.qualityScore ?? null,
    metadata: input.metadata || undefined,
    registeredById: userId || null,
  });

  await writeAudit(prisma, {
    companyId,
    actorUserId: userId,
    action: "CREATE",
    module: "biometrics",
    resource: "fingerprint_enrollment",
    resourceId: record.id,
    metadata: { employeeId: employee.id, deviceReference: input.deviceReference, finger: input.finger || null },
  });
  return publicRecord(record);
};

export const verifyAndAttend = async (companyId, userId, input, context = {}) => {
  await ensureDevice(companyId, input.deviceReference);
  const template = Buffer.from(input.templateBase64, "base64");
  if (!template.length) throw new AppError("Fingerprint template is empty", 400);

  const providerResult = await verifyWithProvider({ template, deviceReference: input.deviceReference });
  if (!providerResult?.matched || !providerResult?.templateReference) {
    return { verified: false, reason: "NO_MATCH" };
  }

  const record = await repository.findActiveByReference(companyId, providerResult.templateReference);
  if (!record || record.type !== "FINGERPRINT" || (record.deviceReference && record.deviceReference !== input.deviceReference)) {
    return { verified: false, reason: "NO_MATCH" };
  }

  if (providerResult.confidence != null && providerResult.confidence < (input.threshold ?? 0.8)) {
    return { verified: false, reason: "LOW_CONFIDENCE", confidence: providerResult.confidence };
  }

  await repository.update(record.id, companyId, { lastVerifiedAt: new Date() });
  const attendance = await checkIn({
    companyId,
    employeeId: record.employee.id,
    occurredAt: context.occurredAt || new Date(),
    source: "BIOMETRIC",
    deviceId: input.deviceReference,
    latitude: context.latitude,
    longitude: context.longitude,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  await writeAudit(prisma, {
    companyId,
    actorUserId: userId,
    action: "CREATE",
    module: "biometrics",
    resource: "fingerprint_attendance",
    resourceId: attendance.id,
    metadata: { biometricId: record.id, employeeId: record.employee.id, deviceReference: input.deviceReference, confidence: providerResult.confidence ?? null },
  });

  return {
    verified: true,
    confidence: providerResult.confidence ?? null,
    biometricId: record.id,
    employee: {
      id: record.employee.id,
      employeeNumber: record.employee.employeeNumber,
      firstName: record.employee.firstName,
      middleName: record.employee.middleName,
      lastName: record.employee.lastName,
    },
    attendance,
  };
};
