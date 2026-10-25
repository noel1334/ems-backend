# Finance Phase 4 — Company Wallet and Hosted Funding

This phase makes the wallet funding UI use the existing backend wallet/payment modules rather than pretending a funding request completed immediately.

## Flow

1. A company finance user enters an amount (minimum NGN 1,000) and chooses Paystack or Flutterwave.
2. EMS creates a pending payment record and redirects to the provider-hosted checkout.
3. The provider returns the browser to `/app/wallet`. That return URL is only a signal; it is not treated as proof of payment.
4. EMS verifies the provider transaction on the backend, checks reference, currency, amount, and provider status, and then credits the company wallet and writes the ledger entry in the same database transaction.
5. Duplicate callbacks/retries use the payment reference and ledger reference to avoid a second credit.

## Required environment settings

- `PAYSTACK_SECRET_KEY` for Paystack; keep the secret backend-only.
- `FLUTTERWAVE_SECRET_KEY` for Flutterwave; keep the secret backend-only.
- `APP_FRONTEND_URL` should be the deployed frontend origin (for example `https://your-ems-app.example`) for backend-created default callback URLs. The frontend passes its current origin explicitly when a funding checkout is initialized.
- Ensure `CORS_ORIGIN` includes the deployed frontend origin and production cookies are configured securely.
- Configure provider webhooks to `/api/v1/payments/webhooks/paystack` and `/api/v1/payments/webhooks/flutterwave` if you want provider webhook updates in addition to user-return verification.

## Scope boundary

This phase delivers company wallet viewing, hosted funding, provider verification, transaction history, filtering, and ledger consistency checks. It does **not** initiate salary transfers or automatically debit payroll from the wallet. Automated payroll disbursement should be a later phase with its own approval, provider settlement, reconciliation, idempotency, and failure-recovery controls.
