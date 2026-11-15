# Flutterwave company payout subaccounts (PSA)

## RS collection subaccounts are not payout wallets

EMS keeps the existing Flutterwave `/v3/subaccounts` integration for **collection split subaccounts** (`RS_...`). These determine how checkout collection proceeds are split/settled. They are not the funding wallets used to pay employee salaries.

Salary payout wallets use Flutterwave's separate **Payout Subaccounts** product and an `account_reference` prefixed `PSA`. EMS stores the PSA reference, Barter ID and static-account metadata on the tenant's `Company` record. It does not overwrite the existing `flutterwaveSubaccountId` collection split reference.

## Company setup

1. Use a Flutterwave merchant account enabled for production API calls. Flutterwave's current Payout Subaccounts documentation states that a live account is a prerequisite.
2. Open Company Wallet → Flutterwave company payout wallet and create the PSA wallet with the company's account email.
3. EMS creates `/v3/payout-subaccounts`, then calls `/v3/payout-subaccounts/{account_reference}/static-account?currency=NGN` to issue the NGN funding account. If wallet creation succeeds but static-account issuance is temporarily unavailable, EMS retains the PSA reference and offers **Issue funding account**; do not create another wallet in that case.
4. Transfer NGN from the company's bank to the displayed Flutterwave static funding account.
5. Refresh the payout-wallet balance. EMS reads `/v3/payout-subaccounts/{account_reference}/balances` and displays the live available balance.
6. When a PSA reference is configured, payroll preflight checks that PSA balance and salary transfer requests include `debit_subaccount: "PSA..."`. Without a PSA configured, the legacy EMS payout route continues to use the shared F4B integration balance; that balance is not company-segregated.

## Transfer behavior

The bank-transfer request still includes the beneficiary bank code, account number, amount and NGN currency. For PSA-funded withdrawals, Flutterwave requires the `debit_subaccount` value so the transfer debits the selected payout wallet, rather than the main F4B wallet.

EMS checks the PSA balance before approval and again before a retry. When the PSA wallet is configured, **Direct Provider Payroll uses the PSA balance as its only funding source**: EMS does not reserve, debit, release or refund the internal EMS company wallet for those PSA transfers.

If no PSA wallet is configured, the existing **EMS Wallet Payroll** route continues to use the EMS internal ledger and the legacy shared Flutterwave F4B integration balance. These are separate funding routes and must not be combined for one payroll period. PSA wallets are production-only; set `PAYROLL_PAYOUTS_MODE=live`, use the live Flutterwave secret, and explicitly enable live payout confirmation before preparing PSA-funded payroll.

## Webhook and reconciliation

In the Flutterwave dashboard, enable the documented **payout subaccounts wallet funding** webhook so PSA funding events can be delivered. The EMS balance display queries Flutterwave's balance endpoint directly; it does not treat an incoming webhook alone as proof that funds are available.

## Official documentation

- Payout Subaccounts: https://developer.flutterwave.com/docs/payout-subaccount
- Create payout subaccount: https://developer.flutterwave.com/reference/create-a-payout-subaccount
- Fetch static account: https://developer.flutterwave.com/reference/get-static-virtual-account
- Fetch payout subaccount balance: https://developer.flutterwave.com/reference/get-payout-subaccount-balance
- Create transfer: https://developer.flutterwave.com/reference/create-transfer
