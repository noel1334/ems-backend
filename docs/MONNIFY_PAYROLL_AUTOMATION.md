# EMS Monnify salary disbursement flow

## Architecture

Monnify payroll is deliberately separate from the Paystack/Flutterwave payout adapter. Each tenant connects its own Monnify disbursement credentials and source account. Monnify batches debit that tenant's Monnify disbursement wallet; they do not reserve or debit the EMS internal company wallet.

1. Finalize payroll.
2. Prepare the EMS payroll payment register (`PayrollDisbursement` rows).
3. Choose **Preview & validate salaries** in the Monnify section for the selected finalized period.
4. EMS reads each pending disbursement and the employee's active primary bank account. It loads the current Monnify bank directory, resolves the selected bank name to a directory code, and performs server-side Name Enquiry.
5. The preview lists `VALID`, `BLOCKED`, and `RETRY_REQUIRED` employees. Code `99` is a provider processing error and is retry-required, not proof of an invalid beneficiary. No employee bank details are rewritten by preview.
6. The submit action requires the preview fingerprint. EMS rebuilds the preview from current database records, so changed payroll/bank details make the token stale. Only beneficiaries that pass the fresh server-side validation are submitted.
7. The batch is stored before the upstream request to prevent duplicate submission. An uncertain network result is recorded as `SUBMISSION_UNKNOWN`; do not resubmit until the batch reference has been reconciled.
8. Monnify may return `PENDING_AUTHORIZATION`. Enter the OTP sent to the company's registered Monnify email. If Monnify reports `OTP_EMAIL_DISPATCH_FAILED`, request a resend from the batch controls. EMS then polls the batch and batch-specific transaction endpoint and maps each result to its original `PayrollDisbursement` row. Only Monnify `SUCCESS` / `COMPLETED` transactions become `PAID` in EMS. While the payroll page is open, EMS automatically reconciles submitted/processing batches every 30 seconds; users can also trigger **Refresh & reconcile** manually.

Blocked employees remain pending and can be reviewed and revalidated after their saved bank details are corrected. Failed or reversed transactions are recorded as failed and must be investigated before another attempt.

## Current Monnify API sequence

- `GET /api/v1/banks?countryCode=NG`
- `GET /api/v2/disbursements/account/validate?accountNumber=...&bankCode=...`
- `POST /api/v2/disbursements/batch`
- `POST /api/v2/disbursements/batch/validate-otp` when MFA is enabled
- `POST /api/v2/disbursements/single/resend-otp` with the batch reference if the OTP email dispatch fails
- `GET /api/v2/disbursements/bulk/summary?batchReference=...`
- `GET /api/v2/disbursements/bulk/{batchReference}/transactions?pageNo=0&pageSize=100` for individual transaction reconciliation

Bulk requests use `destinationBankCode`, `destinationAccountNumber`, and the verified `destinationAccountName`. EMS uses `onValidationFailure: CONTINUE` because it only includes beneficiaries that passed its preflight validation; a late provider-side validation failure should not stop unrelated valid salary transfers.

## Automatic execution requirements

Monnify enables MFA/OTP by default in both Sandbox and Live. A person must authorize each batch unless Monnify approves an MFA waiver for the company's account. For an unattended job, the company owner / primary technical administrator must request the waiver from `integration-support@monnify.com`; EMS cannot switch off Monnify MFA through its API.

Before Live transfers, the company's Monnify account must be approved for third-party disbursements and the backend's stable outbound IP must be allowlisted by Monnify. The company Monnify wallet must be funded. EMS checks that the available wallet balance covers the payroll salary total; Monnify transfer fees may also apply. Never test a live payment with random or fictitious account details.

## Sandbox and code 99

A code sample in the Name Enquiry documentation is an API illustration, not a guaranteed Sandbox fixture. Monnify code `99` means an unexpected processing error; Monnify recommends querying status before retrying a disbursement. `D03` is the explicit invalid-account-details code. If a Sandbox Name Enquiry repeatedly returns code `99`, obtain a currently supported Sandbox beneficiary from Monnify Integration Support instead of generating random account numbers.

## Official references

- Bulk transfers: https://developers.monnify.com/docs/disbursements/bulk-transfers
- Monnify public API collection — Get Bulk Transfer Transactions: https://www.postman.com/monnifyteam/monnify-public-apis/request/j4uaei0/get-bulk-transfer-transactions
- Single transfers: https://developers.monnify.com/docs/disbursements/single-transfers
- Name Enquiry: https://developers.monnify.com/docs/verification-api/verifying-your-customers
- Changelog: https://developers.monnify.com/docs/change-logs
- Integration Support: https://support.monnify.com/topics/integrating-monnify-244
