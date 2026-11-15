# Company Provider Funding and Settlement Monitoring

## What this implementation does

- Adds authenticated, tenant-scoped `GET /api/v1/payroll/paystack-company/funding-status` and `GET /api/v1/payroll/monnify/funding-status` endpoints. They use the authenticated user's `companyId`; callers cannot supply another tenant ID.
- Keeps `/settlement-status` as a compatibility alias for the same status handlers.
- A read-only in-process worker refreshes every active company Paystack and Monnify connection every 15 minutes by default. Configure `PROVIDER_FUNDING_MONITOR_ENABLED=false` to disable it or `PROVIDER_FUNDING_MONITOR_INTERVAL_MS` to change the interval (minimum 60 seconds, maximum 1 hour).
- Paystack checks its live NGN `/balance` and settlement history. If settlement history is temporarily unavailable, the live balance is still returned and persisted; the response includes a settlement warning. The live transfer balance is authoritative for payroll readiness.
- Monnify checks the live disbursement-wallet balance using `/api/v2/disbursements/wallet-balance?accountNumber=...`.
- The Monnify webhook handler now accepts the documented `SETTLEMENT` event, authenticates production signatures with the company's configured Monnify API secret, records the settlement reference/time/destination, and links settlement references to EMS wallet-funding payments when Monnify includes transaction references.
- Latest known balances, settlement snapshots and check timestamps are stored on each provider connection.

## Monnify collection funding versus payout-wallet funding

A hosted Monnify checkout is a **collection**. A successful/paid checkout confirms that the customer paid Monnify; it does not guarantee that the same amount is already available in the company's disbursement wallet.

The settlement destination controls where collected funds go. To make a Monnify checkout increase the balance used by salary transfers:

1. In the company's Monnify merchant dashboard, configure the applicable settlement destination to the Monnify wallet/disbursement wallet used by EMS, rather than an external bank account.
2. Check whether an external sweep/settlement instruction is configured to move funds out to a bank account. If so, review or disable that instruction where permitted by Monnify.
3. Configure the production Settlement webhook to `POST /api/v1/payments/webhooks/monnify`. Monnify production requests must include the `monnify-signature` header; the backend verifies it with HMAC-SHA512 using that company's API secret.
4. For production disbursements, allowlist the backend's stable outbound IP in Monnify as required by the account/API.
5. After Monnify reports settlement to the payout wallet, refresh the live disbursement balance. EMS uses the provider's current `availableBalance` for payroll readiness, not the webhook amount or an EMS ledger balance.

If the settlement event says the destination was an external bank account, the Monnify disbursement wallet will not increase. The company must use Monnify's supported dashboard settlement controls or fund the disbursement wallet separately. Monnify Express Settlement / “Get Settled Now” is a dashboard action; EMS does not call it or move funds between Monnify accounts.

The app records settlement destination as `PAYOUT_WALLET`, `EXTERNAL_BANK`, or `UNKNOWN`. This classification is informational; the live Monnify wallet balance remains authoritative. A settlement event that cannot be matched to the tenant's company connection is acknowledged but not attributed to a tenant.

## Money movement and funding boundaries

- The provider-balance monitor does not initiate transfers, move settlement funds, perform Express Settlement, or credit the EMS internal wallet.
- For `EXTERNAL_PROVIDER_PAYOUT`, the payment record is verified but the EMS internal wallet is deliberately not credited. The actual provider payout balance changes only when Monnify settles the collection to the payout wallet (or through another Monnify-supported funding method).
- For `EMS_INTERNAL_WALLET`, only a provider-verified payment is credited to the EMS internal ledger. That ledger allocation remains distinct from the company's external provider balance.
- Paystack settlement records describe settlement activity; a record does not by itself prove that the corresponding funds are currently available for transfers.
- Monnify collection settlement and the disbursement wallet are distinct. Settlement references and webhooks are informational; the available wallet balance is authoritative for payroll.
- If a provider balance is insufficient, the company must use the provider's supported dashboard/bank funding workflow. EMS never fabricates or mirrors provider funds.

## Deployment

1. Deploy the backend code and run `npx prisma migrate deploy` before serving requests. The migration `20261115120000_provider_payout_wallets_and_settlement_webhooks` adds Monnify settlement fields and Flutterwave PSA payout-wallet fields.
2. Ensure the existing company Paystack and Monnify credentials are configured and active.
3. Configure Monnify's production Settlement webhook at `/api/v1/payments/webhooks/monnify`; use HTTPS and confirm that the deployment preserves the raw request body for signature verification.
4. The in-process worker starts at API boot and runs an initial refresh plus periodic sweeps. It is read-only.
5. The worker runs once per API process. On deployments with multiple API replicas, set `PROVIDER_FUNDING_MONITOR_ENABLED=false` on extra replicas and configure a single monitor instance, or use one external scheduler. This worker does not provide distributed locking.

## API examples

- `GET /api/v1/payroll/paystack-company/funding-status`
- `GET /api/v1/payroll/monnify/funding-status`
- `GET /api/v1/payroll/monnify/funding-status?reference=MONNIFY_SETTLEMENT_REFERENCE`
- `POST /api/v1/payments/webhooks/monnify` (provider webhook; no user session)

All status endpoints require authentication and the existing payroll-runs READ permission.

## Operational limitations

- Paystack settlement records are polled; this code does not receive Paystack settlement webhook events.
- Monnify settlement information is captured when Monnify sends a `SETTLEMENT` webhook. If a settlement event has no matched transaction references and its destination is not the configured disbursement wallet, EMS may not be able to identify the tenant and will not attribute that event.
- The worker is in-process and best suited to one running API instance. For a multi-instance production deployment, use a single scheduler/worker with an appropriate distributed lease.

## Monnify contract settlement destination must be Wallet

For an `EXTERNAL_PROVIDER_PAYOUT` checkout, EMS verifies the customer collection but does not credit the EMS internal ledger or fabricate a credit in Monnify. The collection reaches the disbursement wallet only after Monnify settles it to the wallet. In the Monnify Dashboard, open **Settings → Contract Setup**, select the contract used by the saved connection, and confirm its settlement destination is **Wallet**, not **Bank Account**. Also review any external sweep setting. A contract configured for bank settlement can successfully accept checkout payments while the Monnify disbursement-wallet balance remains unchanged.

Monnify's published settlement cycle is normally same-day around 10 PM, subject to the underlying payment provider's posting. Eligible merchants can use **Get Settled Now** in the dashboard to request an Express Settlement and choose Wallet as the destination; this is a dashboard-only action, not an API operation. EMS now records settlement-webhook destination information and reads the live disbursement-wallet balance before payroll.
