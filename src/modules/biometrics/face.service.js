import crypto from "node:crypto";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";
import { checkIn, checkOut } from "../attendance/attendance.service.js";
import { writeAudit } from "../../common/utils/audit.js";
import * as repository from "./biometric.repository.js";

const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_PROVIDER = "face-api.js";
const FACE_MODEL_VERSION = "face-api.js-0.22.2";
const AMBIGUITY_MARGIN = 0.025;

const employeePublic = (employee) => ({
  id: employee.id,
  employeeNumber: employee.employeeNumber,
  firstName: employee.firstName,
  middleName: employee.middleName,
  lastName: employee.lastName,
});

function validateDescriptor(value) {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) {
    throw new AppError(`A face descriptor must contain exactly ${FACE_DESCRIPTOR_LENGTH} values`, 400, "INVALID_FACE_DESCRIPTOR");
  }
  if (value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || Math.abs(entry) > 2)) {
    throw new AppError("The face descriptor contains invalid values", 400, "INVALID_FACE_DESCRIPTOR");
  }
  return value.map((entry) => Number(entry));
}

function getEncryptionKey() {
  const configured = env.BIOMETRIC_ENCRYPTION_KEY;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new AppError(
      "Face enrollment is not configured. Add BIOMETRIC_ENCRYPTION_KEY as a 64-character hexadecimal secret in the backend environment.",
      503,
      "BIOMETRIC_ENCRYPTION_NOT_CONFIGURED",
    );
  }
  return Buffer.from(configured, "hex");
}

function encryptDescriptor(descriptor) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(descriptor), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptDescriptor(payload) {
  if (!payload || payload.version !== 1 || payload.algorithm !== "aes-256-gcm" || !payload.iv || !payload.tag || !payload.ciphertext) {
    return null;
  }
  const key = getEncryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const descriptor = JSON.parse(clear);
    if (!Array.isArray(descriptor) || descriptor.length !== FACE_DESCRIPTOR_LENGTH || descriptor.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || Math.abs(entry) > 2)) return null;
    return descriptor;
  } catch {
    // A single damaged or legacy record must not prevent other employees from matching.
    return null;
  }
}

function euclideanDistance(left, right) {
  let total = 0;
  for (let index = 0; index < FACE_DESCRIPTOR_LENGTH; index += 1) {
    const difference = left[index] - right[index];
    total += difference * difference;
  }
  return Math.sqrt(total);
}

function getStoredDescriptor(record) {
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : null;
  return decryptDescriptor(metadata?.faceApi?.encryptedDescriptor);
}

export const enrollFace = async (companyId, userId, employeeId, rawDescriptor, consentConfirmed, deviceReference = null) => {
  if (!companyId || !employeeId) throw new AppError("Company and employee are required", 400);
  if (consentConfirmed !== true) throw new AppError("Employee consent must be confirmed before face enrollment", 400, "FACE_CONSENT_REQUIRED");
  const descriptor = validateDescriptor(rawDescriptor);
  const encryptedDescriptor = encryptDescriptor(descriptor);

  const employee = await repository.findEmployee(companyId, employeeId);
  if (!employee) throw new AppError("Employee not found in this company", 404, "EMPLOYEE_NOT_FOUND");

  const existing = await repository.findActiveByEmployeeType(companyId, employeeId, "FACE");
  if (existing?.provider === FACE_PROVIDER) {
    throw new AppError("An active face-api.js enrollment already exists for this employee. Revoke it before re-enrolling.", 409, "FACE_ALREADY_ENROLLED");
  }
  if (existing) {
    // Retire old CompreFace/provider records when an employee is re-enrolled with
    // face-api.js. Their EMS-side reference is cleared; any external provider data
    // must still be deleted in that provider's own console if such a service was used.
    await repository.revokeFaceRecord(existing.id, companyId, employeeId);
  }

  const record = await repository.create({
    companyId,
    employeeId,
    type: "FACE",
    provider: FACE_PROVIDER,
    templateReference: null,
    templateHash: null,
    deviceReference: deviceReference || null,
    metadata: {
      faceApi: {
        encryptedDescriptor,
        modelVersion: FACE_MODEL_VERSION,
        descriptorLength: FACE_DESCRIPTOR_LENGTH,
        enrolledAt: new Date().toISOString(),
        consentConfirmedAt: new Date().toISOString(),
      },
    },
    registeredById: userId ?? null,
  });

  await writeAudit(prisma, {
    companyId,
    actorUserId: userId,
    action: "CREATE",
    module: "biometrics",
    resource: "face-enrollment",
    resourceId: record.id,
    metadata: { employeeId, provider: FACE_PROVIDER, consentConfirmed: true, deviceReference: deviceReference || null },
  });

  return { biometricId: record.id, employee: employeePublic(employee), type: "FACE", provider: FACE_PROVIDER };
};

export const recognizeAndAttend = async (companyId, userId, rawDescriptor, input = {}, context = {}) => {
  if (!companyId) throw new AppError("Company context is required", 400, "COMPANY_CONTEXT_REQUIRED");
  const descriptor = validateDescriptor(rawDescriptor);
  const action = input.action === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
  const records = await repository.findActiveFacesByCompany(companyId);

  const matches = records
    .map((record) => ({ record, descriptor: getStoredDescriptor(record) }))
    .filter((entry) => entry.descriptor)
    .map(({ record, descriptor: enrolledDescriptor }) => ({
      record,
      distance: euclideanDistance(descriptor, enrolledDescriptor),
    }))
    .sort((a, b) => a.distance - b.distance);

  if (!matches.length || matches[0].distance > env.FACE_API_DISTANCE_THRESHOLD) {
    return { recognized: false, reason: matches.length ? "NO_CONFIDENT_MATCH" : "NO_ACTIVE_FACE_ENROLLMENTS" };
  }

  const best = matches[0];
  const secondBest = matches[1];
  if (secondBest && (secondBest.distance - best.distance) < AMBIGUITY_MARGIN) {
    return { recognized: false, reason: "AMBIGUOUS_MATCH" };
  }

  if (input.deviceReference) {
    const device = await prisma.attendanceDevice.findFirst({
      where: { companyId, deviceId: input.deviceReference, isActive: true },
    });
    if (!device) throw new AppError("Biometric device is not authorized for this company", 403, "DEVICE_NOT_AUTHORIZED");
  }

  const attendanceAction = action === "CHECK_OUT" ? checkOut : checkIn;
  const attendance = await attendanceAction({
    companyId,
    employeeId: best.record.employeeId,
    occurredAt: context.occurredAt || new Date(),
    source: "BIOMETRIC",
    deviceId: input.deviceReference || null,
    latitude: context.latitude,
    longitude: context.longitude,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  await repository.update(best.record.id, companyId, { lastVerifiedAt: new Date() });
  await writeAudit(prisma, {
    companyId,
    actorUserId: userId,
    action: action === "CHECK_OUT" ? "UPDATE" : "CREATE",
    module: "biometrics",
    resource: "face-attendance",
    resourceId: attendance.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      biometricId: best.record.id,
      employeeId: best.record.employeeId,
      distance: Number(best.distance.toFixed(5)),
      action,
      deviceReference: input.deviceReference || null,
    },
  });

  return {
    recognized: true,
    distance: Number(best.distance.toFixed(5)),
    threshold: env.FACE_API_DISTANCE_THRESHOLD,
    action,
    biometricId: best.record.id,
    employee: employeePublic(best.record.employee),
    attendance,
  };
};
