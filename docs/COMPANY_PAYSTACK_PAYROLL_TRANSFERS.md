# Tenant-owned Paystack salary transfers

## Purpose and separation

This is a separate direct-provider payout rail alongside the existing EMS wallet payout flow and Monnify. Each tenant stores its own Paystack **secret key** in `CompanyPaystackConnection`; the value is encrypted at rest and never returned by the API. All Paystack requests in this module use that tenant's decrypted key. The module does not read `PAYSTACK_SECRET_KEY` and does not debit the EMS internal wallet.

Paystack's transfer API uses `source: "balance"`. That means the money comes from the tenant's Paystack NGN balance. It does **not** pull money automatically from the tenant's ordinary bank account. The tenant must have Paystack Transfers enabled and fund its Paystack balance before live payouts.

## Provider requirements

- A company enters a server-side Paystack secret key beginning with `sk_test_` or `sk_live_`. Public keys are rejected.
- The environment is inferred from the secret-key prefix, not selected manually.
- Test mode uses Paystack's test/sandbox transfer behavior. A test-mode `success` is recorded as `TEST_SUCCESS`/`PROCESSING`, never as a real payroll `PAID` state.
- Live mode requires the individual tenant's Paystack business account to be approved/enabled for Transfers.
- Paystack requires a recipient to be created with `type: nuban`, account number, bank code, and NGN currency. Recipient codes are cached on the employee bank account but the cache fingerprint is keyed by the tenant's Paystack secret and environment, so changing the tenant key invalidates the cached recipient.
- Amounts are converted to integer kobo using decimal arithmetic. References are generated uniquely for each employee payment.
- A one-employee payroll uses `POST /transfer`. If Paystack returns `otp`, the company administrator enters the OTP sent by Paystack and EMS calls `/transfer/finalize_transfer`.
- A payroll with multiple employees uses `POST /transfer/bulk`. Each provider request contains at most 100 transfers. For larger payrolls, EMS partitions the register into batches of 100 and waits at least five seconds between requests, as Paystack documents. Each chunk's references and state are saved before the provider request so partial submission can be reconciled.
- Paystack bulk transfers require Transfers OTP to be disabled in the company's own Paystack Dashboard. EMS does not disable or bypass this setting. If the provider rejects bulk transfer because OTP/transfer approval is enabled, EMS displays an actionable error.
- Live account Name Enquiry is performed before submission and the resolved name is compared with the saved employee name. Sandbox resolution is skipped by default because test keys and demo bank accounts may not support real account lookups.
- `transfer.success`, `transfer.failed`, and `transfer.reversed` webhooks are authenticated with the matching tenant's encrypted secret key. EMS then verifies the reference, NGN currency and exact kobo amount against that same tenant's Paystack API before updating the disbursement. Configure each tenant's Paystack Dashboard webhook URL as `https://YOUR-API-HOST/api/v1/payments/webhooks/paystack`. The shared Paystack webhook path remains available for the existing platform Paystack payment integration.
- A disbursement is marked `PAID` only after a verified live Paystack transfer reports `success`. `pending`, `otp`, and other non-final states are not marked paid. Failed/reversed states are recorded as failed for review.

## Encryption key

Use one persistent 32-byte key (64 hexadecimal characters) on every backend instance. The module prefers `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` and, only when it is absent, falls back to `MONNIFY_CREDENTIALS_ENCRYPTION_KEY`. Decide which value to use before a company first saves its Paystack key. If using the fallback, retain the existing Monnify key. If adding a separate `PAYMENT_CREDENTIALS_ENCRYPTION_KEY`, set it on Render before any company connects Paystack. Changing or introducing a different value later makes previously saved Paystack credentials unreadable until they are re-encrypted. **Do not rotate the key unless you implement and run a credential re-encryption procedure.** Never commit actual keys or paste them into chat.

## API

Mounted under `/api/v1/payroll/paystack-company`:

- `GET /connection`
- `PUT /connection` body `{ "secretKey": "sk_test_..." }`
- `DELETE /connection`
- `POST /connection/test`
- `GET /banks`
- `GET /batches`
- `POST /payroll/preview` body `{ "payrollPeriodId": "..." }`
- `POST /payroll/submit` body `{ "payrollPeriodId": "...", "previewFingerprint": "..." }`
- `POST /batches/:id/authorize` body `{ "otp": "..." }`
- `POST /batches/:id/refresh`

All routes require authentication and payroll READ or APPROVE permission. Company scope is taken from the authenticated user; the client cannot supply a different company ID.

## Prisma

Run `node scripts/add-company-paystack-schema.mjs` once after applying the patch. The script adds the two models and Company relations without overwriting the rest of the schema. Then run `npx prisma format`, `npx prisma validate`, `npx prisma generate`, and `npx prisma db push`.

## Important limitations / operational checklist

1. Paystack's transfer source is its Paystack balance, not a linked ordinary bank account.
2. Every company has to enable Paystack Transfers on its own Paystack business profile. This cannot be enabled by entering a secret key alone.
3. For **bulk** salary payments, the tenant must disable Transfers OTP in its Paystack Dashboard. This removes an approval gate, so the tenant must make that security decision itself. For a single beneficiary, OTP is supported in EMS.
4. Paystack bulk requests are capped at 100 transactions. EMS splits larger registers into sequential chunks, waits at least five seconds between chunks, and persists the per-employee references before each request. If a chunk is definitively rejected, that chunk remains pending and the batch is reported as `COMPLETED_WITH_ERRORS` after the accepted transfers are reconciled. If the result is ambiguous (for example, a network timeout), the batch remains locked for reconciliation.
5. Paystack transfer fees are charged in addition to salary principal. Preview estimates Nigerian fees using the existing configurable EMS payout fee helper. The provider remains authoritative for actual charges and available balance. Confirm the tenant's current fee agreement and any applicable stamp duty before live payouts.
6. Sandbox success is a simulation. Only a live, verified successful transfer changes the EMS payroll/disbursement state to `PAID`.
7. Backend build/tests and frontend build do not prove a live bank credit. First use a test key and a Paystack test account, then use a live account only after the tenant's transfer eligibility is approved.
8. `CompanyPaystackBatch` locks an unresolved batch. Do not retry a request marked `SUBMISSION_UNKNOWN` or `AWAITING_VERIFICATION` until it has been reconciled with Paystack; this prevents duplicate salaries when the provider response times out.
9. Paystack's optional Transfer Approval URL callback is not implemented in this release. Do not configure that callback for the tenant's account with this integration. Webhook status notifications are supported; the admin can also run manual verification from EMS.

## Research references

Official Paystack documentation used for this integration:

- Bulk transfers: https://paystack.com/docs/transfers/bulk-transfers/
- Single transfers: https://paystack.com/docs/transfers/single-transfers/
- How transfers work, statuses and webhooks: https://paystack.com/docs/transfers/how-transfers-work/
- Transfer recipients: https://paystack.com/docs/api/transfer-recipient/
- API reference: https://paystack.com/docs/api/transfer/

GitHub implementation references reviewed:

- PaystackHQ official documentation repository: https://github.com/PaystackHQ/documentation
- PaystackOSS official Node SDK: https://github.com/PaystackOSS/paystack-node
- PaystackOSS Python API client: https://github.com/PaystackOSS/paystack-python
- Community Node transfer wrapper: https://github.com/Lekky71/paystack-transfer
- Community Node wrapper with single/bulk helpers: https://github.com/stitchng/paystack

The official Paystack docs and official SDK/repository establish the supported API sequence. The community repositories are implementation examples/wrappers, not independent evidence that a particular EMS payroll deployment has completed production salary payments.
