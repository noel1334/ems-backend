# Bank directory and account verification

This adds a backend-owned directory loaded from the configured Paystack and/or Flutterwave provider API. The browser never calls provider APIs directly and never receives secret keys.

## Endpoints
- `GET /api/v1/bank-directory` returns merged provider bank entries and provider-specific codes. Requires employee profile READ permission.
- `POST /api/v1/bank-directory/resolve` accepts `{ "provider": "PAYSTACK"|"FLUTTERWAVE", "accountNumber": "0123456789", "bankCode": "provider-specific-code" }`; returns the provider-resolved account name. Requires employee profile UPDATE permission.

## Render environment
Set at least one backend secret key: `PAYSTACK_SECRET_KEY` and/or `FLUTTERWAVE_SECRET_KEY`. The directory includes whichever configured provider directories are reachable. Codes are never assumed interchangeable. A bank unavailable from one provider cannot be used for transfers through that provider.

## Safety and compatibility
No Prisma schema change is required: `EmployeeBankAccount` already stores `paystackBankCode` and `flutterwaveBankCode`. Account resolution is a convenience check, not proof of ownership or consent. Restrict bank-account changes to authorized roles and keep salary payouts feature-flagged off until sandbox verification.
