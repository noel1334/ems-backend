# EMS Company Paystack Payroll Distribution — V4

## What changed

V4 aligns Company Paystack payroll with the Monnify partial-eligibility approach while respecting Paystack's different API limits and transfer lifecycle.

- Employee rows that fail local payroll/bank checks are skipped and excluded from the Paystack batch.
- In LIVE mode, each otherwise eligible employee is resolved through Paystack before batch creation. Account-specific `400`/`422` validation failures are skipped; a bank lookup outage, `401`, `429`, `5xx`, or network error aborts the preparation phase so a good employee is not silently skipped.
- Recipient preparation is performed before any transfer request. Account-specific recipient-creation validation errors are skipped; operational recipient API errors abort safely before transfers.
- Only prepared employees contribute to the transfer count and amount. Skipped disbursements remain `PENDING` for correction and a later run.
- If no employee remains eligible, no batch and no transfer are created.
- Single-transfer OTP status is labelled as accepted/queued, not as paid. Final live payment status remains dependent on Paystack verification or a signed transfer webhook.

## Critical TEST-mode limitation

Paystack's TEST `/bank/resolve` endpoint has a limited daily allowance (the user's screenshot displayed a limit of three live-bank resolves). V4 skips TEST account resolution by default. In TEST mode, EMS can check local formatting and that a bank code is present in Paystack's bank directory, but **this is not verification that a real Nigerian account number belongs to that bank**. Paystack's transfer-recipient documentation explicitly shows a successful recipient object with `details.account_name: null`; recipient creation is not account-name verification. Paystack TEST transfers are simulated and return `success` without real bank processing. Do not interpret a TEST success as proof that a real employee will be credited.

For live payroll, LIVE account resolution occurs before a batch is assembled, so account-number/bank-code mismatches returned by Paystack are excluded. Do not use a test-only bank code such as `001` on employees' real saved bank records. Use separate test employees/accounts when exercising sandbox-only flows.

## OTP limitation

Paystack's bulk transfer endpoint requires Transfers OTP to be disabled. It cannot authorize an entire bulk payroll with a single OTP. A single eligible employee can use the single-transfer OTP flow. After OTP is accepted, Paystack queues the transfer; the result is not final until Paystack reports `success`, `failed`, or `reversed` through transfer status/webhook.

If the business requires one OTP for an entire payroll batch, that is not supported by Paystack's bulk endpoint; Monnify supports that batch MFA flow.

## Reconciliation and accounting safety

- `pending`, `otp`, `received`, and queued/processing statuses are not final payment confirmation.
- Live payroll items are marked `PAID` only after a verified successful Paystack transfer.
- `transfer.success`, `transfer.failed`, and `transfer.reversed` webhooks and the existing refresh/verify path remain the final status sources.
- Do not retry a transfer with an uncertain submission status until reconciling its existing reference; this prevents duplicate salary transfers.
- TEST mode does not move real money. A sandbox balance change is a simulated provider ledger effect, not proof of an employee's real bank credit.

## Files in this patch

Backend:
- `.env.example`
- `src/modules/payments/company-paystack/company-paystack.service.js`
- `src/modules/payments/company-paystack/company-paystack.utils.js`
- `tests/unit/company-paystack.utils.test.js`

Frontend:
- `src/features/company-paystack-payroll.tsx`

No Prisma schema change or database migration is required.

## Render environment

Keep this setting false for routine sandbox testing:

```env
PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=false
```

LIVE mode always verifies accounts regardless of this setting.

## Apply and test

Apply the backend and frontend ZIP overlays, then run in the backend repository:

```bash
node --check src/modules/payments/company-paystack/company-paystack.service.js
node --check src/modules/payments/company-paystack/company-paystack.utils.js
npm test -- tests/unit/company-paystack.utils.test.js
npm test
git diff --check
```

Run in the frontend repository:

```bash
npm run build
git diff --check
```

Review `git status -sb` and `git diff --stat` before committing.
