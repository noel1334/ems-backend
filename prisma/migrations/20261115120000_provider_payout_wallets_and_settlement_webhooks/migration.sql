-- Keep Flutterwave collection split accounts (RS_) separate from payout wallets (PSA...).
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutAccountReference" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBarterId" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutNuban" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBankName" TEXT,
  ADD COLUMN IF NOT EXISTS "flutterwavePayoutBankCode" TEXT;

-- Capture Monnify settlement destinations so a paid checkout is not confused with wallet funding.
ALTER TABLE "company_monnify_connections"
  ADD COLUMN IF NOT EXISTS "lastSettlementReference" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSettlementAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSettlementDestination" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSettlementSnapshot" JSONB;
