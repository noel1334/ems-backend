# Payroll provider deployment notes

## Database migration ordering

The payroll funding-route lock depends on the columns added by
`20261113090000_separate_payroll_funding_routes`. A Render restart or source deploy alone does
not update Neon. The `prestart` npm lifecycle hook now runs `npm run prisma:deploy` before
`npm start`, so pending checked-in migrations are applied before the API begins accepting
requests. If the migration command fails, the service intentionally does not start.

Render must provide the production `DATABASE_URL` (and any provider credentials) to the
service. Confirm that the deployment logs show Prisma migrations completed before the server
starts. Do not manually add the columns in the Neon SQL editor: Prisma must record the migration
in `_prisma_migrations`.

## Monnify code 99

Monnify code 99 is treated as a transient Name Enquiry failure, not an invalid beneficiary.
Re-run the validation preview to retry Name Enquiry. Employees still marked `RETRY_REQUIRED`
are excluded from that batch. Only submit employees shown as `VALID`.

## Provider funding balances

- EMS internal wallet balances are tenant ledger allocations.
- Paystack transfer balance and Monnify disbursement-wallet available balance are external
  provider balances and are read from the provider APIs.
- Successful checkout does not itself prove that an amount is already available for payroll.
  The company must wait for the provider's settlement and refresh the actual available balance.
- Monnify ledger balance and settlement history are informational; the live disbursement wallet
  available balance is used for payroll preflight.


## Monnify batch skip behavior

Both the payroll-period preview flow and the legacy Monnify batch endpoint validate beneficiaries independently. EMS submits only the employees who pass account-number, bank-directory and Name Enquiry checks; invalid beneficiaries remain pending for correction. The Monnify batch request uses `onValidationFailure: CONTINUE` so a beneficiary that becomes invalid after preflight does not stop unrelated eligible transfers. Temporary Monnify code `99` remains `RETRY_REQUIRED` rather than being labelled a definitely invalid account.

## Flutterwave payout wallet

The migration `20261115120000_provider_payout_wallets_and_settlement_webhooks` adds tenant-scoped Flutterwave PSA fields. A Flutterwave `RS_...` collection split subaccount is not a payout wallet. To fund salaries from a company-segregated Flutterwave wallet, create a `PSA...` payout subaccount, issue its static NGN funding account, fund that account, and confirm the live PSA balance. EMS then sends transfers with `debit_subaccount` set to the PSA reference. Existing companies without a PSA continue to use the legacy shared integration balance until they configure a PSA. See `docs/FLUTTERWAVE_PAYOUT_SUBACCOUNTS.md`.

## Flutterwave company payout wallet (PSA)

A Flutterwave `RS_...` subaccount is a collection split account. It is not a salary-payout wallet. Company-segregated salary funding uses a separate `PSA...` Payout Subaccount and its dedicated static NGN funding account. The EMS migration adds separate tenant fields for that PSA identity and funding account.

- Apply `20261115120000_provider_payout_wallets_and_settlement_webhooks` before using the new wallet or Monnify settlement metadata.
- Create the PSA wallet in Company Wallet, issue its static account, fund it by bank transfer, and refresh the live PSA balance. If static-account issuance fails after wallet creation, use the **Issue funding account** action rather than creating a duplicate PSA wallet.
- PSA payroll is a **Direct Provider Payroll** route: the available PSA balance is the sole salary funding source; the EMS internal wallet is not reserved or debited.
- PSA is production/live-only. Configure `PAYROLL_PAYOUTS_MODE=live`, the live `FLUTTERWAVE_SECRET_KEY`, and `PAYROLL_PAYOUTS_LIVE_CONFIRMATION=true`. Enable payroll payouts only after confirming the live account and funding wallet.
- If PSA is not configured, the legacy EMS Wallet Payroll route remains separate and uses the EMS internal ledger plus the legacy shared Flutterwave F4B integration balance.
- Enable Flutterwave's payout-subaccount wallet-funding webhook in the Flutterwave dashboard if the company wants provider funding events delivered. EMS still uses the live PSA balance endpoint as the authority for available funds.

Official product guide: https://developer.flutterwave.com/docs/payout-subaccount.

## Monnify collection settlement destination

For company external-provider top-ups using `EXTERNAL_PROVIDER_PAYOUT`, the checkout collection must settle into the same Monnify wallet used for payroll. In the Monnify Dashboard, open **Settings → Contract Setup**, select the exact contract configured in the company's EMS Monnify connection, and confirm **Settlement destination = Wallet** (not **Bank Account**). Review external-sweep settings too. A successful checkout can be real and verified while the disbursement wallet stays unchanged if the contract settles to a bank account.

Monnify documents same-day settlement around 10 PM, subject to underlying provider posting, and an eligible merchant can use the dashboard-only **Get Settled Now** Express Settlement action, choosing Wallet as the destination. EMS cannot force this dashboard action through its API. The `SETTLEMENT` webhook records the confirmed destination; the live Wallet Balance API remains the source of truth for payroll.

For live salary disbursements, Monnify must also have third-party disbursements enabled and the backend's static outbound IP address whitelisted by Monnify. This is a Monnify API requirement and is distinct from configuring the inbound webhook endpoint.
