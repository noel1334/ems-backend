# Monnify salary batch disbursement fix

## What was inspected

The current and previous backend archives were compared alongside the current and previous frontend archives. The Monnify bulk-payroll service in the current backend still uses the connected company's Monnify disbursement account (`sourceAccountNumber`), checks its live available balance, performs server-side bank/account validation, submits the eligible employees as a Monnify batch, and reconciles the provider's transaction results. The individual-transfer retry uses the same company's Monnify connection.

The newer backend added a shared funding-route lock to prevent the same payroll period from being paid through multiple providers or funding sources. In the route-history check, however, a legacy `PayrollPayoutBatch` in `PREPARED` state (and, similarly, `APPROVED` before execution) was treated as proof that EMS Wallet Payroll had already been used. The payroll service creates those states when it previews or approves the batch; at that point `reservedAmount` is zero, `executedAt` is null, and no `PAYROLL-BATCH-<batch-id>` wallet reservation ledger entry exists. A preview/approval alone therefore did not move funds, but it could prevent the new Monnify Direct Provider route from being claimed.

## Correction

The route-history inference now ignores only a legacy `PREPARED` or `APPROVED` batch when all of these conditions are true:

- `reservedAmount` is zero;
- `executedAt` is null; and
- no wallet-ledger reservation exists for `PAYROLL-BATCH-<batch-id>`.

The route remains locked when a reservation exists, the batch has a non-zero reserved amount, it has an execution timestamp, or it has moved to another state (including processing/failed/complete/uncertain states). Existing provider-specific batches and non-pending disbursements continue to block conflicting routes. This is intended to restore the valid first Monnify bulk submission without weakening duplicate-payment safeguards.

The current frontend API calls were already mapped to the correct Monnify payroll endpoints. The only frontend change is explanatory UI copy so it no longer says an unexecuted preview permanently locks a route.

## Checks performed

- `node --check` passed for the updated funding-route module, focused unit-test file, Monnify service, and Monnify verification scripts.
- `scripts/verify-monnify-bank-flow.mjs` passed.
- `scripts/verify-monnify-integration.mjs` passed.
- `scripts/verify-monnify-payroll-automation.mjs` passed.
- The focused Vitest suite was not executed in this container because dependencies (`node_modules`) are not included in the source archive. The unit tests were updated to cover uncommitted previews, reservation-backed batches, and non-zero reservations.

No live Monnify transfer was initiated during this source review. Verify the deployed API using your sandbox first, then perform a small controlled live payroll batch only after confirming provider balance, beneficiaries, and batch status.

## Deployment

No new database migration was added by this correction. The existing migration `20261113090000_separate_payroll_funding_routes` is still required by this current backend and must already have been deployed to the target database. The backend's configured prestart hook runs `prisma migrate deploy`; do not run `prisma migrate dev` against production.
