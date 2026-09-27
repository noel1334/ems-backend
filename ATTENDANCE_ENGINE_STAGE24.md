# Stage 24 — Complete Automatic Attendance Engine

Stage 24 hardens the attendance workflow around schedules, overnight shifts, leave, absence generation, breaks, late/early departure and overtime.

## Endpoint

`POST /api/v1/attendance-engine/process`

Requires the company-scoped `attendance:attendance:MANAGE` permission.

Example body:

```json
{
  "from": "2026-09-01",
  "to": "2026-09-30"
}
```

An optional `employeeId` limits processing to one employee.

## Behavior

- Generates missing attendance calendar records for active employees.
- Uses the employee's effective schedule and shift.
- Preserves overnight shift attendance dates.
- Marks scheduled non-working days as `REST_DAY`.
- Marks holidays as `HOLIDAY`.
- Marks approved leave days as `ON_LEAVE` when no attendance check-in exists.
- Leaves actual biometric/manual check-ins intact.
- Recalculates worked, break, late, early-departure and overtime minutes.
- Returns a company-scoped status summary.

## Device/biometric integration

Stage 23 device events continue to use the existing attendance check-in/check-out services, so face and fingerprint events use the same schedule and attendance calculations.

## Database

The attendance model now explicitly stores `earlyDepartureMinutes`; Stage 24 migration also adds operational indexes for attendance status/date and device event lookup.
