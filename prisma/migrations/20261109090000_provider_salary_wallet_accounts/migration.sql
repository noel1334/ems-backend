-- Separate tenant salary-ledger accounts. Existing wallet.balance remains GENERAL.
-- Existing balances are deliberately not copied into either provider account.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MONNIFY';

CREATE TYPE "WalletAccount" AS ENUM ('GENERAL', 'PAYSTACK', 'MONNIFY');

ALTER TABLE "wallets"
  ADD COLUMN "paystackBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "monnifyBalance" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "wallet_ledger_entries"
  ADD COLUMN "account" "WalletAccount" NOT NULL DEFAULT 'GENERAL';
