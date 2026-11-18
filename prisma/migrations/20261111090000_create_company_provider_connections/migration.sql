-- Create company-level Monnify connection settings.
CREATE TABLE "company_monnify_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "apiKeyCiphertext" TEXT NOT NULL,
    "apiSecretCiphertext" TEXT NOT NULL,
    "contractCodeCiphertext" TEXT NOT NULL,
    "sourceAccountNumber" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastKnownBalance" DECIMAL(18,2),
    "lastFundingCheckAt" TIMESTAMP(3),
    "lastSettlementLookupAt" TIMESTAMP(3),
    "lastSettlementReference" TEXT,
    "lastSettlementAt" TIMESTAMP(3),
    "lastSettlementDestination" TEXT,
    "lastSettlementSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_monnify_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_monnify_connections_companyId_key"
ON "company_monnify_connections"("companyId");

ALTER TABLE "company_monnify_connections"
ADD CONSTRAINT "company_monnify_connections_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


-- Create Monnify payroll payout batch records.
CREATE TABLE "company_monnify_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL DEFAULT 'SUBMITTING',
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "totalTransactions" INTEGER NOT NULL,
    "providerResponse" JSONB,
    "submittedBy" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_monnify_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_monnify_batches_batchReference_key"
ON "company_monnify_batches"("batchReference");

CREATE INDEX "company_monnify_batches_companyId_payrollPeriodId_createdAt_idx"
ON "company_monnify_batches"("companyId", "payrollPeriodId", "createdAt");

CREATE INDEX "company_monnify_batches_companyId_providerStatus_idx"
ON "company_monnify_batches"("companyId", "providerStatus");

ALTER TABLE "company_monnify_batches"
ADD CONSTRAINT "company_monnify_batches_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


-- Create company-level Paystack connection settings.
CREATE TABLE "company_paystack_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "secretKeyCiphertext" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastKnownBalance" DECIMAL(18,2),
    "lastFundingCheckAt" TIMESTAMP(3),
    "lastSettlementCheckAt" TIMESTAMP(3),
    "lastSettlementSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_paystack_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_paystack_connections_companyId_key"
ON "company_paystack_connections"("companyId");

ALTER TABLE "company_paystack_connections"
ADD CONSTRAINT "company_paystack_connections_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;


-- Create Paystack payroll payout batch records.
CREATE TABLE "company_paystack_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "batchReference" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL DEFAULT 'SUBMITTING',
    "environment" TEXT NOT NULL,
    "transferMode" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "totalTransactions" INTEGER NOT NULL,
    "providerResponse" JSONB,
    "submittedBy" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_paystack_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_paystack_batches_batchReference_key"
ON "company_paystack_batches"("batchReference");

CREATE INDEX "company_paystack_batches_companyId_payrollPeriodId_createdAt_idx"
ON "company_paystack_batches"("companyId", "payrollPeriodId", "createdAt");

CREATE INDEX "company_paystack_batches_companyId_providerStatus_idx"
ON "company_paystack_batches"("companyId", "providerStatus");

ALTER TABLE "company_paystack_batches"
ADD CONSTRAINT "company_paystack_batches_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
