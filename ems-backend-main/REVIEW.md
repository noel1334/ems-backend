# EMS backend review — stage 14 payments repaired

## Findings fixed in this package

1. **Prisma schema was incomplete for the implemented modules.**
   The previous schema covered company/auth/RBAC/employee/wallet/payment basics but did not define the models already referenced by attendance, leave, schedules, and payroll (`Attendance`, `AttendanceEvent`, `AttendanceBreak`, `WorkSchedule`, `WorkScheduleDay`, employee schedule/shift assignments, leave models, payroll structures/salaries/items/lines, etc.).
   A consolidated `prisma/schema.prisma` is now included.

2. **Biometric module files were empty.**
   The five biometric files in the supplied archive were 0 bytes, and the main route index did not mount a biometric router. A provider-agnostic biometric record module was added and mounted at `/biometrics`.

3. **Biometric permissions were missing from the seed.**
   CREATE/READ/UPDATE/MANAGE permissions were added.

4. **Duplicate payroll calculator file.**
   `payroll.calculator.js` duplicated `payroll.calculation.js` while the service imports the latter. The duplicate was removed.

5. **Session repository filename typo.**
   `sesion.repository.js` was renamed to `session.repository.js` (the file remains a placeholder because the current auth flow uses `UserSession` directly).

6. **Integration test directory contained an accidental trailing-space directory name.**
   Tests were moved into the normal `tests/integration/` directory.

## Important biometric limitation

The added biometric module stores provider-issued template references/hashes and supports registration, lookup, verification by provider reference, and revocation. It does **not** perform fingerprint/face matching itself. Actual biometric matching should be performed by the biometric terminal/provider SDK, with the EMS receiving a trusted template/identity reference.

## Next commands

```bash
npm install
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate dev --name consolidate_ems_schema
npm test
npm run lint
```

Before production deployment, review migration effects against the existing database rather than applying a destructive reset.

## Wallet & payment hardening pass — 2026-09-18

Implemented before runtime database testing:
- Wallet-generated references now use `crypto.randomBytes()` instead of `Math.random()`.
- Payment idempotency keys are request-bound with a stored fingerprint. Reusing a key with different payment details now returns HTTP 409 (`IDEMPOTENCY_KEY_REUSED`).
- Payment creation handles the database unique-constraint race on concurrent idempotency-key requests and safely replays the existing payment.
- Successful payment processing checks provider-reference reuse inside the same transaction and rejects a provider transaction already linked to a different payment (`PROVIDER_REFERENCE_REUSED`).
- Existing wallet credit/debit flow remains serializable and row-locks the company wallet before balance calculation/update.

Runtime validation status:
- JavaScript syntax checks: PASS.
- Docker/PostgreSQL runtime tests: NOT RUN in this environment because Docker is unavailable.
- `npm install --ignore-scripts`: attempted but timed out in this environment, so Vitest/Prisma database integration tests could not be executed here.

Required verification on a machine with PostgreSQL and dependencies:
1. `npm install`
2. `npm run prisma:generate`
3. `npm run prisma:deploy` (or `npm run prisma:migrate` for development)
4. Run concurrent wallet credit/debit tests against the same company wallet.
5. Send the same payment webhook multiple times concurrently and verify exactly one wallet ledger credit is created.
6. Reuse an idempotency key with identical details and verify the original payment is returned.
7. Reuse the same idempotency key with different amount/provider/email and verify HTTP 409.
8. Verify a provider transaction reference cannot be attached to a second payment.
