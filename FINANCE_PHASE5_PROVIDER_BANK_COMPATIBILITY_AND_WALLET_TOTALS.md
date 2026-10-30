# Finance Phase 5 — provider bank compatibility and wallet funding totals

## Changes
- Fixed the Paystack transfer amount guard. `decimal.js` does not implement `isSafeInteger()`; the converted kobo value is now checked with `Number.isSafeInteger()` after confirming the Decimal value is an integer. This addresses the runtime error shown on the payroll payout cards (`amountInKoboDecimal.isSafeInteger is not a function`).
- Payroll bank selection now searches all active employee bank accounts and chooses the newest/primary-first account that has a valid bank code for the selected provider, a 10-digit account number, and an account name. It no longer fails just because the primary account lacks that provider's code when another active account is compatible.
- Bank directory selection in the employee bank form now exposes only entries with at least one provider-specific bank code and displays which provider(s) support each bank. Manual entry remains available for verified provider-specific codes.
- Wallet summary now reports successful company wallet deposits grouped by Paystack and Flutterwave, plus their combined total. These are cumulative company funding amounts, not live provider account balances.

## Important accounting distinction
The EMS wallet is the tenant's internal ledger. Paystack/Flutterwave API balances are held against the configured merchant credentials and may be shared by every tenant using those credentials. They are not isolated company sub-accounts. The new provider totals therefore show verified deposits attributable to this company by funding source; they must not be described as the live balance in the merchant's Paystack or Flutterwave account.

## Transfer and wallet debit behavior
Payroll approval reserves the required salary plus estimated fees from the EMS company wallet. The provider transfer is then initiated from the provider's merchant balance. Do not manually debit the wallet again after provider confirmation. Uncertain provider outcomes remain reserved until the original transfer reference is verified; confirmed failures follow the existing release/reconciliation workflow.

## Validation
Run from backend root:

```sh
node --check src/modules/payments/paystack/paystack.transfer.client.js
node --check src/modules/payroll/payroll.payout.service.js
node --check src/modules/wallet/wallet.service.js
node --check src/modules/wallet/wallet.mapper.js
node scripts/verify-finance-phase5.mjs
npm test
```

Run from frontend root:

```sh
npm run build
```
