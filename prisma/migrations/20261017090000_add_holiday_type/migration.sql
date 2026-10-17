-- Add the holiday classification already consumed by the holiday API service.
-- This is safe to retry if a deployment was partially applied manually.
DO $$
BEGIN
  CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'COMPANY', 'OPTIONAL', 'RELIGIOUS', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "holidays"
  ADD COLUMN IF NOT EXISTS "holidayType" "HolidayType" NOT NULL DEFAULT 'COMPANY';
