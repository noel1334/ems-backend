# Company Provider Funding and Settlement Monitoring

## What this implementation does

- Adds authenticated, tenant-scoped `GET /api/v1/payroll/paystack-company/funding-status` and `GET /api/v1/payroll/monnify/funding-status` endpoints. They use the authenticated user's `companyId`; callers cannot supply another tenant ID.
- Keeps `/settlement-status` as a compatibility alias for the same status handlers.
- A read-only in-process worker refreshes every active company Paystack and Monnify connection every 15 minutes by default. Configure `PROVIDER_FUNDING_MONITOR_ENABLED=false` to disable it or `PROVIDER_FUNDING_MONITOR_INTERVAL_MS` to change the interval (minimum 60 seconds, maximum 1 hour).
- Paystack checks its live NGN `/balance` and settlement history. If settlement history is temporarily unavailable, the live balance is still returned and persisted; the response includes a settlement warning. The live transfer balance is authoritative for payroll readiness.
- Monnify checks the live disbursement-wallet balance. Settlement details can be queried using a settlement reference; Monnify's live available disbursement balance is authoritative for payroll readiness.
- Latest known balances and check timestamps are stored on each provider connection.

## Money movement and funding boundaries

- The worker does not initiate transfers, move settlement funds, perform Express Settlement, or credit the EMS internal wallet.
- A successful checkout/internal wallet credit does not create funds in a company's Paystack transfer balance or Monnify disbursement wallet. Payroll remains gated by the relevant provider's actual available balance.
- Paystack settlement records describe settlement activity; a record does not by itself prove that the corresponding funds are currently available for transfers.
- Monnify collection settlement and the disbursement wallet are distinct. Settlement reference lookups are informational; the available wallet balance is authoritative for payroll.
- If a provider balance is insufficient, the company must use the provider's supported dashboard/bank funding workflow. EMS never fabricates or mirrors provider funds.

## Deployment

1. Deploy the backend code and run `npx prisma migrate deploy` before serving requests.
2. Ensure the existing company Paystack and Monnify credentials are configured and active.
3. The in-process worker starts at API boot and runs an initial refresh plus periodic sweeps. It is read-only.
4. The worker runs once per API process. On deployments with multiple API replicas, set `PROVIDER_FUNDING_MONITOR_ENABLED=false` on extra replicas and configure a single monitor instance, or use one external scheduler. This worker does not provide distributed locking.

## API examples

- `GET /api/v1/payroll/paystack-company/funding-status`
- `GET /api/v1/payroll/monnify/funding-status`
- `GET /api/v1/payroll/monnify/funding-status?reference=MONNIFY_SETTLEMENT_REFERENCE`

All endpoints require authentication and the existing payroll-runs READ permission.

## Current limitations

- Paystack settlement records are polled; this code does not receive Paystack settlement webhook events.
- Monnify settlement details require a reference; this worker polls the live wallet balance but does not invent settlement identifiers or assume an unverified webhook format.
- The worker is in-process and best suited to one running API instance. For a multi-instance production deployment, use a single scheduler/worker with an appropriate distributed lease.
