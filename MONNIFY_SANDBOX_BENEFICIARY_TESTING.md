# Monnify Sandbox beneficiary testing in EMS

## What the Sandbox helper does

The Company Monnify account panel now includes a Name Enquiry tool. It loads bank names and bank codes from the connected company's Monnify bank directory, accepts a 10-digit beneficiary account number, and displays the account name returned by Monnify. It does not edit an employee record and does not initiate a transfer.

Use beneficiary test data supplied or explicitly confirmed by Monnify for the company's Sandbox account. Do not generate random 10-digit account numbers and do not copy a bank code from another provider. The `0123456789` / `058` pair shown in Monnify's Name Enquiry documentation is an illustrative API request; it must not be assumed to be an active Sandbox fixture.

## Payroll batch safeguards

Before a Monnify batch can be created, the backend:

1. Confirms the payroll period exists for the tenant and is `FINALIZED`.
2. Loads the bank directory from the connected Monnify environment.
3. Resolves each bank by its Monnify directory name (or, for compatibility, checks a supplied code against the current directory).
4. Calls Monnify Name Enquiry for every beneficiary immediately before submission.
5. Requires the provider-resolved account name to match the employee's saved account name.
6. Rejects the entire batch before creating a batch record if any beneficiary fails validation.
7. Uses the verified Monnify account name and directory bank code in the transfer payload, with `onValidationFailure: BREAK` as a second provider-side guard.

A code `99` from Monnify is treated as an unexpected processing error, not automatically as proof of an invalid account. A `D03` response is identified as invalid account details. Neither response causes EMS to rewrite bank details or bank codes.

## Environment safeguards

Each batch stores the Sandbox/Live environment in which it was created. EMS blocks switching the company's Monnify connection environment or disconnecting it while a batch is being submitted, awaiting OTP, awaiting processing, or processing. OTP authorization and status refresh require the currently connected environment to match the batch's saved environment.

A successful Name Enquiry is not proof that a transfer was paid. Always authorize with the company's Monnify OTP (when requested), then refresh and reconcile the individual transaction statuses.

## Deployment

This patch adds `environment` to `CompanyMonnifyBatch`. The backend deployment must run the project's existing `npx prisma db push` before serving requests, followed by `npx prisma generate`.
