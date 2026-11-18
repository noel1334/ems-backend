# EMS backend payroll funding-routes patch

This is a root-relative overlay patch for the canonical `ems-backend-main` project.

It adds the shared per-payroll-period funding-route/provider lock, classifies EMS-wallet and company-direct provider payouts, fixes the Flutterwave EMS-wallet balance lookup, adds the Prisma migration and adds unit tests.

This patch intentionally contains no `.env`, `.git`, `node_modules`, uploads, unrelated source snapshots, deletion instructions, or replacement copy of `SOURCE_SELECTION.md`.

Apply the migration through the production release process before the new application code handles payroll requests. Do not use `prisma migrate dev` against Neon production.
