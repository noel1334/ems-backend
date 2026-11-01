import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "prisma", "schema.prisma");
let schema = fs.readFileSync(file, "utf8");
function ensureModelFields(modelName, fields) {
  const start = schema.indexOf(`model ${modelName} {`);
  if (start < 0) throw new Error(`Could not find ${modelName} model in prisma/schema.prisma`);
  const end = schema.indexOf("\n}", start);
  if (end < 0) throw new Error(`Could not find end of ${modelName} model`);
  let block = schema.slice(start, end);
  const lines = block.split("\n");
  const names = new Set(fields.map((entry) => entry.name));
  const retained = lines.filter((line) => ![...names].some((name) => new RegExp(`^\\s*${name}\\s+`).test(line)));
  let insertAt = retained.findIndex((line) => /^\s*@@/.test(line));
  if (insertAt < 0) insertAt = retained.length;
  retained.splice(insertAt, 0, ...fields.map((entry) => `  ${entry.name.padEnd(29, " ")}${entry.type}`));
  const nextBlock = retained.join("\n");
  schema = schema.slice(0, start) + nextBlock + schema.slice(end);
}

ensureModelFields("Company", [
  { name: "paystackCompanyConnection", type: "CompanyPaystackConnection?" },
  { name: "paystackCompanyBatches", type: "CompanyPaystackBatch[]" },
  { name: "paystackCompanyRecipients", type: "CompanyPaystackRecipient[]" },
]);
ensureModelFields("EmployeeBankAccount", [
  { name: "companyPaystackRecipients", type: "CompanyPaystackRecipient[]" },
]);

if (!schema.includes("model CompanyPaystackConnection {")) {
  schema += `\n\nmodel CompanyPaystackConnection {
  id                  String   @id @default(uuid())
  companyId           String   @unique
  secretKeyCiphertext String
  keyLast4            String
  environment         String   @default("test")
  isActive            Boolean  @default(true)
  lastTestedAt        DateTime?
  lastKnownBalance    Decimal? @db.Decimal(18, 2)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  company             Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@map("company_paystack_connections")
}
`;
}
if (!schema.includes("model CompanyPaystackBatch {")) {
  schema += `\n\nmodel CompanyPaystackBatch {
  id                String   @id @default(uuid())
  companyId         String
  payrollPeriodId   String
  batchReference    String   @unique
  providerStatus    String   @default("SUBMITTING")
  environment       String
  transferMode      String
  totalAmount       Decimal  @db.Decimal(18, 2)
  totalTransactions Int
  providerResponse  Json?
  submittedBy       String?
  authorizedAt      DateTime?
  lastCheckedAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  company           Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@index([companyId, payrollPeriodId, createdAt])
  @@index([companyId, providerStatus])
  @@map("company_paystack_batches")
}
`;
}
if (!schema.includes("model CompanyPaystackRecipient {")) {
  schema += `\n\nmodel CompanyPaystackRecipient {
  id                    String                @id @default(uuid())
  companyId             String
  employeeBankAccountId String
  environment           String
  recipientCode         String
  fingerprint           String
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt
  company               Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  employeeBankAccount  EmployeeBankAccount   @relation(fields: [employeeBankAccountId], references: [id], onDelete: Cascade)
  @@unique([companyId, employeeBankAccountId, environment])
  @@index([employeeBankAccountId])
  @@map("company_paystack_recipients")
}
`;
}

fs.writeFileSync(file, schema);
console.log("OK Company Paystack connection, batch and tenant-scoped recipient models and relations added (idempotent).");
