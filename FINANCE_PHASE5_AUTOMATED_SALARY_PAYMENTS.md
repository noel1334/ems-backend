# EMS Finance Phase 5 — Automated Salary Payments

This patch is based on the latest uploaded `ems-backend-main` source. That source already contains the payout service, transfer clients, route/controller wiring, employee provider-specific bank-code fields, and Prisma `PayrollDisbursement` provider columns. The archive carries the required payout files so they can be installed into the backend project without replacing `prisma/schema.prisma`.

## Workflow

1. Finalize payroll and prepare its disbursement register.
2. Ensure the company EMS wallet has sufficient available balance.
3. Ensure every employee has an active primary bank account with a correct provider-specific bank code.
4. An authorized payroll approver explicitly confirms a Paystack or Flutterwave payout batch.
5. EMS reserves the aggregate payroll amount in the company wallet ledger before initiating provider transfers.
6. Each transfer is assigned a deterministic unique reference and tracked as `PROCESSING` until the provider reports a terminal result.
7. An authorized approver verifies individual transfer status. Only a verified provider success marks a disbursement paid.
8. Definitive failed transfers are refunded to the company wallet with an auditable ledger entry. Uncertain/time-out results remain reserved and must be investigated; they must not be blindly retried.
9. Payroll becomes `PAID` only when every disbursement in the period is verified as paid.

## Required server configuration

Keep `PAYROLL_PAYOUTS_ENABLED=false` until test-mode validation and provider approval are complete. Then configure on the backend host only:

- `PAYROLL_PAYOUTS_ENABLED=true`
- `PAYSTACK_SECRET_KEY` for Paystack payouts and/or `FLUTTERWAVE_SECRET_KEY` for Flutterwave payouts
- optional provider base URLs only if your environment requires them

Never expose provider secret keys in Vite/frontend environment variables.

## Provider prerequisites

- Paystack transfers are funded from the Paystack business balance. Paystack requires a registered business for Transfers; automated transfers may require transfer-approval/OTP settings to be configured. Confirm the account is approved for API transfers before enabling the feature.
- Flutterwave requires approved KYC, Transfers via API enabled, sufficient NGN wallet balance, and IP whitelisting where required.
- The EMS company wallet is a tenant-scoped internal ledger. It does not itself move money into Paystack/Flutterwave. The selected provider account must separately hold sufficient transferable funds and fees. Funding the EMS wallet via one provider does not automatically fund the other provider's settlement balance.

## Important operating rules

- Test with provider test credentials and test beneficiaries first. Never test with live salary amounts.
- Check bank codes against the selected provider's current bank list; Paystack and Flutterwave bank codes are not interchangeable.
- Do not retry a `PROCESSING` or uncertain transfer. Verify the existing provider reference first.
- Paystack transfers may remain pending/OTP-required and Flutterwave transfers may initially be `NEW` or `PENDING`; neither means paid.
- Keep the feature flag disabled if the provider account requires an OTP/manual approval flow incompatible with unattended automated payouts.

## API routes

- `POST /api/v1/payroll/periods/:id/disbursements/execute` with `{ "provider": "PAYSTACK" | "FLUTTERWAVE", "confirm": true }`
- `POST /api/v1/payroll/disbursements/:disbursementId/verify`
- Existing disbursement list, prepare, and manual reconciliation routes remain available. Provider-managed records cannot be manually marked paid.

## Validation

From the backend project:

```bash
node --check src/modules/payroll/payroll.payout.service.js
node --check src/modules/payments/paystack/paystack.transfer.client.js
node --check src/modules/payments/flutterwave/flutterwave.transfer.client.js
npm test -- tests/unit/payroll-payout-utils.test.js
npx prisma validate
```

`prisma validate` requires a valid `DATABASE_URL` environment value. This patch does not intentionally modify the Prisma schema; required payout columns and provider bank-code fields are already in the uploaded source.
