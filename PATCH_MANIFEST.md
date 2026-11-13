# EMS Backend Provider Funding and Payroll Fix

Root-relative overlay for the canonical `ems-backend-main` repository.

Includes:
- Flutterwave company subaccount setup and settlement allocation.
- Separate EMS internal-ledger funding vs external provider payout-account collection handling.
- Live Paystack/Monnify provider balance refresh integration support.
- Startup Prisma migration hook (`prestart` runs `prisma migrate deploy`).
- Retry UX/support for transient Monnify beneficiary code 99 is in the frontend overlay.

Apply only to the canonical backend already containing commit `0017233` (the payroll funding-route lock and migration). Do not extract over another source tree without reviewing it. Do not run `prisma migrate dev` against production Neon. For Render, use Start Command `npm start` (or configure Pre-Deploy Command `npm run prisma:deploy`) so the committed migrations are applied before the API starts.

The patch contains no `.git`, `.env`, `node_modules`, uploads, or database credentials.
