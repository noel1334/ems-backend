# Finance Phase 5 — Paystack-primary payout workflow correction

## Architecture

- Company wallet funding: Paystack.
- Alternative company wallet funding: Flutterwave.
- New automated salary payouts: Paystack Transfers only.
- Alternative salary payout provider: Monnify is under evaluation and is not integrated or enabled in this release.
- Future advanced payout option: Mono Disburse, not integrated in this release.

Flutterwave payout verification and webhook reconciliation remain in place for previously submitted transfer records. New Flutterwave salary payout previews, executions, and retries are blocked. A definitively failed legacy Flutterwave transfer may be retried through Paystack only after its provider outcome and fee reconciliation are complete.

## Confirmation defect fixed

The payroll page previously kept the selected provider in local React state and sent that value when confirming. The backend separately checked the provider stored on the approved `PayrollPayoutBatch`. Changing the local selection after approval caused a 409 provider mismatch. The updated UI has a fixed Paystack salary-payout choice, displays the provider stored on the approved batch in the confirmation dialog, and sends Paystack only when the stored approved batch is also Paystack.

For a legacy APPROVED Flutterwave batch that has not reserved funds, the UI now offers **Switch to Paystack & re-preview**. The backend replaces the unexecuted preview, clears the old approval and requires a new explicit approval. It remains blocked if the batch has started or a reservation already exists.

## Safety behaviour

- Existing Flutterwave PROCESSING / REQUIRES_REVIEW records remain verifiable through the original Flutterwave transfer ID.
- No pending or uncertain transfer is automatically retried.
- New salary transfers reserve the EMS company wallet amount and use the Paystack provider integration balance check as a separate preflight.
- Provider mismatch checks, provider reference validation, webhook idempotency, reconciliation, and wallet-ledger safeguards remain enabled.

## Verification

Run from the backend repository root:

```bash
node --check src/modules/payroll/payroll.payout.service.js
node --check src/modules/payroll/payroll.payout.config.js
npm test -- --run tests/unit/payroll-payout-config.test.js tests/unit/payroll-payout-utils.test.js tests/unit/paystack-transfer-amount.test.js
node scripts/verify-finance-phase5.mjs
git diff --check
```

No Prisma schema or database migration is required for this correction.
