ALTER TABLE "employee_bank_accounts"
  ADD COLUMN IF NOT EXISTS "monnifyBankCode" TEXT,
  ADD COLUMN IF NOT EXISTS "monnifyVerifiedAt" TIMESTAMP(3);
