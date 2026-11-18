-- Create payroll payout batches before disbursements because
-- disbursements optionally reference a batch.

CREATE TABLE "payroll_payout_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "salaryAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reservedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "providerAvailableBalance" DECIMAL(18,2),
    "walletBalanceAtPreview" DECIMAL(18,2),
    "validationResults" JSONB,
    "preparationFingerprint" TEXT,
    "previewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payout_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_payout_batches_companyId_periodId_key"
ON "payroll_payout_batches"("companyId", "periodId");

CREATE INDEX "payroll_payout_batches_companyId_status_createdAt_idx"
ON "payroll_payout_batches"("companyId", "status", "createdAt");

CREATE INDEX "payroll_payout_batches_provider_status_createdAt_idx"
ON "payroll_payout_batches"("provider", "status", "createdAt");

ALTER TABLE "payroll_payout_batches"
ADD CONSTRAINT "payroll_payout_batches_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_payout_batches"
ADD CONSTRAINT "payroll_payout_batches_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


-- Create employee payroll disbursement records.
-- fundingRoute is intentionally added by the next migration.

CREATE TABLE "payroll_disbursements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "batchId" TEXT,
    "estimatedFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reservedFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualFeeAmount" DECIMAL(18,2),
    "feeReconciliationReference" TEXT,
    "feeReconciliationNote" TEXT,
    "feeReconciledAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
    "provider" TEXT,
    "providerTransferId" TEXT,
    "providerStatus" TEXT,
    "providerResponse" JSONB,
    "failureReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_disbursements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_disbursements_payrollItemId_key"
ON "payroll_disbursements"("payrollItemId");

CREATE UNIQUE INDEX "payroll_disbursements_companyId_externalReference_key"
ON "payroll_disbursements"("companyId", "externalReference");

CREATE INDEX "payroll_disbursements_companyId_periodId_status_idx"
ON "payroll_disbursements"("companyId", "periodId", "status");

CREATE INDEX "payroll_disbursements_employeeId_idx"
ON "payroll_disbursements"("employeeId");

CREATE INDEX "payroll_disbursements_batchId_status_idx"
ON "payroll_disbursements"("batchId", "status");

ALTER TABLE "payroll_disbursements"
ADD CONSTRAINT "payroll_disbursements_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_disbursements"
ADD CONSTRAINT "payroll_disbursements_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_disbursements"
ADD CONSTRAINT "payroll_disbursements_payrollItemId_fkey"
FOREIGN KEY ("payrollItemId") REFERENCES "payroll_items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_disbursements"
ADD CONSTRAINT "payroll_disbursements_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_disbursements"
ADD CONSTRAINT "payroll_disbursements_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "payroll_payout_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;


-- Create individual provider payout attempts.
CREATE TABLE "payroll_payout_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "disbursementId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "providerTransferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "estimatedFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualFeeAmount" DECIMAL(18,2),
    "providerResponse" JSONB,
    "failureReason" TEXT,
    "createdBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payout_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_payout_attempts_externalReference_key"
ON "payroll_payout_attempts"("externalReference");

CREATE UNIQUE INDEX "payroll_payout_attempts_disbursementId_attemptNumber_key"
ON "payroll_payout_attempts"("disbursementId", "attemptNumber");

CREATE INDEX "payroll_payout_attempts_companyId_status_createdAt_idx"
ON "payroll_payout_attempts"("companyId", "status", "createdAt");

CREATE INDEX "payroll_payout_attempts_disbursementId_status_idx"
ON "payroll_payout_attempts"("disbursementId", "status");

ALTER TABLE "payroll_payout_attempts"
ADD CONSTRAINT "payroll_payout_attempts_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_payout_attempts"
ADD CONSTRAINT "payroll_payout_attempts_disbursementId_fkey"
FOREIGN KEY ("disbursementId") REFERENCES "payroll_disbursements"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


-- Store provider webhook events with idempotency protection.
CREATE TABLE "payroll_payout_webhook_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "transferReference" TEXT,
    "providerTransferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "message" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payout_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_payout_webhook_events_provider_eventKey_key"
ON "payroll_payout_webhook_events"("provider", "eventKey");

CREATE INDEX "payroll_payout_webhook_events_companyId_provider_status_idx"
ON "payroll_payout_webhook_events"("companyId", "provider", "status");

CREATE INDEX "payroll_payout_webhook_events_provider_status_receivedAt_idx"
ON "payroll_payout_webhook_events"("provider", "status", "receivedAt");

CREATE INDEX "payroll_payout_webhook_events_transferReference_idx"
ON "payroll_payout_webhook_events"("transferReference");

ALTER TABLE "payroll_payout_webhook_events"
ADD CONSTRAINT "payroll_payout_webhook_events_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
