# Company-direct payroll funding correction

## Funding model

Company-specific Paystack and Monnify payroll transfers are funded from the connected company's provider disbursement balance. The EMS company wallet remains a separate internal ledger and is not a second source-of-funds requirement for these direct provider routes.

Wallet checkout credits the selected internal EMS ledger account after server-side payment verification. It does not automatically move money into a Paystack or Monnify provider balance. Companies must separately fund the provider balance using the provider's supported settlement/top-up process and confirm the balance in the provider dashboard/API.

## Backend changes

- Monnify company-direct preview and submission no longer read or require the EMS internal Monnify salary balance.
- New Monnify company-direct batches no longer debit the internal wallet before provider submission.
- New Monnify company-direct failed transfers do not create artificial wallet credits. A refund is retained only when the matching historical legacy reservation ledger entry exists.
- The same historical-reservation check protects individual Monnify retry refunds.
- Paystack company-direct payroll continues to use the company's encrypted key, provider balance preflight and `source: balance` transfer calls.
- Company Paystack, company Monnify and legacy shared-provider routes are mutually exclusive for a payroll period. The guards are repeated inside serializable transactions to reduce race conditions.

## Sandbox and live status

A Sandbox/test success is a simulated provider result and must not be described as a real bank credit. Live payments must be verified against the provider's original transfer reference before marking a salary paid.

## Important operational note

This patch does not transfer the EMS internal wallet balance into the provider balance. It corrects which balance is used by the company-direct payroll API. If a company has money only in its EMS internal wallet, it must fund its provider disbursement balance before using company-direct Paystack or Monnify payroll.

## Verification

Run:

```sh
npm test -- --run tests/unit/company-provider-direct-payroll.test.js
node --check src/modules/payments/monnify/monnify.service.js
node --check src/modules/payments/company-paystack/company-paystack.service.js
node --check src/modules/payroll/payroll.payout.service.js
```

No Prisma schema migration is required by these changes.
