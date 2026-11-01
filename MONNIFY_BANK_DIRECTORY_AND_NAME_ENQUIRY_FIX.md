# Monnify bank directory and Name Enquiry correction

This update uses the company's own encrypted Monnify credentials and environment.

## Provider requests

- Bank directory: authenticated `GET /api/v1/banks` with no additional query parameters.
- Name Enquiry: authenticated `GET /api/v2/disbursements/account/validate` with `accountNumber` and `bankCode` query parameters. The v2 path follows Monnify's current Verification API documentation.

The bank directory response is normalized from Monnify's response body. Bank codes are kept as exact strings, including leading zeroes such as `058`. Numeric codes are rejected rather than guessed/padded.

## Payroll controls

- Manual Name Enquiry only accepts a bank code currently returned by Monnify's bank directory.
- The response account number and bank code must match the request.
- Payroll preview resolves each saved employee bank name against the current Monnify directory, uses that directory's exact bank code, and checks the returned account number, bank code, and account name before marking a beneficiary valid.
- The verified account name is passed to the Monnify transfer request. Invalid, mismatched, or unverified beneficiaries are excluded from the batch.
- Monnify code `99` remains a retryable provider error, not an invalid-account verdict.
- Provider errors include a sanitized request diagnostic (method, endpoint path, query with account number masked) and provider response code/message. No API key, API secret, bearer token, or full account number is returned in diagnostics.

## Sandbox guidance from Monnify support

Monnify support confirmed that any valid account number can be used for Sandbox Name Enquiry, provided the bank code is selected from `GET /api/v1/banks`. This replaces the previous UI warning that implied a special Monnify-confirmed test account was required.

## Official documentation

- Get Banks: https://teamapt.atlassian.net/wiki/spaces/MON/pages/213909736/Get+Banks
- Current Name Enquiry guide: https://monnify-docs.playground.monnify.com/docs/verification-api/verifying-your-customers
- Validate Bank Account (legacy v1 reference): https://teamapt.atlassian.net/wiki/spaces/MON/pages/213909739/Validate+Bank+Account
