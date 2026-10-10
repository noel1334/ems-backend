CREATE TYPE "InventoryTransactionType" AS ENUM ('ISSUE', 'RETURN');
CREATE TYPE "InventoryTransactionStatus" AS ENUM ('PENDING_EMPLOYEE_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'CANCELLED');
CREATE TYPE "InventoryLedgerType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'LOSS');
CREATE TYPE "InventoryVerificationMethod" AS ENUM ('FINGERPRINT', 'FACE');
CREATE TYPE "InventoryVerificationStatus" AS ENUM ('VERIFIED', 'EXPIRED', 'USED');

CREATE TABLE "inventory_locations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_locations_companyId_code_key" ON "inventory_locations"("companyId","code");
CREATE INDEX "inventory_locations_companyId_isActive_idx" ON "inventory_locations"("companyId","isActive");
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_suppliers" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_suppliers_companyId_name_key" ON "inventory_suppliers"("companyId","name");
CREATE INDEX "inventory_suppliers_companyId_isActive_idx" ON "inventory_suppliers"("companyId","isActive");
ALTER TABLE "inventory_suppliers" ADD CONSTRAINT "inventory_suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT,
  "sku" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'piece',
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "minimumQuantity" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_companyId_sku_key" ON "inventory_items"("companyId","sku");
CREATE UNIQUE INDEX "inventory_items_companyId_barcode_key" ON "inventory_items"("companyId","barcode");
CREATE INDEX "inventory_items_companyId_isActive_idx" ON "inventory_items"("companyId","isActive");
CREATE INDEX "inventory_items_companyId_locationId_idx" ON "inventory_items"("companyId","locationId");
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "inventory_verifications" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "method" "InventoryVerificationMethod" NOT NULL,
  "biometricId" TEXT NOT NULL,
  "provider" TEXT,
  "verificationReference" TEXT NOT NULL,
  "status" "InventoryVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_verifications_verificationReference_key" ON "inventory_verifications"("verificationReference");
CREATE INDEX "inventory_verifications_companyId_employeeId_status_idx" ON "inventory_verifications"("companyId","employeeId","status");
CREATE INDEX "inventory_verifications_expiresAt_idx" ON "inventory_verifications"("expiresAt");
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_transactions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "storekeeperId" TEXT NOT NULL,
  "locationId" TEXT,
  "verificationId" TEXT NOT NULL,
  "type" "InventoryTransactionType" NOT NULL,
  "status" "InventoryTransactionStatus" NOT NULL DEFAULT 'PENDING_EMPLOYEE_CONFIRMATION',
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "employeeNote" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_transactions_verificationId_key" ON "inventory_transactions"("verificationId");
CREATE INDEX "inventory_transactions_companyId_status_createdAt_idx" ON "inventory_transactions"("companyId","status","createdAt");
CREATE INDEX "inventory_transactions_companyId_employeeId_createdAt_idx" ON "inventory_transactions"("companyId","employeeId","createdAt");
CREATE INDEX "inventory_transactions_companyId_itemId_createdAt_idx" ON "inventory_transactions"("companyId","itemId","createdAt");
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_storekeeperId_fkey" FOREIGN KEY ("storekeeperId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "inventory_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_ledger_entries" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "transactionId" TEXT,
  "supplierId" TEXT,
  "actorUserId" TEXT,
  "type" "InventoryLedgerType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_ledger_entries_transactionId_key" ON "inventory_ledger_entries"("transactionId");
CREATE INDEX "inventory_ledger_entries_companyId_itemId_createdAt_idx" ON "inventory_ledger_entries"("companyId","itemId","createdAt");
CREATE INDEX "inventory_ledger_entries_companyId_type_createdAt_idx" ON "inventory_ledger_entries"("companyId","type","createdAt");
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "inventory_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
