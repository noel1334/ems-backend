# Finance Phase 6 — Provider-aware payroll routing and provider balances

## Included
- Correct Paystack kobo integer validation using `Number.isSafeInteger` after Decimal conversion.
- Provider-specific employee eligibility: only active bank accounts with a valid provider bank code, 10-digit account number and account name are included in that provider's preview.
- Employees not routable by the selected provider remain `PENDING`; preview and execution reserve funds only for eligible employees.
- A completed/failed/partial provider group can be followed by a preview for the other provider using the same payroll register. Previously paid employees are not selected again because only `PENDING` disbursements are evaluated.
- Pending rows excluded from the current provider are detached from its batch so the next provider can evaluate them.
- The payroll period is marked `PAID` only after every disbursement in that period is paid.
- Wallet summary exposes live Paystack and Flutterwave integration balances, their combined total only when both are available, and explicit shared-account caveats.

## Important accounting and safety notes
- The EMS company wallet is an internal tenant ledger. Provider balances are external integration-account balances and may be shared across tenants using the same credentials. They must not be added to the EMS wallet balance as if they were tenant-owned funds.
- The combined provider total is shown only when both provider balances are available; otherwise it is reported as incomplete rather than summing a partial result.
- `FAILED` and `REQUIRES_REVIEW` disbursements are not silently returned to `PENDING`. Existing transfer references and provider statuses must be verified before retrying.
- A provider bank-code eligibility check does not guarantee that a provider will accept a transfer. Provider response and verification remain authoritative.

## Deployment
No Prisma schema migration is required for this phase. Deploy the backend and frontend together. After deployment, test with one low-value, authorised transfer and verify the provider dashboard and EMS ledger before processing the remaining employees.
