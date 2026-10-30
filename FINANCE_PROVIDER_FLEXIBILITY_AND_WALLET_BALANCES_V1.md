# Finance provider flexibility and gateway balances — V1

## Changes
- Fixed Paystack's Decimal.js validation: `Decimal` has no `isSafeInteger()` method. Amounts are converted to kobo, then checked with JavaScript `Number.isSafeInteger()`.
- Payroll provider preflight now chooses the first active employee bank account that has that provider's valid bank code, a 10-digit account number and an account name. It does not fail merely because the primary account lacks that provider's bank code.
- Employees without a bank account supported by the selected provider are marked `SKIPPED` in the preview and remain `PENDING`. Eligible employees can be processed as a partial provider batch.
- After a provider run has reached a terminal state, remaining pending employees can be previewed with the other provider. Any in-flight or review-required transfers must be reconciled first.
- The payroll period is not marked PAID while skipped/pending disbursements remain.
- Each execution run receives a unique wallet reservation reference so a second provider run cannot collide with the first run's reservation.
- Wallet summary now reports Paystack and Flutterwave NGN integration balances separately and provides their combined total when available.

## Important accounting distinction
The Paystack `/balance` and Flutterwave `/balances` endpoints return balances for the configured gateway credentials. If one gateway credential is shared by multiple EMS tenants, those balances are shared integration balances, not balances owned by a specific company. The tenant's actual EMS company wallet remains the separate `Available balance` and wallet ledger. Do not present the gateway totals as company-segregated funds unless each company has its own provider account/credentials.

## Validation
Run the backend checks and frontend build in the target repositories before deployment. Live transfers must be tested with small amounts and reconciled against the gateway statements. Never retry a transfer in `PROCESSING` or `REQUIRES_REVIEW` state until its original provider reference has been verified.
