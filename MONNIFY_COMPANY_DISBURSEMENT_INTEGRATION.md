# EMS Monnify company disbursement integration

This release adds company-scoped Monnify credentials, encrypted at rest with AES-256-GCM, connection testing, bank listing, v2 account Name Enquiry, bulk batch submission, OTP authorization, and batch status/transaction retrieval.

## Important scope and live-money safeguards

- Every connection is keyed by the authenticated `companyId`; the API never accepts a company ID from the request body.
- Credentials are never returned to the frontend. `MONNIFY_CREDENTIALS_ENCRYPTION_KEY` must be a stable 32-byte base64 key or 64-character hex key. Losing/changing it makes saved credentials undecryptable.
- Batch submissions are locked in the database before calling Monnify. If the provider outcome is uncertain, the batch is marked `SUBMISSION_UNKNOWN`; do not submit again until the reference is checked with Monnify.
- OTP authorization is available only for batches in `PENDING_AUTHORIZATION`.
- This release exposes a company-scoped Monnify batch API. It does not yet automatically convert EMS `PayrollDisbursement` rows into Monnify batch entries or reconcile individual Monnify transaction outcomes into EMS payroll statuses. Do not use it as the production payroll execute path until that adapter and end-to-end tests are completed.
- Live transfers require Monnify to approve third-party disbursements and whitelist a stable outbound server IP. Test with sandbox credentials first.
- `contractCode` is encrypted and retained as company connection metadata. The API uses API key/secret authentication as documented by Monnify.

## Backend environment

Generate a persistent encryption key once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set the output as `MONNIFY_CREDENTIALS_ENCRYPTION_KEY` in Render. Never rotate it without decrypting/re-encrypting all company credentials.

## Apply database changes

The project currently uses `prisma db push` in its deployment workflow. After applying the ZIP:

```bash
npm ci
npx prisma validate
npx prisma generate
npx prisma db push
node scripts/verify-monnify-integration.mjs
node --check src/modules/payments/monnify/monnify.service.js
node --check src/modules/payments/monnify/monnify.client.js
node --check src/modules/payments/monnify/monnify.routes.js
npm test
```

## API endpoints

All routes are under `/api/v1/payroll/monnify` and require authentication plus payroll read/approval permissions:

- `GET /connection`
- `PUT /connection` body: `apiKey`, `apiSecret`, `contractCode`, `sourceAccountNumber`, `environment` (`sandbox` or `live`)
- `DELETE /connection`
- `POST /connection/test`
- `GET /banks`
- `POST /account-validation` body: `accountNumber`, `bankCode`
- `GET /batches`
- `POST /batches` body: `payrollPeriodId`, `transactions[]` (`reference`, `amount`, `accountNumber`, `bankCode`, `accountName`, optional `narration`)
- `POST /batches/:id/authorize` body: `otp`
- `POST /batches/:id/refresh`

The API is deliberately not wired into the existing payroll execute button in this release. That integration requires mapping and updating existing `PayrollDisbursement` and `PayrollPayoutAttempt` records transaction-by-transaction, with reconciliation tests before live activation.
