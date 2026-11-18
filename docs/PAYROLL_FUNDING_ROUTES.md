# Payroll funding routes

EMS supports two mutually exclusive funding routes for each tenant payroll period.

## 1. EMS Wallet Payroll

The company payroll batch reserves salary principal and estimated fees from the company's internal EMS wallet ledger. The internal allocation is Paystack for the legacy Paystack payout rail and GENERAL for the legacy Flutterwave payout rail. The outbound transfer still uses the EMS-configured Paystack or Flutterwave integration credentials. In live mode, the external integration balance is independently checked because the provider transfer spends funds held at that integration. This is not a company-owned Paystack/Monnify provider balance, and a wallet checkout does not credit a provider disbursement balance.

## 2. Direct Provider Payroll

Company Paystack Payroll uses the company's own encrypted Paystack credentials and the company's actual Paystack transfer balance. Company Monnify Payroll uses the company's own Monnify disbursement connection and available disbursement-wallet balance. These flows do not debit the EMS internal wallet for new batches. Provider balances are checked by the existing provider-specific preflight before submission.

## Period lock and duplicate protection

`PayrollPeriod.payoutFundingRoute`, `payoutProvider`, and `payoutRouteLockedAt` form the tenant-scoped route lock. Every payout submission/retry claims this lock inside a serializable database transaction that also creates the direct-provider batch or reserves internal-wallet funds. The claim is scoped by both `companyId` and `periodId`.

The first route/provider selected in a prepared payout batch or used for a submission owns the period. EMS treats a prepared batch as route evidence even before funds are reserved, preventing accidental switching after the operator has selected a route. A later request using a different route or provider fails with HTTP 409 and a stable error code. The lock is deliberately not auto-released after an ambiguous provider timeout, failed transfer, or reversal: the original references must first be reconciled. A new route must never be used as a shortcut around an uncertain original transfer.

Historical batches/disbursements are inspected when a period has no explicit lock yet. Existing company Paystack/Monnify batches and legacy EMS-wallet payout batches/disbursements are treated as route evidence. Conflicting historical evidence blocks further payment and requires reconciliation.

## Operational notes

- Apply migration `20261113090000_separate_payroll_funding_routes` before using the new backend code.
- Deploy migrations through the configured production release process (`prisma migrate deploy`); do not use `prisma migrate dev` against production.
- Confirm `DATABASE_URL` exists in the Render service environment. Prisma schema validation can use a disposable placeholder URL because it does not connect to a database.
- Do not treat a successful wallet checkout as a provider disbursement-wallet top-up.
- Do not manually clear route fields or create another batch to work around a route conflict. Reconcile provider statuses, reservations, refunds/reversals, and audit records first.
