# Monnify payroll submission recovery patch

## What this patch changes

- Keeps the documented Monnify bulk submission route `POST /api/v2/disbursements/batch`.
- Keeps bulk OTP authorization on `POST /api/v2/disbursements/batch/validate-otp`.
- Uses the documented OTP resend route `POST /api/v2/disbursements/single/resend-otp` with the unique batch reference. Do not substitute `/batch/resend-otp`.
- Records and logs safe provider error metadata (provider code/message, HTTP status, method and endpoint path, batch reference, EMS request ID). It does not log API credentials, request payloads, source account numbers or beneficiary account numbers.
- Separates documented hard rejection responses (`D03` invalid account details, `D04` insufficient disbursement balance, `D06` outbound IP not allowlisted) from a timeout/uncertain response. Those hard rejections are marked `SUBMISSION_REJECTED`; duplicate-reference (`D05`), duplicate-request (`D07`), unexpected (`99`) and network/unknown responses remain `SUBMISSION_UNKNOWN` until reconciled. Individual fallback is enabled for `D03`/`D04` after fresh per-employee checks; `D06` is a definite rejection but does not enable single transfers because the same unapproved server IP would also block the single-transfer API. After allowlisting the Render outbound IP, submit a fresh batch instead.
- When Monnify confirms a batch reference does not exist (D02 from the batch summary lookup), marks that batch rejected, allowing the one-by-one fallback.
- Persists a confirmed batch summary and recovers employee-to-reference links before requesting transaction history, so a separate transaction-history failure does not hide a valid OTP authorization state.
- Adds a batch OTP dialog after a successful accepted response, a button to reopen it from a pending batch record, and an OTP resend action while authorization is pending or Monnify reports `OTP_EMAIL_DISPATCH_FAILED`.
- Enables individual Monnify transfers for a pending row only when all Monnify batch records for that payroll period are explicitly rejected. Existing retries of individually failed transfers still require Monnify's terminal failed status.
- Rechecks current wallet balance and Monnify Name Enquiry for each individual salary transfer.
- Restores the funding-route protection that treats an unfunded, unexecuted legacy wallet batch preview as a draft rather than a completed route selection. Existing reservations/executed batches remain locked.

## Why an OTP may not arrive

Monnify sends/requests the authorization OTP only after it accepts the bulk submission and reports an authorization state such as `PENDING_AUTHORIZATION`. If Monnify rejects the request before accepting the batch, there is no batch awaiting authorization and no OTP should be expected. The revised error will expose the provider response code and message instead of replacing it with a generic `INTERNAL_SERVER_ERROR`.

## Live account prerequisites to verify with Monnify

Monnify's current disbursement documentation says that live third-party disbursements must be enabled for the merchant and the backend's static outbound IP must be allowlisted. Confirm that the connected credentials belong to the same environment selected in EMS (Sandbox credentials for Sandbox; Live credentials for Live). If this approval or IP allowlisting is missing, Monnify can reject the submission before OTP.

## Safety rules

- Never retry a `SUBMISSION_UNKNOWN` batch and never use the one-by-one fallback for it until the exact batch reference is reconciled.
- A single transfer is a real payment instruction. Use it only after the bulk batch is explicitly rejected or a specific individual transaction is confirmed finally failed.
- Each individual transfer has its own unique reference and can require its own OTP. If an individual transfer's status lookup returns Monnify `D02` (reference not found), EMS marks that exact attempt failed so the existing confirmed-failure retry action can be used.
- This patch does not add a database migration and does not require resetting or reseeding the database.

## Checks

Run from the backend repository root:

```bash
node --check src/modules/payments/monnify/monnify.client.js
node --check src/modules/payments/monnify/monnify.service.js
node --check src/modules/payments/monnify/monnify.controller.js
node --check src/modules/payroll/payroll.funding-route.service.js
node scripts/verify-monnify-payroll-automation.mjs
node scripts/verify-monnify-submission-recovery.mjs
```

Run the focused Vitest test with `npx vitest run tests/unit/payroll-funding-route.test.js`, then run the full Vitest suite as part of normal CI after dependencies are installed. The separate frontend patch contains its own static UI verification script. No real Monnify transfer is made by these local checks.
