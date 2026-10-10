import crypto from "node:crypto";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import * as repository from "./biometric.repository.js";
import { checkIn } from "../attendance/attendance.service.js";
import { writeAudit } from "../../common/utils/audit.js";

const publicRecord = (record) => {
  if (!record) return null;
  return {
    id: record.id,
    companyId: record.companyId,
    employeeId: record.employeeId,
    type: record.type,
    provider: record.provider,
    deviceReference: record.deviceReference,
    status: record.status,
    enrolledAt: record.enrolledAt,
    lastVerifiedAt: record.lastVerifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    employee: record.employee
      ? {
          id: record.employee.id,
          employeeNumber: record.employee.employeeNumber,
          firstName: record.employee.firstName,
          middleName: record.employee.middleName,
          lastName: record.employee.lastName,
        }
      : undefined,
  };
};

export const register = async (companyId, userId, input) => {
  const employee = await repository.findEmployee(companyId, input.employeeId);
  if (!employee) throw new AppError("Employee not found", 404);

  if (!input.templateReference && !input.templateHash) {
    throw new AppError("A provider template reference or template hash is required", 400);
  }

  const templateHash = input.templateHash
    ? input.templateHash
    : crypto.createHash("sha256").update(input.templateReference).digest("hex");

  const existing = await prisma.biometricRecord.findFirst({
    where: {
      companyId,
      employeeId: input.employeeId,
      type: input.type,
      status: "ACTIVE",
    },
  });

  if (existing) throw new AppError("An active biometric of this type already exists for this employee", 409);

  const record = await repository.create({
    companyId,
    employeeId: input.employeeId,
    type: input.type,
    provider: input.provider ?? null,
    templateReference: input.templateReference ?? null,
    templateHash,
    deviceReference: input.deviceReference ?? null,
    metadata: input.metadata ?? undefined,
    registeredById: userId ?? null,
  });

  return publicRecord(record);
};

export const list = async (companyId, employeeId, type) => {
  const rows = await repository.list(companyId, {
    ...(employeeId ? { employeeId } : {}),
    ...(type ? { type } : {}),
  });
  return rows.map(publicRecord);
};

export const get = async (companyId, id) => {
  const record = await repository.findById(companyId, id);
  if (!record) throw new AppError("Biometric record not found", 404);
  return publicRecord(record);
};

export const revoke = async (companyId, id) => {
  const record = await repository.findById(companyId, id);
  if (!record) throw new AppError("Biometric record not found", 404);
  await repository.update(id, companyId, { status: "REVOKED" });
  return { ...publicRecord(record), status: "REVOKED" };
};

// This endpoint verifies a provider-issued template reference. Actual biometric
// matching (fingerprint/face) remains the responsibility of the hardware/provider.
export const verifyReference = async (companyId, input) => {
  const record = await repository.findActiveByReference(companyId, input.templateReference);
  if (!record || (input.type && record.type !== input.type) || (input.deviceReference && record.deviceReference !== input.deviceReference)) {
    return { verified: false };
  }

  await repository.update(record.id, companyId, { lastVerifiedAt: new Date() });
  return {
    verified: true,
    employee: {
      id: record.employee.id,
      employeeNumber: record.employee.employeeNumber,
      firstName: record.employee.firstName,
      middleName: record.employee.middleName,
      lastName: record.employee.lastName,
    },
    biometricId: record.id,
    type: record.type,
    provider: record.provider,
  };
};


export const verifyAndRecordAttendance = async (companyId, userId, input, context = {}) => {
  const result = await verifyReference(companyId, input);
  if (!result.verified) return result;
  if (input.deviceReference) {
    const device = await prisma.attendanceDevice.findFirst({ where: { companyId, deviceId: input.deviceReference, isActive: true } });
    if (!device) throw new AppError("Biometric device is not authorized for this company", 403, "DEVICE_NOT_AUTHORIZED");
  }
  const attendance = await checkIn({ companyId, employeeId: result.employee.id, occurredAt: context.occurredAt || new Date(), source: "BIOMETRIC", deviceId: input.deviceReference || null, latitude: context.latitude, longitude: context.longitude, ipAddress: context.ipAddress, userAgent: context.userAgent });
  await writeAudit(prisma, { companyId, actorUserId: userId, action: "CREATE", module: "biometrics", resource: "attendance", resourceId: attendance.id, ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { biometricId: result.biometricId, employeeId: result.employee.id, deviceReference: input.deviceReference || null } });
  return { verified: true, employee: result.employee, biometricId: result.biometricId, attendance };
};
