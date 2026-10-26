# EMS Finance Phase 5 — Automated Salary Payouts

## Included
- Added a live Nigerian bank directory from Paystack and Flutterwave, called from the backend so provider secrets never reach the browser. Results are cached and merged into one bank selector with separate provider-specific bank codes.
- Added explicit provider availability/configuration information for the frontend. A missing key or provider outage does not expose credentials or make a stale/invalid bank code look verified.
- Completed the payout API surface for automated payroll initiation, provider status verification, and payout configuration. The existing wallet reservation/refund, provider references, amount/currency checks, company scoping, and audit records are preserved.
- Provider bank codes in the employee bank account form are populated from the selected bank and displayed in separate Paystack and Flutterwave fields.
- Status verification remains available for submitted transfers even if the new-payout kill switch is later disabled. The switch continues to block new transfers.

## Required backend settings
- `PAYSTACK_SECRET_KEY` and/or `FLUTTERWAVE_SECRET_KEY` for each provider you want to use.
- `PAYROLL_PAYOUTS_ENABLED=false` by default. Only enable it after testing end-to-end with provider sandbox/test credentials and confirming the provider transfer permissions, account funding, and webhook/security settings. Never set provider secret keys in frontend environment variables.

## Safety behaviour
- Only finalized payroll periods can be paid. Every pending employee must have an active account, a valid 10-digit Nigerian account number, account name, and a code for the selected provider before any wallet reservation or transfer begins.
- The full pending batch amount is reserved from the company wallet before submission. Definitively failed transfers are refunded through a distinct wallet ledger reference. An inconclusive provider request keeps funds reserved and must be investigated and verified before further action; do not blindly re-submit.
- Provider transfer status, reference, amount, currency, and terminal outcomes are verified server-side. The UI requires an explicit confirmation because this action initiates real money movement.
- Flutterwave NGN transfer inputs in this integration must be whole-naira amounts.

## Test before production
Run the unit suite and frontend build, then use sandbox credentials to test successful, pending, failed, and uncertain transfers. Confirm the wallet ledger after every scenario before enabling real transfers.
