# EMS Attendance Implementation V1

## Scope

The attendance domain, Prisma models, and most attendance services already existed in this backend. This patch connects the frontend attendance workspace to those services and repairs gaps in the attendance flow; it does not introduce a new database model or require a Prisma migration.

## Attendance capabilities connected

- Tenant-scoped attendance list and filters.
- Clock-in and clock-out for authorized HR/admin users.
- Employee self-service clock-in, clock-out, and break start/end. These `/me` endpoints derive the employee from the authenticated user and never accept an employee ID from the browser.
- Break tracking, with checkout refused until an active break is ended.
- Overnight checkout can locate the open attendance record from the prior work date even if a generated record exists for the current date.
- Attendance correction now requires a reason and stores it in `correctionReason`; valid check-in/check-out ordering is enforced.
- Approval submits the backend's expected `approved` boolean and keeps the existing lock-on-approval behavior.
- A tenant-scoped `/attendance/events` audit timeline with validated pagination, date, source, type, and employee filters.
- Attendance engine processing by date range, plus a safety rule that prevents a missing scheduled record from being labelled `ABSENT` before its scheduled shift/day has ended. Future date ranges are rejected; an unfinished current-day shift is recorded as `INCOMPLETE` instead of being prematurely marked absent.

## API endpoints

- `GET /attendance` — authorized attendance records and filters.
- `GET /attendance/events` — tenant-scoped attendance event timeline.
- `POST /attendance/check-in` — HR/admin check-in; requires attendance CREATE.
- `POST /attendance/check-out` — HR/admin checkout; requires attendance UPDATE.
- `PATCH /attendance/:id/correct` — submit a correction with a reason; requires attendance UPDATE.
- `PATCH /attendance/:id/approval` — approve/reject according to the existing backend rules.
- `POST /attendance-engine/process` — generate/reconcile attendance records through today; future date ranges are rejected. Requires attendance MANAGE.
- `GET /me/attendance` — authenticated employee attendance history.
- `POST /me/attendance/check-in`, `/me/attendance/check-out`, `/me/attendance/break/start`, `/me/attendance/break/end` — self-service clock actions tied to the logged-in employee.

## Important operating notes

1. Assign the tenant's appropriate attendance CREATE, READ, UPDATE, APPROVE, and MANAGE permissions to HR/admin roles.
2. Each employee must be linked to a user account to use employee self-service attendance.
3. Ensure the employee has the relevant shift/schedule assignment and that holidays and approved leave are configured before processing a period.
4. Do not process future dates. The engine can process through today, but a current shift that has not reached its scheduled end remains `INCOMPLETE` instead of being marked absent. Review exceptions, corrections, leave, rest days, and incomplete shifts before relying on attendance totals for payroll.
5. The UI uses web clock events. No fingerprint or face terminal integration is added by this patch.

## Validation

The changed backend JavaScript files should pass `node --check`. Run `npm test` in the actual project after applying the patch. The attendance event/correction request-validation unit tests are included. No database migration is expected.
