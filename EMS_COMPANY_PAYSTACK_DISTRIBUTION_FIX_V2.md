# Company Paystack salary distribution — account-resolution and recipient preparation fix

## What changed

- Company-owned Paystack payroll now resolves employee bank accounts with that company's Paystack key in both TEST and LIVE mode by default.
- The resolver result is checked against the saved account number, and the resolved account name is compared with the saved account name before an employee is accepted.
- A test-only setting can disable provider resolution for diagnostics, but when that happens the preview explicitly marks the rows as local-format-only and disables the submit action. It no longer labels unverified sandbox account details as Validated.
- Recipient creation is completed for all employees before the first transfer request. Failures are collected per employee; a failed recipient preparation marks the batch FAILED and confirms that no salary transfers were initiated.
- Batch history returns only safe failure summaries (employee, bank, Paystack bank code, last four account digits, and message), not full bank numbers or secret keys.
- Paystack request errors now retain safe endpoint/status diagnostics for server-side handling.

## Render environment setting

Add or keep this backend environment variable:

```env
PAYSTACK_COMPANY_VALIDATE_BANK_ACCOUNTS_IN_SANDBOX=true
```

This setting is company-Paystack-specific and does not change the legacy wallet/shared-key payout flow. The default is `true`; only set it to `false` temporarily for diagnostics. If false, test-mode preview will not permit submission until validation is re-enabled.

## Paystack workflow requirements

- The transfer recipient must be created with `type: nuban`, the beneficiary name, account number, bank code from the company's Paystack `/bank` endpoint, and `currency: NGN`.
- Bulk transfers send `source: balance`, `currency: NGN`, and transfer objects with kobo amounts, recipient codes, and unique references.
- Each bulk transfer request contains at most 100 transfers and is spaced at least five seconds from the previous request.
- Paystack bulk transfer requires Transfers OTP to be disabled in the company's Paystack Dashboard. A single transfer can require OTP and uses the finalize-transfer flow.
- Transfer completion must be verified from webhooks or the verify-transfer endpoint. An accepted/pending transfer is not marked PAID until verified as successful in LIVE mode.

## Important: failed batches already in the database

The new diagnostics apply to new attempts. Historical FAILED batches remain in the audit history and are not automatically retried. Do not change the status of historical batches manually. After deploying this patch, prepare a new preview; the preview should identify any bank/account mismatch before enabling the submit button.

## Relevant Paystack documentation

- Resolve account: https://paystack.com/docs/identity-verification/verify-account-number/
- Create transfer recipients: https://paystack.com/docs/transfers/creating-transfer-recipients/
- Bulk transfers: https://paystack.com/docs/transfers/bulk-transfers/
- How transfers work and balance checks: https://paystack.com/docs/transfers/how-transfers-work/
- Test-mode bank account details: https://paystack.com/docs/payments/test-payments/
