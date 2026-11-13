-- Explicitly separate EMS internal-wallet payroll from company-owned provider payroll.
-- This migration adds a shared period lock so all payout services serialize against
-- the same payroll_period row, preventing cross-route double payment.
ALTER TABLE "payroll_periods"
  ADD COLUMN "payoutFundingRoute" TEXT,
  ADD COLUMN "payoutProvider" TEXT,
  ADD COLUMN "payoutRouteLockedAt" TIMESTAMP(3);

ALTER TABLE "payroll_disbursements"
  ADD COLUMN "fundingRoute" TEXT;

ALTER TABLE "payroll_payout_batches"
  ADD COLUMN "fundingRoute" TEXT NOT NULL DEFAULT 'EMS_WALLET';

-- Backfill the route classification on historical employee payment records.
UPDATE "payroll_disbursements"
SET "fundingRoute" = 'DIRECT_PROVIDER'
WHERE "provider" IN ('PAYSTACK_COMPANY', 'MONNIFY');

UPDATE "payroll_disbursements"
SET "fundingRoute" = 'EMS_WALLET'
WHERE "provider" IN ('PAYSTACK', 'FLUTTERWAVE');

ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_payoutFundingRoute_check"
  CHECK ("payoutFundingRoute" IS NULL OR "payoutFundingRoute" IN ('EMS_WALLET', 'DIRECT_PROVIDER'));

ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_payoutProvider_check"
  CHECK ("payoutProvider" IS NULL OR "payoutProvider" IN ('PAYSTACK', 'FLUTTERWAVE', 'MONNIFY'));

ALTER TABLE "payroll_disbursements"
  ADD CONSTRAINT "payroll_disbursements_fundingRoute_check"
  CHECK ("fundingRoute" IS NULL OR "fundingRoute" IN ('EMS_WALLET', 'DIRECT_PROVIDER'));

ALTER TABLE "payroll_payout_batches"
  ADD CONSTRAINT "payroll_payout_batches_fundingRoute_check"
  CHECK ("fundingRoute" IN ('EMS_WALLET', 'DIRECT_PROVIDER'));

CREATE INDEX "payroll_periods_payoutFundingRoute_payoutProvider_idx"
  ON "payroll_periods" ("payoutFundingRoute", "payoutProvider");
