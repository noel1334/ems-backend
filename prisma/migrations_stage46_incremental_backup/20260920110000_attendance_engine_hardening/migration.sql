-- Stage 24: complete automatic attendance engine hardening
ALTER TABLE "attendances"
ADD COLUMN IF NOT EXISTS "earlyDepartureMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "attendances_company_status_date_idx"
ON "attendances" ("companyId", "status", "attendanceDate");

CREATE INDEX IF NOT EXISTS "attendance_events_device_occurred_idx"
ON "attendance_events" ("deviceId", "occurredAt");
