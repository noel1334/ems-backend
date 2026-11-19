-- EMS schema reconciliation based on the original prisma/schema.prisma.
-- This is deliberately additive and idempotent: it does not drop tables,
-- delete rows, or reset the live Neon database.

-- Provider-specific employee bank codes and cached Paystack recipient fields.
-- These fields are read by payroll payout preview when Prisma includes bankAccounts.
ALTER TABLE "employee_bank_accounts"
  ADD COLUMN IF NOT EXISTS "paystackBankCode" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwaveBankCode" TEXT,
  ADD COLUMN IF NOT EXISTS "paystackRecipientCode" TEXT,
  ADD COLUMN IF NOT EXISTS "paystackRecipientMode" TEXT,
  ADD COLUMN IF NOT EXISTS "paystackRecipientFingerprint" TEXT;

-- Complete the Paystack recipient cache model from the original Prisma schema.
CREATE TABLE IF NOT EXISTS "company_paystack_recipients" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeBankAccountId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "recipientCode" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_paystack_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_paystack_recipients_companyId_employeeBankAccountId_environment_key"
  ON "company_paystack_recipients" ("companyId", "employeeBankAccountId", "environment");
CREATE INDEX IF NOT EXISTS "company_paystack_recipients_employeeBankAccountId_idx"
  ON "company_paystack_recipients" ("employeeBankAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_paystack_recipients_companyId_fkey'
  ) THEN
    ALTER TABLE "company_paystack_recipients"
      ADD CONSTRAINT "company_paystack_recipients_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_paystack_recipients_employeeBankAccountId_fkey'
  ) THEN
    ALTER TABLE "company_paystack_recipients"
      ADD CONSTRAINT "company_paystack_recipients_employeeBankAccountId_fkey"
      FOREIGN KEY ("employeeBankAccountId") REFERENCES "employee_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- PayrollPeriod fields present in the original Prisma model and queried by
-- payroll listing, preview, activation and soft-deletion operations.
ALTER TABLE "payroll_periods"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutFundingRoute" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutRouteLockedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payroll_periods_companyId_deletedAt_startDate_idx"
  ON "payroll_periods" ("companyId", "deletedAt", "startDate");

-- LeaveType editor and validation fields from the original Prisma model.
ALTER TABLE "leave_types"
  ADD COLUMN IF NOT EXISTS "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "requiresReason" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allowHalfDay" BOOLEAN NOT NULL DEFAULT true;

-- Provider payout destination fields on Company. The earlier provider-wallet
-- migration should already add these; IF NOT EXISTS also repairs older DBs.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutAccountReference" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBarterId" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutNuban" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBankName" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBankCode" TEXT;

-- Keep the explicit payroll payout route fields aligned if an earlier deploy
-- recorded the route migration before all columns were present.
ALTER TABLE "payroll_disbursements"
  ADD COLUMN IF NOT EXISTS "fundingRoute" TEXT;

ALTER TABLE "payroll_payout_batches"
  ADD COLUMN IF NOT EXISTS "fundingRoute" TEXT NOT NULL DEFAULT 'EMS_WALLET';
