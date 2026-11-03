import crypto from "node:crypto";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { checkIn, checkOut } from "../attendance/attendance.service.js";

const hashKey = (key) => crypto.createHash("sha256").update(key).digest("hex");
const generateKey = () => `ems_dev_${crypto.randomBytes(32).toString("base64url")}`;

export const registerDevice = async (companyId, userId, input) => {
  if (!companyId) throw new AppError("Company context is required", 400);
  if (!input.deviceId) throw new AppError("deviceId is required", 400);
  const existing = await prisma.attendanceDevice.findFirst({ where: { companyId, deviceId: input.deviceId } });
  if (existing) throw new AppError("Attendance device already exists", 409, "DEVICE_EXISTS");
  const apiKey = generateKey();
  const device = await prisma.attendanceDevice.create({
    data: {
      companyId,
      name: input.name,
      deviceId: input.deviceId,
      deviceType: input.deviceType ?? "BIOMETRIC_GATEWAY",
      metadata: input.metadata ?? undefined,
      credentials: { create: { name: input.credentialName ?? "Primary device credential", keyHash: hashKey(apiKey) } },
    },
    include: { credentials: true },
  });
  await writeAudit(prisma, { companyId, actorUserId: userId, action: "CREATE", module: "attendance_devices", resource: "device", resourceId: device.id, metadata: { deviceId: input.deviceId, deviceType: device.deviceType } });
  return { id: device.id, name: device.name, deviceId: device.deviceId, deviceType: device.deviceType, isActive: device.isActive, apiKey };
};

export const authenticateDevice = async (apiKey) => {
  if (!apiKey) throw new AppError("Device API key is required", 401, "DEVICE_KEY_REQUIRED");
  const credential = await prisma.attendanceDeviceCredential.findUnique({ where: { keyHash: hashKey(apiKey) }, include: { attendanceDevice: true } });
  if (!credential?.isActive || !credential.attendanceDevice?.isActive || !credential.attendanceDevice.deviceId) throw new AppError("Invalid or inactive device credential", 401, "DEVICE_UNAUTHORIZED");
  await prisma.attendanceDeviceCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  return credential.attendanceDevice;
};

export const heartbeat = async (device) => ({ ok: true, deviceId: device.deviceId, serverTime: new Date().toISOString() });

export const rotateCredential = async (companyId, userId, deviceId, credentialId) => {
  const device = await prisma.attendanceDevice.findFirst({ where: { id: deviceId, companyId, isActive: true }, include: { credentials: true } });
  if (!device) throw new AppError("Attendance device not found", 404, "DEVICE_NOT_FOUND");
  const credential = device.credentials.find((item) => item.id === credentialId && item.isActive);
  if (!credential) throw new AppError("Active device credential not found", 404, "DEVICE_CREDENTIAL_NOT_FOUND");
  const apiKey = generateKey();
  await prisma.$transaction([
    prisma.attendanceDeviceCredential.update({ where: { id: credential.id }, data: { isActive: false } }),
    prisma.attendanceDeviceCredential.create({ data: { attendanceDeviceId: device.id, name: `${credential.name} (rotated)`, keyHash: hashKey(apiKey) } }),
  ]);
  await writeAudit(prisma, { companyId, actorUserId: userId, action: "UPDATE", module: "attendance_devices", resource: "credential", resourceId: credential.id, metadata: { deviceId: device.id, event: "ROTATE" } });
  return { deviceId: device.id, credentialId: credential.id, apiKey };
};

export const processRecognitionEvent = async ({ device, input, ipAddress, userAgent }) => {
  if (!input.templateReference) throw new AppError("templateReference is required", 400, "TEMPLATE_REFERENCE_REQUIRED");
  if (!input.type || !["FACE", "FINGERPRINT"].includes(input.type)) throw new AppError("type must be FACE or FINGERPRINT", 400);
  const record = await prisma.biometricRecord.findFirst({ where: { companyId: device.companyId, type: input.type, status: "ACTIVE", templateReference: input.templateReference }, include: { employee: true } });
  if (!record) return { verified: false, reason: "NO_MATCH" };
  if (record.deviceReference && record.deviceReference !== device.deviceId) return { verified: false, reason: "DEVICE_MISMATCH" };
  if (input.confidence != null && input.confidence < (input.threshold ?? 0.8)) return { verified: false, reason: "LOW_CONFIDENCE", confidence: input.confidence };

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  let attendance;
  let action = input.action ?? "AUTO";
  if (action === "AUTO") {
    const existing = await prisma.attendance.findFirst({ where: { companyId: device.companyId, employeeId: record.employeeId, checkInAt: { not: null }, checkOutAt: null, isLocked: false }, orderBy: { attendanceDate: "desc" } });
    action = existing ? "CHECK_OUT" : "CHECK_IN";
  }
  const common = { companyId: device.companyId, employeeId: record.employeeId, occurredAt, source: "BIOMETRIC", deviceId: device.deviceId, ipAddress, userAgent, latitude: input.latitude, longitude: input.longitude, notes: input.notes };
  attendance = action === "CHECK_OUT" ? await checkOut(common) : await checkIn(common);
  await prisma.biometricRecord.update({ where: { id: record.id }, data: { lastVerifiedAt: new Date() } });
  await writeAudit(prisma, { companyId: device.companyId, action: "CREATE", module: "attendance_devices", resource: "recognition_event", resourceId: attendance.id, ipAddress, userAgent, metadata: { deviceId: device.deviceId, biometricId: record.id, employeeId: record.employeeId, type: input.type, action, confidence: input.confidence ?? null } });
  return { verified: true, action, confidence: input.confidence ?? null, employee: { id: record.employee.id, employeeNumber: record.employee.employeeNumber, firstName: record.employee.firstName, middleName: record.employee.middleName, lastName: record.employee.lastName }, attendance };
};
