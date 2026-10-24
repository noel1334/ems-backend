# EMS Employee Attendance Self-Service V1 (Backend)

## What this adds

- Secure self-service routes for check-in, check-out, break start and break end under `/me/attendance`.
- The employee record is resolved from the authenticated user's linked employee record; the client cannot submit an arbitrary `employeeId` for clocking.
- Break operations verify that the attendance record belongs to the signed-in employee.
- Attendance history returns break records, enabling the frontend to show break state and duration.
- Default self-service history is limited to past attendance through the current moment rather than pulling future generated attendance rows ahead of history.
- Server-side checkout rejects checkout while an active break remains open.
- No Prisma schema migration is required.

## Apply

From the backend repository root, extract this ZIP, then run:

```bash
node scripts/apply-employee-attendance-backend-v1.mjs
node --check src/modules/attendance/attendance.service.js
node --check src/modules/self-service/self-service.service.js
node --check src/modules/self-service/self-service.controller.js
node --check src/modules/self-service/self-service.routes.js
npm test -- tests/unit/attendance.service.test.js
npm test
```

The apply script makes targeted, idempotent edits to the existing modules instead of overwriting complete module files.

## Routes

- `GET /me/attendance`
- `POST /me/attendance/check-in`
- `POST /me/attendance/check-out`
- `POST /me/attendance/:attendanceId/break/start`
- `POST /me/attendance/:attendanceId/break/end`

All are authenticated. Clock-in/out timestamps are created by the server. Existing `/attendance` management APIs remain available for authorized HR/Admin work.
