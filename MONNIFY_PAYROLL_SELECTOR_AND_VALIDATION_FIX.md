# Monnify payroll selector and beneficiary-validation fix

This patch updates the existing Monnify payroll automation integration.

## Changes

- Returns employee-specific beneficiary Name Enquiry errors, including the employee, saved bank name, account last four digits, resolved Monnify bank code, provider code, and sandbox/live environment.
- Normalizes common bank-name suffixes and diacritics before matching the employee's saved bank to Monnify's bank directory.
- Prevents Monnify from starting a payroll when a Paystack/Flutterwave payout batch for the same period is already APPROVED, PROCESSING, or REQUIRES_REVIEW.
- Allows a fresh Monnify preview only after Monnify explicitly reports FAILED_ON_ACCOUNTS_VALIDATION, a pre-transfer failure. A generic FAILED or EXPIRED batch remains locked for reconciliation to avoid accidental duplicate payments.
- Preserves employee-to-transfer references when a Monnify submission result is uncertain, so the same batch can be investigated without submitting duplicates.
- Extends the static verification script to check the account-error formatter.

Invalid or unsupported beneficiary bank details are not bypassed. The preview remains blocked until the employee's saved bank details are corrected or the correct sandbox beneficiary test data is used.

## Apply and verify

Apply this archive at the backend repository root. Run `node --check src/modules/payments/monnify/monnify.service.js`, `node scripts/verify-monnify-payroll-automation.mjs`, the backend test suite, and `git diff --check` before pushing.
