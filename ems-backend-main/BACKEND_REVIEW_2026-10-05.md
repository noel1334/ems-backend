# EMS backend review — 2026-10-05

## Findings fixed

- `SUPER_ADMIN` existed in the Prisma seed but access tokens previously required a company ID, so a true platform user could not authenticate. Platform authentication now permits a tenantless `SUPER_ADMIN` token and re-validates the role from the database for platform endpoints.
- Platform administration now has dedicated `/api/v1/platform/*` endpoints protected by `requireSuperAdmin`.
- Company self-service endpoints now require normal tenant authentication; tenant creation is a platform-only operation.
- Inventory had no Prisma-backed backend module. A company-scoped inventory module is now present with item/barcode lookup, locations, suppliers, receipts, adjustments, transactions, verification challenges and an immutable ledger.
- Store Keeper is now a system role with inventory permissions.
- Employee confirmation/dispute is enforced against the employee identity from the access token.
- ISSUE stock is reserved before employee confirmation. Final confirmation uses a PostgreSQL `FOR UPDATE` row lock and writes the inventory ledger atomically.
- Inventory biometric verification is short-lived and single-use. EMS stores provider/reference metadata, not raw fingerprint/face templates.

## Supabase/Lovable review

The frontend ZIP contained a generated Supabase integration and Lovable preview-auth/error-reporting artifacts. Those frontend artifacts were removed. The EMS frontend continues to use its own API/mock abstraction and does not require Supabase for application authentication.

The backend still contains an optional Supabase Storage adapter for employee documents/photos. That is storage, not application authentication or Lovable Cloud AI. It remains configurable through `STORAGE_PROVIDER=local|supabase` and was not removed from the backend because doing so would change the existing document-storage contract.

## Validation

- All backend JavaScript source files pass `node --check`.
- Prisma CLI validation could not be completed in this isolated review environment because dependency installation timed out before the Prisma CLI became available.
- A Prisma migration was added for all new inventory tables/enums/indexes/foreign keys.
- The frontend source was not rebuilt here because the uploaded ZIP does not contain `node_modules`; no application dependency installation was included in the deliverable.
