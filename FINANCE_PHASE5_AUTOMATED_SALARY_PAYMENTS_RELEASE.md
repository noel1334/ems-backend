# Finance Phase 5 — Automated Salary Payments

This release extends the existing Phase 4 wallet, existing payroll disbursement register, bank-directory fields, Paystack/Flutterwave transfer clients, and the current payroll workspace. It does not add a second wallet or payroll implementation.

## Existing implementation found in the supplied snapshot

- `PayrollDisbursement` records and provider-specific bank account fields already exist in Prisma.
- Payroll payout preparation, provider transfer initiation, transfer verification, wallet reservation/refund ledger operations, and audit logging already exist in `src/modules/payroll/payroll.payout.service.js`.
- Backend routes already expose prepare, execute, verify, and manual reconciliation endpoints.
- Frontend `src/features/payroll-periods-workspace.tsx` already contains provider selection, transfer confirmation, verification controls, and disbursement status display.
- Provider webhooks and a scheduled reconciliation worker are not established by this snapshot; use the explicit verify endpoint until those are implemented and tested. Do not assume webhooks are active.

## Safety repair in this release

The payout service now calls `assertPayrollPayoutProviderConfiguration()` so the existing sandbox/live credential guard is actually enforced before new transfers. The earlier service-level check only checked whether a secret existed and could bypass `PAYROLL_PAYOUTS_MODE=sandbox` credential validation.

## Required environment configuration

Keep these values in the backend environment (Render), not in the frontend:

```env
PAYROLL_PAYOUTS_ENABLED=false
PAYROLL_PAYOUTS_MODE=sandbox
PAYROLL_PAYOUTS_LIVE_CONFIRMATION=false
```

Configure the appropriate test secret for sandbox checks. Do not turn on live payouts until you have confirmed provider business eligibility, available provider balance plus fees, wallet funding reconciliation, duplicate-transfer controls, failure/refund behavior, and status verification. The internal EMS wallet is an internal ledger; it does not prove that the Paystack/Flutterwave transfer balance contains the same funds.

## Important limitations to resolve before production

1. Provider transfer fees are not calculated by the current payout register; the wallet reservation currently covers salary amounts only.
2. The supplied snapshot does not contain a complete signed webhook/idempotency pipeline or scheduled reconciliation worker.
3. Paystack recipient codes are created during payout initiation and are not persisted/reused by this snapshot.
4. Do not retry a `PROCESSING`/uncertain transfer by submitting a new transfer. Verify its original reference first.

The current feature flag remains disabled by default. This release is not a declaration that live money movement is production-ready.
