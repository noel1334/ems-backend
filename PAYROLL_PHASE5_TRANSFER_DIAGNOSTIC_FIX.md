# Phase 5 payroll transfer diagnostic fix

## Included changes

- `src/modules/payments/paystack/paystack.transfer.client.js`: exports `toPaystackKobo`, uses Decimal.js for naira-to-kobo conversion, rejects zero/negative values, fractional kobo, and values outside JavaScript's safe-integer range.
- `tests/unit/paystack-transfer-amount.test.js`: focused tests for the conversion helper.
- `src/common/errors/error.middleware.js`: writes a production-safe `api_unhandled_error` JSON log for unexpected HTTP 500 responses. It records the request ID, API path, safe error message/code, provider HTTP status/message, and limited stack context. It does not log request bodies, authorization headers, provider secrets, full provider payloads, or 10-digit account numbers.

## Paystack error diagnosis

This patch improves diagnosis; it does not claim to have identified the underlying cause of the previously observed Paystack HTTP 500. After deploying the backend patch, the browser error will show a request reference. Search Render backend logs for `api_unhandled_error` and that same request ID. The recorded message and stack will identify the exact failing operation.

Before attempting another transfer, refresh the payroll period and inspect its batch and every disbursement. Do not resubmit a batch with PROCESSING or REQUIRES_REVIEW records. Verify the original provider references first.
