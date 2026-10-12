-- Repair database drift seen on deployments where employees.employeeNumber is missing.
-- Existing employee numbers are preserved; only missing/blank values are backfilled.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employeeNumber" TEXT;

WITH missing AS (
  SELECT
    e."id",
    e."companyId",
    ROW_NUMBER() OVER (PARTITION BY e."companyId" ORDER BY e."createdAt", e."id") AS rn
  FROM "employees" e
  WHERE e."employeeNumber" IS NULL OR BTRIM(e."employeeNumber") = ''
), existing_max AS (
  SELECT
    "companyId",
    COALESCE(MAX(CASE WHEN "employeeNumber" ~ '^EMP-[0-9]+$' THEN SUBSTRING("employeeNumber" FROM 5)::BIGINT ELSE NULL END), 0) AS max_value
  FROM "employees"
  GROUP BY "companyId"
)
UPDATE "employees" e
SET "employeeNumber" = 'EMP-' || LPAD((COALESCE(existing_max.max_value, 0) + missing.rn)::TEXT, 6, '0')
FROM missing
LEFT JOIN existing_max ON existing_max."companyId" = missing."companyId"
WHERE e."id" = missing."id";

ALTER TABLE "employees" ALTER COLUMN "employeeNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "employees_companyId_employeeNumber_key"
  ON "employees"("companyId", "employeeNumber");
