# Finance Phase 5 — Automated Salary Payments

This release extends the existing EMS payroll register, company wallet ledger, employee bank accounts and payment integrations. Company-wallet funding uses Paystack as primary and Flutterwave as an alternative. New automated salary payouts use Paystack Transfers only. Monnify is being evaluated as a payout alternative but is not integrated in this release; Mono Disburse is a future option.

## Workflow in EMS

1. Finalize the payroll period and prepare its payment register.
2. Run **Preview & validate with Paystack**. Flutterwave is not selectable for new salary payouts.
3. Review employee net pay, saved bank, last four account digits, bank validation errors, estimated fees, internal wallet balance and provider integration balance.
4. Approve the batch separately. The server recomputes its preparation fingerprint and rejects approval if payroll, bank details or fee inputs have changed; it independently rechecks the wallet and provider balances at approval and execution.
5. Initiate transfers only from an approved batch. The backend atomically reserves the internal wallet amount and creates unique per-attempt references before calling the provider.
6. Verify processing transfers. The scheduled worker also reconciles existing references; it never starts new transfers.
7. Retry only a provider-confirmed `FAILED` payment after required fee reconciliation. New retry attempts use Paystack. Existing pending Flutterwave transfers remain verifiable through their original Flutterwave references; they are never switched or resubmitted while unresolved.
8. Employees can view payment status, paid date, reference and payment notes beside their released payslips. Payroll administrators can export the payment report as CSV.
9. If the provider's transfer response does not report its final fee, or an actual fee could not be debited from the EMS wallet, an authorized payroll approver can reconcile it against a provider statement reference. The operation records an audit trail and credits/releases or debits the fee difference atomically. Failed transfers with unresolved fees cannot be retried until the fee discrepancy is reconciled.

## Important accounting and security behaviour

- The internal company wallet is an EMS ledger, not the Paystack balance. The Paystack transfer balance is integration-wide and may be shared by multiple EMS tenants using the same merchant credentials. It can change outside EMS after preflight; preflight is not a lock on provider funds.
- Funds are reserved atomically in the EMS wallet before transfers. The ledger is reconciled using provider-verified results, refunds/releases, reported fees and fee-reconciliation notes.
- A request timeout or generic provider/API error is not treated as proof of transfer failure. Only a provider-confirmed failed transfer or a definitive non-retryable client rejection can safely release the failed salary reservation; uncertain outcomes retain their reservation until the original transfer reference is verified.
- Reversal and fee-reconciliation events are distinct: a reversed salary principal is restored once, and any net fee refund/charge must be reconciled against the provider statement before further finance actions.
- Paystack recipient codes are cached against provider mode and an HMAC fingerprint of the bank details. The stored fingerprint does not contain a raw account number.
- Authenticated `transfer.*` webhooks are matched against known references, deduplicated, and re-verified through the provider API before changing payout status. Duplicate/stale attempts do not post another wallet credit.
- The UI never receives secret provider credentials or full bank account numbers in preview output.
- The Paystack fee defaults are configurable estimates and must be checked against the business's current provider contract and applicable charges before live use. Flutterwave transfer-fee quoting is not used for new salary payouts in this release.

## Safe deployment defaults

Keep these settings until provider test-mode and accounting tests pass:

```env
PAYROLL_PAYOUTS_ENABLED=false
PAYROLL_PAYOUTS_MODE=sandbox
PAYROLL_PAYOUTS_LIVE_CONFIRMATION=false
PAYROLL_PAYOUT_RECONCILIATION_ENABLED=true
PAYROLL_PAYOUT_RECONCILIATION_INTERVAL_MS=300000
PAYROLL_PAYOUT_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=false
```

Use only provider test secret keys in sandbox mode. Live mode requires a live key plus both `PAYROLL_PAYOUTS_ENABLED=true` and `PAYROLL_PAYOUTS_LIVE_CONFIRMATION=true`. Do not turn this on from the frontend; these are server-side controls.

To exercise the actual end-to-end workflow in a provider test environment, temporarily set `PAYROLL_PAYOUTS_ENABLED=true` while keeping `PAYROLL_PAYOUTS_MODE=sandbox`, using only test secret keys, and keeping `PAYROLL_PAYOUTS_LIVE_CONFIRMATION=false`. This enables sandbox requests only because the backend rejects live keys in sandbox mode. After testing, set `PAYROLL_PAYOUTS_ENABLED=false` again. Do not use production credentials for sandbox tests.

Configure fee values as needed:

```env
PAYSTACK_TRANSFER_FEE_UP_TO_5000_NGN=10
PAYSTACK_TRANSFER_FEE_5001_TO_50000_NGN=25
PAYSTACK_TRANSFER_FEE_ABOVE_50000_NGN=50
PAYSTACK_TRANSFER_STAMP_DUTY_NGN=50
PAYSTACK_TRANSFER_STAMP_DUTY_THRESHOLD_NGN=10000
PAYSTACK_REGISTERED_PAYROLL_EXEMPTION=false
```

Set `PAYROLL_PAYOUT_RECIPIENT_FINGERPRINT_SECRET` to a high-entropy secret in the deployment environment (not in source control). If unset, the backend falls back to a server secret already required by the application.

## Apply and validate

Back up the database and the current project before applying Prisma schema updates. This project currently supports the `prisma db push` workflow; review the schema diff before applying it to a production database.

```bash
npm install
npx prisma validate
npx prisma db push
npx prisma generate
npm test -- tests/unit/payroll-payout-utils.test.js tests/unit/payroll-payout-config.test.js tests/unit/payroll-payout-fees.test.js
node scripts/verify-finance-phase5.mjs
git diff --check
```

`verify-finance-phase5.mjs` is a structural check only. Unit tests do not prove merchant-account eligibility or live transfers. Before production, run provider test-mode end-to-end tests for wallet reservations, insufficient balances, duplicate/concurrent requests, timeout handling, status verification, webhooks, reversals, actual fees, multi-tenant access and employee payslips. Confirm the provider account's transfer API eligibility, merchant/IP/approval settings, and the source of actual provider funds with the merchant administrator.

## Known limitation to account for before enabling live payouts

The available-balance preflight is an observation of the configured Paystack merchant integration, not an atomic reservation at Paystack. Multiple EMS tenants sharing one provider credential, or other transactions using the merchant balance outside EMS, can race against this observation. Use a dedicated provider integration/balance per company or a controlled central payout queue and merchant-level reconciliation before relying on automated live payments for multiple tenants.
