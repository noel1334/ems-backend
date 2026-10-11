ALTER TABLE "biometric_records" ADD COLUMN IF NOT EXISTS "finger" TEXT;
ALTER TABLE "biometric_records" ADD COLUMN IF NOT EXISTS "templateFormat" TEXT;
ALTER TABLE "biometric_records" ADD COLUMN IF NOT EXISTS "qualityScore" DECIMAL(5,4);
CREATE UNIQUE INDEX IF NOT EXISTS "biometric_records_companyId_type_templateHash_key" ON "biometric_records"("companyId", "type", "templateHash");
CREATE INDEX IF NOT EXISTS "biometric_records_companyId_type_finger_idx" ON "biometric_records"("companyId", "type", "finger");
