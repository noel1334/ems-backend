-- Reconcile columns already declared in prisma/schema.prisma and used by
-- payroll-period and leave-type services, but absent from the original DB migration.

-- Payroll period lifecycle fields used by listing, activation and soft deletion.
ALTER TABLE "payroll_periods"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Leave policy fields used by the leave-type editor and leave request validation.
ALTER TABLE "leave_types"
  ADD COLUMN IF NOT EXISTS "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "requiresReason" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowHalfDay" BOOLEAN NOT NULL DEFAULT true;

-- Indexes support the active/deleted payroll-period queries and remain safe
-- if an index was already created manually in a live database.
CREATE INDEX IF NOT EXISTS "payroll_periods_companyId_deletedAt_startDate_idx"
  ON "payroll_periods" ("companyId", "deletedAt", "startDate");
CREATE INDEX IF NOT EXISTS "payroll_periods_companyId_isActive_startDate_idx"
  ON "payroll_periods" ("companyId", "isActive", "startDate");
