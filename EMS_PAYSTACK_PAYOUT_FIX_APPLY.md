# EMS Paystack-primary salary payout correction

This release fixes the approved-provider mismatch in the payroll confirmation flow and standardises new automated salary payouts on Paystack Transfers.

## Provider architecture in this release

- Company wallet funding: Paystack.
- Alternative company wallet funding: Flutterwave.
- New automated salary payouts: Paystack Transfers only.
- Previously submitted Flutterwave payouts: original transfer verification and webhook reconciliation remain supported.
- Monnify Disbursement: not integrated in this release; evaluate after Paystack is proven end-to-end.
- Mono Disburse: future option; not integrated.

## Apply on Termux

Download `ems-backend-paystack-payout-fix.zip` to `~/storage/downloads`, then run:

```bash
cd ~/work/ems-backend

# Create a backup before overlaying the corrected source.
cp -a . "../ems-backend-before-paystack-payout-fix-$(date +%Y%m%d-%H%M%S)"

mkdir -p ~/ems-backend-paystack-payout-fix
unzip -oq ~/storage/downloads/ems-backend-paystack-payout-fix.zip \
  -d ~/ems-backend-paystack-payout-fix
cp -a ~/ems-backend-paystack-payout-fix/. ~/work/ems-backend/

node --check src/modules/payroll/payroll.payout.service.js
node --check src/modules/payroll/payroll.payout.config.js
node scripts/verify-finance-phase5.mjs
node scripts/verify-finance-payout-architecture.mjs
npm test -- --run tests/unit/payroll-payout-config.test.js tests/unit/payroll-payout-utils.test.js tests/unit/paystack-transfer-amount.test.js
npx prisma validate
git diff --check
```

Do not copy an `.env` file from the archive. Keep your existing local `.env` and Render environment variables. The archive intentionally does not contain secret credentials.

## Apply the frontend

Download `ems-frontend-paystack-payout-fix.zip` to `~/storage/downloads`, then run:

```bash
cd ~/work/ems-frontend2-api-crud-phase/ems-frontend2-main

cp -a . "../ems-frontend-before-paystack-payout-fix-$(date +%Y%m%d-%H%M%S)"

mkdir -p ~/ems-frontend-paystack-payout-fix
unzip -oq ~/storage/downloads/ems-frontend-paystack-payout-fix.zip \
  -d ~/ems-frontend-paystack-payout-fix
cp -a ~/ems-frontend-paystack-payout-fix/. .

node scripts/verify-finance-payout-architecture.mjs
npm run build
```

## Existing payroll batches

- An old `APPROVED` Flutterwave batch that has not reserved funds can be changed through **Switch to Paystack & re-preview**. Review the new Paystack preview and approve it again before confirming.
- If funds were already reserved, do not switch or re-preview that batch.
- Existing Flutterwave `PROCESSING` or `REQUIRES_REVIEW` records must be verified against their original Flutterwave transfer reference. Do not submit them again.
- A retry is allowed only after the provider has definitively marked the previous attempt `FAILED` and any fee reconciliation requirement has been resolved.

## Server environment

Keep the wallet funding credentials for both gateways:

- `PAYSTACK_SECRET_KEY`
- `FLUTTERWAVE_SECRET_KEY`

For salary payout tests, use Paystack test credentials and keep:

```env
PAYROLL_PAYOUTS_ENABLED=true
PAYROLL_PAYOUTS_MODE=sandbox
PAYROLL_PAYOUTS_LIVE_CONFIRMATION=false
```

Do not switch to live mode or use a live key until Paystack has approved the business for Transfers and sandbox tests, bank details, fees, reconciliation and webhook processing have been checked. This release does not make a live transfer automatically safe or guarantee provider account eligibility.

## Database

No Prisma schema change or migration is required. Existing payout batch, disbursement, attempt and webhook records are retained.
