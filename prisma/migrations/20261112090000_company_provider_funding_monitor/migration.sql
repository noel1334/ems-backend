ALTER TABLE "company_monnify_connections"
  ADD COLUMN IF NOT EXISTS "lastKnownBalance" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "lastFundingCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSettlementLookupAt" TIMESTAMP(3);

ALTER TABLE "company_paystack_connections"
  ADD COLUMN IF NOT EXISTS "lastFundingCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSettlementCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSettlementSnapshot" JSONB;
