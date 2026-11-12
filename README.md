# EMS employee bank-account update fix — backend

Apply this archive at the root of `ems-backend`.

Files replaced/added:
- `src/modules/employees/employee-profile.service.js`
- `tests/unit/employee-profile-bank-update.test.js`

Changes:
- Do not call Monnify when only the Paystack or Flutterwave bank code changed, even when the existing Monnify verification timestamp is empty.
- Retry Name Enquiry on an ordinary save when a Monnify beneficiary is still unverified.
- If the Monnify Name Enquiry endpoint itself returns provider code `99`, persist the selected bank code and other bank-profile edits, preserve a non-empty existing/manual account name, and leave `monnifyVerifiedAt` null.
- Do not suppress code `99` from authentication or the Monnify bank-directory endpoint.
- The beneficiary remains unverified after the fallback. Payroll's own validation must still complete before a salary transfer can proceed.

No database migration is required.

Run:
- `node --check src/modules/employees/employee-profile.service.js`
- `node --check tests/unit/employee-profile-bank-update.test.js`
- `npm test -- tests/unit/employee-profile-bank-update.test.js`
- `npm test`


## Company provider funding monitor

See [company provider funding and settlement monitoring](docs/COMPANY_PROVIDER_FUNDING_AND_SETTLEMENT_MONITOR.md) for endpoints, migration, scheduling configuration, and safety boundaries.
