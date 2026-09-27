import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";
import { checkIn } from "../attendance/attendance.service.js";
import { writeAudit } from "../../common/utils/audit.js";
import * as provider from "./face-recognition.provider.js";
import * as repository from "./biometric.repository.js";

const subjectFor = (companyId, employeeId) => `company:${companyId}:employee:${employeeId}`;

const employeePublic = (employee) => ({
  id: employee.id,
  employeeNumber: employee.employeeNumber,
  firstName: employee.firstName,
  middleName: employee.middleName,
  lastName: employee.lastName,
});

const extractMatches = (result) => Array.isArray(result?.result) ? result.result : [];

export const enrollFace = async (companyId, userId, employeeId, file, deviceReference = null) => {
  if (!companyId || !employeeId) throw new AppError("Company and employee are required", 400);
  const employee = await repository.findEmployee(companyId, employeeId);
  if (!employee) throw new AppError("Employee not found", 404);

  const existing = await prisma.biometricRecord.findFirst({
    where: { companyId, employeeId, type: "FACE", status: "ACTIVE" },
  });
  if (existing) throw new AppError("An active face enrollment already exists for this employee", 409, "FACE_ALREADY_ENROLLED");

  const subject = subjectFor(companyId, employeeId);
  const providerResult = await provider.enroll({ subject, file });

  const record = await repository.create({
    companyId,
    employeeId,
    type: "FACE",
    provider: "compreface",
    templateReference: subject,
    templateHash: null,
    deviceReference,
    metadata: { providerSubject: subject, providerResult },
    registeredById: userId ?? null,
  });

  await writeAudit(prisma, {
    companyId,
    actorUserId: userId,
    action: "CREATE",
    module: "biometrics",
    resource: "face-enrollment",
    resourceId: record.id,
    metadata: { employeeId, provider: "compreface", deviceReference },
  });

  return { biometricId: record.id, employee: employeePublic(employee), type: "FACE", provider: "compreface" };
};

export const recognizeAndAttend = async (companyId, userId, file, context = {}) => {
  const providerResult = await provider.recognize({ file });
  const matches = extractMatches(providerResult)
    .map((item) => ({ subject: item.subject, similarity: Number(item.similarity ?? 0) }))
    .filter((item) => item.subject && item.similarity >= env.COMPRE_FACE_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  if (!matches.length) return { recognized: false, reason: "NO_MATCH" };

  const best = matches[0];
  const record = await prisma.biometricRecord.findFirst({
    where: {
      companyId,
      type: "FACE",
      status: "ACTIVE",
      templateReference: best.subject,
    },
    include: { employee: true },
  });
  if (!record) return { recognized: false, reason: "MATCH_NOT_REGISTERED_FOR_COMPANY" };

  if (context.deviceReference) {
    const device = await prisma.attendanceDevice.findFirst({ where: { companyId, deviceId: context.deviceReference, isActive: true } });
    if (!device) throw new AppError("Biometric device is not authorized for this company", 403, "DEVICE_NOT_AUTHORIZED");
  }

  await repository.update(record.id, companyId, { lastVerifiedAt: new Date() });
  const attendance = await checkIn({
    companyId,
    employeeId: record.employeeId,
    occurredAt: context.occurredAt || new Date(),
    source: "BIOMETRIC",
    deviceId: context.deviceReference || null,
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
    resource: "face-attendance",
    resourceId: attendance.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { biometricId: record.id, employeeId: record.employeeId, similarity: best.similarity, deviceReference: context.deviceReference || null },
  });

  return {
    recognized: true,
    confidence: best.similarity,
    biometricId: record.id,
    employee: employeePublic(record.employee),
    attendance,
  };
};
