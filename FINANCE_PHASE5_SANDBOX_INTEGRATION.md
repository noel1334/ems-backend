# EMS Finance Phase 5 — Provider Sandbox Integration

This patch adds a server-side payout-mode guard before payout initiation and verification. It does not send any provider request by itself.

## Sandbox configuration

Set these values only in the backend environment (Render or local backend `.env`):

```env
PAYROLL_PAYOUTS_ENABLED=true
PAYROLL_PAYOUTS_MODE=sandbox
PAYROLL_PAYOUTS_LIVE_CONFIRMATION=false
PAYSTACK_SECRET_KEY=sk_test_...       # only if testing Paystack
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-... # wallet-funding test key only
```

Use real provider-issued test secret keys, not the placeholder examples above. Do not expose secret keys in frontend environment variables, source code, screenshots, logs, or chat. The provider API URLs are the normal official API URLs; test-mode behavior is selected by the provider's test secret key.

The salary-payout mode guard accepts Paystack test credentials only and refuses live credentials in sandbox mode. Flutterwave remains a supported wallet-funding gateway; its transfer API is retained only to verify previously submitted legacy payout records. Live salary payouts require `PAYROLL_PAYOUTS_MODE=live`, a Paystack live-key prefix, and `PAYROLL_PAYOUTS_LIVE_CONFIRMATION=true`. Keep that confirmation false until sandbox validation is complete.

## Test commands

```bash
node --check src/modules/payroll/payroll.payout.config.js
node --check src/modules/payroll/payroll.payout.service.js
npm test -- tests/unit/payroll-payout-config.test.js tests/unit/payroll-payout-utils.test.js
```

These are local safety tests and do not make live network calls. After they pass, use provider test credentials and a dedicated test company/payroll period with a small test amount. Confirm bank-code setup in each provider dashboard, execute one test transfer, then verify its status in the EMS payroll workspace. Do not retry an uncertain transfer; look it up by the stable reference in the provider dashboard first.

## Important wallet distinction

The EMS company wallet is an internal ledger. Its balance is not automatically the same as Paystack's transferable balance. Paystack must have sufficient test-mode transfer funds/capability for salary disbursement. Paystack and Flutterwave can both be used to test wallet funding, but a Flutterwave wallet-funding top-up does not credit Paystack's transfer balance.

## Scope

This patch adds configuration safety and tests; it does not claim that a provider sandbox transfer has succeeded. A real sandbox run requires the user's provider test credentials and provider dashboard access.
