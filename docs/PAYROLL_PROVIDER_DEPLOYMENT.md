# Payroll provider deployment notes

## Database migration ordering

The payroll funding-route lock depends on the columns added by
`20261113090000_separate_payroll_funding_routes`. A Render restart or source deploy alone does
not update Neon. The `prestart` npm lifecycle hook now runs `npm run prisma:deploy` before
`npm start`, so pending checked-in migrations are applied before the API begins accepting
requests. If the migration command fails, the service intentionally does not start.

Render must provide the production `DATABASE_URL` (and any provider credentials) to the
service. Confirm that the deployment logs show Prisma migrations completed before the server
starts. Do not manually add the columns in the Neon SQL editor: Prisma must record the migration
in `_prisma_migrations`.

## Monnify code 99

Monnify code 99 is treated as a transient Name Enquiry failure, not an invalid beneficiary.
Re-run the validation preview to retry Name Enquiry. Employees still marked `RETRY_REQUIRED`
are excluded from that batch. Only submit employees shown as `VALID`.

## Provider funding balances

- EMS internal wallet balances are tenant ledger allocations.
- Paystack transfer balance and Monnify disbursement-wallet available balance are external
  provider balances and are read from the provider APIs.
- Successful checkout does not itself prove that an amount is already available for payroll.
  The company must wait for the provider's settlement and refresh the actual available balance.
- Monnify ledger balance and settlement history are informational; the live disbursement wallet
  available balance is used for payroll preflight.
