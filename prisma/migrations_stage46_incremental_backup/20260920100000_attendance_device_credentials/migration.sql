CREATE TABLE "attendance_device_credentials" (
  "id" TEXT NOT NULL,
  "attendanceDeviceId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_device_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_device_credentials_keyHash_key" ON "attendance_device_credentials"("keyHash");
CREATE INDEX "attendance_device_credentials_attendanceDeviceId_idx" ON "attendance_device_credentials"("attendanceDeviceId");
ALTER TABLE "attendance_device_credentials" ADD CONSTRAINT "attendance_device_credentials_attendanceDeviceId_fkey" FOREIGN KEY ("attendanceDeviceId") REFERENCES "attendance_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
