# EMS Backend — Stage 17 Validation

## Completed in this pass

- Completed the previously empty employee-number service with a PostgreSQL atomic per-company sequence.
- Fixed session repository/service references from the obsolete `session` model to Prisma `userSession`.
- Restricted session revocation to the authenticated user.
- Mounted `/api/v1/sessions` routes.
- Added authentication, payment, and biometric rate limiting using `express-rate-limit`.
- Added `/api/v1/ready` database-readiness endpoint.
- Completed Zod/Joi validation middleware helpers.
- Completed the RBAC permission service helpers.
- Fixed `AppError` compatibility with both object and string error codes.
- Fixed audit-log field mapping (`actorUserId` → schema `userId`).
- Fixed payroll attendance field usage (`date` → `attendanceDate`).
- Added `PAID` to the payroll status enum because payroll finalization writes item status `PAID`.
- Added attendance locking field used by the attendance service.
- Added company/device uniqueness for attendance devices.
- Added active-biometric uniqueness constraint per company/employee/type.
- Added biometric device-reference verification support.
- Added successful login/logout audit records.
- Added static Stage 17 checks and removed all zero-byte JS source files.

## Checks executed

- Node syntax check: **PASS** for all JS source files and Stage 17 check script.
- Stage 17 static schema/source check: **PASS** — 42 models, 35 enums, no missing relation targets, no duplicate model/enum names, no empty JS source files.
- Employee-number utility smoke test: **PASS**.
- `npm test`: **NOT RUNNABLE in this build environment** because dependencies are not installed (`vitest: not found`).
- `npx prisma validate`: **ATTEMPTED**, but package installation/download timed out in the build environment. Therefore Prisma CLI validation against the installed Prisma version was not possible here.

## Before deployment

1. Run `npm install` in an environment with package-registry access.
2. Run `npx prisma generate`.
3. Run `npx prisma format`.
4. Run `npx prisma validate`.
5. Create/apply a reviewed PostgreSQL migration (`npx prisma migrate dev` for development, `npx prisma migrate deploy` for production).
6. Run `npm test` and `npm run lint`.
7. Configure real Paystack/Flutterwave credentials and webhook secrets.
8. Connect the actual biometric provider/device SDK; the backend stores provider references/hashes and does not perform biometric matching itself.
9. Run staging integration tests against PostgreSQL, payment webhooks, and biometric hardware/provider.
