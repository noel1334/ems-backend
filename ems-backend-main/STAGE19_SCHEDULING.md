# EMS Stage 19 — Flexible Scheduling & Rotation Engine

Stage 19 adds a tenant-aware scheduling policy engine for SaaS companies with different staffing models.

## Supported policy choices
- Departments may have no shifts, fixed schedules, or rotating shifts.
- Each department can have its own scheduling policy.
- Rotation can be disabled or configured in any number of days from 1–365.
- Automatic leave can be disabled, generated automatically, or generated for manager approval.
- Leave duration is configurable.
- Leave can begin after a configurable number of days (`leaveCycleAfterDays`).
- Maximum concurrent leave can be constrained by percentage and/or minimum staffing count/percentage.
- Preferred leave weekdays, blocked dates, preferred dates, working weekdays, and selected shifts can be configured.
- A generation is created as a DRAFT, then can be APPROVED and PUBLISHED.

## API
- `GET /api/v1/scheduling/policies`
- `POST /api/v1/scheduling/policies`
- `GET /api/v1/scheduling/policies/:id`
- `PATCH /api/v1/scheduling/policies/:id`
- `GET /api/v1/scheduling/generations`
- `POST /api/v1/scheduling/generations`
- `GET /api/v1/scheduling/generations/:id`
- `POST /api/v1/scheduling/generations/:id/approve`
- `POST /api/v1/scheduling/generations/:id/publish`

## Important behavior
Generation is deterministic/stable rather than unsafe pure randomness. Employees are distributed into leave groups while the policy limits concurrent leave. Shift rotation uses the configured rotation cycle and stable employee ordering.

Publishing materializes generated work/shift periods into employee shift assignments. Planned leave remains part of the generation; leave balances should only be deducted through the normal leave approval workflow.

## Database
Stage 19 adds `SchedulingPolicy`, `ScheduleGeneration`, and `ScheduleGenerationAssignment` plus supporting enums/relations. Run the project's Prisma migration command against the Neon database after reviewing the generated migration.

## Static validation
Run `npm run check:stage19`. Runtime validation still requires a real PostgreSQL/Neon connection.
