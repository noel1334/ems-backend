# EMS Finance Phase 4 — Company Wallet Funding

## Included
- Uses the existing tenant-scoped `Wallet`, `WalletLedgerEntry`, `Payment`, Paystack, and Flutterwave modules; no duplicate schema models were introduced.
- Funding initialization creates a pending payment and returns the provider checkout details. It does not credit the wallet.
- Wallet credit happens only after the backend verifies provider status, payment reference, amount, and currency.
- Funding verification supports the Flutterwave transaction ID returned by its redirect while verifying the provider's `tx_ref` against the EMS payment reference.
- Payment initialization metadata now preserves idempotency details and stores provider initialization output separately.
- Pending provider checks remain retryable rather than being incorrectly marked failed; terminal provider statuses are recorded as failed.
- Enforces a minimum funding amount of NGN 1,000.
- The frontend redirects to the real provider checkout URL, verifies on return, refreshes wallet/ledger data, and clearly distinguishes checkout initialization from successful funding.

## Required environment
Configure `PAYSTACK_SECRET_KEY` and/or `FLUTTERWAVE_SECRET_KEY` on the backend, along with the existing database and public app/API configuration. Never expose provider secret keys in the frontend.

## Verification notes
JavaScript syntax checks were run for the changed backend files. Full Prisma/database and frontend production builds were not run in this environment because dependencies and a configured database are not present. Test with provider sandbox credentials before production use.
